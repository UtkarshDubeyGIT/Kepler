'use client'

import { useState } from 'react'
import type { Task, PlanningState, UserMemory } from '@/types'
import ChatPanel from '@/components/chat/ChatPanel'
import PlanView from '@/components/plan/PlanView'
import TaskList from '@/components/tasks/TaskList'
import ThemeToggle from '@/components/ui/ThemeToggle'

type MobileTab = 'chat' | 'plan' | 'tasks'

type Props = {
  initialMemory: UserMemory | null
  initialTasks: Task[]
  initialPlan: PlanningState | null
  userEmail: string
}

export default function DashboardClient({ initialTasks, initialPlan, userEmail }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [plan, setPlan] = useState<PlanningState | null>(initialPlan)
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')

  function handlePlanUpdate(newPlan: PlanningState) {
    setPlan(newPlan)
  }

  function handleTaskAdded(task: Task) {
    setTasks(prev => {
      // Upsert: replace if exists, append if new — prevents duplicate keys
      const exists = prev.some(t => t.id === task.id)
      if (exists) return prev.map(t => t.id === task.id ? task : t)
      return [...prev, task]
    })
  }

  function handleTasksRefreshed(freshTasks: Task[]) {
    setTasks(freshTasks)
  }

  function handleTaskUpdated(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleTaskDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const tabs: { key: MobileTab; label: string; icon: string }[] = [
    { key: 'chat', label: 'Chat', icon: '💬' },
    { key: 'plan', label: "Today's Plan", icon: '📋' },
    { key: 'tasks', label: 'Tasks', icon: '✓' },
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden transition-theme" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <header
        className="flex-none px-4 py-3 flex items-center justify-between transition-theme"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-lg font-bold tracking-tight">Kepler</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{userEmail}</span>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <div
        className="flex-none md:hidden px-2 transition-theme"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className="flex-1 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                borderBottom: mobileTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                color: mobileTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop: Chat panel (left, 55%) */}
        <div className={`md:flex md:flex-col md:w-[55%] overflow-hidden ${
          mobileTab === 'chat' ? 'flex flex-col flex-1' : 'hidden'
        }`} style={{ borderRight: '1px solid var(--border)' }}>
          <ChatPanel
            onPlanUpdate={handlePlanUpdate}
            onTaskAdded={handleTaskAdded}
            onTasksRefreshed={handleTasksRefreshed}
          />
        </div>

        {/* Desktop: Right panel (45%) */}
        <div className={`md:flex md:flex-col md:w-[45%] overflow-hidden ${
          mobileTab !== 'chat' ? 'flex flex-col flex-1' : 'hidden md:flex'
        }`}>

          {/* Plan View */}
          <div className={`md:flex md:flex-col md:h-1/2 overflow-hidden ${
            mobileTab === 'plan' ? 'flex flex-col flex-1' : 'hidden md:flex'
          }`} style={{ borderBottom: '1px solid var(--border)' }}>
            <PlanView
              plan={plan}
              onUndo={handlePlanUpdate}
            />
          </div>

          {/* Task List */}
          <div className={`md:flex md:flex-col md:h-1/2 overflow-hidden ${
            mobileTab === 'tasks' ? 'flex flex-col flex-1' : 'hidden md:flex'
          }`}>
            <TaskList
              tasks={tasks}
              onTaskAdded={handleTaskAdded}
              onTaskUpdated={handleTaskUpdated}
              onTaskDeleted={handleTaskDeleted}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
