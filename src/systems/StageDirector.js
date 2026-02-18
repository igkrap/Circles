import Phaser from 'phaser';

export const EnemyType = {
  SCOUT: 'scout',
  NORMAL: 'normal',
  TANK: 'tank',
  ELITE: 'elite',
  MINIBOSS: 'miniboss',
  BOSS: 'boss'
};

export default class StageDirector {
  constructor(opts = {}) {
    const difficulty = opts.difficulty ?? 'NORMAL';
    this.difficulty = difficulty;

    this.stage = 1;
    this.stageKills = 0;
    this.stageCleared = false;
    this.clearMs = 0;
    this.waveAcc = 0;
    this.bossAlive = false;
    this.specialDoneForStage = false;

    if (difficulty === 'EASY') {
      this.baseKillGoal = 18;
      this.baseIntervalMs = 2650;
    } else if (difficulty === 'HARD') {
      this.baseKillGoal = 24;
      this.baseIntervalMs = 2320;
    } else {
      this.baseKillGoal = 20;
      this.baseIntervalMs = 2480;
    }
  }

  getDifficultyScalar() {
    // Sharper slope for 20-stage mode.
    return Math.min(3.1, 0.84 + 0.11 * (this.stage - 1));
  }

  currentSpec() {
    const s = this.stage;
    const killStep = this.difficulty === 'NORMAL' ? 7 : (this.difficulty === 'EASY' ? 6 : 8);
    const intervalStep = this.difficulty === 'NORMAL' ? 120 : (this.difficulty === 'EASY' ? 105 : 140);

    const killGoal = this.baseKillGoal + killStep * (s - 1);
    let waveIntervalMs = Math.max(620, this.baseIntervalMs - intervalStep * (s - 1));
    waveIntervalMs *= 0.88;

    let bmin = Math.max(2, Math.round(2 + 0.32 * (s - 1)));
    let bmax = Math.max(bmin + 1, Math.round(4 + 0.44 * (s - 1)));

    let patterns;
    if (s <= 2) {
      patterns = ['random', 'corners', 'random'];
    } else if (s <= 4) {
      patterns = ['corners', 'edge_stream', 'random'];
    } else if (s <= 7) {
      patterns = ['corners', 'edge_stream', 'ring', 'pincer'];
    } else if (s <= 11) {
      patterns = ['edge_stream', 'ring', 'pincer', 'box'];
    } else if (s <= 15) {
      patterns = ['edge_stream', 'ring', 'pincer', 'box', 'spiral'];
    } else {
      patterns = ['ring', 'pincer', 'box', 'spiral', 'random'];
    }

    if (s % 5 === 0) {
      waveIntervalMs *= 1.2;
      bmin = Math.max(1, bmin - 2);
      bmax = Math.max(bmin + 1, bmax - 3);
    }

    return {
      stage: s,
      killGoal,
      waveIntervalMs,
      burstMin: bmin,
      burstMax: bmax,
      patterns
    };
  }

  onEnemyKilled() {
    this.stageKills += 1;
  }

  isBossStage() {
    return this.stage % 5 === 0;
  }

  startNextStage() {
    this.stage += 1;
    this.stageKills = 0;
    this.stageCleared = false;
    this.clearMs = 0;
    this.waveAcc = 0;
    this.bossAlive = false;
    this.specialDoneForStage = false;
  }

  spawnSpecialsIfAny(scene) {
    if (this.specialDoneForStage || !scene?.queueEnemySpawn) return false;
    let spawned = false;

    if (this.stage >= 3 && this.stage % 3 === 0) {
      const count = 5 + Math.floor(this.stage * 0.5);
      for (let i = 0; i < count; i += 1) {
        const edge = Phaser.Utils.Array.GetRandom(['L', 'R', 'T', 'B']);
        const b = scene.physics.world.bounds;
        let x = b.width * 0.5;
        let y = b.height * 0.5;
        if (edge === 'L') {
          x = 24;
          y = Phaser.Math.Between(70, b.height - 70);
        } else if (edge === 'R') {
          x = b.width - 24;
          y = Phaser.Math.Between(70, b.height - 70);
        } else if (edge === 'T') {
          x = Phaser.Math.Between(70, b.width - 70);
          y = 24;
        } else {
          x = Phaser.Math.Between(70, b.width - 70);
          y = b.height - 24;
        }
        scene.queueEnemySpawn(x, y, EnemyType.ELITE, 0.75);
      }
      spawned = true;
    }

    if (this.stage >= 6 && this.stage % 4 === 0) {
      const b = scene.physics.world.bounds;
      const c = 3 + Math.floor(this.stage / 4);
      const cx = b.width * 0.5;
      const cy = b.height * 0.5;
      const rr = Phaser.Math.Between(110, 170);
      for (let i = 0; i < c; i += 1) {
        const a = (i / Math.max(1, c)) * Math.PI * 2;
        scene.queueEnemySpawn(
          Phaser.Math.Clamp(cx + Math.cos(a) * rr, 36, b.width - 36),
          Phaser.Math.Clamp(cy + Math.sin(a) * rr, 36, b.height - 36),
          EnemyType.TANK,
          0.8
        );
      }
      spawned = true;
    }

    if (this.stage >= 5 && this.stage % 5 === 0) {
      const b = scene.physics.world.bounds;
      if (this.stage >= 10) {
        scene.queueEnemySpawn(b.width * 0.5 - 120, 100, EnemyType.ELITE, 1.0);
        scene.queueEnemySpawn(b.width * 0.5 + 120, 100, EnemyType.ELITE, 1.0);
      }
      if (this.stage >= 15) {
        scene.queueEnemySpawn(b.width * 0.5 - 200, 118, EnemyType.TANK, 1.05);
        scene.queueEnemySpawn(b.width * 0.5 + 200, 118, EnemyType.TANK, 1.05);
      }
      spawned = true;
    }

    if (spawned) this.specialDoneForStage = true;
    return spawned;
  }

  update(dtMs, scene) {
    const spec = this.currentSpec();

    if (!this.stageCleared && this.stageKills >= spec.killGoal) {
      this.stageCleared = true;
      this.clearMs = 2200;
      scene?.onStageClear?.(this.stage);
    }

    if (this.stageCleared) {
      if (this.clearMs > 0) {
        this.clearMs = Math.max(0, this.clearMs - dtMs);
        return;
      }
      this.startNextStage();
      return;
    }

    if (this.waveAcc === 0 && this.spawnSpecialsIfAny(scene)) {
      this.waveAcc = -350;
    }

    if (this.isBossStage()) {
      if (!this.bossAlive) {
        scene.spawnBoss();
        this.bossAlive = true;
      }
      return;
    }

    this.waveAcc += dtMs;
    const interval = spec.waveIntervalMs;

    while (this.waveAcc >= interval) {
      this.waveAcc -= interval;
      this.spawnWave(scene, spec);
    }
  }

  pickEnemyType(stage = this.stage) {
    const r = Math.random();

    let rr = r;
    let miniP = 0;
    if (stage >= 14) miniP = Math.min(0.06, 0.01 + 0.006 * (stage - 14));
    if (rr < miniP) return EnemyType.MINIBOSS;
    rr -= miniP;

    let eliteP = 0;
    if (stage >= 2) eliteP = Math.min(0.3, 0.05 + 0.016 * (stage - 2));
    if (rr < eliteP) return EnemyType.ELITE;
    rr -= eliteP;

    let tankP = 0;
    if (stage >= 3) tankP = Math.min(0.24, 0.04 + 0.014 * (stage - 3));
    if (rr < tankP) return EnemyType.TANK;

    if (stage <= 1) {
      return r < 0.55 ? EnemyType.SCOUT : EnemyType.NORMAL;
    }
    if (stage === 2) {
      if (r < 0.45) return EnemyType.SCOUT;
      if (r < 0.85) return EnemyType.NORMAL;
      return EnemyType.TANK;
    }
    if (stage <= 6) {
      if (r < 0.3) return EnemyType.SCOUT;
      if (r < 0.62) return EnemyType.NORMAL;
      if (r < 0.86) return EnemyType.TANK;
      return EnemyType.ELITE;
    }

    if (stage <= 12) {
      if (r < 0.22) return EnemyType.SCOUT;
      if (r < 0.45) return EnemyType.NORMAL;
      if (r < 0.7) return EnemyType.TANK;
      return EnemyType.ELITE;
    }

    if (r < 0.15) return EnemyType.SCOUT;
    if (r < 0.36) return EnemyType.NORMAL;
    if (r < 0.64) return EnemyType.TANK;
    if (r < 0.92) return EnemyType.ELITE;
    return EnemyType.MINIBOSS;
  }

  spawnWave(scene, spec) {
    if (!scene || !scene.spawnEnemyAt) return;
    const alive = scene.enemies.countActive(true);
    const softCap = scene.getEnemySoftCap?.() ?? 18;
    if (alive >= softCap + 6) return;

    const n = Phaser.Math.Between(spec.burstMin, spec.burstMax);
    const pattern = Phaser.Utils.Array.GetRandom(spec.patterns);
    const bounds = scene.physics.world.bounds;
    const anchor = scene.getSpawnAnchor?.() ?? { x: scene.player.x, y: scene.player.y };
    const px = anchor.x;
    const py = anchor.y;

    const spawnCorner = () => {
      const corners = [
        { x: 40, y: 40 },
        { x: bounds.width - 40, y: 40 },
        { x: 40, y: bounds.height - 40 },
        { x: bounds.width - 40, y: bounds.height - 40 }
      ];
      Phaser.Utils.Array.Shuffle(corners);
      for (let i = 0; i < n; i += 1) {
        const c = corners[i % corners.length];
        scene.spawnEnemyAt(c.x, c.y, this.pickEnemyType(spec.stage));
      }
    };

    const spawnEdgeStream = () => {
      const edge = Phaser.Utils.Array.GetRandom(['L', 'R', 'T', 'B']);
      for (let i = 0; i < n; i += 1) {
        let x = px;
        let y = py;
        if (edge === 'L') {
          x = 16;
          y = Phaser.Math.Between(50, bounds.height - 50);
        } else if (edge === 'R') {
          x = bounds.width - 16;
          y = Phaser.Math.Between(50, bounds.height - 50);
        } else if (edge === 'T') {
          x = Phaser.Math.Between(50, bounds.width - 50);
          y = 16;
        } else {
          x = Phaser.Math.Between(50, bounds.width - 50);
          y = bounds.height - 16;
        }
        scene.spawnEnemyAt(x, y, this.pickEnemyType(spec.stage));
      }
    };

    const spawnRing = () => {
      const radius = Phaser.Math.FloatBetween(130, 185);
      for (let i = 0; i < n; i += 1) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const x = Phaser.Math.Clamp(px + Math.cos(a) * radius, 40, bounds.width - 40);
        const y = Phaser.Math.Clamp(py + Math.sin(a) * radius, 40, bounds.height - 40);
        scene.spawnEnemyAt(x, y, this.pickEnemyType(spec.stage));
      }
    };

    const spawnPincer = () => {
      const horizontal = Math.random() < 0.5;
      for (let i = 0; i < n; i += 1) {
        const t = (i + 1) / (n + 1);
        let x;
        let y;
        if (horizontal) {
          x = i % 2 === 0 ? 24 : bounds.width - 24;
          y = Phaser.Math.Clamp(bounds.height * t + Phaser.Math.Between(-32, 32), 50, bounds.height - 50);
        } else {
          x = Phaser.Math.Clamp(bounds.width * t + Phaser.Math.Between(-32, 32), 50, bounds.width - 50);
          y = i % 2 === 0 ? 24 : bounds.height - 24;
        }
        scene.spawnEnemyAt(x, y, this.pickEnemyType(spec.stage));
      }
    };

    const spawnBox = () => {
      const halfW = Phaser.Math.Between(120, 220);
      const halfH = Phaser.Math.Between(90, 170);
      for (let i = 0; i < n; i += 1) {
        const side = i % 4;
        const lerp = (i + 1) / (n + 1);
        let x;
        let y;
        if (side === 0) {
          x = px - halfW + lerp * halfW * 2;
          y = py - halfH;
        } else if (side === 1) {
          x = px + halfW;
          y = py - halfH + lerp * halfH * 2;
        } else if (side === 2) {
          x = px + halfW - lerp * halfW * 2;
          y = py + halfH;
        } else {
          x = px - halfW;
          y = py + halfH - lerp * halfH * 2;
        }
        scene.spawnEnemyAt(
          Phaser.Math.Clamp(x, 40, bounds.width - 40),
          Phaser.Math.Clamp(y, 40, bounds.height - 40),
          this.pickEnemyType(spec.stage)
        );
      }
    };

    const spawnSpiral = () => {
      const startA = Phaser.Math.FloatBetween(0, Math.PI * 2);
      for (let i = 0; i < n; i += 1) {
        const t = i / Math.max(1, n - 1);
        const a = startA + t * Math.PI * 2 * 1.35;
        const radius = 70 + t * 190;
        const x = Phaser.Math.Clamp(px + Math.cos(a) * radius, 40, bounds.width - 40);
        const y = Phaser.Math.Clamp(py + Math.sin(a) * radius, 40, bounds.height - 40);
        scene.spawnEnemyAt(x, y, this.pickEnemyType(spec.stage));
      }
    };

    const spawnRandom = () => {
      for (let i = 0; i < n; i += 1) {
        const x = Phaser.Math.Between(50, bounds.width - 50);
        const y = Phaser.Math.Between(50, bounds.height - 50);
        scene.spawnEnemyAt(x, y, this.pickEnemyType(spec.stage));
      }
    };

    if (pattern === 'corners') spawnCorner();
    else if (pattern === 'edge_stream') spawnEdgeStream();
    else if (pattern === 'ring') spawnRing();
    else if (pattern === 'pincer') spawnPincer();
    else if (pattern === 'box') spawnBox();
    else if (pattern === 'spiral') spawnSpiral();
    else spawnRandom();
  }
}
