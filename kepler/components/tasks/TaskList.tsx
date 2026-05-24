'use client'

import { useState } from 'react'
import type { Task } from '@/types'
import TaskItem from './TaskItem'

type Props = {
  tasks: Task[]
  onTaskAdded: (task: Task) => void
  onTaskUpdated: (task: Task) => void
  onTaskDeleted: (id: string) => void
}

export default function TaskList({ tasks, onTaskAdded, onTaskUpdated, onTaskDeleted }: Props) {
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
        onTaskAdded(data.task)
        setNewTitle('')
        setAdding(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex-none px-4 py-3 flex items-center justify-between transition-theme"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold">
          Tasks <span style={{ color: 'var(--text-muted)' }} className="font-normal">({pending.length})</span>
        </h2>
        <button
          onClick={() => setAdding(true)}
          id="add-task-btn"
          className="text-xs text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none cursor-pointer"
          style={{ background: 'var(--primary)' }}
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
              className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              autoFocus
              id="new-task-input"
            />
            <button
              onClick={handleAddTask}
              disabled={!newTitle.trim() || submitting}
              className="text-xs text-white rounded-lg px-3 py-2 disabled:opacity-40 cursor-pointer"
              style={{ background: 'var(--primary)' }}
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle('') }}
              className="text-xs rounded-lg px-2 py-2 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Deadline tasks */}
        {withDeadline.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>With deadlines</p>
            {withDeadline.map(task => (
              <TaskItem key={task.id} task={task} onUpdated={onTaskUpdated} onDeleted={onTaskDeleted} />
            ))}
          </div>
        )}

        {/* Backlog */}
        {backlog.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Backlog</p>
            {backlog.map(task => (
              <TaskItem key={task.id} task={task} onUpdated={onTaskUpdated} onDeleted={onTaskDeleted} />
            ))}
          </div>
        )}

        {pending.length === 0 && !adding && (
          <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm">No tasks yet. Add some above or tell Kepler in chat.</p>
          </div>
        )}
      </div>
    </div>
  )
}
