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

  const priorityColors: Record<string, string> = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#94A3B8',
  }

  const deadlineFmt = task.deadline
    ? new Date(task.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      className={`flex items-center gap-3 py-2 px-2 rounded-lg group transition-colors ${loading ? 'opacity-50' : ''}`}
      style={{ ['--hover-bg' as string]: 'var(--surface)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Checkbox */}
      <button
        onClick={markDone}
        disabled={loading}
        className="w-4 h-4 rounded-full border-2 flex-none transition-colors focus:outline-none cursor-pointer"
        style={{ borderColor: 'var(--text-muted)' }}
        aria-label={`Mark "${task.title}" as done`}
      />

      {/* Priority dot */}
      <span
        className="w-2 h-2 rounded-full flex-none"
        style={{ background: priorityColors[task.priority] }}
      />

      {/* Title */}
      <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{task.title}</span>

      {/* Deadline */}
      {deadlineFmt && (
        <span className="text-xs flex-none" style={{ color: 'var(--text-muted)' }}>{deadlineFmt}</span>
      )}

      {/* Delete */}
      <button
        onClick={deleteTask}
        disabled={loading}
        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-none cursor-pointer"
        style={{ color: 'var(--text-muted)' }}
        aria-label={`Delete "${task.title}"`}
      >
        ✕
      </button>
    </div>
  )
}
