# Phase 6 – API Routes
> Read 00-MASTER-CONTEXT.md first. Phase 5 must be complete.

## Goal
Three API routes that wire together the database, LLM parser, and planning engine. These are the brain of Kepler.

## Deliverables
- [ ] `app/api/chat/route.ts` — main interaction endpoint
- [ ] `app/api/plan/route.ts` — plan generation + undo
- [ ] `app/api/tasks/route.ts` — task CRUD

---

## Route 1: Chat (`POST /api/chat`)

This is the most important route. It receives a user message, classifies intent, takes action, and returns a response.

Create `app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseUserMessage } from '@/lib/llm'
import { generatePlan, replan } from '@/lib/planner'
import type { Task, PlanBlock, ChatResponse } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { message } = body
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // ── Load user context ────────────────────────────────────────────────────
  const [memoryResult, tasksResult, planResult] = await Promise.all([
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('planning_state').select('*').eq('user_id', user.id).eq('plan_date', today).single(),
  ])

  const memory = memoryResult.data
  const tasks: Task[] = tasksResult.data ?? []
  const planState = planResult.data

  if (!memory) {
    return NextResponse.json({
      message: "It looks like you haven't completed onboarding yet. Please set up your profile first.",
      plan: null,
      replanReason: null,
      requiresConfirmation: false,
    } satisfies ChatResponse)
  }

  // ── Parse intent ─────────────────────────────────────────────────────────
  const intent = await parseUserMessage(
    message,
    (planState?.blocks as PlanBlock[]) ?? [],
    { goals: memory.goals, constraints: memory.constraints }
  )

  let responseText = intent.response
  let updatedPlan: PlanBlock[] | null = null
  let replanReason: string | null = null
  let requiresConfirmation = false

  // ── Handle intent ────────────────────────────────────────────────────────

  if (intent.type === 'interruption') {
    const { drift_mins, confidence } = intent

    // Log the interruption regardless of whether we replan
    await supabase.from('interruption_log').insert({
      user_id: user.id,
      raw_input: message,
      parsed_drift_mins: drift_mins,
      affected_task_id: null, // could be resolved in a future improvement
      replan_triggered: drift_mins < 20 && confidence === 'high',
      confidence,
    })

    if (drift_mins > 0 && planState?.blocks) {
      const isSmallAndClear = drift_mins < 20 && confidence === 'high'

      if (isSmallAndClear) {
        // Auto-replan: small drift, high confidence
        const currentTime = new Date().toTimeString().slice(0, 5)
        const result = replan(
          planState.blocks as PlanBlock[],
          tasks,
          [], // calendar blocks are loaded in the plan route; use empty here for simplicity
          memory.constraints.work_end ?? '18:00',
          currentTime,
          drift_mins,
          today
        )

        updatedPlan = result.blocks
        replanReason = result.reason

        // Save the updated plan (preserving previous for undo)
        await supabase.from('planning_state').update({
          blocks: updatedPlan,
          previous_blocks: planState.blocks,
          version: (planState.version ?? 1) + 1,
          last_replan_reason: replanReason,
        }).eq('id', planState.id)

      } else {
        // Large drift or low confidence — ask user before replanning
        requiresConfirmation = true
        responseText = `I noticed you lost about ${drift_mins} minutes${intent.affected_task ? ` on "${intent.affected_task}"` : ''}. Should I adjust the rest of your day to account for this?`
      }
    }
  }

  if (intent.type === 'add_task') {
    const { new_task } = intent
    const { data: insertedTask, error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: new_task.title,
      priority: new_task.priority ?? 'medium',
      deadline: new_task.deadline ?? null,
    }).select().single()

    if (error) {
      console.error('Task insert error:', error)
      responseText = "I had trouble adding that task. Please try again."
    }
  }

  if (intent.type === 'update_memory') {
    const { memory_update } = intent
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }

    if (memory_update.goals) updatePayload.goals = memory_update.goals
    if (memory_update.constraints) updatePayload.constraints = memory_update.constraints

    if (Object.keys(updatePayload).length > 1) {
      await supabase.from('user_memory').update(updatePayload).eq('user_id', user.id)
    }
  }

  return NextResponse.json({
    message: responseText,
    plan: updatedPlan,
    replanReason,
    requiresConfirmation,
    pendingDrift: requiresConfirmation ? intent.drift_mins : undefined,
  } satisfies ChatResponse)
}
```

---

## Route 2: Plan (`GET /api/plan`, `POST /api/plan`, `POST /api/plan/undo`)

Handles plan generation and undo.

Create `app/api/plan/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generatePlan } from '@/lib/planner'
import { getTodayCalendarEvents } from '@/lib/calendar'
import type { Task, PlanBlock } from '@/types'

// GET /api/plan — Returns today's plan, generating it if it doesn't exist
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  // Check for existing plan
  const { data: existing } = await supabase
    .from('planning_state')
    .select('*')
    .eq('user_id', user.id)
    .eq('plan_date', today)
    .single()

  if (existing) {
    return NextResponse.json({ plan: existing })
  }

  // No plan exists — generate one
  const [memoryResult, tasksResult, tokenResult] = await Promise.all([
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('user_tokens').select('access_token').eq('user_id', user.id).single(),
  ])

  const memory = memoryResult.data
  const tasks: Task[] = tasksResult.data ?? []

  if (!memory) {
    return NextResponse.json({ error: 'User memory not found' }, { status: 404 })
  }

  // Fetch calendar events if token exists
  let calendarBlocks: Array<{ title: string; start: string; end: string }> = []
  if (tokenResult.data?.access_token) {
    try {
      calendarBlocks = await getTodayCalendarEvents(tokenResult.data.access_token)
    } catch (err) {
      console.warn('Calendar fetch failed, proceeding without calendar:', err)
    }
  }

  const blocks = generatePlan(
    tasks,
    calendarBlocks,
    memory.constraints?.work_start ?? '09:00',
    memory.constraints?.work_end ?? '18:00',
    today
  )

  // Save the new plan
  const { data: newPlan } = await supabase
    .from('planning_state')
    .insert({
      user_id: user.id,
      plan_date: today,
      blocks,
      version: 1,
    })
    .select()
    .single()

  return NextResponse.json({ plan: newPlan })
}

// POST /api/plan — Confirm a pending replan (when user said "yes")
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { drift_mins } = await request.json()
  const today = new Date().toISOString().split('T')[0]

  const [planResult, tasksResult, memoryResult] = await Promise.all([
    supabase.from('planning_state').select('*').eq('user_id', user.id).eq('plan_date', today).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).eq('status', 'pending'),
    supabase.from('user_memory').select('constraints').eq('user_id', user.id).single(),
  ])

  if (!planResult.data) {
    return NextResponse.json({ error: 'No plan found for today' }, { status: 404 })
  }

  const { replan } = await import('@/lib/planner')
  const currentTime = new Date().toTimeString().slice(0, 5)
  const result = replan(
    planResult.data.blocks as PlanBlock[],
    tasksResult.data ?? [],
    [],
    memoryResult.data?.constraints?.work_end ?? '18:00',
    currentTime,
    drift_mins,
    today
  )

  await supabase.from('planning_state').update({
    blocks: result.blocks,
    previous_blocks: planResult.data.blocks,
    version: planResult.data.version + 1,
    last_replan_reason: result.reason,
  }).eq('id', planResult.data.id)

  return NextResponse.json({ plan: result.blocks, reason: result.reason })
}
```

Create `app/api/plan/undo/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// POST /api/plan/undo — Restore the previous plan version
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]
  const { data: planState } = await supabase
    .from('planning_state')
    .select('*')
    .eq('user_id', user.id)
    .eq('plan_date', today)
    .single()

  if (!planState?.previous_blocks) {
    return NextResponse.json({ error: 'No previous plan to restore' }, { status: 400 })
  }

  await supabase.from('planning_state').update({
    blocks: planState.previous_blocks,
    previous_blocks: null,
    version: planState.version + 1,
    last_replan_reason: 'Restored previous plan (undo)',
  }).eq('id', planState.id)

  return NextResponse.json({ plan: planState.previous_blocks })
}
```

---

## Route 3: Tasks (`GET`, `POST`, `PATCH`, `DELETE /api/tasks`)

Create `app/api/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/tasks — Get all tasks for the user
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'done')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data })
}

// POST /api/tasks — Create a new task
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, priority = 'medium', deadline = null } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('tasks').insert({
    user_id: user.id,
    title: title.trim(),
    priority,
    deadline,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data }, { status: 201 })
}
```

Create `app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// PATCH /api/tasks/[id] — Update a task (status, priority, title, deadline)
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const allowedFields = ['title', 'priority', 'deadline', 'status', 'estimated_duration_mins']
  const updatePayload: Record<string, any> = {}

  for (const field of allowedFields) {
    if (field in body) updatePayload[field] = body[field]
  }

  // Set completed_at when marking done
  if (body.status === 'done') {
    updatePayload.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', params.id)
    .eq('user_id', user.id) // RLS belt-and-suspenders
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

// DELETE /api/tasks/[id] — Delete a task
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

---

## Verification

Test each route with curl or a REST client (Postman / Insomnia / Thunder Client):

```bash
# Get today's plan (must be authenticated)
curl http://localhost:3000/api/plan \
  -H "Cookie: <your session cookie>"

# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: <your session cookie>" \
  -d '{"title":"Review PR","priority":"high","deadline":null}'

# Send a chat message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <your session cookie>" \
  -d '{"message":"My standup ran 30 minutes over"}'

# Undo last replan
curl -X POST http://localhost:3000/api/plan/undo \
  -H "Cookie: <your session cookie>"
```

Expected:
- `GET /api/plan` returns a plan object with `blocks` array
- `POST /api/tasks` returns the created task
- `POST /api/chat` with interruption returns `{ message, plan, replanReason }` when drift < 20 min, or `{ message, requiresConfirmation: true }` when drift ≥ 20 min
- `POST /api/plan/undo` restores previous blocks

---

## Important Notes

- Every route checks `auth.getUser()` before doing anything — never trust client-provided user IDs
- Use `Promise.all` for parallel DB reads where possible (performance)
- The chat route does NOT fetch calendar blocks during replanning — that's a simplification for v1. Calendar is only loaded during initial plan generation in `GET /api/plan`
- The undo only goes back one version (single undo). Multi-level undo is out of scope
