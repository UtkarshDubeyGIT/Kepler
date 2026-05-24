import { createServerSupabaseClient } from './supabase-server'
import type { CalendarBlock } from '@/types'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ─── Main Calendar Event Fetcher ──────────────────────────────────────────

/**
 * Fetches today's Google Calendar events for the user.
 * Automatically attempts to refresh the OAuth token if expired.
 *
 * @param userId - The user's ID
 * @param blockAllDayEvents - User preference for blocking all-day events
 * @returns Array of normalized CalendarBlock items
 */
export async function getTodayCalendarEvents(
  userId: string,
  blockAllDayEvents: boolean = false
): Promise<CalendarBlock[]> {
  const supabase = await createServerSupabaseClient()

  // 1. Fetch token from user_tokens table
  const { data: tokenData, error: tokenError } = await supabase
    .from('user_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (tokenError || !tokenData?.access_token) {
    console.warn('No Google token found for user:', userId)
    return []
  }

  let accessToken = tokenData.access_token

  try {
    return await fetchEventsFromGoogle(accessToken, blockAllDayEvents)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    // If unauthorized, attempt to refresh token
    if (errorMessage.includes('401') && tokenData.refresh_token) {
      console.log('Access token expired. Refreshing token for user:', userId)
      try {
        accessToken = await refreshGoogleToken(userId, tokenData.refresh_token)
        return await fetchEventsFromGoogle(accessToken, blockAllDayEvents)
      } catch (refreshErr) {
        console.error('Token refresh failed:', refreshErr)
      }
    } else {
      console.error('Failed to fetch calendar events:', err)
    }
  }

  return []
}

// ─── Google API Fetch Helper ──────────────────────────────────────────────

async function fetchEventsFromGoogle(
  accessToken: string,
  blockAllDayEvents: boolean
): Promise<CalendarBlock[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', todayStart.toISOString())
  url.searchParams.set('timeMax', todayEnd.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Google Calendar API response error: ${response.status}`)
  }

  const data = await response.json()
  const items = data.items || []

  const calendarBlocks: CalendarBlock[] = []

  for (const event of items) {
    const isAllDay = !!event.start?.date
    const transparency = event.transparency ?? 'opaque' // opaque = busy, transparent = free

    // 1. Skip transparent/free events
    if (transparency === 'transparent') {
      continue
    }

    if (isAllDay) {
      // 2. Handle all-day event based on user preference
      if (!blockAllDayEvents) {
        continue
      }

      // All-day event blocks the full day slot (clamped by planning engine)
      calendarBlocks.push({
        title: event.summary || 'All-day Busy Event',
        start: '00:00',
        end: '23:59',
      })
    } else {
      // 3. Regular event: parse HH:MM from ISO string
      const startDateTime = event.start?.dateTime
      const endDateTime = event.end?.dateTime

      if (!startDateTime || !endDateTime) continue

      calendarBlocks.push({
        title: event.summary || 'Calendar Event',
        start: extractLocalTime(startDateTime),
        end: extractLocalTime(endDateTime),
      })
    }
  }

  return calendarBlocks
}

// ─── Token Refresh Handler ────────────────────────────────────────────────

async function refreshGoogleToken(userId: string, refreshToken: string): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error(`Google token refresh request failed: ${response.status}`)
  }

  const data = await response.json()
  const newAccessToken = data.access_token

  if (!newAccessToken) {
    throw new Error('Refresh response missing access_token')
  }

  // Update new token in user_tokens table
  await supabase.from('user_tokens').update({
    access_token: newAccessToken,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return newAccessToken
}

// ─── Time Utilities ───────────────────────────────────────────────────────

function extractLocalTime(dateTimeStr: string): string {
  const parts = dateTimeStr.split('T')
  if (parts.length < 2) return '09:00'
  return parts[1].slice(0, 5) // Extract "HH:MM"
}
