import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generatePlan, replan } from '@/lib/planner'
import { getTodayCalendarEvents } from '@/lib/calendar'
import type { Task, PlanBlock, CalendarBlock } from '@/types'

// GET /api/plan — Returns today's plan, generating it if it doesn't exist
export async function GET() {
  const supabase = await createServerSupabaseClient()
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
  const [memoryResult, tasksResult] = await Promise.all([
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: true }),
  ])

  const memory = memoryResult.data
  const tasks: Task[] = tasksResult.data ?? []

  if (!memory) {
    return NextResponse.json({ error: 'User memory not found' }, { status: 404 })
  }

  // Fetch calendar events
  const blockAllDayEvents = memory?.constraints?.block_all_day_events ?? false
  let calendarBlocks: CalendarBlock[] = []
  try {
    calendarBlocks = await getTodayCalendarEvents(user.id, blockAllDayEvents)
  } catch (err) {
    console.warn('Calendar fetch failed, proceeding without calendar:', err)
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
  const supabase = await createServerSupabaseClient()
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
