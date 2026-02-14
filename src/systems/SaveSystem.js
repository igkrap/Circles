const KEY_TOTAL_GOLD = 'dodger_total_gold_v1';
const KEY_RECORDS = 'dodger_records_v1';

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
}
