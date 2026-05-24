# Phase 9 – Deployment
> Read 00-MASTER-CONTEXT.md first. Phase 8 must be complete.

## Goal
Deploy the complete, responsive Kepler MVP web application to Vercel and verify that authentication, calendar API access, database queries, and the LLM parsing logic work end-to-end in the production environment.

## Deliverables
- [ ] Successful production build using `npm run build`
- [ ] Vercel project configuration and environment variables configured
- [ ] Supabase OAuth redirect settings updated with production URLs
- [ ] Google Cloud Console OAuth redirect URLs updated

---

## Step 1: Pre-deployment Checks

Ensure the project compiles and builds successfully locally:
```bash
npm run build
```
Verify that there are no TypeScript, ESLint, or bundle-time errors in console.

---

## Step 2: Set Up Vercel Project

1. Push your repository to GitHub (or select local import in Vercel CLI).
2. Go to [Vercel Dashboard](https://vercel.com) and click **Add New** → **Project**.
3. Select your Kepler repository.
4. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `<your-supabase-project-url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<your-supabase-anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<your-supabase-service-role-key>`
   - `GEMINI_API_KEY` = `<your-gemini-api-key>`
   - `GOOGLE_CLIENT_ID` = `<your-google-oauth-client-id>` (used for token refresh)
   - `GOOGLE_CLIENT_SECRET` = `<your-google-oauth-client-secret>` (used for token refresh)
5. Click **Deploy**. Note down the deployment domain (e.g. `https://kepler-replan.vercel.app`).

---

## Step 3: Update Redirect Configurations

Because authentication redirect targets change in production, you must update Supabase and Google settings:

### A. Google Cloud Console
1. Go to [Google Cloud APIs & Services](https://console.cloud.google.com/apis/credentials).
2. Find the OAuth 2.0 Client ID created in Phase 1.
3. Add the Supabase Production Callback URL to **Authorized redirect URIs**:
   - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   *(Ensure this matches the Supabase reference used in production).*

### B. Supabase Dashboard
1. Go to [Supabase Console](https://supabase.com) → Project Settings → **Authentication** → **Redirect URLs**.
2. Add your Vercel deployment URL to **Redirect URLs**:
   - `https://<your-vercel-domain>.vercel.app/auth/callback`
3. Click Save.

---

## Step 4: Verify Deployment

1. Navigate to your production URL: `https://<your-vercel-domain>.vercel.app/`
2. Click **Continue with Google**.
3. Grant calendar access on the OAuth screen.
4. complete the onboarding questions.
5. Create a new task, send a chat message detailing a 30-minute meeting delay, and verify the replanning suggestions and undo feature behave correctly.
