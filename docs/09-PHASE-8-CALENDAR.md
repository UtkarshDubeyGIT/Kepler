# Phase 8 – Google Calendar Integration
> Read 00-MASTER-CONTEXT.md first. Phase 7 must be complete.

## Goal
Fetch the user's Google Calendar events for today, filter out transparent (free) events, handle all-day events according to the user's preference, and normalize them into time blocks. Automatically refresh the access token if it has expired.

## Deliverables
- [ ] `lib/calendar.ts` — contains the Google Calendar fetching, token refresh, and normalization logic
- [ ] Integration with `GET /api/plan` route (Phase 6 API) to feed calendar blocks into plan generation
- [ ] Settings option displayed on dashboard UI or onboarding to configure `block_all_day_events`

---

## Step 1: Create Calendar Integration Helper

Create `lib/calendar.ts`:

```typescript
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
  const supabase = createServerSupabaseClient()

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
  } catch (err: any) {
    // If unauthorized, attempt to refresh token
    if (err.message?.includes('401') && tokenData.refresh_token) {
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
  const supabase = createServerSupabaseClient()

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
  return parts[1].slice(0, 5) // Extracted "HH:MM"
}
```

---

## Step 2: Update API Plan Route

Modify `app/api/plan/route.ts` to call `getTodayCalendarEvents` with the user constraints:

```typescript
// Fetch user memory constraints
const blockAllDayEvents = memory?.constraints?.block_all_day_events ?? false;

// Fetch calendar events
let calendarBlocks: CalendarBlock[] = []
try {
  calendarBlocks = await getTodayCalendarEvents(user.id, blockAllDayEvents)
} catch (err) {
  console.warn('Calendar fetch failed, proceeding without calendar:', err)
}
```

---

## Step 3: Add Dashboard UI Settings Toggle

Add a settings toggle/checkbox in `components/plan/PlanView.tsx` or as a popover to allow users to update their all-day event blocking preference dynamically:

```typescript
async function handleToggleAllDayEventsSetting(checked: boolean) {
  await fetch('/api/user/memory', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block_all_day_events: checked }),
  })
}
```

---

## Verification

1. Create a dummy calendar event in Google Calendar:
   - Event A: all-day event marked as **Busy**
   - Event B: all-day event marked as **Free**
   - Event C: normal event 11:00 AM - 12:00 PM
2. Enable calendar integration for your user.
3. Verify that:
   - Event C is scheduled in the plan.
   - Event B (transparent) is skipped.
   - Event A (all-day busy) is scheduled and blocks scheduling if `block_all_day_events` is enabled.
   - Event A is skipped if `block_all_day_events` is disabled.
4. Manually expire the database token and check server console to verify that the token refresh flow succeeds automatically on page reload.
