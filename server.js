const express = require('express');
const path = require('path');
const { storageMode, readRaw, writeRaw, useSupabase } = require('./storage');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// Render sets RENDER=true on its hosts. We also honor NODE_ENV=production.
// In production we REFUSE to run on ephemeral file storage, because Render's
// free tier wipes the container filesystem on every spin-down, which silently
// destroys the schedule. Bail out loudly so the misconfiguration is obvious.
const IS_PRODUCTION =
  process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !useSupabase()) {
  console.error('');
  console.error('============================================================');
  console.error(' FATAL: Supabase environment variables are missing.');
  console.error('');
  console.error(' Without them this server stores data on the container disk,');
  console.error(' which Render ERASES every time the free-tier service spins');
  console.error(' down. Your schedule would be wiped on every cold start.');
  console.error('');
  console.error(' Fix: in the Render dashboard, open this service →');
  console.error('   Environment → add the following and redeploy:');
  console.error('     SUPABASE_URL         (e.g. https://abcd.supabase.co)');
  console.error('     SUPABASE_SECRET_KEY  (an "sb_secret_..." key from the');
  console.error('                           Supabase API Keys page — or paste');
  console.error('                           a legacy service_role JWT under');
  console.error('                           SUPABASE_SERVICE_ROLE_KEY instead;');
  console.error('                           both formats work)');
  console.error('');
  console.error(' See SUPABASE_SETUP.md for step-by-step instructions.');
  console.error('============================================================');
  console.error('');
  process.exit(1);
}

const DEFAULT = {
  slots: {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  },
  bookings: {},
  pending: []
};

function oneMonthAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
}

function normalize(data) {
  const slots = { ...DEFAULT.slots, ...(data?.slots || {}) };
  return {
    slots,
    bookings: data?.bookings && typeof data.bookings === 'object' ? data.bookings : {},
    pending: Array.isArray(data?.pending) ? data.pending : []
  };
}

function prune(data) {
  const cutoff = oneMonthAgo();
  const bookings = { ...data.bookings };

  for (const key of Object.keys(bookings)) {
    const entry = bookings[key];
    const weekStr = key.slice(0, 10);
    let drop = false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(weekStr)) {
      const weekDate = new Date(weekStr + 'T12:00:00');
      if (weekDate < cutoff) drop = true;
    }
    if (!drop && entry?.bookedAt) {
      const booked = new Date(entry.bookedAt);
      if (!Number.isNaN(booked.getTime()) && booked < cutoff) drop = true;
    }
    if (drop) delete bookings[key];
  }

  const pending = data.pending.filter((p) => {
    if (!p.requestedAt) return true;
    const t = new Date(p.requestedAt);
    return !Number.isNaN(t.getTime()) && t >= cutoff;
  });

  return { slots: data.slots, bookings, pending };
}

async function readData() {
  const raw = await readRaw();
  return normalize(raw || DEFAULT);
}

async function writeData(data) {
  const normalized = normalize(data);
  const pruned = prune(normalized);
  await writeRaw(pruned);
  return pruned;
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  const mode = storageMode();
  // If we're somehow running in production without Supabase, surface it as
  // an unhealthy check so Render shows the deploy as failing rather than
  // silently serving an app whose data will vanish at next spin-down.
  if (IS_PRODUCTION && mode !== 'supabase') {
    return res.status(503).json({
      ok: false,
      storage: mode,
      error:
        'Server is using ephemeral file storage in production. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render. See SUPABASE_SETUP.md.'
    });
  }
  res.json({ ok: true, storage: mode });
});

// Never expose data/ as a static path. The bundled data/schedule.json is the
// empty initial seed used only as a local-dev fallback; serving it would let
// browsers fetch a fake "empty" schedule whenever the API is slow to respond,
// making it look like the database was wiped.
app.use('/data', (_req, res) => res.status(404).end());

app.get('/', (_req, res) => {
  res.redirect('/index.html');
});

app.get('/api/schedule', async (_req, res) => {
  try {
    const current = await readData();
    const pruned = prune(current);
    const changed =
      JSON.stringify(pruned.bookings) !== JSON.stringify(current.bookings) ||
      JSON.stringify(pruned.pending) !== JSON.stringify(current.pending);
    res.json(changed ? await writeData(pruned) : pruned);
  } catch (e) {
    console.error('GET /api/schedule failed:', e);
    res.status(500).json({
      error: 'Could not load schedule',
      detail: e.message,
      storage: storageMode()
    });
  }
});

app.put('/api/schedule', async (req, res) => {
  try {
    const current = await readData();
    const body = req.body || {};
    const merged = normalize({
      slots: body.slots !== undefined ? body.slots : current.slots,
      bookings: body.bookings !== undefined ? body.bookings : current.bookings,
      pending: body.pending !== undefined ? body.pending : current.pending
    });
    res.json(await writeData(merged));
  } catch (e) {
    console.error('PUT /api/schedule failed:', e);
    res.status(500).json({
      error: 'Could not save schedule',
      detail: e.message,
      storage: storageMode()
    });
  }
});

app.use(express.static(ROOT));

app.listen(PORT, '0.0.0.0', () => {
  const mode = storageMode();
  console.log(`Lesson scheduler running on port ${PORT}`);
  console.log(`  Storage:       ${mode}${mode === 'supabase' ? ' (persistent)' : ' (LOCAL FILE — not persistent on hosted environments)'}`);
  console.log(`  Student page:  http://localhost:${PORT}/index.html`);
  console.log(`  Teacher page:  http://localhost:${PORT}/teacher.html`);
  if (mode === 'file') {
    console.log('  NOTE: data lives in data/schedule.json and will be lost on any redeploy or container restart.');
    console.log('  See SUPABASE_SETUP.md to enable persistent storage.');
  }
});
