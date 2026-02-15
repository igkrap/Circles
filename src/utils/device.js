const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS/i;

export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const uaMobile = MOBILE_UA_RE.test(ua);
  const isIpadDesktopUA = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;

  const coarsePrimary = !!window.matchMedia?.('(pointer: coarse)')?.matches;
  const finePrimary = !!window.matchMedia?.('(pointer: fine)')?.matches;
  const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  const smallViewport = shortSide > 0 && shortSide <= 900;

  return uaMobile || isIpadDesktopUA || (coarsePrimary && !finePrimary && smallViewport);
}
