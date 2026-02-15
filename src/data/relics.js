export const RELIC_TIERS = {
  EARLY: 'early',
  MID: 'mid',
  LATE: 'late'
};

export const RELICS = [
  // Early: no-risk, single-digit buffs
  { id: 'early_assault', tier: RELIC_TIERS.EARLY, price: 1200, name: '초기 전투칩', effects: { damageMulPct: 0.04 } },
  { id: 'early_precision', tier: RELIC_TIERS.EARLY, price: 1400, name: '정밀 조준핀', effects: { critChanceFlat: 0.03 } },
  { id: 'early_rapid', tier: RELIC_TIERS.EARLY, price: 1600, name: '경량 장전기', effects: { fireIntervalPct: -0.05 } },
  { id: 'early_ballistic', tier: RELIC_TIERS.EARLY, price: 1800, name: '탄도 보정링', effects: { critDamageMulPct: 0.08 } },
  { id: 'early_coolant', tier: RELIC_TIERS.EARLY, price: 2000, name: '소형 냉각핀', effects: { skillCooldownPct: -0.05 } },
  { id: 'early_survival', tier: RELIC_TIERS.EARLY, price: 2200, name: '완충 플레이트', effects: { damageTakenPct: -0.05 } },
  { id: 'early_regen', tier: RELIC_TIERS.EARLY, price: 2400, name: '재생 패치', effects: { hpRegenFlat: 0.4 } },
  { id: 'early_shield', tier: RELIC_TIERS.EARLY, price: 2600, name: '실드 잔량셀', effects: { damageTakenPct: -0.03, hpRegenFlat: 0.2 } },
  { id: 'early_mobility', tier: RELIC_TIERS.EARLY, price: 2800, name: '관성 보조부츠', effects: { moveSpeedPct: 0.05 } },
  { id: 'early_scavenger', tier: RELIC_TIERS.EARLY, price: 3000, name: '회수용 갈고리', effects: { goldGainPct: 0.07 } },
  { id: 'early_execution', tier: RELIC_TIERS.EARLY, price: 3400, name: '학습 가속칩', effects: { xpGainPct: 0.06 } },
  { id: 'early_overclock', tier: RELIC_TIERS.EARLY, price: 4000, name: '예열 코어', effects: { damageMulPct: 0.03, fireIntervalPct: -0.03 } },

  // Mid: no-risk, two-digit buffs
  { id: 'mid_assault', tier: RELIC_TIERS.MID, price: 4500, name: '고압 전투칩', effects: { damageMulPct: 0.12 } },
  { id: 'mid_precision', tier: RELIC_TIERS.MID, price: 5000, name: '정밀 광학 렌즈', effects: { critChanceFlat: 0.08 } },
  { id: 'mid_rapid', tier: RELIC_TIERS.MID, price: 5500, name: '강화 장전기', effects: { fireIntervalPct: -0.12 } },
  { id: 'mid_ballistic', tier: RELIC_TIERS.MID, price: 6000, name: '탄도 컴파일러', effects: { critDamageMulPct: 0.18 } },
  { id: 'mid_coolant', tier: RELIC_TIERS.MID, price: 6500, name: '확장 냉각코어', effects: { skillCooldownPct: -0.12 } },
  { id: 'mid_survival', tier: RELIC_TIERS.MID, price: 7000, name: '중형 방호판', effects: { damageTakenPct: -0.10 } },
  { id: 'mid_regen', tier: RELIC_TIERS.MID, price: 7500, name: '나노 재생모듈', effects: { hpRegenFlat: 1.0 } },
  { id: 'mid_shield', tier: RELIC_TIERS.MID, price: 8200, name: '실드 커패시터', effects: { damageTakenPct: -0.06, hpRegenFlat: 0.5 } },
  { id: 'mid_mobility', tier: RELIC_TIERS.MID, price: 9000, name: '기동 프레임', effects: { moveSpeedPct: 0.12 } },
  { id: 'mid_scavenger', tier: RELIC_TIERS.MID, price: 9600, name: '수집 드론베이', effects: { goldGainPct: 0.15 } },
  { id: 'mid_execution', tier: RELIC_TIERS.MID, price: 10300, name: '전술 학습칩', effects: { xpGainPct: 0.14 } },
  { id: 'mid_overclock', tier: RELIC_TIERS.MID, price: 11000, name: '터보 연산코어', effects: { damageMulPct: 0.10, skillCooldownPct: -0.10 } },

  // Late: high-risk, high-return
  { id: 'late_assault', tier: RELIC_TIERS.LATE, price: 13000, name: '열폭주 인젝터', effects: { damageMulPct: 0.35, damageTakenPct: 0.18 } },
  { id: 'late_precision', tier: RELIC_TIERS.LATE, price: 13800, name: '피크리티컬 회로', effects: { critChanceFlat: 0.22, damageMulPct: -0.20, critDamageMulPct: 0.35 } },
  { id: 'late_rapid', tier: RELIC_TIERS.LATE, price: 14600, name: '유리장갑 프레임', effects: { fireIntervalPct: -0.32, damageTakenPct: 0.12 } },
  { id: 'late_ballistic', tier: RELIC_TIERS.LATE, price: 15400, name: '도박사 탄창', effects: { critDamageMulPct: 0.45, fireIntervalPct: 0.15 } },
  { id: 'late_coolant', tier: RELIC_TIERS.LATE, price: 16200, name: '파멸형 축전지', effects: { skillCooldownPct: -0.35, damageMulPct: -0.18 } },
  { id: 'late_survival', tier: RELIC_TIERS.LATE, price: 17200, name: '붕괴 차폐막', effects: { damageTakenPct: -0.28, moveSpeedPct: -0.16 } },
  { id: 'late_regen', tier: RELIC_TIERS.LATE, price: 18400, name: '방사선 혈청', effects: { hpRegenFlat: 3.0, damageMulPct: -0.20 } },
  { id: 'late_shield', tier: RELIC_TIERS.LATE, price: 19800, name: '중성자 실드셀', effects: { damageTakenPct: -0.18, fireIntervalPct: 0.18 } },
  { id: 'late_mobility', tier: RELIC_TIERS.LATE, price: 21400, name: '중력 억제 부츠', effects: { moveSpeedPct: 0.38, damageTakenPct: 0.15 } },
  { id: 'late_scavenger', tier: RELIC_TIERS.LATE, price: 23200, name: '검은상자 계약서', effects: { goldGainPct: 0.80, damageTakenPct: 0.20 } },
  { id: 'late_execution', tier: RELIC_TIERS.LATE, price: 25400, name: '전장 가속 주입기', effects: { xpGainPct: 0.55, damageTakenPct: 0.15 } },
  { id: 'late_overclock', tier: RELIC_TIERS.LATE, price: 28000, name: '사건지평선 코어', effects: { damageMulPct: 0.28, skillCooldownPct: -0.20, hpRegenFlat: -1.0 } }
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export const RELICS_BY_TIER = {
  [RELIC_TIERS.EARLY]: RELICS.filter((r) => r.tier === RELIC_TIERS.EARLY),
  [RELIC_TIERS.MID]: RELICS.filter((r) => r.tier === RELIC_TIERS.MID),
  [RELIC_TIERS.LATE]: RELICS.filter((r) => r.tier === RELIC_TIERS.LATE)
};

export const CODEX_SETS = [
  { id: 'codex_assault', name: '화력 도감', relicIds: ['early_assault', 'mid_assault', 'late_assault'], effects: { damageMulPct: 0.05 } },
  { id: 'codex_precision', name: '정밀 도감', relicIds: ['early_precision', 'mid_precision', 'late_precision'], effects: { critChanceFlat: 0.03, critDamageMulPct: 0.08 } },
  { id: 'codex_rapid', name: '연사 도감', relicIds: ['early_rapid', 'mid_rapid', 'late_rapid'], effects: { fireIntervalPct: -0.06 } },
  { id: 'codex_ballistic', name: '탄도 도감', relicIds: ['early_ballistic', 'mid_ballistic', 'late_ballistic'], effects: { critDamageMulPct: 0.18 } },
  { id: 'codex_coolant', name: '쿨링 도감', relicIds: ['early_coolant', 'mid_coolant', 'late_coolant'], effects: { skillCooldownPct: -0.07 } },
  { id: 'codex_survival', name: '생존 도감', relicIds: ['early_survival', 'mid_survival', 'late_survival'], effects: { damageTakenPct: -0.12 } },
  { id: 'codex_regen', name: '재생 도감', relicIds: ['early_regen', 'mid_regen', 'late_regen'], effects: { hpRegenFlat: 0.8 } },
  { id: 'codex_shield', name: '실드 도감', relicIds: ['early_shield', 'mid_shield', 'late_shield'], effects: { damageTakenPct: -0.06, hpRegenFlat: 0.5 } },
  { id: 'codex_mobility', name: '기동 도감', relicIds: ['early_mobility', 'mid_mobility', 'late_mobility'], effects: { moveSpeedPct: 0.08, fireIntervalPct: -0.04 } },
  { id: 'codex_scavenger', name: '수집 도감', relicIds: ['early_scavenger', 'mid_scavenger', 'late_scavenger'], effects: { goldGainPct: 0.15 } },
  { id: 'codex_execution', name: '성장 도감', relicIds: ['early_execution', 'mid_execution', 'late_execution'], effects: { xpGainPct: 0.18 } },
  { id: 'codex_overclock', name: '과부하 도감', relicIds: ['early_overclock', 'mid_overclock', 'late_overclock'], effects: { damageMulPct: 0.08, skillCooldownPct: -0.08 } }
];

export function combineEffects(effectList) {
  const out = {};
  effectList.forEach((effects) => {
    if (!effects || typeof effects !== 'object') return;
    Object.entries(effects).forEach(([k, v]) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      out[k] = (out[k] ?? 0) + n;
    });
  });
  return out;
}

export function getCompletedCodexSets(ownedRelicIds) {
  const owned = new Set(Array.isArray(ownedRelicIds) ? ownedRelicIds : []);
  return CODEX_SETS.filter((set) => set.relicIds.every((id) => owned.has(id)));
}

function pct(n) {
  const v = Math.round(n * 100);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}%`;
}

export function effectToText(effects) {
  if (!effects) return '';
  const lines = [];
  if (effects.damageMulPct) lines.push(`피해량 ${pct(effects.damageMulPct)}`);
  if (effects.critChanceFlat) lines.push(`치명타 확률 ${pct(effects.critChanceFlat)}`);
  if (effects.critDamageMulPct) lines.push(`치명타 피해 ${pct(effects.critDamageMulPct)}`);
  if (effects.fireIntervalPct) lines.push(`공격 주기 ${pct(effects.fireIntervalPct)}`);
  if (effects.moveSpeedPct) lines.push(`이동속도 ${pct(effects.moveSpeedPct)}`);
  if (effects.skillCooldownPct) lines.push(`스킬 쿨다운 ${pct(effects.skillCooldownPct)}`);
  if (effects.damageTakenPct) lines.push(`받는 피해 ${pct(effects.damageTakenPct)}`);
  if (effects.hpRegenFlat) lines.push(`초당 재생 ${effects.hpRegenFlat > 0 ? '+' : ''}${effects.hpRegenFlat.toFixed(1)}`);
  if (effects.xpGainPct) lines.push(`경험치 획득 ${pct(effects.xpGainPct)}`);
  if (effects.goldGainPct) lines.push(`골드 획득 ${pct(effects.goldGainPct)}`);
  return lines.join(' / ');
}
