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
      this.baseKillGoal = 16;
      this.baseIntervalMs = 2800;
    } else if (difficulty === 'HARD') {
      this.baseKillGoal = 22;
      this.baseIntervalMs = 2350;
    } else {
      this.baseKillGoal = 18;
      this.baseIntervalMs = 2600;
    }
  }

  getDifficultyScalar() {
    // Stage 1 intentionally gentler.
    return Math.min(1.8, 0.78 + 0.06 * (this.stage - 1));
  }

  currentSpec() {
    const s = this.stage;
    const killStep = this.difficulty === 'NORMAL' ? 5 : (this.difficulty === 'EASY' ? 4 : 6);
    const intervalStep = this.difficulty === 'NORMAL' ? 100 : (this.difficulty === 'EASY' ? 80 : 120);

    const killGoal = this.baseKillGoal + killStep * (s - 1);
    let waveIntervalMs = Math.max(1150, this.baseIntervalMs - intervalStep * (s - 1));
    waveIntervalMs *= 0.9;

    let bmin = Math.max(1, Math.round(2 + 0.22 * (s - 1)));
    let bmax = Math.max(bmin + 1, Math.round(3 + 0.28 * (s - 1)));

    let patterns;
    if (s <= 2) {
      patterns = ['random', 'corners', 'random'];
    } else if (s <= 4) {
      patterns = ['corners', 'edge_stream', 'random'];
    } else {
      patterns = ['corners', 'edge_stream', 'ring', 'random'];
    }

    if (s % 5 === 0) {
      waveIntervalMs *= 1.15;
      bmin = Math.max(1, bmin - 1);
      bmax = Math.max(bmin + 1, bmax - 1);
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

    if (this.stage >= 4 && this.stage % 3 === 0) {
      const count = 4 + Math.floor(this.stage / 3);
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

    if (this.stage >= 5 && this.stage % 5 === 0) {
      const b = scene.physics.world.bounds;
      scene.queueEnemySpawn(b.width * 0.5, 70, EnemyType.MINIBOSS, 1.15);
      if (this.stage >= 10) {
        scene.queueEnemySpawn(b.width * 0.5 - 120, 100, EnemyType.ELITE, 1.0);
        scene.queueEnemySpawn(b.width * 0.5 + 120, 100, EnemyType.ELITE, 1.0);
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
    let eliteP = 0;
    if (stage >= 2) eliteP = Math.min(0.18, 0.04 + 0.012 * (stage - 2));
    if (rr < eliteP) return EnemyType.ELITE;
    rr -= eliteP;

    let tankP = 0;
    if (stage >= 3) tankP = Math.min(0.14, 0.04 + 0.01 * (stage - 3));
    if (rr < tankP) return EnemyType.TANK;

    if (stage <= 1) {
      return r < 0.55 ? EnemyType.SCOUT : EnemyType.NORMAL;
    }
    if (stage === 2) {
      if (r < 0.45) return EnemyType.SCOUT;
      if (r < 0.85) return EnemyType.NORMAL;
      return EnemyType.TANK;
    }
    if (stage <= 4) {
      if (r < 0.34) return EnemyType.SCOUT;
      if (r < 0.70) return EnemyType.NORMAL;
      if (r < 0.88) return EnemyType.TANK;
      return EnemyType.ELITE;
    }

    // Later stages: more elite/tank.
    if (r < 0.24) return EnemyType.SCOUT;
    if (r < 0.52) return EnemyType.NORMAL;
    if (r < 0.76) return EnemyType.TANK;
    return EnemyType.ELITE;
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
    else spawnRandom();
  }
}
