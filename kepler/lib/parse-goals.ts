import type { Goal } from '@/types'

// Converts a free-text goals string into a Goal[] array.
// Splits on newlines, commas, or numbered lists.
export function parseGoals(input: string): Goal[] {
  if (!input.trim()) return []

  // Split on newlines, or comma if no newlines
  const lines = input.includes('\n')
    ? input.split('\n')
    : input.split(',')

  return lines
    .map(line => line
      .replace(/^\d+[.)]\s*/, '') // remove "1. " or "1) " prefixes
      .replace(/^[-•]\s*/, '')     // remove "- " or "• " prefixes
      .trim()
    )
    .filter(line => line.length > 0)
    .slice(0, 5) // cap at 5 goals
    .map(title => ({ title, priority: 'high' as const }))
}
