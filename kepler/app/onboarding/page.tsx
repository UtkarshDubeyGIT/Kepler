'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseWorkHours } from '@/lib/parse-work-hours'
import { parseGoals } from '@/lib/parse-goals'

type Step = {
  key: 'goals' | 'work_hours' | 'commitments' | 'block_all_day_events'
  question: string
  placeholder: string
  hint: string
}

const STEPS: Step[] = [
  {
    key: 'goals',
    question: "What are your top priorities right now?",
    placeholder: "e.g. Finish my capstone project, prep for campus placements, build a side project...",
    hint: "List up to 5 things. These help Kepler understand what matters most.",
  },
  {
    key: 'work_hours',
    question: "What are your typical working hours?",
    placeholder: "e.g. 9am to 6pm",
    hint: "Kepler won't schedule tasks outside these hours.",
  },
  {
    key: 'commitments',
    question: "Any fixed commitments Kepler should always work around?",
    placeholder: "e.g. 9am standup Mon–Fri, gym at 7pm, college from 9am–4pm",
    hint: "These will always be treated as non-negotiable blocks.",
  },
  {
    key: 'block_all_day_events',
    question: "Should Kepler block out your day for all-day calendar events?",
    placeholder: "Type 'yes' or 'no'. (Default: no)",
    hint: "If yes, all-day events explicitly marked as 'Busy' in Google Calendar will block scheduling.",
  },
]

type Answers = {
  goals: string
  work_hours: string
  commitments: string
  block_all_day_events: string
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    goals: '',
    work_hours: '',
    commitments: '',
    block_all_day_events: '',
  })
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const currentStep = STEPS[step]
  const isLastStep = step === STEPS.length - 1

  async function handleNext() {
    if (!input.trim() && currentStep.key !== 'block_all_day_events') return

    const updated = { ...answers, [currentStep.key]: input }
    setAnswers(updated)
    setInput('')

    if (!isLastStep) {
      setStep(step + 1)
      return
    }

    // Final step — save to Supabase
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const parsedHours = parseWorkHours(updated.work_hours)
      const parsedGoals = parseGoals(updated.goals)
      const blockAllDayEvents = /yes|block|true|y/i.test(updated.block_all_day_events || 'no')

      // Parse commitments as routines (simple split, no duration in v1)
      const parsedRoutines = updated.commitments
        .split(/[,\n]/)
        .map(r => r.trim())
        .filter(r => r.length > 0)
        .map(title => ({ title, duration_mins: 60 })) // default duration

      await supabase.from('user_memory').upsert({
        user_id: user.id,
        goals: parsedGoals,
        constraints: {
          ...parsedHours,
          block_all_day_events: blockAllDayEvents,
        },
        routines: parsedRoutines,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      })

      router.push('/dashboard')
    } catch (err) {
      console.error('Onboarding save error:', err)
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleNext()
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-24 px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4" style={{ background: 'var(--primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Let&apos;s set you up</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            This takes about 2 minutes. Kepler learns from your answers.
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? 'var(--primary)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        {/* Question */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Question {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text)' }}>
            {currentStep.question}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{currentStep.hint}</p>
        </div>

        {/* Input */}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentStep.placeholder}
          rows={4}
          className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 transition-shadow"
          style={{
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
          autoFocus
        />

        {/* Error */}
        {error && (
          <p className="text-sm mt-2" style={{ color: '#EF4444' }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          {step > 0 ? (
            <button
              onClick={() => { setStep(step - 1); setInput(answers[STEPS[step - 1].key]) }}
              className="text-sm transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            disabled={(currentStep.key !== 'block_all_day_events' && !input.trim()) || saving}
            className="text-white text-sm font-medium px-6 py-2.5 rounded-xl disabled:opacity-40 transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}
          >
            {saving ? 'Saving...' : isLastStep ? 'Start planning →' : 'Next →'}
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-right mt-2" style={{ color: 'var(--text-muted)' }}>
          Press Enter to continue
        </p>
      </div>
    </div>
  )
}
