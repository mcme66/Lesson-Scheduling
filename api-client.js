const API_URL = new URL('api/schedule', window.location.origin).href;

// Render's free tier can take 30–60s to wake from spin-down. Use a generous
// per-request timeout so we don't give up before the server is back online
// and accidentally show empty/stale data.
const REQUEST_TIMEOUT_MS = 60000;

// Track whether we've ever successfully loaded real data from the API.
// Once we have, we must NEVER replace the in-memory data with a placeholder
// — that's how cold-start blips used to look like "the database was wiped".
let hasLoadedFromApi = false;

export function isReadOnly() {
  // Saving is only blocked if we've never been able to reach the API.
  return !hasLoadedFromApi;
}

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function normalize(data) {
  const pending = Array.isArray(data.pending)
    ? data.pending
    : Array.isArray(data.items)
      ? data.items
      : [];
  return {
    slots: data.slots || {},
    bookings: data.bookings || {},
    pending
  };
}

export async function loadSchedule() {
  const res = await fetchWithTimeout(API_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error (${res.status})`);
  const data = normalize(await res.json());
  hasLoadedFromApi = true;
  return data;
}

export async function saveSchedule(update) {
  if (!hasLoadedFromApi) {
    throw new Error(
      'Cannot save — the schedule has not loaded yet. Wait for the server to wake up, then try again.'
    );
  }
  const res = await fetchWithTimeout(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return normalize(await res.json());
}

/** Load with retries (helps when a free host is waking from sleep). */
export async function loadScheduleWithRetry(maxAttempts = 8) {
  let lastError;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await loadSchedule();
    } catch (e) {
      lastError = e;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, Math.min(1500 * (i + 1), 8000)));
      }
    }
  }
  throw lastError;
}

/**
 * Poll the server so teacher and students stay in sync.
 * onStatus(message | null) — null clears the status line.
 *
 * IMPORTANT: when a poll fails (e.g. server is mid-cold-start), we DO NOT
 * invoke the callback with placeholder/empty data. The caller's existing
 * in-memory schedule stays intact and a status message is shown instead.
 * This prevents the "data looks wiped" flash on Render free-tier wake-ups.
 */
export function subscribeSchedule(callback, { onStatus, intervalMs = 8000 } = {}) {
  let cancelled = false;
  let attempt = 0;

  async function poll() {
    if (cancelled) return;
    attempt++;
    if (attempt === 1) onStatus?.('Connecting to schedule…');
    try {
      const data = await loadScheduleWithRetry(attempt === 1 ? 8 : 3);
      onStatus?.(null);
      callback(data);
    } catch (e) {
      console.error('Schedule sync error:', e);
      const waking = e.name === 'AbortError' || /Failed to fetch|NetworkError/i.test(String(e));
      onStatus?.(
        hasLoadedFromApi
          ? 'Lost connection to the server. Retrying…'
          : waking
            ? 'Server is waking up (free tier cold start can take ~60s). Retrying…'
            : 'Could not reach the schedule API. Retrying…'
      );
    }
  }

  poll();
  const id = setInterval(poll, intervalMs);

  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
