const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'schedule.json');
const SCHEDULE_ROW_ID = 'main';

let supabase = null;

// Accept any of the supported names so users don't have to care which
// API-key format Supabase shows them in the dashboard.
//
//   SUPABASE_SECRET_KEY      → new format ("sb_secret_..." from API Keys page)
//   SUPABASE_SERVICE_ROLE_KEY → legacy JWT format (still shown as "Legacy keys")
//   SUPABASE_KEY             → catch-all alias
//
// All three are sent to the Supabase client as the same bearer token — the
// client doesn't care which format the string is.
function getSupabaseKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  );
}

// Normalize the URL the user pasted into the env var. The Supabase JS client
// wants just the project base URL (https://abcd.supabase.co); it appends
// /rest/v1/ itself. Accidentally including /rest/v1/ or a trailing slash is a
// common mistake that produces 404s on every query, so we strip those here.
function getSupabaseUrl() {
  const raw = (process.env.SUPABASE_URL || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\/+$/, '')           // trailing slashes
    .replace(/\/rest\/v1$/i, '')    // accidental REST path suffix
    .replace(/\/auth\/v1$/i, '');   // same for auth path, just in case
}

function useSupabase() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

function getSupabase() {
  if (!supabase && useSupabase()) {
    const url = getSupabaseUrl();
    if (url !== (process.env.SUPABASE_URL || '').trim()) {
      console.warn(
        `Note: SUPABASE_URL contained an API path suffix; using ${url} instead. ` +
          `You can set SUPABASE_URL to just the project base URL.`
      );
    }
    supabase = createClient(url, getSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabase;
}

function storageMode() {
  return useSupabase() ? 'supabase' : 'file';
}

function readFileRaw() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeFileRaw(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function readRaw() {
  if (useSupabase()) {
    const client = getSupabase();
    const { data, error } = await client
      .from('schedule')
      .select('data')
      .eq('id', SCHEDULE_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error('Supabase read error:', error.message);
      throw new Error('Could not load schedule from database');
    }
    if (data?.data) return data.data;
    return null;
  }
  return readFileRaw();
}

async function writeRaw(data) {
  if (useSupabase()) {
    const client = getSupabase();
    const { error } = await client.from('schedule').upsert(
      {
        id: SCHEDULE_ROW_ID,
        data,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.error('Supabase write error:', error.message);
      throw new Error('Could not save schedule to database');
    }
    return;
  }
  writeFileRaw(data);
}

module.exports = { storageMode, readRaw, writeRaw, useSupabase };
