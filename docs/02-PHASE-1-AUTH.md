# Phase 1 – Auth + Google OAuth + Calendar Token
> Read 00-MASTER-CONTEXT.md first. Phase 0 must be complete.

## Goal
Users can sign in with Google. Kepler requests Google Calendar read-only access at the same time as login (single OAuth flow). The calendar token is stored in the database for later server-side use.

## Deliverables
- [ ] Login page at `/login`
- [ ] Auth callback route at `/auth/callback`
- [ ] Google provider token saved to `user_tokens` table after login
- [ ] Redirect to `/onboarding` if user has not completed onboarding, `/dashboard` if they have
- [ ] Middleware protecting `/dashboard` and `/onboarding` routes

---

## Prerequisites (Manual — Agent Cannot Do These)

The developer must complete these steps manually before running this phase:

1. **Create a Supabase project** at supabase.com. Get the Project URL and anon key and add them to `.env.local`.
2. **Enable Google provider in Supabase**: Authentication → Providers → Google → Enable.
3. **Create Google OAuth credentials** in Google Cloud Console:
   - Create a project
   - Enable the Google Calendar API (APIs & Services → Library → "Google Calendar API")
   - Create OAuth credentials (APIs & Services → Credentials → Create OAuth Client ID → Web application)
   - Add Supabase callback URL as authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret into Supabase Google provider settings
4. Add your Gemini API key to `.env.local`.

---

## Step 1: Middleware

Create `middleware.ts` at the project root:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedRoutes = ['/dashboard', '/onboarding']
  const isProtected = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route))

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

---

## Step 2: Login page

Create `app/(auth)/login/page.tsx`:

```typescript
'use client'

import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Request calendar access at the same time as login — single OAuth screen
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',   // ensures we get a refresh token
          prompt: 'consent',        // forces consent screen so refresh token is always returned
        },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm px-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Kepler</h1>
        <p className="text-slate-500 mb-10 text-sm leading-relaxed">
          Your planning assistant that remembers your goals and adapts when life changes.
        </p>
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        <p className="text-xs text-slate-400 mt-4">
          Kepler will request read-only access to your Google Calendar.
        </p>
      </div>
    </div>
  )
}
```

---

## Step 3: Auth callback route

Create `app/auth/callback/route.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = cookies()
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
```

---

## Step 4: Create user_tokens table

Run this SQL in Supabase SQL Editor (or wait for Phase 2 when you run the full schema):

```sql
create table if not exists public.user_tokens (
  user_id uuid references auth.users(id) on delete cascade primary key,
  provider text not null,
  access_token text,
  refresh_token text,
  updated_at timestamptz default now()
);

alter table public.user_tokens enable row level security;
create policy "Users see own tokens" on public.user_tokens
  for all using (auth.uid() = user_id);
```

---

## Verification

1. Run `npm run dev`
2. Visit `http://localhost:3000` → should redirect to `/login`
3. Click "Continue with Google" → should redirect to Google OAuth
4. Complete Google sign-in → should redirect back to `/auth/callback` → then to `/onboarding` (404 for now is fine)
5. Check Supabase → Authentication → Users → your user should appear
6. Check Supabase → Table Editor → `user_tokens` → should have a row with your `access_token`

---

## Common Issues

**"redirect_uri_mismatch" from Google**: The redirect URI in Google Cloud Console doesn't match. Ensure you added `https://<project-ref>.supabase.co/auth/v1/callback` exactly.

**No refresh token**: Make sure `access_type: 'offline'` and `prompt: 'consent'` are set in the OAuth options.

**Middleware infinite redirect**: Check that `/login` is not in the protected routes list.
