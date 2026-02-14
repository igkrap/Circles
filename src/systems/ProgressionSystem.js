const XP_BASE_NEXT = 30;
const XP_GROWTH_POW = 1.35;

export default class ProgressionSystem {
  constructor() {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.calcXpToNext(this.level);
    this.pendingLevelups = 0;
  }

  calcXpToNext(level) {
    const lv = Math.max(1, Math.floor(level));
    return Math.max(1, Math.floor(XP_BASE_NEXT * Math.pow(lv, XP_GROWTH_POW)));
  }

  grantXp(amount) {
    let add = Number(amount);
    if (!Number.isFinite(add)) add = 0;
    add = Math.max(0, Math.floor(add));
    this.xp += add;

    let leveled = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      leveled += 1;
      this.pendingLevelups += 1;
      this.xpToNext = this.calcXpToNext(this.level);
    }
    return leveled;
  }

  consumePendingLevelup() {
    if (this.pendingLevelups <= 0) return false;
    this.pendingLevelups -= 1;
    return true;
  }

  getXpRatio() {
    if (this.xpToNext <= 0) return 0;
    return Math.min(1, Math.max(0, this.xp / this.xpToNext));
  }
}
