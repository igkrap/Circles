import { getPvpServerBaseUrl } from '../utils/network.js';

const STORE_KEY = 'circles.auth.session.v1';
const REDIRECT_STATE_KEY = 'circles.auth.google.redirect.state.v1';
const REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;
let sdkLoadPromise = null;

function loadGoogleSdk() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
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
  }).finally(() => {
    sdkLoadPromise = null;
  });
  return sdkLoadPromise;
}

function randomState() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function shouldFallbackToRedirect(err) {
  const msg = String(err?.message || '');
  return msg.includes('popup_failed_to_open') || msg.includes('popup_closed') || msg.includes('popup_blocked');
}

function clearUrlAuthHash() {
  if (!window.location.hash) return;
  const clean = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, '', clean);
}

function consumeRedirectAccessToken() {
  const hash = String(window.location.hash || '');
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get('access_token');
  const state = params.get('state');
  const oauthError = params.get('error');
  const errorDescription = params.get('error_description');
  if (!accessToken && !oauthError) return null;

  let pending = null;
  try {
    pending = JSON.parse(localStorage.getItem(REDIRECT_STATE_KEY) || 'null');
  } catch {
    pending = null;
  }
  localStorage.removeItem(REDIRECT_STATE_KEY);
  clearUrlAuthHash();

  if (oauthError) {
    throw new Error(`google_oauth_error:${oauthError}${errorDescription ? `:${errorDescription}` : ''}`);
  }
  if (!accessToken) {
    throw new Error('google_access_token_missing');
  }
  const now = Date.now();
  const savedState = String(pending?.state || '');
  const savedAt = Number(pending?.createdAt || 0);
  if (!savedState || !state || state !== savedState || now - savedAt > REDIRECT_MAX_AGE_MS) {
    throw new Error('google_redirect_state_invalid');
  }
  return accessToken;
}

function startRedirectOAuth(clientId) {
  const state = randomState();
  localStorage.setItem(REDIRECT_STATE_KEY, JSON.stringify({
    state,
    createdAt: Date.now()
  }));
  const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
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
      },
      error_callback: (err) => {
        const type = String(err?.type || err?.error || 'unknown');
        reject(new Error(`google_oauth_error:${type}`));
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
  const redirectToken = consumeRedirectAccessToken();
  if (redirectToken) {
    const session = await exchangeAccessTokenWithServer(redirectToken);
    saveSession(session);
    return session;
  }
  try {
    await loadGoogleSdk();
  } catch {
    startRedirectOAuth(clientId);
    throw new Error('oauth_redirect_started');
  }
  let accessToken = '';
  try {
    accessToken = await requestGoogleAccessToken(clientId);
  } catch (err) {
    if (shouldFallbackToRedirect(err)) {
      startRedirectOAuth(clientId);
      throw new Error('oauth_redirect_started');
    }
    throw err;
  }
  const session = await exchangeAccessTokenWithServer(accessToken);
  saveSession(session);
  return session;
}

async function exchangeAccessTokenWithServer(accessToken) {
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
  return {
    token: data.token,
    user: data.user,
    issuedAt: Date.now(),
    serverBaseUrl: baseUrl
  };
}

async function resumeRedirectLogin() {
  const token = consumeRedirectAccessToken();
  if (!token) return null;
  const session = await exchangeAccessTokenWithServer(token);
  saveSession(session);
  return session;
}

export default {
  loadSession,
  clearSession,
  loadGoogleSdk,
  resumeRedirectLogin,
  loginWithGoogle
};
