const KEY_TOTAL_GOLD = 'dodger_total_gold_v1';
const KEY_RECORDS = 'dodger_records_v1';
const KEY_RELIC_STATE = 'dodger_relic_state_v1';
const MAX_EQUIPPED_RELICS = 3;

export default class SaveSystem {
  static getTotalGold() {
    const raw = localStorage.getItem(KEY_TOTAL_GOLD);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  static setTotalGold(v) {
    const n = Number(v);
    const safe = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    localStorage.setItem(KEY_TOTAL_GOLD, String(safe));
    return safe;
  }

  static addGold(delta) {
    const cur = SaveSystem.getTotalGold();
    return SaveSystem.setTotalGold(cur + delta);
  }

  static getRecords() {
    try {
      const raw = localStorage.getItem(KEY_RECORDS);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((r) => r && typeof r === 'object');
    } catch {
      return [];
    }
  }

  static saveRecord(record) {
    const now = Date.now();
    const safe = {
      name: String(record?.name ?? 'PLAYER').slice(0, 24),
      totalScore: Math.max(0, Math.floor(Number(record?.totalScore) || 0)),
      timeSec: Math.max(0, Number(record?.timeSec) || 0),
      kills: Math.max(0, Math.floor(Number(record?.kills) || 0)),
      stage: Math.max(1, Math.floor(Number(record?.stage) || 1)),
      level: Math.max(1, Math.floor(Number(record?.level) || 1)),
      createdAt: now
    };
    const arr = SaveSystem.getRecords();
    arr.push(safe);
    arr.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.timeSec - a.timeSec;
    });
    const trimmed = arr.slice(0, 200);
    localStorage.setItem(KEY_RECORDS, JSON.stringify(trimmed));
    return safe;
  }

  static getTopRecords(limit = 50) {
    const n = Math.max(1, Math.floor(limit));
    return SaveSystem.getRecords().sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.timeSec - a.timeSec;
    }).slice(0, n);
  }

  static getRelicState() {
    try {
      const raw = localStorage.getItem(KEY_RELIC_STATE);
      if (!raw) {
        return { owned: {}, equipped: [] };
      }
      const parsed = JSON.parse(raw);
      const ownedRaw = parsed?.owned && typeof parsed.owned === 'object' ? parsed.owned : {};
      const owned = {};
      Object.entries(ownedRaw).forEach(([id, v]) => {
        if (v) owned[String(id)] = true;
      });

      const equippedRaw = Array.isArray(parsed?.equipped) ? parsed.equipped : [];
      const equipped = equippedRaw
        .map((id) => String(id))
        .filter((id, idx, arr) => !!owned[id] && arr.indexOf(id) === idx)
        .slice(0, MAX_EQUIPPED_RELICS);

      return { owned, equipped };
    } catch {
      return { owned: {}, equipped: [] };
    }
  }

  static saveRelicState(state) {
    const ownedInput = state?.owned && typeof state.owned === 'object' ? state.owned : {};
    const owned = {};
    Object.entries(ownedInput).forEach(([id, v]) => {
      if (v) owned[String(id)] = true;
    });

    const equippedInput = Array.isArray(state?.equipped) ? state.equipped : [];
    const equipped = equippedInput
      .map((id) => String(id))
      .filter((id, idx, arr) => !!owned[id] && arr.indexOf(id) === idx)
      .slice(0, MAX_EQUIPPED_RELICS);

    const safe = { owned, equipped };
    localStorage.setItem(KEY_RELIC_STATE, JSON.stringify(safe));
    return safe;
  }

  static getOwnedRelicIds() {
    const state = SaveSystem.getRelicState();
    return Object.keys(state.owned);
  }

  static getEquippedRelicIds() {
    return SaveSystem.getRelicState().equipped;
  }

  static isRelicOwned(relicId) {
    const id = String(relicId ?? '');
    if (!id) return false;
    const state = SaveSystem.getRelicState();
    return !!state.owned[id];
  }

  static buyRelic(relicId, price) {
    const id = String(relicId ?? '');
    const cost = Math.max(0, Math.floor(Number(price) || 0));
    if (!id) return { ok: false, reason: 'invalid_id' };

    const state = SaveSystem.getRelicState();
    if (state.owned[id]) return { ok: false, reason: 'already_owned' };

    const curGold = SaveSystem.getTotalGold();
    if (curGold < cost) return { ok: false, reason: 'not_enough_gold' };

    SaveSystem.setTotalGold(curGold - cost);
    state.owned[id] = true;
    SaveSystem.saveRelicState(state);
    return { ok: true, reason: 'purchased' };
  }

  static toggleEquipRelic(relicId, maxSlots = MAX_EQUIPPED_RELICS) {
    const id = String(relicId ?? '');
    const cap = Math.max(1, Math.floor(Number(maxSlots) || MAX_EQUIPPED_RELICS));
    if (!id) return { ok: false, reason: 'invalid_id' };

    const state = SaveSystem.getRelicState();
    if (!state.owned[id]) return { ok: false, reason: 'not_owned' };

    const idx = state.equipped.indexOf(id);
    if (idx >= 0) {
      state.equipped.splice(idx, 1);
      SaveSystem.saveRelicState(state);
      return { ok: true, reason: 'unequipped', equipped: state.equipped };
    }

    if (state.equipped.length >= cap) return { ok: false, reason: 'equip_full', equipped: state.equipped };
    state.equipped.push(id);
    SaveSystem.saveRelicState(state);
    return { ok: true, reason: 'equipped', equipped: state.equipped };
  }
}
