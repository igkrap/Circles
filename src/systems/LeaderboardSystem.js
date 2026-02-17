import { getPvpServerBaseUrl } from '../utils/network.js';

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'pvp' || v === 'survival' || v === 'coop') return v;
  return 'survival';
}

async function fetchLeaderboard(mode = 'survival', limit = 30, baseUrl = '') {
  const safeMode = normalizeMode(mode);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 30)));
  const root = String(baseUrl || getPvpServerBaseUrl()).replace(/\/+$/, '');
  const url = `${root}/leaderboard?mode=${encodeURIComponent(safeMode)}&limit=${safeLimit}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`leaderboard_fetch_failed:${resp.status}`);
  return await resp.json();
}

async function submitRun(session, payload) {
  if (!session?.token) return null;
  const mode = normalizeMode(payload?.mode);
  if (mode === 'pvp') return null;
  const root = String(session?.serverBaseUrl || getPvpServerBaseUrl()).replace(/\/+$/, '');
  const resp = await fetch(`${root}/leaderboard/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify({
      mode,
      stage: Math.max(1, Math.floor(Number(payload?.stage || 1))),
      score: Math.max(0, Math.floor(Number(payload?.score || 0))),
      timeSec: Math.max(0, Number(payload?.timeSec || 0)),
      kills: Math.max(0, Math.floor(Number(payload?.kills || 0)))
    })
  });
  if (!resp.ok) throw new Error(`leaderboard_submit_failed:${resp.status}`);
  return await resp.json();
}

export default {
  fetchLeaderboard,
  submitRun
};
