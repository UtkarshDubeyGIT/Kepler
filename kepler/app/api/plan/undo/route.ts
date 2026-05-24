import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// POST /api/plan/undo — Restore the previous plan version
export async function POST() {
  const supabase = await createServerSupabaseClient()
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
