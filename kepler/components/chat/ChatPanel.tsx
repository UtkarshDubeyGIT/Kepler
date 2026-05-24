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
  onTasksRefreshed: (tasks: Task[]) => void
}

export default function ChatPanel({ onPlanUpdate, onTaskAdded, onTasksRefreshed }: Props) {
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
  const inputRef = useRef<HTMLInputElement>(null)

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
        fetchAndUpdatePlan()
      }

      // If large drift — show confirmation UI
      if (data.requiresConfirmation && data.pendingDrift) {
        setPendingDrift(data.pendingDrift)
      }

      // Refresh tasks after add_task
      fetchAndUpdateTasks()
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Something went wrong. Please try again.",
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function fetchAndUpdatePlan() {
    const res = await fetch('/api/plan')
    const data = await res.json()
    if (data.plan) onPlanUpdate(data.plan)
  }

  async function fetchAndUpdateTasks() {
    const res = await fetch('/api/tasks')
    const data = await res.json()
    if (data.tasks) {
      onTasksRefreshed(data.tasks)
    }
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
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'system' ? 'w-full max-w-full rounded-xl text-xs' : ''
              }`}
              style={{
                ...(msg.role === 'user' ? {
                  background: 'var(--primary)',
                  color: 'white',
                } : msg.role === 'system' ? {
                  background: 'var(--primary)',
                  opacity: 0.1,
                  color: 'var(--primary)',
                  border: '1px solid var(--primary)',
                } : {
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }),
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
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
      <div
        className="flex-none px-4 py-3 flex gap-2 items-center transition-theme"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell Kepler what's happening..."
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 transition-shadow"
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
          disabled={loading}
          id="chat-input"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="text-white rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40 transition-colors flex-none cursor-pointer"
          style={{ background: 'var(--primary)' }}
          id="chat-send"
        >
          Send
        </button>
      </div>
    </div>
  )
}
