# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## EventStaff NG

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

Open the Supabase Dashboard SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, indexes, validation rules, starter categories, and row-level security policies used by the app.

| Table | Stores |
| --- | --- |
| `profiles` | Authenticated user name, contact details, role, state, and avatar |
| `categories` | Staff categories, icons, descriptions, availability, and active status |
| `staff_profiles` | Worker category, location, rating, experience, availability, and verification |
| `events` | Hirer event details, date/time, location, guest count, instructions, and status |
| `event_requirements` | Required category, worker count, experience, budget, and special requirements |
| `job_posts` | Marketplace job details, pay, staffing count, schedule, and status |
| `job_applications` | Worker applications, applicant identity, notes, status, and timestamps |
| `saved_workers` | Hirer-to-worker saved profiles |
| `bookings` | Event assignments, agreed amount, status, and notes |
| `messages` | Private hirer-worker messages and read status |

The current prototype reads `categories`, `job_posts`, and `staff_profiles`, and inserts into `job_applications`. It falls back to demo data when those tables are empty or unavailable.

Before production, replace the temporary public application insert policy in the SQL file with an authenticated worker-only policy and connect applications to `auth.uid()`.

## Verification

```bash
npm run build
```
## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
