// Parses free-text work hours into 24-hour HH:MM strings.
// Falls back to 09:00–18:00 if parsing fails.
export function parseWorkHours(input: string): { work_start: string; work_end: string } {
  const DEFAULT = { work_start: '09:00', work_end: '18:00' }
  if (!input) return DEFAULT

  // Normalize input: lowercase, remove "to" variants
  const normalized = input.toLowerCase()
    .replace(/\s+to\s+/g, '-')
    .replace(/\s*–\s*/g, '-')
    .replace(/\s*—\s*/g, '-')

  // Match patterns like "9am-6pm", "9:30am-5:30pm", "09:00-18:00"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi
  const matches = [...normalized.matchAll(timePattern)]

  if (matches.length < 2) return DEFAULT

  function toMinutes(match: RegExpMatchArray): number {
    let hours = parseInt(match[1])
    const mins = parseInt(match[2] || '0')
    const period = match[3]?.toLowerCase()

    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    // If no period, treat >= 8 as AM and < 8 as PM
    if (!period) {
      if (hours < 8) hours += 12
    }

    return hours * 60 + mins
  }

  function toHHMM(totalMins: number): string {
    const h = Math.floor(totalMins / 60).toString().padStart(2, '0')
    const m = (totalMins % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  }

  const startMins = toMinutes(matches[0])
  const endMins = toMinutes(matches[1])

  // Basic sanity check
  if (startMins >= endMins || startMins < 0 || endMins > 24 * 60) return DEFAULT

  return {
    work_start: toHHMM(startMins),
    work_end: toHHMM(endMins),
  }
}
