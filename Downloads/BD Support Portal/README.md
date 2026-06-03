# BD Support Portal

A client support portal built with Next.js 15, Supabase, and shadcn/ui.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Auth & Database**: Supabase (`@supabase/ssr`)
- **Email**: Resend
- **AI**: Anthropic Claude

## Getting Started

### 1. Copy environment variables

```bash
cp .env.local.example .env.local
```

Fill in each value — see the table below.

### 2. Install dependencies

```bash
npm install
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL (Settings > API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (Settings > API) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key — server-only, never expose to the client |
| `RESEND_API_KEY` | ✅ | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | ✅ | Verified sender address in Resend |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for AI features |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public app URL (e.g. `http://localhost:3000`); used for auth redirects |

---

## Project Structure

```
app/
  (portal)/          # Authenticated routes — share the top nav layout
    dashboard/
    tickets/
  auth/callback/     # Supabase auth code-exchange route handler
  login/
  signup/
  verify-email/
  page.tsx           # Public landing page
components/
  top-nav.tsx        # Authenticated nav with user dropdown
  ui/                # shadcn/ui components
lib/
  supabase/
    server.ts        # Server components / route handlers
    browser.ts       # Client components
    admin.ts         # Service role — server-only
middleware.ts        # Session refresh + route gating
```
