import {
  ABILITY_KEYS,
  ACTIVE_KEYS,
  PASSIVE_KEYS,
  ABILITY_META,
  MAX_RANK_PER_ABILITY,
  MAX_UNIQUE_TRAITS_PER_RUN
} from '../data/abilities.js';

export default class AbilitySystem {
  constructor() {
    this.abilities = {};
    ABILITY_KEYS.forEach((k) => {
      this.abilities[k] = 0;
    });

    this.activeSlots = { 1: null, 2: null, 3: null, 4: null };
  }

  rank(key) {
    return Math.max(0, Math.floor(this.abilities[key] ?? 0));
  }

  getOwnedCount() {
    return Object.values(this.abilities).filter((v) => Number(v) > 0).length;
  }

  hasEmptyActiveSlot() {
    for (let s = 1; s <= 4; s += 1) {
      if (!this.activeSlots[s]) return true;
    }
    return false;
  }

  canOffer(key) {
    const r = this.rank(key);
    if (r >= MAX_RANK_PER_ABILITY) return false;

    if (r <= 0 && this.getOwnedCount() >= MAX_UNIQUE_TRAITS_PER_RUN) {
      return false;
    }

    if (ACTIVE_KEYS.includes(key)) {
      if (r >= 1) return true;
      return this.hasEmptyActiveSlot();
    }
    return true;
  }

  makeLevelupChoices(n = 3) {
    const pool = ABILITY_KEYS.filter((k) => this.canOffer(k));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, Math.floor(n)));
  }

  applyAbility(key, ctx) {
    if (!ABILITY_KEYS.includes(key)) return false;
    if (!this.canOffer(key)) return false;

    const prev = this.rank(key);
    const next = Math.min(MAX_RANK_PER_ABILITY, prev + 1);
    this.abilities[key] = next;

    if (ACTIVE_KEYS.includes(key) && prev === 0) {
      for (let s = 1; s <= 4; s += 1) {
        if (!this.activeSlots[s]) {
          this.activeSlots[s] = key;
          break;
        }
      }
    }

    this.applyStatEffects(key, ctx);
    return true;
  }

  applyStatEffects(key, ctx) {
    const r = this.rank(key);
    if (!ctx) return;

    if (key === 'ATK') {
      const baseAtk = ctx.baseDamageBase ?? 10;
      ctx.baseDamage = Math.max(1, Math.floor(baseAtk * (1 + 0.1 * r)));
    } else if (key === 'FIRERATE') {
      const base = ctx.fireRateBase ?? 130;
      const mul = Math.pow(0.92, r);
      ctx.fireRateMs = Math.max(40, Math.floor(base * mul));
    } else if (key === 'MOVESPD') {
      const base = ctx.playerSpeedBase ?? 270;
      ctx.playerSpeed = Math.max(80, base * (1 + 0.08 * r));
    } else if (key === 'MAX_HP') {
      const baseMax = ctx.playerMaxHpBase ?? 100;
      const oldMax = ctx.playerMaxHp ?? baseMax;
      const newMax = Math.max(1, Math.floor(baseMax * (1 + 0.1 * r)));
      ctx.playerMaxHp = newMax;
      const delta = Math.max(0, newMax - oldMax);
      ctx.playerHp = Math.min(newMax, (ctx.playerHp ?? newMax) + delta);
    } else if (key === 'SHIELD') {
      const maxSh = r;
      const cur = Math.floor(ctx.playerShield ?? 0);
      ctx.playerShield = Math.min(maxSh, cur + 1);
    } else if (key === 'XPGain') {
      ctx.xpGainMul = 1 + 0.2 * r;
    } else if (key === 'GOLD_GAIN') {
      ctx.goldGainMul = 1 + 0.2 * r;
    } else if (key === 'CRIT_CHANCE') {
      ctx.critChance = Math.min(0.5, 0.05 * r);
    } else if (key === 'HP_REGEN') {
      ctx.hpRegenPerSec = 0.8 * r;
    }
  }

  getAbilityLabel(key) {
    const meta = ABILITY_META[key];
    const name = meta?.name ?? key;
    return `${name} (${this.rank(key)}/${MAX_RANK_PER_ABILITY})`;
  }

  getAbilityDescription(key) {
    return ABILITY_META[key]?.desc ?? '';
  }

  synergyFlags() {
    const mechanic = ['LASER', 'GRENADE', 'SHOCKWAVE'].every((k) => this.rank(k) > 0);
    const swordsman = ['FWD_SLASH', 'DASH', 'SPIN_SLASH'].every((k) => this.rank(k) > 0);
    const mage = ['CHAIN_LIGHTNING', 'BLIZZARD', 'FIRE_BOLT'].every((k) => this.rank(k) > 0);

    const activeOwned = ACTIVE_KEYS.filter((k) => this.rank(k) > 0).length;
    const passiveOwned = PASSIVE_KEYS.filter((k) => this.rank(k) > 0).length;
    const ownedCount = this.getOwnedCount();
    // Ranger unlock condition:
    // 1) Exactly/at least 8 selected traits in run
    // 2) All selected traits are passive (no active trait selected)
    const ranger = ownedCount >= 8 && passiveOwned >= 8 && activeOwned === 0;

    return {
      MECHANIC: mechanic,
      SWORDSMAN: swordsman,
      RANGER: ranger,
      MAGE: mage
    };
  }

  activeRangeMul() {
    return this.synergyFlags().MECHANIC ? 1.25 : 1.0;
  }

  activeCooldownMul() {
    return this.synergyFlags().MAGE ? 0.6 : 1.0;
  }

  lifeStealRatio() {
    return this.synergyFlags().SWORDSMAN ? 0.12 : 0.0;
  }

  bulletPierceEnabled() {
    return this.synergyFlags().RANGER;
  }
}
