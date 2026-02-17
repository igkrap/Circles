import { getPvpServerBaseUrl } from '../utils/network.js';

const STORE_KEY = 'circles.auth.session.v1';

function loadGoogleSdk() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => reject(new Error('google_sdk_timeout')), 10000);
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        window.clearTimeout(timeout);
        resolve();
      } else {
        window.setTimeout(check, 100);
      }
    };
    check();
  });
}

function requestGoogleAccessToken(clientId) {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (resp) => {
        if (resp?.error) {
          reject(new Error(`google_oauth_error:${resp.error}`));
          return;
        }
        if (!resp?.access_token) {
          reject(new Error('google_access_token_missing'));
          return;
        }
        resolve(resp.access_token);
      }
    });
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

function saveSession(session) {
  localStorage.setItem(STORE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORE_KEY);
}

function loadSession() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.id) return null;
    const currentBase = getPvpServerBaseUrl();
    if (parsed.serverBaseUrl !== currentBase) {
      parsed.serverBaseUrl = currentBase;
      saveSession(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

async function loginWithGoogle() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID_missing');
  await loadGoogleSdk();
  const accessToken = await requestGoogleAccessToken(clientId);
  const baseUrl = getPvpServerBaseUrl();
  const resp = await fetch(`${baseUrl}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`auth_failed:${text}`);
  }
  const data = await resp.json();
  const session = {
    token: data.token,
    user: data.user,
    issuedAt: Date.now(),
    serverBaseUrl: baseUrl
  };
  saveSession(session);
  return session;
}

export default {
  loadSession,
  clearSession,
  loginWithGoogle
};
