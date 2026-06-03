# Supabase database setup

Your lesson schedule is stored in **Supabase Postgres** so it survives Render free-tier spin-down. The app still uses the same JSON shape (`slots`, `bookings`, `pending`); it just lives in one database row instead of a file on the server.

---

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in (free tier is fine).
2. Click **New project**.
3. Pick an organization, name (e.g. `lesson-scheduling`), database password, and region close to you.
4. Wait until the project finishes provisioning.

---

## 2. Create the `schedule` table

1. In the left sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy all of it, paste into the editor.
4. Click **Run** (or Ctrl+Enter).
5. You should see success. Optional check: **Table Editor** → table `schedule` → one row with `id` = `main`.

---

## 3. Get API credentials

1. Go to **Project Settings** (gear icon).
2. Copy the **Project URL** → use it as `SUPABASE_URL`.
3. Copy a secret key. Supabase offers two formats and **either one works** — pick whichever your dashboard shows you:

   - **New format (recommended)** → **API Keys** → under **Secret keys**, copy a key that starts with `sb_secret_...`. Set it as the env var `SUPABASE_SECRET_KEY`.
   - **Legacy format** → **API** → under **Project API keys**, copy the **service_role** key (a long JWT). Set it as the env var `SUPABASE_SERVICE_ROLE_KEY`.

   Internally the server accepts `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_KEY` — they're all sent to Supabase as the same bearer token. Set whichever one matches the key format you copied.

**Important:** This is a **secret** key that bypasses Row Level Security. It must live on the server only (Render env vars or a local `.env`). Never put it in `index.html`, `teacher.html`, or any public repo. Do **not** use the "Publishable" or "anon" key — those don't have write permission to the schedule table.

---

## 4. Configure Render (production)

1. Open [Render Dashboard](https://dashboard.render.com) → your **lesson-scheduling** web service.
2. Go to **Environment**.
3. Add:

   | Key | Value |
   |-----|--------|
   | `SUPABASE_URL` | Your Project URL from step 3 |
   | `SUPABASE_SECRET_KEY` *(or `SUPABASE_SERVICE_ROLE_KEY`)* | The secret key you copied in step 3 — either an `sb_secret_...` key (new format) or a `service_role` JWT (legacy). Either works; pick the env var name that matches what you copied. |

4. Save. Render will redeploy automatically.
5. After deploy, open `https://YOUR-SERVICE.onrender.com/api/health` — you should see:

   ```json
   { "ok": true, "storage": "supabase" }
   ```

   **Safety net:** if the env vars are missing on Render (or on any host that sets `NODE_ENV=production`), the server now refuses to start and prints a big `FATAL: Supabase environment variables are missing.` block in the logs. This is deliberate — it prevents the previous failure mode where the app silently fell back to writing to the container's disk, which Render then wiped on every spin-down. If your deploy is showing as failed in Render with that message, the fix is to add the two env vars and redeploy.

---

## 5. Local development (optional)

1. Copy `.env.example` to `.env` in the project root.
2. Fill in the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Install and run:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:3000/teacher.html` and add a test slot.
5. Restart the server — the slot should still be there if Supabase is configured.

**Without `.env`:** the app falls back to `data/schedule.json` on disk (fine for quick local tests; not persistent on Render).

---

## 6. Migrate existing data (if you had slots before)

If you still have a backup of `schedule.json` with real slots/bookings:

1. Supabase → **Table Editor** → `schedule` → row `main` → edit `data` column.
2. Paste your full JSON (must include `slots`, `bookings`, `pending`).
3. Save.

Or run in SQL Editor (replace with your JSON, escaped):

```sql
update public.schedule
set data = '{"slots":{...},"bookings":{},"pending":[]}'::jsonb,
    updated_at = now()
where id = 'main';
```

---

## 7. Verify persistence after Render sleep

1. Add a lesson time on the teacher page.
2. Wait for Render to spin down (or trigger **Manual Deploy** → redeploy).
3. Open the student page again — slots should still appear.

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| Render deploy fails with `FATAL: Supabase environment variables are missing` | Add `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` (new `sb_secret_...` format) or `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT) in Environment, then redeploy |
| Browser shows "Server is not responding…" forever | Service crashed on Render. Open Render → Logs and look for the FATAL block; usually means env vars still aren't set. |
| Browser shows "Server returned 500 — …" with a message | The API is up but Supabase is rejecting it. The message usually points at the cause: wrong URL, wrong key format (you may have pasted the "Publishable"/"anon" key by mistake), or the `schedule` table doesn't exist (re-run `supabase/schema.sql`). |
| `/api/health` returns 503 with `"storage": "file"` | Env vars missing in production — same fix as the first row |
| Empty schedule after deploy | Row `main` missing → re-run `supabase/schema.sql` |
| Schedule looks empty for ~30–60s after a long idle period, then comes back | Normal Render free-tier cold start — the client waits and retries instead of showing stale empty data |
| RLS errors | Re-run schema SQL; do not add public RLS policies |

---

## Fallback: Cloudflare R2

If Supabase does not work for you, the plan supports swapping storage to R2 (one `schedule.json` in a bucket). That is not implemented by default; ask to add it if needed.
