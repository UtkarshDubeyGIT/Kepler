import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  // Load all data in parallel for fast initial render
  const [memoryResult, tasksResult, planResult] = await Promise.all([
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).neq('status', 'done').order('created_at', { ascending: true }),
    supabase.from('planning_state').select('*').eq('user_id', user.id).eq('plan_date', today).single(),
  ])

  // If onboarding not complete, redirect
  if (!memoryResult.data?.onboarding_complete) {
    redirect('/onboarding')
  }

  return (
    <DashboardClient
      initialMemory={memoryResult.data}
      initialTasks={tasksResult.data ?? []}
      initialPlan={planResult.data}
      userEmail={user.email ?? ''}
    />
  )
}
