# asah-admin · ASAH web admin

Web admin for Juta Berlian Culinary's HQ: setup, learning content, checklist templates,
dashboards. Part of ASAH:

| Repo | What |
| --- | --- |
| [asah-app](https://github.com/babono/asah-app) | Flutter phone app for outlet staff and managers |
| [asah-be](https://github.com/babono/asah-be) | Supabase backend: schema, RLS, RPCs, Edge Functions |
| **asah-admin** (this) | Next.js web admin |

## Stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui (Radix), the ASAH design palette in `src/app/globals.css` |
| Data | `@supabase/ssr` + supabase-js, typed by `src/lib/database.types.ts`; TanStack Query |
| Tables / forms | TanStack Table v9; react-hook-form + zod |
| i18n | next-intl, English and Bahasa Indonesia (`src/messages`) |
| Video | tus-js-client → Cloudflare Stream through asah-be's `stream-tus-upload` |

### How it fits together

- **No business logic here.** The admin talks to Supabase as the signed-in user. RLS and the RPCs
  in asah-be decide what is allowed, so the phone app and the admin cannot drift apart. There are
  no API routes or Server Actions, and no service role key. Anything privileged (creating
  accounts, video upload URLs) is an Edge Function in asah-be.
- **Auth**: phone + one-time code (`/sign-in`). `src/proxy.ts` (Next 16's replacement for
  middleware) refreshes the session cookie on every request and redirects signed-out visitors.
- **Permissions**: `useSession()` loads the profile and `rpc('my_permissions')`. `Session.can()`
  mirrors `app.has_permission()`, so the sidebar and buttons show only what the database would
  allow (PRD R6).
- **Rendering**: the pages are client components behind a login, so the server only serves a static
  shell (no cookie reads in Server Components, which Cache Components would require to sit
  behind Suspense).

```
src/
  proxy.ts                      session refresh + sign-in redirect
  app/
    sign-in/page.tsx            phone OTP (design screen 0)
    (admin)/layout.tsx          admin shell (header, permission-gated sidebar)
    (admin)/page.tsx            home
    (admin)/checklists/...      the pattern page: list + builder
  features/checklists/
    api.ts                      queries and mutations (React Query + typed Supabase)
    templates-list.tsx          TanStack Table list + create dialog
    template-builder.tsx        settings, positions, items, schedules, publish
  components/
    admin/                      shell, nav, page frame, DataTable, form fields, logo
    ui/                         shadcn/ui
    providers.tsx               Supabase, React Query, next-intl, toasts
  lib/
    database.types.ts           generated, do not edit
    session.ts                  profile + permissions
    video-upload.ts             resumable uploads to Cloudflare Stream
  messages/en.json, id.json
scripts/gen-types.ts            types from asah-be's migrations, without Docker
```

## Run

```bash
cp .env.example .env.local      # Supabase URL + publishable (anon) key
npm install
npm run dev                     # http://localhost:3000
```

Set up the backend first (see asah-be), including a first HQ admin
(`supabase/bootstrap_first_admin.sql`).

| Script | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run typecheck` | route types + `tsc` |
| `npm run gen:types` | regenerate `database.types.ts` from `../asah-be/supabase/migrations` (set `ASAH_BE_DIR` if elsewhere). Runs the migrations in PGlite, no Docker or project needed |
| `npm run gen:types:remote` | same, from a live project (`SUPABASE_PROJECT_ID`, Supabase CLI logged in) |

Run `gen:types` after every migration in asah-be. A query that no longer matches the schema then
fails `typecheck`.

## Adding a page

Follow `features/checklists`:

1. `features/<area>/api.ts`: a query per screen (`useQuery` + typed `supabase.from(...).select("...")`
   as one string literal so the select is typed) and mutations that invalidate the query and toast.
2. A list with `DataTable` (define columns in `useMemo`) and a builder or detail component.
   Forms use `react-hook-form` + a zod schema + the fields in `components/admin/form-fields.tsx`.
3. A thin route in `app/(admin)/<area>/page.tsx`.
4. Set `built: true` for the entry in `components/admin/nav.ts`, and add strings to both
   `messages/en.json` and `messages/id.json`.

## Status

| Page | PRD | |
| --- | --- | --- |
| Sign in, shell, home, language switch | F5, F8, R6 | Done |
| Checklist templates: list, builder (items, positions, brand, failed-item SLA, publish, new version), schedules | A1, A2, A4 | Done |
| Dashboards with CSV export | S4, S5 | Soon |
| Issues and audits | S1–S4 | Soon |
| Positions and levels, Outlets | F2, F3 | Soon |
| Users (create, spreadsheet import via asah-be `admin-users`) and roles | F4, R1–R5 | Soon |
| Learning modules (blocks, video via `lib/video-upload.ts`, quiz, rubric, review), Learning paths | T1–T6 | Soon |
| Mentor ratings, Audit log, Settings | M7, F9 | Soon |

The Flutter prototype of every page (all the queries each screen needs) is in asah-app's git
history, commit `f7bbaae`, under `lib/admin/pages/`.

Not yet run against a live Supabase project.
