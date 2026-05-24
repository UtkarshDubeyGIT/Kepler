# Phase 0 – Project Setup
> Read 00-MASTER-CONTEXT.md first.

## Goal
A working Next.js + Supabase skeleton with no Kepler features yet — just the plumbing.

## Deliverables
- [ ] Next.js 14 project initialized with TypeScript, Tailwind, App Router
- [ ] `.env.local` template committed (with empty values)
- [ ] Supabase client helper at `lib/supabase.ts`
- [ ] `types/index.ts` with all Kepler types defined
- [ ] `.gitignore` includes `.env.local`
- [ ] Project runs with `npm run dev` without errors

---

## Step 1: Initialize the project

```bash
npx create-next-app@latest kepler --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd kepler
```

When prompted:
- TypeScript: Yes
- ESLint: Yes
- Tailwind: Yes
- `src/` directory: No
- App Router: Yes
- Import alias: Yes (`@/*`)

---

## Step 2: Install dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
```

No other dependencies. Do not add UI component libraries, icon packs, or date libraries at this stage.

---

## Step 3: Environment variables

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

Create `.env.example` with the same keys but empty values — this one gets committed to git.

Add to `.gitignore`:
```
.env.local
```

---

## Step 4: Supabase client helpers

Create `lib/supabase.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

// Browser client — use in Client Components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `lib/supabase-server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server client — use in Server Components, API routes, and middleware
export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

---

## Step 5: TypeScript types

Create `types/index.ts` with ALL Kepler types. Every phase will import from here.

```typescript
// ─── User Memory ─────────────────────────────────────────────────────────────

export type Goal = {
  title: string
  priority: 'high' | 'medium' | 'low'
}

export type Constraints = {
  work_start: string  // "09:00"
  work_end: string    // "18:00"
  block_all_day_events: boolean
}

export type Routine = {
  title: string
  duration_mins: number
}

export type UserMemory = {
  user_id: string
  goals: Goal[]
  constraints: Constraints
  routines: Routine[]
  onboarding_complete: boolean
  updated_at: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'done' | 'skipped'

export type Task = {
  id: string
  user_id: string
  title: string
  priority: TaskPriority
  deadline: string | null    // ISO timestamp or null
  status: TaskStatus
  estimated_duration_mins: number | null
  created_at: string
  completed_at: string | null
}

export type CreateTaskInput = {
  title: string
  priority?: TaskPriority
  deadline?: string | null
  estimated_duration_mins?: number | null
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export type PlanBlockType = 'task' | 'calendar' | 'buffer'

export type PlanBlock = {
  task_id: string | null        // null for calendar events and buffers
  title: string
  start: string                 // "09:00"
  end: string                   // "10:30"
  flexible: boolean             // false = cannot be moved by replanning
  type: PlanBlockType
  reason?: string               // why this block was placed here (for explainability)
}

export type PlanningState = {
  id: string
  user_id: string
  plan_date: string             // "YYYY-MM-DD"
  blocks: PlanBlock[]
  previous_blocks: PlanBlock[] | null   // snapshot before last replan
  version: number
  last_replan_reason: string | null
  created_at: string
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export type CalendarBlock = {
  title: string
  start: string   // "09:00"
  end: string     // "10:00"
}

// ─── Interruptions ───────────────────────────────────────────────────────────

export type InterruptionLog = {
  id: string
  user_id: string
  raw_input: string
  parsed_drift_mins: number | null
  affected_task_id: string | null
  replan_triggered: boolean
  confidence: 'high' | 'low'
  created_at: string
}

// ─── LLM Parser Output ───────────────────────────────────────────────────────

export type ParsedIntent =
  | {
      type: 'interruption'
      drift_mins: number
      affected_task: string | null
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'add_task'
      new_task: CreateTaskInput
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'update_memory'
      memory_update: Partial<UserMemory>
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'chat'
      confidence: 'high' | 'low'
      response: string
    }

// ─── API Response Types ───────────────────────────────────────────────────────

export type ChatResponse = {
  message: string
  plan: PlanBlock[] | null
  replanReason: string | null
  requiresConfirmation: boolean
  pendingDrift?: number
}
```

---

## Step 6: Create directory structure

Create these empty directories with `.gitkeep` files:

```bash
mkdir -p app/\(auth\)/login
mkdir -p app/auth/callback
mkdir -p app/onboarding
mkdir -p app/dashboard
mkdir -p app/api/chat
mkdir -p app/api/plan
mkdir -p app/api/tasks
mkdir -p components/chat
mkdir -p components/plan
mkdir -p components/tasks
mkdir -p components/ui
mkdir -p supabase
```

---

## Step 7: Placeholder pages

Create `app/page.tsx` (root redirect):
```typescript
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/login')
}
```

---

## Verification

Run:
```bash
npm run dev
```

Expected: App starts without TypeScript errors. Visiting `http://localhost:3000` redirects to `/login` (which shows a 404 for now — that's fine).

Run:
```bash
npm run build
```

Expected: Build completes without errors.

---

## Do NOT do in this phase
- Do not create any Supabase tables yet (Phase 2)
- Do not add any Google OAuth config yet (Phase 1)
- Do not install any UI component libraries
- Do not write any feature code
