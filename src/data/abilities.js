export const MAX_RANK_PER_ABILITY = 5;
export const MAX_UNIQUE_TRAITS_PER_RUN = 8;

export const ABILITY_KEYS = [
  'XPGain',
  'ATK',
  'FIRERATE',
  'MOVESPD',
  'SHIELD',
  'HP_REGEN',
  'MAX_HP',
  'CRIT_CHANCE',
  'GOLD_GAIN',
  'SHOCKWAVE',
  'LASER',
  'GRENADE',
  'FWD_SLASH',
  'DASH',
  'SPIN_SLASH',
  'CHAIN_LIGHTNING',
  'BLIZZARD',
  'FIRE_BOLT'
];

export const ACTIVE_KEYS = [
  'SHOCKWAVE',
  'LASER',
  'GRENADE',
  'FWD_SLASH',
  'DASH',
  'SPIN_SLASH',
  'CHAIN_LIGHTNING',
  'BLIZZARD',
  'FIRE_BOLT'
];

export const PASSIVE_KEYS = ABILITY_KEYS.filter((k) => !ACTIVE_KEYS.includes(k));

export const ABILITY_META = {
  XPGain: { name: '경험치 획득', desc: '랭크당 경험치 획득 +20%', type: 'passive' },
  ATK: { name: '공격력', desc: '랭크당 공격력 +10% (최대 +50%)', type: 'passive' },
  FIRERATE: { name: '공격 속도', desc: '랭크당 기본 공격 속도 증가', type: 'passive' },
  MOVESPD: { name: '이동 속도', desc: '랭크당 이동 속도 +8%', type: 'passive' },
  SHIELD: { name: '보호막', desc: '최대 보호막 충전량 증가', type: 'passive' },
  HP_REGEN: { name: '체력 재생', desc: '시간당 체력 회복 증가', type: 'passive' },
  MAX_HP: { name: '최대 체력', desc: '랭크당 최대 체력 +10% (최대 +50%)', type: 'passive' },
  CRIT_CHANCE: { name: '치명타 확률', desc: '랭크당 치명타 확률 +5%', type: 'passive' },
  GOLD_GAIN: { name: '골드 획득', desc: '랭크당 골드 획득 +20%', type: 'passive' },
  SHOCKWAVE: { name: '쇼크웨이브', desc: '액티브 스킬 해금', type: 'active' },
  LASER: { name: '레이저', desc: '액티브 스킬 해금', type: 'active' },
  GRENADE: { name: '수류탄', desc: '액티브 스킬 해금', type: 'active' },
  FWD_SLASH: { name: '전방 베기', desc: '액티브 스킬 해금', type: 'active' },
  DASH: { name: '대시', desc: '액티브 스킬 해금', type: 'active' },
  SPIN_SLASH: { name: '회전 베기', desc: '액티브 스킬 해금', type: 'active' },
  CHAIN_LIGHTNING: { name: '체인 라이트닝', desc: '액티브 스킬 해금', type: 'active' },
  BLIZZARD: { name: '블리자드', desc: '액티브 스킬 해금', type: 'active' },
  FIRE_BOLT: { name: '파이어 볼트', desc: '액티브 스킬 해금', type: 'active' }
};
