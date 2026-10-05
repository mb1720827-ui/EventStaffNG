# EventStaff NG

React + Vite frontend for an event staffing marketplace, backed by Supabase.

## Local development

1. Copy the Supabase project URL and public anon/publishable key into `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-key
```

2. Install dependencies and start the app:

```bash
npm install
npm run dev
```

## Supabase setup

In the Supabase Dashboard SQL Editor, run these in order (both are safe to re-run):

1. [`supabase/schema.sql`](supabase/schema.sql) — tables, seed categories, base policies.
2. [`supabase/migrations/20261005_marketplace_loop.sql`](supabase/migrations/20261005_marketplace_loop.sql) — enables RLS on every table, the hire → book → complete → payout → review loop, admin-only verification, and server-side notifications.
3. [`supabase/migrations/20261010_webapp_ratings_lifecycle.sql`](supabase/migrations/20261010_webapp_ratings_lifecycle.sql) — removes demo professionals/jobs, auto-closes applications when events start, review replies and context, payout confirmation and disputes, push subscriptions, and realtime on notifications.

Optional: enable the **pg_cron** extension (Database › Extensions) *before* running migration 3 so applications close on schedule every 10 minutes. Without it, they still close whenever someone opens a dashboard or event page, and the database refuses late applications and bookings either way.

In **Authentication › URL Configuration**, add `https://<your-domain>/reset-password` (and `http://localhost:5173/reset-password` for local dev) to the redirect allow-list so password-reset emails work.

Then in **Storage**: make the `avatars` bucket public (the migration tries to), and add a policy on the private `documents` bucket letting authenticated users upload to their own `{user_id}/` folder and letting admins read everything (for the verification queue).

## Push notifications (web app)

The app is installable (manifest + service worker in `public/`). In-app alerts (bell + pop-ups) work out of the box over Supabase Realtime. To also deliver notifications to phones/desktops when the app is closed:

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add the **public** key to `.env.local` as `VITE_VAPID_PUBLIC_KEY=...` and rebuild.
3. Deploy the Edge Function and set its secrets:
   ```bash
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:hello@eventstaff.ng
   ```
4. In **Database › Webhooks**, create a webhook on `public.notifications` for **Insert**, type **Supabase Edge Functions**, function `send-push`, with the service-role auth header enabled.

Users then switch on push from **Notifications** or **Account** settings. Push needs HTTPS (localhost is fine). On iPhone/iPad it works only after *Add to Home Screen*. The service worker is registered in production builds; set `VITE_ENABLE_SW=true` to test it under `npm run dev`.

Keep the VAPID **private** key only in Supabase secrets — never in `.env.local` or the repo.

## Admin accounts

To create an admin, sign up normally, then run `update profiles set role = 'admin' where id = '<user id>';` in the SQL editor and sign in again. Admins land on `/admin`.

| Table | Stores |
| --- | --- |
| `profiles` | Authenticated user name, contact details, role, state, and avatar |
| `categories` | Staff categories, icons, descriptions, availability, and active status |
| `hirer_profiles` | Hirer company, contact, and billing details |
| `staff_profiles` | Worker marketplace profile and verification data (public projection) |
| `events` | Hirer event details, date/time, location, guest count, instructions, and status |
| `event_requirements` | Required category, worker count, budget, and special requirements for an event |
| `job_posts` | Marketplace job details, pay, staffing count, schedule, and status |
| `job_applications` | Worker applications, applicant identity, notes, status, and timestamps |
| `saved_workers` | Hirer-to-worker saved profiles |
| `bookings` | Event assignments, agreed amount, status, and notes |
| `messages` | Private hirer-worker messages and read status |
| `payments` | Worker payouts linked to bookings |
| `reviews` | Two-way ratings between hirers and workers |
| `notifications` | Match, application, and booking alerts for both sides |
| `worker_profiles` | Detailed professional profile (private, worker-managed) |
| `worker_skills` | Additional skills declared by a worker |
| `worker_preferences` | Job, location, availability, and pay preferences used by the matching engine |
| `worker_availability` | Calendar slots declaring when a worker is free |
| `worker_documents` | Category-specific professional documents (certificates, licenses, identity, portfolio) with a verification workflow |
| `worker_experience` | Professional employment history backing worker profiles |
| `worker_verifications` | System verifications (email, phone, identity, professional) |
| `verification_requirements` | Per-category document requirements used to build the verification checklist |
| `platform_settings` | Configurable matching weights, verification rules, and AI engine selection |

The two sides are connected through a shared marketplace:

```
HIRER → event → event_requirements → job_posts → worker marketplace → applications → worker
WORKER → worker_profiles/skills/preferences/availability/documents → job marketplace → recommended jobs → applications
```

The matching engine lives in [`src/lib/matching.js`](src/lib/matching.js) and scores every job/worker using configurable weights (profession, availability, location, skills, verification, rating, pay). Weights and thresholds live in `platform_settings` (`matching.weights`, `matching.min_match_threshold`) and can be edited without a frontend rebuild.

### Storage

Professional profile photos are uploaded to a `avatars` bucket and documents to a
`documents` bucket. The schema seeds both buckets with `avatars`/`documents` names plus
storage-row-level-security policies. Each user may only upload to their own
`{user_id}/` folder.

### AI staffing recommendations

`EventCreateV2.jsx` calls `generateStaffingRecommendations(event)` which uses the event
type, guest count, and duration to suggest staffing categories, recommended counts, and
default budgets. This is the offline rule-based fallback engine (`ai.staffing_engine =
'rules'` in `platform_settings`). An external AI service can override the same function
signature without touching the UI. Hirers always keep full control and can regenerate,
add, remove, or re-budget every category before publishing.

The current prototype reads `categories`, `job_posts`, and `staff_profiles`, and inserts into `job_applications`. It falls back to demo data when those tables are empty or unavailable.

Before production, replace the temporary public application insert policy in the SQL file with an authenticated worker-only policy and connect applications to `auth.uid()`.

## Verification

```bash
npm run build
```
