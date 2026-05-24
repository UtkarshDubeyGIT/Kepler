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
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex-none px-4 py-3 flex items-center justify-between transition-theme"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="text-sm font-semibold">Today&apos;s Plan</h2>
          {plan?.last_replan_reason && (
            <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--primary)' }}>{plan.last_replan_reason}</p>
          )}
        </div>
        {hasUndo && (
          <button
            onClick={handleUndo}
            disabled={undoing}
            id="undo-replan"
            className="text-xs rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors flex items-center gap-1.5 focus:outline-none cursor-pointer"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            ↩ Undo replan
          </button>
        )}
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {blocks.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p className="text-2xl mb-2">📅</p>
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
  const isHighPriority = !isCalendar && block.flexible === false

  // Color scheme based on block type
  const style = isCalendar
    ? { background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)' }
    : isHighPriority
    ? { background: 'rgba(79, 70, 229, 0.08)', border: '1px solid rgba(79, 70, 229, 0.2)' }
    : { background: 'var(--surface)', border: '1px solid var(--border)' }

  const labelColor = isCalendar ? '#06B6D4' : isHighPriority ? 'var(--primary)' : undefined

  return (
    <div className="rounded-xl px-3 py-2.5 transition-all duration-200 hover:shadow-sm" style={style}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: labelColor ?? 'var(--text)' }}>
            {block.title}
          </p>
          {block.reason && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{block.reason}</p>
          )}
        </div>
        <div className="text-right flex-none">
          <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {block.start}–{block.end}
          </p>
          {isCalendar && (
            <span className="text-[10px] font-medium" style={{ color: '#06B6D4' }}>Calendar</span>
          )}
          {isHighPriority && (
            <span className="text-[10px] font-medium" style={{ color: 'var(--primary)' }}>High priority</span>
          )}
        </div>
      </div>
    </div>
  )
}
