export function getPvpServerBaseUrl() {
  const raw = import.meta.env.VITE_PVP_SERVER_URL || 'http://localhost:8788';
  return String(raw).replace(/\/+$/, '');
}

export function toWsBaseUrl(baseHttpUrl) {
  const http = String(baseHttpUrl || '').replace(/\/+$/, '');
  return http.startsWith('https://')
    ? `wss://${http.slice('https://'.length)}`
    : http.startsWith('http://')
      ? `ws://${http.slice('http://'.length)}`
      : http;
}
