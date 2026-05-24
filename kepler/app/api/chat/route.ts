import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseUserMessage } from '@/lib/llm'
import { generatePlan, replan } from '@/lib/planner'
import type { Task, PlanBlock, ChatResponse } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
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
      affected_task_id: null,
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
          [],
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
    const { error } = await supabase.from('tasks').insert({
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

  if (intent.type === 'reschedule_task') {
    const { task_title, new_deadline } = intent

    // Fuzzy match: find a pending task whose title contains the user's words (case-insensitive)
    const matchedTask = tasks.find(t =>
      t.title.toLowerCase().includes(task_title.toLowerCase()) ||
      task_title.toLowerCase().includes(t.title.toLowerCase())
    )

    if (matchedTask && new_deadline) {
      const { error } = await supabase
        .from('tasks')
        .update({ deadline: new_deadline })
        .eq('id', matchedTask.id)

      if (error) {
        console.error('Task reschedule error:', error)
        responseText = "I had trouble rescheduling that task. Please try again."
      }
    } else if (!matchedTask) {
      responseText = `I couldn't find a task matching "${task_title}". Could you rephrase or check your task list?`
    } else {
      responseText = "I understood you want to reschedule, but I couldn't figure out the new date. Could you be more specific?"
    }
  }

  if (intent.type === 'update_memory') {
    const { memory_update } = intent
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

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
    pendingDrift: requiresConfirmation && intent.type === 'interruption' ? intent.drift_mins : undefined,
  } satisfies ChatResponse)
}
