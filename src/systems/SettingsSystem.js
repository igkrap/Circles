const KEY = 'dodger_settings_v1';

const DEFAULTS = {
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: 0.5,
  sfxVolume: 0.5
};

function clamp01(v, fallback = 0.5) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export default class SettingsSystem {
  static load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const data = JSON.parse(raw);
      return {
        bgmEnabled: !!data.bgmEnabled,
        sfxEnabled: !!data.sfxEnabled,
        bgmVolume: clamp01(data.bgmVolume, DEFAULTS.bgmVolume),
        sfxVolume: clamp01(data.sfxVolume, DEFAULTS.sfxVolume)
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  static save(settings) {
    const safe = {
      bgmEnabled: !!settings?.bgmEnabled,
      sfxEnabled: !!settings?.sfxEnabled,
      bgmVolume: clamp01(settings?.bgmVolume, DEFAULTS.bgmVolume),
      sfxVolume: clamp01(settings?.sfxVolume, DEFAULTS.sfxVolume)
    };
    localStorage.setItem(KEY, JSON.stringify(safe));
    return safe;
  }
}
