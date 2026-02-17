import { getPvpServerBaseUrl } from '../utils/network.js';

let pushTimer = null;
let inFlight = false;
let pendingSnapshot = null;

async function pushNow(session, snapshot) {
  if (!session?.token) return null;
  const baseUrl = String(session?.serverBaseUrl || getPvpServerBaseUrl());
  const resp = await fetch(`${baseUrl}/user/progress`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify(snapshot || {})
  });
  if (!resp.ok) throw new Error(`progress_push_failed:${resp.status}`);
  return await resp.json();
}

function schedulePush(session, snapshot, delayMs = 700) {
  pendingSnapshot = snapshot;
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(async () => {
    if (!pendingSnapshot || inFlight) return;
    inFlight = true;
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    try {
      await pushNow(session, snap);
    } catch {
      // ignore; next mutation will retry
    } finally {
      inFlight = false;
      if (pendingSnapshot) schedulePush(session, pendingSnapshot, 500);
    }
  }, delayMs);
}

async function pull(session) {
  if (!session?.token) return null;
  const baseUrl = String(session?.serverBaseUrl || getPvpServerBaseUrl());
  const resp = await fetch(`${baseUrl}/user/progress`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  if (!resp.ok) throw new Error(`progress_pull_failed:${resp.status}`);
  return await resp.json();
}

export default {
  pull,
  schedulePush
};

