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

Then in **Storage**: make the `avatars` bucket public (the migration tries to), and add a policy on the private `documents` bucket letting authenticated users upload to their own `{user_id}/` folder and letting admins read everything (for the verification queue).

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
