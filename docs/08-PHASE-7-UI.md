# Phase 7 – Dashboard UI
> Read 00-MASTER-CONTEXT.md first. Phase 6 must be complete.

## Goal
The main app interface. Split-panel layout on desktop (chat left, plan + tasks right). Single column on mobile. Shows today's plan, task list, chat interface, and replan diff with undo.

## Deliverables
- [ ] `app/dashboard/page.tsx` — dashboard shell (Server Component, loads initial data)
- [ ] `components/chat/ChatPanel.tsx` — chat interface
- [ ] `components/plan/PlanView.tsx` — today's plan view with replan diff
- [ ] `components/plan/PlanBlock.tsx` — individual plan block
- [ ] `components/tasks/TaskList.tsx` — task list sidebar
- [ ] `components/tasks/TaskItem.tsx` — individual task row
- [ ] `components/ui/ConfirmReplan.tsx` — confirmation dialog for large drift
- [ ] Mobile responsive (tab switcher on mobile)

---

## Dashboard Shell

Create `app/dashboard/page.tsx` as a Server Component that loads initial data:

```typescript
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  // Load all data in parallel for fast initial render
  const [memoryResult, tasksResult, planResult] = await Promise.all([
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('user_id', user.id).neq('status', 'done').order('created_at', { ascending: true }),
    supabase.from('planning_state').select('*').eq('user_id', user.id).eq('plan_date', today).single(),
  ])

  return (
    <DashboardClient
      initialMemory={memoryResult.data}
      initialTasks={tasksResult.data ?? []}
      initialPlan={planResult.data}
      userEmail={user.email ?? ''}
    />
  )
}
```

Create `app/dashboard/DashboardClient.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { Task, PlanningState, UserMemory } from '@/types'
import ChatPanel from '@/components/chat/ChatPanel'
import PlanView from '@/components/plan/PlanView'
import TaskList from '@/components/tasks/TaskList'

type MobileTab = 'chat' | 'plan' | 'tasks'

type Props = {
  initialMemory: UserMemory | null
  initialTasks: Task[]
  initialPlan: PlanningState | null
  userEmail: string
}

export default function DashboardClient({ initialMemory, initialTasks, initialPlan, userEmail }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [plan, setPlan] = useState<PlanningState | null>(initialPlan)
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')

  function handlePlanUpdate(newPlan: PlanningState) {
    setPlan(newPlan)
  }

  function handleTaskAdded(task: Task) {
    setTasks(prev => [...prev, task])
  }

  function handleTaskUpdated(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleTaskDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const tabs: { key: MobileTab; label: string }[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'plan', label: "Today's Plan" },
    { key: 'tasks', label: 'Tasks' },
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <header className="flex-none border-b bg-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Kepler</h1>
        <span className="text-xs text-gray-400">{userEmail}</span>
      </header>

      {/* Mobile tab switcher */}
      <div className="flex-none md:hidden border-b bg-white px-4">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                mobileTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop: Chat panel (left, 55%) */}
        <div className={`md:flex md:flex-col md:w-[55%] md:border-r bg-white overflow-hidden ${
          mobileTab === 'chat' ? 'flex flex-col flex-1' : 'hidden'
        }`}>
          <ChatPanel
            onPlanUpdate={handlePlanUpdate}
            onTaskAdded={handleTaskAdded}
            currentPlanVersion={plan?.version ?? 0}
            hasPreviousPlan={!!plan?.previous_blocks}
          />
        </div>

        {/* Desktop: Right panel (45%) */}
        <div className={`md:flex md:flex-col md:w-[45%] overflow-hidden ${
          mobileTab !== 'chat' ? 'flex flex-col flex-1' : 'hidden md:flex'
        }`}>

          {/* Plan View */}
          <div className={`md:flex md:flex-col md:h-1/2 md:border-b overflow-hidden ${
            mobileTab === 'plan' ? 'flex flex-col flex-1' : 'hidden md:flex'
          }`}>
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
              onTaskUpdated={handleTaskUpdated}
              onTaskDeleted={handleTaskDeleted}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Chat Panel

Create `components/chat/ChatPanel.tsx`:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import type { Task, PlanningState, ChatResponse } from '@/types'
import ConfirmReplan from '@/components/ui/ConfirmReplan'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

type Props = {
  onPlanUpdate: (plan: PlanningState) => void
  onTaskAdded: (task: Task) => void
  currentPlanVersion: number
  hasPreviousPlan: boolean
}

export default function ChatPanel({ onPlanUpdate, onTaskAdded, currentPlanVersion, hasPreviousPlan }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm Kepler. Tell me what's happening with your day, report an interruption, or add a task.",
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingDrift, setPendingDrift] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(messageText?: string) {
    const text = (messageText ?? input).trim()
    if (!text || loading) return

    setInput('')
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      const data: ChatResponse = await res.json()

      // Add assistant response
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
      }])

      // If plan was updated, show system message and notify parent
      if (data.plan && data.replanReason) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: 'system',
          content: `📋 ${data.replanReason}`,
        }])
        // Refresh plan from server
        fetchAndUpdatePlan()
      }

      // If large drift — show confirmation UI
      if (data.requiresConfirmation && data.pendingDrift) {
        setPendingDrift(data.pendingDrift)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Something went wrong. Please try again.",
      }])
    } finally {
      setLoading(false)
    }
  }

  async function fetchAndUpdatePlan() {
    const res = await fetch('/api/plan')
    const data = await res.json()
    if (data.plan) onPlanUpdate(data.plan)
  }

  async function handleConfirmReplan(drift: number) {
    setPendingDrift(null)
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drift_mins: drift }),
    })
    const data = await res.json()
    if (data.plan) {
      fetchAndUpdatePlan()
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `📋 ${data.reason}`,
      }])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gray-900 text-white'
                : msg.role === 'system'
                ? 'bg-blue-50 text-blue-800 border border-blue-100 w-full max-w-full rounded-xl text-xs'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Confirm replan prompt */}
      {pendingDrift && (
        <ConfirmReplan
          driftMins={pendingDrift}
          onConfirm={() => handleConfirmReplan(pendingDrift)}
          onDismiss={() => setPendingDrift(null)}
        />
      )}

      {/* Input */}
      <div className="flex-none border-t px-4 py-3 flex gap-2 items-center bg-white">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell Kepler what's happening..."
          className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors flex-none"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

---

## Plan View

Create `components/plan/PlanView.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { PlanningState, PlanBlock } from '@/types'

type Props = {
  plan: PlanningState | null
  onUndo: (plan: PlanningState) => void
}

export default function PlanView({ plan, onUndo }: Props) {
  const [undoing, setUndoing] = useState(false)

  const blocks: PlanBlock[] = (plan?.blocks as PlanBlock[]) ?? []
  const hasUndo = !!plan?.previous_blocks

  async function handleUndo() {
    setUndoing(true)
    try {
      const res = await fetch('/api/plan/undo', { method: 'POST' })
      const data = await res.json()
      if (data.plan && plan) {
        onUndo({ ...plan, blocks: data.plan, previous_blocks: null })
      }
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b flex items-center justify-between bg-white">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Today's Plan</h2>
          {plan?.last_replan_reason && (
            <p className="text-xs text-blue-600 mt-0.5 leading-tight">{plan.last_replan_reason}</p>
          )}
        </div>
        {hasUndo && (
          <button
            onClick={handleUndo}
            disabled={undoing}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            ↩ Undo replan
          </button>
        )}
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {blocks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>No plan yet.</p>
            <p className="mt-1">Add some tasks and Kepler will build your day.</p>
          </div>
        ) : (
          blocks.map((block, i) => (
            <PlanBlockCard key={`${block.start}-${i}`} block={block} />
          ))
        )}
      </div>
    </div>
  )
}

function PlanBlockCard({ block }: { block: PlanBlock }) {
  const isCalendar = block.type === 'calendar'

  return (
    <div className={`rounded-xl px-3 py-2.5 border ${
      isCalendar
        ? 'bg-blue-50 border-blue-100'
        : block.flexible === false
        ? 'bg-orange-50 border-orange-100'
        : 'bg-white border-gray-100'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            isCalendar ? 'text-blue-800' : 'text-gray-800'
          }`}>
            {block.title}
          </p>
          {block.reason && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{block.reason}</p>
          )}
        </div>
        <div className="text-right flex-none">
          <p className="text-xs font-mono text-gray-500">
            {block.start}–{block.end}
          </p>
          {isCalendar && (
            <span className="text-[10px] text-blue-500">Calendar</span>
          )}
          {!isCalendar && block.flexible === false && (
            <span className="text-[10px] text-orange-500">High priority</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Task List

Create `components/tasks/TaskList.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { Task } from '@/types'
import TaskItem from './TaskItem'

type Props = {
  tasks: Task[]
  onTaskUpdated: (task: Task) => void
  onTaskDeleted: (id: string) => void
}

export default function TaskList({ tasks, onTaskUpdated, onTaskDeleted }: Props) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pending = tasks.filter(t => t.status === 'pending')
  const backlog = pending.filter(t => !t.deadline)
  const withDeadline = pending.filter(t => !!t.deadline).sort(
    (a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
  )

  async function handleAddTask() {
    if (!newTitle.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      const data = await res.json()
      if (data.task) {
        onTaskUpdated(data.task)
        setNewTitle('')
        setAdding(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b flex items-center justify-between bg-white">
        <h2 className="text-sm font-semibold text-gray-900">
          Tasks <span className="text-gray-400 font-normal">({pending.length})</span>
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700 transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">

        {/* Quick add */}
        {adding && (
          <div className="flex gap-2 mb-3">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTask()}
              placeholder="Task name..."
              className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <button
              onClick={handleAddTask}
              disabled={!newTitle.trim() || submitting}
              className="text-xs bg-gray-900 text-white rounded-lg px-3 py-2 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle('') }}
              className="text-xs text-gray-500 rounded-lg px-2 py-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Deadline tasks */}
        {withDeadline.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">With deadlines</p>
            {withDeadline.map(task => (
              <TaskItem key={task.id} task={task} onUpdated={onTaskUpdated} onDeleted={onTaskDeleted} />
            ))}
          </div>
        )}

        {/* Backlog */}
        {backlog.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Backlog</p>
            {backlog.map(task => (
              <TaskItem key={task.id} task={task} onUpdated={onTaskUpdated} onDeleted={onTaskDeleted} />
            ))}
          </div>
        )}

        {pending.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-6">
            No tasks yet. Add some above or tell Kepler in chat.
          </p>
        )}
      </div>
    </div>
  )
}
```

Create `components/tasks/TaskItem.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { Task } from '@/types'

type Props = {
  task: Task
  onUpdated: (task: Task) => void
  onDeleted: (id: string) => void
}

export default function TaskItem({ task, onUpdated, onDeleted }: Props) {
  const [loading, setLoading] = useState(false)

  async function markDone() {
    setLoading(true)
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    const data = await res.json()
    if (data.task) onUpdated(data.task)
    setLoading(false)
  }

  async function deleteTask() {
    setLoading(true)
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onDeleted(task.id)
    setLoading(false)
  }

  const priorityDot: Record<string, string> = {
    high: 'bg-red-400',
    medium: 'bg-yellow-400',
    low: 'bg-gray-300',
  }

  const deadlineFmt = task.deadline
    ? new Date(task.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className={`flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 group ${loading ? 'opacity-50' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={markDone}
        disabled={loading}
        className="w-4 h-4 rounded-full border-2 border-gray-300 flex-none hover:border-gray-900 transition-colors"
      />

      {/* Priority dot */}
      <span className={`w-2 h-2 rounded-full flex-none ${priorityDot[task.priority]}`} />

      {/* Title */}
      <span className="flex-1 text-sm text-gray-700 truncate">{task.title}</span>

      {/* Deadline */}
      {deadlineFmt && (
        <span className="text-xs text-gray-400 flex-none">{deadlineFmt}</span>
      )}

      {/* Delete */}
      <button
        onClick={deleteTask}
        disabled={loading}
        className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-none"
      >
        ✕
      </button>
    </div>
  )
}
```

---

## Confirm Replan Component

Create `components/ui/ConfirmReplan.tsx`:

```typescript
type Props = {
  driftMins: number
  onConfirm: () => void
  onDismiss: () => void
}

export default function ConfirmReplan({ driftMins, onConfirm, onDismiss }: Props) {
  return (
    <div className="mx-4 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
      <p className="text-sm text-amber-800 font-medium">Adjust your plan?</p>
      <p className="text-xs text-amber-700 mt-1">
        You lost ~{driftMins} minutes. Should Kepler reschedule the rest of your day?
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onConfirm}
          className="text-xs bg-amber-800 text-white rounded-lg px-4 py-1.5 hover:bg-amber-900"
        >
          Yes, reschedule
        </button>
        <button
          onClick={onDismiss}
          className="text-xs text-amber-700 border border-amber-300 rounded-lg px-4 py-1.5 hover:bg-amber-100"
        >
          No, keep plan
        </button>
      </div>
    </div>
  )
}
```

---

## Verification

1. Sign in → complete onboarding → land on dashboard
2. Desktop: chat panel on left, plan + tasks on right (side by side)
3. Mobile: tab switcher at top showing Chat / Today's Plan / Tasks
4. Send a message in chat → response appears
5. Report an interruption < 20 min → plan auto-updates, system message appears
6. Report an interruption ≥ 20 min → ConfirmReplan prompt appears
7. Click "Undo replan" → plan reverts
8. Add a task via the task list → appears immediately
9. Click the circle on a task → task disappears (marked done)
