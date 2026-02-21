import Phaser from 'phaser';

function parseBoolParam(rawValue, fallback = false) {
  if (rawValue == null) return fallback;
  const v = String(rawValue).trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

function sanitizeMode(rawMode) {
  const m = String(rawMode || 'survival').trim().toLowerCase();
  if (m === 'coop' || m === 'pvp' || m === 'defense') return m;
  return 'survival';
}

function sanitizeBiome(rawBiome) {
  const biome = String(rawBiome || '').trim().toLowerCase();
  if (biome === 'desert') return biome;
  return 'default';
}

function consumeDebugLaunchFromUrl() {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return null;
  let url;
  try {
    url = new URL(window.location.href);
  } catch {
    return null;
  }
  const q = url.searchParams;
  if (!parseBoolParam(q.get('debug'), false)) return null;

  const mode = sanitizeMode(q.get('mode'));
  const biome = sanitizeBiome(q.get('biome') || q.get('map'));
  const stageRaw = Number(q.get('stage'));
  const stage = Number.isFinite(stageRaw)
    ? Phaser.Math.Clamp(Math.floor(stageRaw), 1, 20)
    : 5;

  const launchData = {
    mode,
    biome,
    partyKey: String(q.get('party') || '').trim(),
    debug: {
      enabled: true,
      stage,
      forceBoss: parseBoolParam(q.get('boss'), true),
      forceDash: parseBoolParam(q.get('dash'), true),
      solo: parseBoolParam(q.get('solo'), false),
      biome
    }
  };

  ['debug', 'mode', 'stage', 'party', 'boss', 'dash', 'solo', 'biome', 'map'].forEach((k) => q.delete(k));
  const cleanQuery = q.toString();
  const cleanUrl = `${url.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${url.hash || ''}`;
  const prevUrl = `${url.pathname}${url.search}${url.hash || ''}`;
  if (cleanUrl !== prevUrl && window.history?.replaceState) {
    window.history.replaceState({}, '', cleanUrl);
  }
  return launchData;
}

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Improve touch responsiveness
    this.input.mouse?.disableContextMenu?.();
    this.input.addPointer(2);
    const debugLaunch = consumeDebugLaunchFromUrl();
    if (debugLaunch) {
      this.registry.set('debugLaunch', debugLaunch);
    }

    this.scene.start('Preload');
  }
}
