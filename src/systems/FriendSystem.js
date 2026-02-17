import { getPvpServerBaseUrl } from '../utils/network.js';

function getBaseUrl(session) {
  return String(session?.serverBaseUrl || getPvpServerBaseUrl()).replace(/\/+$/, '');
}

function authHeaders(session) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.token || ''}`
  };
}

async function apiGet(session, path) {
  const resp = await fetch(`${getBaseUrl(session)}${path}`, {
    headers: { Authorization: `Bearer ${session?.token || ''}` }
  });
  if (!resp.ok) {
    let detail = '';
    try {
      const body = await resp.json();
      detail = String(body?.error || '').trim();
    } catch {
      detail = '';
    }
    throw new Error(`friend_api_failed:${resp.status}${detail ? `:${detail}` : ''}`);
  }
  return await resp.json();
}

async function apiPost(session, path, body) {
  const resp = await fetch(`${getBaseUrl(session)}${path}`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(body || {})
  });
  if (!resp.ok) {
    let detail = '';
    try {
      const out = await resp.json();
      detail = String(out?.error || '').trim();
    } catch {
      detail = '';
    }
    throw new Error(`friend_api_failed:${resp.status}${detail ? `:${detail}` : ''}`);
  }
  return await resp.json();
}

async function getMe(session) {
  return await apiGet(session, '/friends/me');
}

async function getFriends(session) {
  return await apiGet(session, '/friends/list');
}

async function removeFriend(session, friendUserId) {
  return await apiPost(session, '/friends/remove', { friendUserId: String(friendUserId || '') });
}

async function addByTag(session, tag) {
  return await apiPost(session, '/friends/add', { tag: String(tag || '').trim().toUpperCase() });
}

async function requestByTag(session, tag) {
  return await apiPost(session, '/friends/requests', { tag: String(tag || '').trim().toUpperCase() });
}

async function getFriendRequests(session) {
  return await apiGet(session, '/friends/requests');
}

async function respondFriendRequest(session, requestId, accept = true) {
  return await apiPost(session, `/friends/requests/${encodeURIComponent(String(requestId || ''))}/respond`, { accept: !!accept });
}

async function getInvites(session) {
  return await apiGet(session, '/friends/invites');
}

async function inviteFriend(session, friendUserId) {
  return await apiPost(session, '/friends/invite', { friendUserId });
}

async function respondInvite(session, inviteId, accept = true) {
  return await apiPost(session, `/friends/invites/${encodeURIComponent(String(inviteId || ''))}/respond`, { accept: !!accept });
}

async function getChat(session, friendUserId, options = 60) {
  const safeId = encodeURIComponent(String(friendUserId || ''));
  let limit = 60;
  let before = 0;
  let after = 0;
  let day = '';
  if (typeof options === 'number') {
    limit = options;
  } else if (options && typeof options === 'object') {
    limit = options.limit ?? limit;
    before = options.before ?? before;
    after = options.after ?? after;
    day = String(options.day || '').trim();
  }
  const safeLimit = Math.max(1, Math.min(300, Math.floor(Number(limit) || 60)));
  const qs = new URLSearchParams();
  qs.set('limit', String(safeLimit));
  const safeBefore = Math.floor(Number(before) || 0);
  const safeAfter = Math.floor(Number(after) || 0);
  if (safeBefore > 0) qs.set('before', String(safeBefore));
  if (safeAfter > 0) qs.set('after', String(safeAfter));
  if (day) qs.set('day', day);
  return await apiGet(session, `/friends/chat/${safeId}?${qs.toString()}`);
}

async function sendChat(session, friendUserId, message) {
  const safeId = encodeURIComponent(String(friendUserId || ''));
  return await apiPost(session, `/friends/chat/${safeId}`, { message: String(message || '') });
}

async function markChatRead(session, friendUserId) {
  const safeId = encodeURIComponent(String(friendUserId || ''));
  return await apiPost(session, `/friends/chat/${safeId}/read`, {});
}

export default {
  getMe,
  getFriends,
  removeFriend,
  addByTag,
  requestByTag,
  getFriendRequests,
  respondFriendRequest,
  getInvites,
  inviteFriend,
  respondInvite,
  getChat,
  sendChat,
  markChatRead
};
