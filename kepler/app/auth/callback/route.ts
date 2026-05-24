import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Save the Google Calendar token for server-side calendar access
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.provider_token) {
    await supabase.from('user_tokens').upsert({
      user_id: session.user.id,
      provider: 'google_calendar',
      access_token: session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
      updated_at: new Date().toISOString(),
    })
  }

  // Check if user has completed onboarding
  const { data: memory } = await supabase
    .from('user_memory')
    .select('onboarding_complete')
    .eq('user_id', session!.user.id)
    .single()

  const destination = memory?.onboarding_complete ? '/dashboard' : '/onboarding'
  return NextResponse.redirect(`${origin}${destination}`)
}
