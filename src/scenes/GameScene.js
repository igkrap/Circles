import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import StageDirector, { EnemyType } from '../systems/StageDirector.js';
import InputSystem from '../systems/InputSystem.js';
import { FloatingText } from '../systems/Fx.js';
import ProgressionSystem from '../systems/ProgressionSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import LevelUpOverlay from '../systems/LevelUpOverlay.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import { ABILITY_KEYS, ABILITY_META, MAX_UNIQUE_TRAITS_PER_RUN } from '../data/abilities.js';
import { AUDIO_ACTION_PROFILE, AUDIO_DEFAULT_PROFILE } from '../data/audioProfile.js';
import {
  RELIC_BY_ID,
  combineEffects,
  getCompletedCodexSets
} from '../data/relics.js';

const XP_PER_TYPE = {
  [EnemyType.SCOUT]: 8,
  [EnemyType.NORMAL]: 10,
  [EnemyType.TANK]: 16,
  [EnemyType.ELITE]: 30,
  [EnemyType.MINIBOSS]: 180,
  [EnemyType.BOSS]: 180
};

const SCORE_PER_TYPE = {
  [EnemyType.SCOUT]: 10,
  [EnemyType.NORMAL]: 12,
  [EnemyType.TANK]: 18,
  [EnemyType.ELITE]: 28,
  [EnemyType.MINIBOSS]: 100,
  [EnemyType.BOSS]: 140
};

class GoldPickup extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, amount) {
    super(scene, x, y, 'tex_gold');
    this.amount = amount;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(5);
    this.setCircle(9);
    this.body.setAllowGravity(false);

    const vx = Phaser.Math.Between(-30, 30);
    const vy = Phaser.Math.Between(-30, 30);
    this.body.setVelocity(vx, vy);
    this.body.setDrag(50, 50);
  }
}

class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type, hp, speed) {
    const tex = type === EnemyType.SCOUT ? 'tex_enemy_scout'
      : type === EnemyType.NORMAL ? 'tex_enemy_normal'
      : type === EnemyType.TANK ? 'tex_enemy_tank'
      : type === EnemyType.ELITE || type === EnemyType.MINIBOSS ? 'tex_enemy_elite'
      : 'tex_boss';

    super(scene, x, y, tex);

    this.type = type;
    this.maxHp = hp;
    this.hp = hp;
    this.speed = speed;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(true);

    const r = (type === EnemyType.BOSS) ? 28 : (type === EnemyType.MINIBOSS ? 22 : (type === EnemyType.TANK ? 17 : 13));
    this.setCircle(r);
    if (type === EnemyType.MINIBOSS) {
      this.setScale(1.18);
    }

    this.shadow = scene.add.image(x, y + r + 6, 'tex_shadow').setDepth(2).setAlpha(0.42);
    this.shadow.setDisplaySize(r * 2.1, Math.max(10, r * 0.85));
    this.once('destroy', () => {
      this.shadow?.destroy();
      this.shadow = null;
    });
  }
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.runGold = 0;
    this.totalGold = SaveSystem.getTotalGold();
    this.levelupActive = false;
    this.pauseActive = false;
    this.settings = SettingsSystem.load();
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
    this.isSafariTarget = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
    this.vfxQuality = this.isSafariTarget ? 0.58 : 1.0;

    this.sound.stopAll();
    const gameBgmKeys = ['bgm_main1', 'bgm_main2', 'bgm_main'].filter((k) => this.cache.audio.exists(k));
    const pickedBgmKey = gameBgmKeys.length > 0
      ? Phaser.Utils.Array.GetRandom(gameBgmKeys)
      : 'bgm_main';
    this.bgm = this.sound.add(pickedBgmKey, { loop: true, volume: this.settings.bgmVolume });
    this.applyAudioSettings();

    const worldW = 4800;
    const worldH = 3000;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.createWorldBackdrop(worldW, worldH);

    this.player = this.physics.add.image(worldW / 2, worldH / 2, 'tex_player');
    this.player.setDepth(4);
    this.player.setCircle(15);
    this.player.setCollideWorldBounds(true);
    this.playerShadow = this.add.image(this.player.x, this.player.y + 20, 'tex_shadow').setDepth(2).setAlpha(0.45);
    this.playerShadow.setDisplaySize(42, 18);
    this.playerAura = this.add.image(this.player.x, this.player.y, 'tex_aura_ring').setDepth(3).setAlpha(0.55);
    this.playerAura.setBlendMode(Phaser.BlendModes.ADD);

    this.playerMaxHpBase = 100;
    this.playerMaxHp = this.playerMaxHpBase;
    this.playerHp = this.playerMaxHp;
    this.playerShield = 0;

    this.playerSpeedBase = 270;
    this.playerSpeed = this.playerSpeedBase;
    this.baseDamageBase = 7;
    this.baseDamage = this.baseDamageBase;
    this.fireRateBase = 155;
    this.fireRateMs = this.fireRateBase;

    this.xpGainMul = 1.0;
    this.goldGainMul = 1.0;
    this.critChance = 0.0;
    this.relicDamageMul = 1.0;
    this.relicMoveSpeedMul = 1.0;
    this.relicFireIntervalMul = 1.0;
    this.relicSkillCooldownMul = 1.0;
    this.relicDamageTakenMul = 1.0;
    this.relicXpGainMul = 1.0;
    this.relicGoldGainMul = 1.0;
    this.relicCritChanceFlat = 0.0;
    this.relicCritDamageMul = 1.0;
    this.relicLifestealFlat = 0.0;
    this.relicHpRegenFlat = 0.0;
    this.hpRegenPerSec = 0.0;
    this.hpRegenAcc = 0.0;
    this.shieldRegenDelaySec = 0.0;
    this.shieldRegenAcc = 0.0;

    this.progression = new ProgressionSystem();
    this.abilitySystem = new AbilitySystem();
    this.applyRelicAndCodexEffects();
    this.combatPace = 0.78;
    this.enemyPace = 0.86;
    this.tweens.timeScale = 0.82;
    this.skillCooldowns = {};
    this.grenades = [];
    this.blizzards = [];
    this.spinAuras = [];
    this.fireBolts = [];
    this.spawnWarnings = [];
    this.lineWarnings = [];
    this.bossLasers = [];
    this.playerInvulnSec = 0;
    this.kills = 0;
    this.baseScore = 0;

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.inputSystem = new InputSystem(this, () => ({ x: this.player.x, y: this.player.y }));
    this.isMobileTouch = !!this.sys?.game?.device?.input?.touch;
    this.mobileUi = null;
    this.skillDragState = null;
    this.skillAimOverride = null;
    this.aimCursorPos = new Phaser.Math.Vector2(this.player.x, this.player.y);
    this.autoTarget = null;
    this.aimCursorGfx = this.add.graphics().setDepth(120).setScrollFactor(0);

    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, runChildUpdate: false });
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false });
    this.goldPickups = this.physics.add.group({ classType: GoldPickup, runChildUpdate: false });
    this.createVfx();

    this.stageDirector = new StageDirector();
    this.fireAcc = 0;
    this.elapsedMs = 0;

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.onBulletHit(b, e));
    this.physics.add.overlap(this.player, this.enemies, (p, e) => this.onPlayerTouchEnemy(p, e));
    this.physics.add.overlap(this.player, this.goldPickups, (p, g) => this.onGoldPickup(p, g));

    this.createHud();
    if (this.isMobileTouch) this.createMobileControls();
    this.createPauseUi();

    this.levelUpOverlay = new LevelUpOverlay(this, (key) => this.chooseLevelup(key));
    this.keyHandler = (event) => this.onKeyDown(event);
    this.input.keyboard.on('keydown', this.keyHandler);

    this.events.once('shutdown', () => {
      this.input.keyboard.off('keydown', this.keyHandler);
      this.levelUpOverlay.destroy();
      this.spawnWarnings.forEach((w) => w.gfx?.destroy());
      this.lineWarnings.forEach((w) => w.gfx?.destroy());
      this.bossLasers.forEach((b) => b.gfx?.destroy());
      this.aimCursorGfx?.destroy();
      this.pauseUi?.root?.destroy(true);
      this.fxParticles?.destroy();
      this.mobileUi?.root?.destroy(true);
      this.bgLayer?.destroy();
      this.bgNebula?.destroy();
      this.playerShadow?.destroy();
      this.playerAura?.destroy();
    });
  }

  createWorldBackdrop(worldW, worldH) {
    this.cameras.main.setBackgroundColor(0x050c1d);
    this.bgLayer = this.add.tileSprite(worldW * 0.5, worldH * 0.5, worldW, worldH, 'tex_bg_tile');
    this.bgLayer.setDepth(-20);
    this.bgLayer.setAlpha(1);

    this.bgNebula = this.add.graphics().setDepth(-18);
    const colors = [0x112748, 0x1e2b54, 0x1c3658];
    colors.forEach((c, idx) => {
      this.bgNebula.fillStyle(c, 0.12 + idx * 0.03);
      const x = worldW * (0.22 + idx * 0.3);
      const y = worldH * (0.32 + idx * 0.2);
      this.bgNebula.fillCircle(x, y, 210 + idx * 55);
    });
  }

  createMobileControls() {
    const root = this.add.container(0, 0).setDepth(1400).setScrollFactor(0);
    const mkPad = (x, y, r) => {
      const base = this.add.circle(x, y, r, 0x172033, 0.28).setScrollFactor(0);
      base.setStrokeStyle(2, 0x3b4d75, 0.85);
      const thumb = this.add.circle(x, y, r * 0.34, 0x7ea0ff, 0.35).setScrollFactor(0);
      thumb.setStrokeStyle(1, 0xeaf0ff, 0.65);
      root.add([base, thumb]);
      return { base, thumb };
    };

    const padR = 101;
    const left = mkPad(96, this.scale.height - 96, padR);
    const right = mkPad(this.scale.width - 96, this.scale.height - 96, padR);

    this.mobileUi = {
      root,
      padRadius: padR,
      leftPad: left,
      rightPad: right,
      skillButtons: [],
      aimGuide: this.add.graphics().setDepth(1410).setScrollFactor(0)
    };
    root.add(this.mobileUi.aimGuide);

    for (let slot = 1; slot <= 4; slot += 1) {
      const btn = this.add.circle(0, 0, 26, 0x172033, 0.78)
        .setStrokeStyle(2, 0x3b4d75, 0.92)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0);
      const num = this.add.text(0, 0, `${slot}`, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '13px',
        color: '#eaf0ff'
      }).setOrigin(0, 0).setScrollFactor(0);
      const icon = this.add.image(0, 0, 'tex_gold').setVisible(false).setScrollFactor(0);
      const cd = this.add.text(0, 0, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '12px',
        color: '#c9d4f2'
      }).setOrigin(0.5).setScrollFactor(0);
      const cdOverlay = this.add.graphics().setScrollFactor(0);

      btn.on('pointerdown', (p) => {
        this.skillDragState = {
          slot,
          pointerId: p.id,
          startX: p.x,
          startY: p.y,
          originX: btn.x,
          originY: btn.y,
          drag: false,
          pointerX: p.x,
          pointerY: p.y
        };
      });
      btn.on('pointermove', (p) => {
        if (!this.skillDragState || this.skillDragState.pointerId !== p.id) return;
        this.skillDragState.pointerX = p.x;
        this.skillDragState.pointerY = p.y;
        const d = Phaser.Math.Distance.Between(this.skillDragState.startX, this.skillDragState.startY, p.x, p.y);
        if (d > 18) this.skillDragState.drag = true;
      });
      btn.on('pointerup', (p) => {
        if (!this.skillDragState || this.skillDragState.pointerId !== p.id) return;
        const st = this.skillDragState;
        this.skillDragState = null;
        this.mobileUi.aimGuide.clear();
        if (st.drag) {
          const v = new Phaser.Math.Vector2(st.pointerX - st.originX, st.pointerY - st.originY);
          if (v.lengthSq() > 0.0001) {
            this.tryCastSkillSlot(slot, v.normalize());
            return;
          }
        }
        this.tryCastSkillSlot(slot);
      });

      root.add([btn, num, icon, cd, cdOverlay]);
      this.mobileUi.skillButtons.push({ slot, btn, num, icon, cd, cdOverlay, radius: 26 });
    }

    this.input.on('pointermove', (p) => {
      if (!this.skillDragState || this.skillDragState.pointerId !== p.id) return;
      this.skillDragState.pointerX = p.x;
      this.skillDragState.pointerY = p.y;
      const d = Phaser.Math.Distance.Between(this.skillDragState.startX, this.skillDragState.startY, p.x, p.y);
      if (d > 18) this.skillDragState.drag = true;
    });

    this.input.on('pointerup', (p) => {
      if (!this.skillDragState || this.skillDragState.pointerId !== p.id) return;
      const st = this.skillDragState;
      this.skillDragState = null;
      this.mobileUi?.aimGuide?.clear();
      if (st.drag) {
        const v = new Phaser.Math.Vector2(st.pointerX - st.originX, st.pointerY - st.originY);
        if (v.lengthSq() > 0.0001) {
          this.tryCastSkillSlot(st.slot, v.normalize());
          return;
        }
      }
      this.tryCastSkillSlot(st.slot);
    });

    this.layoutMobileControls(this.scale.width, this.scale.height);
    this.scale.on('resize', (size) => this.layoutMobileControls(size.width, size.height));
  }

  layoutMobileControls(w, h) {
    if (!this.mobileUi) return;
    const padR = this.mobileUi.padRadius;
    const leftX = padR + 24;
    const rightX = w - padR - 24;
    const y = h - padR - 24;
    this.mobileUi.leftPad.base.setPosition(leftX, y).setRadius(padR);
    this.mobileUi.leftPad.thumb.setPosition(leftX, y).setRadius(padR * 0.34);
    this.mobileUi.rightPad.base.setPosition(rightX, y).setRadius(padR);
    this.mobileUi.rightPad.thumb.setPosition(rightX, y).setRadius(padR * 0.34);

    this.inputSystem.setTouchPads({
      left: { x: leftX, y },
      right: { x: rightX, y },
      radius: padR,
      deadZone: 14
    });

    const bd = 78;
    const br = bd * 0.5;
    const bottomInset = 10 + 12 + br; // keep above XP bar
    const fanOrigin = {
      x: w - (br + 10),
      y: h - bottomInset
    };
    const fanRadius = (padR + br + 220) * 0.7;
    const userAngles = [270, 300, 330, 360];
    const minX = br + 10;
    const maxX = w - br - 10;
    const minY = br + 10;
    const maxY = h - bottomInset;
    this.mobileUi.skillButtons.forEach((b, i) => {
      const ua = userAngles[i] ?? userAngles[userAngles.length - 1];
      // User angle convention: 270=left, 360=up.
      const screenDeg = 450 - ua;
      const a = Phaser.Math.DegToRad(screenDeg);
      let cx = fanOrigin.x + Math.cos(a) * fanRadius;
      let cy = fanOrigin.y - Math.sin(a) * fanRadius;
      cx = Phaser.Math.Clamp(cx, minX, maxX);
      cy = Phaser.Math.Clamp(cy, minY, maxY);
      const x = cx - br;
      const yy = cy - br;
      b.btn.setPosition(cx, cy).setRadius(br);
      b.num.setPosition(x + 6, yy + 4);
      b.icon.setPosition(cx, cy + 1).setDisplaySize(18, 18);
      b.cd.setPosition(cx, cy);
      b.cdOverlay.clear();
      b.rect = { x, y: yy, w: bd, h: bd };
    });
  }

  createVfx() {
    this.vfxDepth = 9;
  }

  vfxCount(n) {
    return Math.max(1, Math.floor(n * (this.vfxQuality ?? 1)));
  }

  emitParticleBurst(texture, x, y, cfg = {}) {
    const {
      count = 10,
      lifespanMin = 140,
      lifespanMax = 280,
      speedMin = 30,
      speedMax = 140,
      angleMin = 0,
      angleMax = 360,
      scaleStart = 0.6,
      scaleEnd = 0,
      alphaStart = 0.9,
      alphaEnd = 0,
      gravityY = 0,
      tint = null,
      blendMode = Phaser.BlendModes.ADD
    } = cfg;
    const actualCount = this.vfxCount(count);
    const lifeMul = this.isSafariTarget ? 0.8 : 1;
    const finalLifeMin = Math.max(60, Math.floor(lifespanMin * lifeMul));
    const finalLifeMax = Math.max(finalLifeMin + 1, Math.floor(lifespanMax * lifeMul));
    const selectedBlend = (this.isSafariTarget && blendMode === Phaser.BlendModes.ADD)
      ? Phaser.BlendModes.NORMAL
      : blendMode;
    // Phaser particle APIs differ by version. Support both emitter-return and manager-return paths.
    let particleObj = null;
    let emitter = null;
    try {
      particleObj = this.add.particles(x, y, texture, {
        lifespan: { min: finalLifeMin, max: finalLifeMax },
        speed: { min: speedMin, max: speedMax },
        angle: { min: angleMin, max: angleMax },
        scale: { start: scaleStart, end: scaleEnd },
        alpha: { start: alphaStart, end: alphaEnd },
        gravityY,
        blendMode: selectedBlend,
        emitting: false
      });
      // Newer Phaser: add.particles(...) returns emitter
      if (particleObj && typeof particleObj.explode === 'function') {
        emitter = particleObj;
      }
    } catch {
      particleObj = null;
    }

    if (!emitter) {
      try {
        // Older Phaser fallback: manager + emitter config
        particleObj = this.add.particles(texture);
        emitter = particleObj.createEmitter({
          x,
          y,
          lifespan: { min: finalLifeMin, max: finalLifeMax },
          speed: { min: speedMin, max: speedMax },
          angle: { min: angleMin, max: angleMax },
          scale: { start: scaleStart, end: scaleEnd },
          alpha: { start: alphaStart, end: alphaEnd },
          gravityY,
          blendMode: selectedBlend,
          on: false
        });
      } catch {
        return;
      }
    }

    if (particleObj && typeof particleObj.setDepth === 'function') {
      particleObj.setDepth((this.vfxDepth ?? 9) + 1);
    }
    if (tint !== null) {
      if (emitter && typeof emitter.setTint === 'function') emitter.setTint(tint);
      else if (particleObj && typeof particleObj.setTint === 'function') particleObj.setTint(tint);
    }
    if (typeof emitter.explode === 'function') emitter.explode(actualCount, x, y);
    else if (typeof emitter.emitParticleAt === 'function') emitter.emitParticleAt(x, y, actualCount);

    this.time.delayedCall(finalLifeMax + 140, () => {
      if (particleObj && typeof particleObj.destroy === 'function') particleObj.destroy();
    });
  }

  emitFlameSmoke(x, y, dirX = 0, dirY = -1, power = 1) {
    const a = Phaser.Math.RadToDeg(Math.atan2(dirY, dirX));
    this.emitParticleBurst('tex_flame', x, y, {
      count: Math.max(2, Math.floor(8 * power)),
      lifespanMin: 120,
      lifespanMax: 260,
      speedMin: 40 * power,
      speedMax: 150 * power,
      angleMin: a + 145,
      angleMax: a + 215,
      scaleStart: 0.65 * power,
      scaleEnd: 0.05,
      alphaStart: 0.95,
      alphaEnd: 0,
      blendMode: Phaser.BlendModes.ADD
    });
    this.emitParticleBurst('tex_smoke', x, y, {
      count: Math.max(2, Math.floor(6 * power)),
      lifespanMin: 260,
      lifespanMax: 520,
      speedMin: 14 * power,
      speedMax: 55 * power,
      angleMin: a + 150,
      angleMax: a + 210,
      scaleStart: 0.35 * power,
      scaleEnd: 1.0 * power,
      alphaStart: 0.42,
      alphaEnd: 0,
      gravityY: -18,
      tint: 0xbec6d6,
      blendMode: Phaser.BlendModes.NORMAL
    });
  }

  emitMagicSpark(x, y, tint = 0xcfe5ff, power = 1) {
    this.emitParticleBurst('tex_particle_soft', x, y, {
      count: Math.max(4, Math.floor(12 * power)),
      lifespanMin: 90,
      lifespanMax: 180,
      speedMin: 50 * power,
      speedMax: 210 * power,
      scaleStart: 0.4 * power,
      scaleEnd: 0.05,
      alphaStart: 0.95,
      alphaEnd: 0,
      tint,
      blendMode: Phaser.BlendModes.ADD
    });
  }

  emitBurst(x, y, cfg = {}) {
    const {
      count = 10,
      tint = 0xffffff,
      speedMin = 60,
      speedMax = 220,
      lifespan = 260,
      scaleStart = 1.0
    } = cfg;
    const c = Phaser.Display.Color.IntegerToColor(tint);
    const actualCount = this.vfxCount(count);
    const lifeMul = this.isSafariTarget ? 0.82 : 1;
    const finalLifespan = Math.max(70, Math.floor(lifespan * lifeMul));
    for (let i = 0; i < actualCount; i += 1) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.FloatBetween(speedMin, speedMax);
      const len = (spd * finalLifespan) / 1000;
      const tx = x + Math.cos(ang) * len;
      const ty = y + Math.sin(ang) * len;
      const dot = this.add.image(x, y, 'tex_particle_soft')
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.95)
        .setDepth(this.vfxDepth ?? 9);
      dot.setScale(Phaser.Math.FloatBetween(0.18, 0.44) * scaleStart);
      this.tweens.add({
        targets: dot,
        x: tx,
        y: ty,
        alpha: 0,
        scale: 0.04,
        duration: finalLifespan,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy()
      });
    }

    const flash = this.add.circle(x, y, 9, Phaser.Display.Color.GetColor(c.red, c.green, c.blue), 0.22).setDepth((this.vfxDepth ?? 9) - 1);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      radius: 28,
      alpha: 0,
      duration: Math.min(220, finalLifespan),
      onComplete: () => flash.destroy()
    });
  }

  emitSpokes(x, y, cfg = {}) {
    const {
      count = 10,
      inner = 8,
      outer = 48,
      color = 0xffffff,
      width = 2,
      alpha = 0.75,
      duration = 150
    } = cfg;
    const g = this.add.graphics().setDepth((this.vfxDepth ?? 9) + 1);
    g.lineStyle(width, color, alpha);
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.08, 0.08);
      const r1 = inner + Phaser.Math.FloatBetween(-2, 2);
      const r2 = outer + Phaser.Math.FloatBetween(-5, 5);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      g.strokePath();
    }
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
  }

  emitScreenFlash(color = 0xbad8ff, alpha = 0.1, duration = 90) {
    const cam = this.cameras.main;
    const finalAlpha = this.isSafariTarget ? alpha * 0.55 : alpha;
    const finalDuration = this.isSafariTarget ? Math.floor(duration * 0.78) : duration;
    const r = this.add.rectangle(
      cam.worldView.centerX,
      cam.worldView.centerY,
      cam.width,
      cam.height,
      color,
      finalAlpha
    ).setDepth(2000);
    r.setScrollFactor(0);
    r.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: r, alpha: 0, duration: finalDuration, onComplete: () => r.destroy() });
  }

  emitSwish(x, y, angle, radius, color = 0xeaf4ff, duration = 130) {
    const g = this.add.graphics().setDepth((this.vfxDepth ?? 9) + 1);
    const span = Phaser.Math.DegToRad(52);
    g.lineStyle(5, color, 0.85);
    g.beginPath();
    g.arc(x, y, radius, angle - span * 0.5, angle + span * 0.5, false);
    g.strokePath();
    g.lineStyle(2, 0xffffff, 0.65);
    g.beginPath();
    g.arc(x, y, Math.max(12, radius - 10), angle - span * 0.4, angle + span * 0.4, false);
    g.strokePath();
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
  }

  createHud() {
    this.ui = {};
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';

    this.ui.gold = this.add.text(0, 0, '', { fontFamily: font, fontSize: '18px', color: '#ffd700' }).setScrollFactor(0);
    this.ui.coin = this.add.image(0, 0, 'tex_gold').setScale(0.9).setScrollFactor(0);
    this.ui.minimapBg = this.add.rectangle(0, 0, 140, 96, 0x101a2c, 0.62).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimapBg.setStrokeStyle(1, 0x3b4d75, 0.9);
    this.ui.minimap = this.add.graphics().setScrollFactor(0);
    this.ui.stage = this.add.text(this.scale.width / 2, 14, '', { fontFamily: font, fontSize: '18px', color: '#eaf0ff' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.stageSub = this.add.text(this.scale.width / 2, 36, '', { fontFamily: font, fontSize: '14px', color: '#aab6d6' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.time = this.add.text(this.scale.width - 18, 14, '', { fontFamily: font, fontSize: '18px', color: '#eaf0ff' }).setOrigin(1, 0).setScrollFactor(0);

    this.ui.xpBarBg = this.add.rectangle(0, 0, this.scale.width, 10, 0x23304a).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarFill = this.add.rectangle(0, 0, this.scale.width, 10, 0x7ea0ff).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarBg.setStrokeStyle(1, 0x3b4d75, 1);

    this.ui.statusBg = this.add.rectangle(0, 0, 310, 72, 0x172033, 0.72).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusBg.setStrokeStyle(2, 0x3b4d75, 0.95);
    this.ui.statusLine = this.add.rectangle(0, 0, 0, 10, 0x23304a, 0.95).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusLine.setStrokeStyle(1, 0x3b4d75, 1);
    this.ui.hp = this.add.text(0, 0, '', { fontFamily: font, fontSize: '17px', color: '#eaf0ff' }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.shield = this.add.text(0, 0, '', { fontFamily: font, fontSize: '17px', color: '#eaf0ff' }).setOrigin(1, 0).setScrollFactor(0);
    this.ui.synergy = this.add.text(0, 0, '', { fontFamily: font, fontSize: '13px', color: '#8bc6ff' }).setOrigin(0, 0).setScrollFactor(0);

    this.ui.skillSlots = [];
    for (let i = 0; i < 4; i += 1) {
      const bg = this.add.rectangle(0, 0, 56, 56, 0x172033, 0.72).setOrigin(0.5).setScrollFactor(0);
      const border = this.add.rectangle(0, 0, 56, 56).setOrigin(0.5).setScrollFactor(0);
      border.setStrokeStyle(2, 0x3b4d75, 1);
      const num = this.add.text(0, 0, String(i + 1), {
        fontFamily: font,
        fontSize: '13px',
        color: '#eaf0ff'
      }).setOrigin(0, 0).setScrollFactor(0);
      const iconSprite = this.add.image(0, 0, 'tex_gold').setVisible(false).setScrollFactor(0);
      const icon = this.add.text(0, 0, '-', {
        fontFamily: font,
        fontSize: '12px',
        color: '#eaf0ff',
        align: 'center'
      }).setOrigin(0.5).setScrollFactor(0);
      const rank = this.add.text(0, 0, '', {
        fontFamily: font,
        fontSize: '12px',
        color: '#eaf0ff'
      }).setOrigin(1, 1).setScrollFactor(0);
      const cdText = this.add.text(0, 0, '', {
        fontFamily: font,
        fontSize: '12px',
        color: '#c9d4f2'
      }).setOrigin(0.5).setScrollFactor(0);
      const cdOverlay = this.add.graphics().setScrollFactor(0);

      this.ui.skillSlots.push({
        bg,
        border,
        num,
        iconSprite,
        icon,
        rank,
        cdText,
        cdOverlay,
        rect: { x: 0, y: 0, w: 56, h: 56 }
      });
    }

    this.ui.traitArea = this.add.rectangle(0, 0, 0, 0, 0x111a2c, 0).setOrigin(0, 0).setScrollFactor(0);
    this.ui.traitArea.setStrokeStyle(0, 0x3b4d75, 0);
    this.ui.traitSlots = [];
    for (let i = 0; i < MAX_UNIQUE_TRAITS_PER_RUN; i += 1) {
      const slotBg = this.add.rectangle(0, 0, 20, 20, 0x172033, 0).setOrigin(0, 0).setScrollFactor(0);
      slotBg.setStrokeStyle(0, 0x3b4d75, 0);
      const icon = this.add.image(0, 0, 'tex_gold').setVisible(false).setScrollFactor(0);
      const rank = this.add.text(0, 0, '', {
        fontFamily: font,
        fontSize: '10px',
        color: '#eaf0ff'
      }).setOrigin(1, 1).setScrollFactor(0);
      this.ui.traitSlots.push({ slotBg, icon, rank });
    }

    const hudDepth = 1000;
    [
      this.ui.gold,
      this.ui.coin,
      this.ui.minimapBg,
      this.ui.stage,
      this.ui.stageSub,
      this.ui.time,
      this.ui.xpBarBg,
      this.ui.xpBarFill,
      this.ui.statusBg,
      this.ui.statusLine,
      this.ui.hp,
      this.ui.shield,
      this.ui.synergy,
      this.ui.traitArea
    ].forEach((obj) => obj.setDepth(hudDepth));
    this.ui.minimap.setDepth(hudDepth + 1);
    this.ui.skillSlots.forEach((slot) => {
      slot.bg.setDepth(hudDepth);
      slot.border.setDepth(hudDepth);
      slot.num.setDepth(hudDepth + 3);
      slot.iconSprite.setDepth(hudDepth);
      slot.icon.setDepth(hudDepth);
      slot.rank.setDepth(hudDepth + 2);
      slot.cdText.setDepth(hudDepth);
      slot.cdOverlay.setDepth(hudDepth + 1);
    });
    this.ui.traitSlots.forEach((slot) => {
      slot.slotBg.setDepth(hudDepth);
      slot.icon.setDepth(hudDepth);
      slot.rank.setDepth(hudDepth + 1);
    });

    this.layoutHud(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize) => this.layoutHud(gameSize.width, gameSize.height));
  }

  layoutHud(w, h) {
    const xpH = 10;
    const pad = 14;

    this.ui.coin.setPosition(14, 22);
    this.ui.gold.setPosition(28, 13);
    const mmW = w < 720 ? 118 : 144;
    const mmH = w < 720 ? 78 : 96;
    const mmX = pad;
    const mmY = 40;
    this.ui.minimapBg.setPosition(mmX, mmY).setSize(mmW, mmH);
    this.ui.minimapLayout = { x: mmX, y: mmY, w: mmW, h: mmH, pad: 4 };
    this.ui.stage.setPosition(w / 2, 14);
    this.ui.stageSub.setPosition(w / 2, 36);
    this.ui.time.setPosition(w - 18, 14);
    this.ui.xpBarBg.setPosition(0, h);
    this.ui.xpBarBg.width = w;
    this.ui.xpBarFill.setPosition(0, h);
    this.ui.xpBarFill.height = xpH;

    const statusW = Math.min(310, Math.max(230, Math.floor(w * 0.42)));
    const statusH = 72;
    const statusX = pad;
    const statusY = h - xpH - 10 - statusH;
    this.ui.statusBg.setPosition(statusX, statusY);
    this.ui.statusBg.setSize(statusW, statusH);
    this.ui.statusLine.setPosition(statusX + 14, statusY + 36);
    this.ui.statusLine.setSize(statusW - 28, 10);
    this.ui.hp.setPosition(statusX + 14, statusY + 10);
    this.ui.shield.setPosition(statusX + statusW - 14, statusY + 10);
    this.ui.synergy.setPosition(statusX + 14, statusY + 50);
    this.ui.statusLayout = { x: statusX, y: statusY, w: statusW, h: statusH };

    const box = w < 720 ? 48 : 56;
    const gap = w < 720 ? 8 : 10;
    const gridW = box * 2 + gap;
    const gridH = box * 2 + gap;
    const gridX = w - pad - gridW;
    const gridY = h - xpH - 10 - gridH;
    this.ui.skillSlots.forEach((slot, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const x = gridX + c * (box + gap);
      const y = gridY + r * (box + gap);
      slot.rect = { x, y, w: box, h: box };
      slot.bg.setPosition(x + box * 0.5, y + box * 0.5).setSize(box, box);
      slot.border.setPosition(x + box * 0.5, y + box * 0.5).setSize(box, box);
      slot.num.setPosition(x + 5, y + 3);
      slot.iconSprite.setPosition(x + box * 0.5, y + box * 0.5 + 2).setDisplaySize(box * 0.36, box * 0.36).setAlpha(0.96);
      slot.icon.setPosition(x + box * 0.5, y + box * 0.5 + 3).setFontSize(Math.max(10, Math.floor(box * 0.22)));
      slot.rank.setPosition(x + box - 6, y + box - 6);
      slot.cdText.setPosition(x + box * 0.5, y + box * 0.5).setFontSize(Math.max(11, Math.floor(box * 0.2)));

      const showDesktopSkillHud = !this.isMobileTouch;
      slot.bg.setVisible(showDesktopSkillHud);
      slot.border.setVisible(showDesktopSkillHud);
      slot.num.setVisible(showDesktopSkillHud);
      slot.rank.setVisible(showDesktopSkillHud);
      slot.cdText.setVisible(showDesktopSkillHud);
      slot.cdOverlay.setVisible(showDesktopSkillHud);
      if (!showDesktopSkillHud) {
        slot.icon.setVisible(false);
        slot.iconSprite.setVisible(false);
      }
    });

    const traitX = statusX + statusW + 12;
    const traitY = statusY;
    const traitW = Math.max(0, gridX - 12 - traitX);
    const traitH = statusH;
    const traitVisible = traitW >= 54;
    this.ui.traitArea.setVisible(false);
    this.ui.traitArea.setPosition(traitX, traitY).setSize(traitW, traitH);

    const iconSize = 14;
    const cell = iconSize + 9;
    const cols = 4;
    this.ui.traitLayout = { x: traitX, y: traitY, w: traitW, h: traitH, visible: traitVisible, iconSize, cols };
    this.ui.traitSlots.forEach((slot, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const sx = traitX + 10 + col * cell;
      const sy = traitY + 13 + row * (cell + 2);
      slot.slotBg.setVisible(false).setPosition(sx, sy).setSize(iconSize, iconSize);
      slot.icon.setVisible(false).setPosition(sx + iconSize * 0.5, sy + iconSize * 0.5).setDisplaySize(iconSize - 2, iconSize - 2);
      slot.rank.setVisible(false).setPosition(sx + iconSize - 1, sy + iconSize - 1).setFontSize(iconSize <= 16 ? 9 : 10);
    });
  }

  drawMinimap() {
    const mm = this.ui?.minimap;
    const lo = this.ui?.minimapLayout;
    if (!mm || !lo || !this.player) return;
    const bounds = this.physics?.world?.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    const { x, y, w, h, pad } = lo;
    const iw = Math.max(8, w - pad * 2);
    const ih = Math.max(8, h - pad * 2);
    const scaleX = iw / bounds.width;
    const scaleY = ih / bounds.height;
    const ox = x + pad;
    const oy = y + pad;

    mm.clear();
    mm.fillStyle(0x0b1427, 0.42);
    mm.fillRect(ox, oy, iw, ih);

    const enemies = this.enemies?.getChildren?.() ?? [];
    const stride = Math.max(1, Math.ceil(enemies.length / 70));
    mm.fillStyle(0xff7a7a, 0.82);
    for (let i = 0; i < enemies.length; i += stride) {
      const e = enemies[i];
      if (!e?.active) continue;
      const ex = ox + e.x * scaleX;
      const ey = oy + e.y * scaleY;
      mm.fillCircle(ex, ey, 1.6);
    }

    const px = ox + this.player.x * scaleX;
    const py = oy + this.player.y * scaleY;
    mm.fillStyle(0x9fc0ff, 0.98);
    mm.fillCircle(px, py, 2.4);

  }

  drawSlotCooldown(slotUi, fracRemain) {
    const clamped = Phaser.Math.Clamp(fracRemain, 0, 1);
    const g = slotUi.cdOverlay;
    g.clear();
    if (clamped <= 0) return;

    const { x, y, w, h } = slotUi.rect;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const r = Math.min(w, h) * 0.5 - 2;
    const start = -Math.PI / 2;
    const end = start + clamped * Math.PI * 2;

    g.fillStyle(0x000000, 0.58);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, start, end, false);
    g.closePath();
    g.fillPath();
  }

  shortSkillLabel(key) {
    if (!key) return '-';
    const mapped = {
      SHOCKWAVE: 'SHOCK',
      LASER: 'LASER',
      GRENADE: 'GRE',
      FWD_SLASH: 'SLASH',
      DASH: 'DASH',
      SPIN_SLASH: 'SPIN',
      CHAIN_LIGHTNING: 'CHAIN',
      BLIZZARD: 'BLIZ',
      FIRE_BOLT: 'BOLT'
    };
    if (mapped[key]) return mapped[key];
    const metaName = ABILITY_META[key]?.name ?? key;
    return metaName.length <= 5 ? metaName : metaName.slice(0, 5).toUpperCase();
  }

  getSkillIconKey(key) {
    if (!key) return null;
    const tex = `ico_${key}`;
    return this.textures.exists(tex) ? tex : null;
  }

  onKeyDown(event) {
    const key = event.keyCode;
    if (key === Phaser.Input.Keyboard.KeyCodes.ESC) {
      if (!this.levelupActive) this.togglePause();
      return;
    }

    if (this.pauseActive) return;

    if (this.levelupActive) {
      if (key === Phaser.Input.Keyboard.KeyCodes.UP || key === Phaser.Input.Keyboard.KeyCodes.W) {
        this.levelUpOverlay.moveFocus(-1);
      } else if (key === Phaser.Input.Keyboard.KeyCodes.DOWN || key === Phaser.Input.Keyboard.KeyCodes.S) {
        this.levelUpOverlay.moveFocus(1);
      } else if (
        key === Phaser.Input.Keyboard.KeyCodes.ENTER
        || key === Phaser.Input.Keyboard.KeyCodes.SPACE
      ) {
        this.levelUpOverlay.pick();
      } else if (key === Phaser.Input.Keyboard.KeyCodes.ONE) {
        this.levelUpOverlay.pick(0);
      } else if (key === Phaser.Input.Keyboard.KeyCodes.TWO) {
        this.levelUpOverlay.pick(1);
      } else if (key === Phaser.Input.Keyboard.KeyCodes.THREE) {
        this.levelUpOverlay.pick(2);
      }
      return;
    }

    if (key === Phaser.Input.Keyboard.KeyCodes.ONE || key === Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE) {
      this.tryCastSkillSlot(1);
    } else if (key === Phaser.Input.Keyboard.KeyCodes.TWO || key === Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO) {
      this.tryCastSkillSlot(2);
    } else if (key === Phaser.Input.Keyboard.KeyCodes.THREE || key === Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE) {
      this.tryCastSkillSlot(3);
    } else if (key === Phaser.Input.Keyboard.KeyCodes.FOUR || key === Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR) {
      this.tryCastSkillSlot(4);
    }
  }

  setLevelupActive(active) {
    const next = !!active;
    if (this.levelupActive === next) return;
    this.levelupActive = next;
    this.inputSystem.setLocked(next);
    if (next) {
      this.physics.world.pause();
    } else {
      this.physics.world.resume();
    }
  }

  togglePause() {
    if (this.levelupActive) return;
    this.pauseActive = !this.pauseActive;
    if (this.pauseActive) {
      this.physics.world.pause();
      this.inputSystem.setLocked(true);
      this.pauseUi.root.setVisible(true);
      this.refreshPauseUi();
    } else {
      this.physics.world.resume();
      this.inputSystem.setLocked(false);
      this.pauseUi.root.setVisible(false);
    }
  }

  setPaused(active) {
    if (!!active === this.pauseActive) return;
    this.togglePause();
  }

  tryOpenLevelup() {
    if (this.progression.pendingLevelups <= 0) return;
    if (this.pauseActive) this.setPaused(false);
    const choices = this.abilitySystem.makeLevelupChoices(3);
    if (choices.length === 0) {
      this.progression.consumePendingLevelup();
      return;
    }

    this.setLevelupActive(true);
    this.levelUpOverlay.show(
      choices,
      (key) => this.abilitySystem.getAbilityLabel(key),
      (key) => this.abilitySystem.getAbilityDescription(key)
    );
  }

  chooseLevelup(key) {
    const applied = this.abilitySystem.applyAbility(key, this);
    if (!applied) return;

    // Reference behavior: no dedicated level-up selection SFX.
    this.progression.consumePendingLevelup();

    if (this.progression.pendingLevelups > 0) {
      const nextChoices = this.abilitySystem.makeLevelupChoices(3);
      if (nextChoices.length > 0) {
        this.levelUpOverlay.show(
          nextChoices,
          (k) => this.abilitySystem.getAbilityLabel(k),
          (k) => this.abilitySystem.getAbilityDescription(k)
        );
        return;
      }
      this.progression.consumePendingLevelup();
    }

    this.levelUpOverlay.hide();
    this.setLevelupActive(false);
  }

  applyLevelGrowth(levels) {
    const n = Math.max(0, Math.floor(levels));
    if (n <= 0) return;
    this.baseDamageBase += n;
    this.playerMaxHpBase += 30 * n;
    this.abilitySystem.applyStatEffects('ATK', this);
    this.abilitySystem.applyStatEffects('MAX_HP', this);
  }

  applyRelicAndCodexEffects() {
    const state = SaveSystem.getRelicState();
    const equippedIds = Array.isArray(state.equipped) ? state.equipped : [];
    const equippedRelics = equippedIds
      .map((id) => RELIC_BY_ID[id])
      .filter((r) => !!r);

    const ownedRelicIds = Object.keys(state.owned ?? {});
    const activeCodex = getCompletedCodexSets(ownedRelicIds);

    const effects = combineEffects([
      ...equippedRelics.map((r) => r.effects),
      ...activeCodex.map((set) => set.effects)
    ]);

    this.relicDamageMul = Math.max(0.1, 1 + (effects.damageMulPct ?? 0));
    this.relicMoveSpeedMul = Math.max(0.1, 1 + (effects.moveSpeedPct ?? 0));
    this.relicFireIntervalMul = Math.max(0.2, 1 + (effects.fireIntervalPct ?? 0));
    this.relicSkillCooldownMul = Math.max(0.2, 1 + (effects.skillCooldownPct ?? 0));
    this.relicDamageTakenMul = Math.max(0.1, 1 + (effects.damageTakenPct ?? 0));
    this.relicXpGainMul = Math.max(0.1, 1 + (effects.xpGainPct ?? 0));
    this.relicGoldGainMul = Math.max(0.1, 1 + (effects.goldGainPct ?? 0));
    this.relicCritChanceFlat = effects.critChanceFlat ?? 0;
    this.relicCritDamageMul = Math.max(0.1, 1 + (effects.critDamageMulPct ?? 0));
    this.relicLifestealFlat = Math.max(0, effects.lifeStealFlat ?? 0);
    this.relicHpRegenFlat = effects.hpRegenFlat ?? 0;
  }

  update(time, delta) {
    const dt = delta;

    if (this.levelupActive) {
      this.updateHud();
      return;
    }

    if (this.pauseActive) {
      this.updateHud();
      return;
    }

    this.elapsedMs += dt;
    if (this.bgLayer) {
      const cam = this.cameras.main;
      this.bgLayer.tilePositionX = cam.scrollX * 0.22;
      this.bgLayer.tilePositionY = cam.scrollY * 0.22;
    }
    if (this.bgNebula) {
      this.bgNebula.setAlpha(0.9 + Math.sin(this.elapsedMs * 0.00035) * 0.06);
    }
    const dtSec = dt / 1000;
    this.tickSkillCooldowns(dt / 1000);
    this.updateGrenades(dt / 1000);
    this.updateShieldRegen(dt / 1000);
    this.updateBlizzards(dt / 1000);
    this.updateSpinAuras(dt / 1000);
    this.updateFireBolts(dt / 1000);
    this.updateSpawnWarnings(dtSec);
    this.updateLineWarnings(dtSec);
    this.updateBossLasers(dtSec);
    this.playerInvulnSec = Math.max(0, this.playerInvulnSec - dtSec);

    const totalHpRegenPerSec = this.hpRegenPerSec + this.relicHpRegenFlat;
    if (totalHpRegenPerSec > 0) {
      if (this.playerHp < this.playerMaxHp) {
        this.hpRegenAcc += (dt / 1000) * totalHpRegenPerSec;
        const heal = Math.floor(this.hpRegenAcc);
        if (heal > 0) {
          this.hpRegenAcc -= heal;
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
        }
      } else {
        this.hpRegenAcc = 0;
      }
    } else if (totalHpRegenPerSec < 0) {
      this.hpRegenAcc += (dt / 1000) * (-totalHpRegenPerSec);
      const drain = Math.floor(this.hpRegenAcc);
      if (drain > 0) {
        this.hpRegenAcc -= drain;
        this.playerHp = Math.max(1, this.playerHp - drain);
      }
    } else {
      this.hpRegenAcc = 0;
    }

    this.inputSystem.update();
    const mv = this.inputSystem.getMoveVec();
    const moveSpeed = this.playerSpeed * this.relicMoveSpeedMul;
    this.player.body.setVelocity(mv.x * moveSpeed * this.combatPace, mv.y * moveSpeed * this.combatPace);
    if (this.playerShadow) this.playerShadow.setPosition(this.player.x, this.player.y + 20);
    if (this.playerAura) {
      this.playerAura.setPosition(this.player.x, this.player.y);
      this.playerAura.rotation += dtSec * 0.9;
      const pulse = 1 + Math.sin(this.elapsedMs * 0.0065) * 0.06;
      this.playerAura.setScale(pulse);
    }
    this.updateAimCursor(dtSec);

    this.fireAcc += dt;
    const fireInterval = this.fireRateMs * this.relicFireIntervalMul;
    if (this.inputSystem.isFiring() && this.fireAcc >= fireInterval) {
      this.fireAcc = 0;
      this.fireBullet();
      this.playActionSfx('fire');
    }

    this.stageDirector.update(dt, this);

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const skipMove = this.updateMiniBossPattern(e, dtSec);
      if (skipMove) return;
      let speedMul = 1;
      if ((e._blizzardSlowUntil ?? 0) > this.time.now) {
        speedMul = Math.min(speedMul, e._blizzardSlowMul ?? 1);
      }
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.body.setVelocity((dx / len) * e.speed * speedMul * this.enemyPace, (dy / len) * e.speed * speedMul * this.enemyPace);
      if (e.shadow) e.shadow.setPosition(e.x, e.y + (e.body?.radius ?? 14) + 7);
    });

    this.bullets.children.iterate((b) => {
      if (!b || !b.active) return;
      if (b.x < -50 || b.x > this.physics.world.bounds.width + 50 || b.y < -50 || b.y > this.physics.world.bounds.height + 50) {
        b.destroy();
      }
    });

    this.updateHud();
    this.updateMobileControls();
    this.drawAimCursor();
    this.tryOpenLevelup();
  }

  updateHud() {
    const spec = this.stageDirector.currentSpec();
    const stage = spec.stage;
    const tSec = Math.floor(this.elapsedMs / 1000);
    const shieldMax = this.abilitySystem.rank('SHIELD');
    const hpNow = Math.max(0, Math.floor(this.playerHp));
    const hpRatio = this.playerMaxHp > 0 ? Phaser.Math.Clamp(hpNow / this.playerMaxHp, 0, 1) : 0;

    this.ui.hp.setColor(hpRatio < 0.35 ? '#ffd0d0' : '#eaf0ff');
    this.ui.hp.setText(`레벨 ${this.progression.level}  체력 ${hpNow}/${this.playerMaxHp}`);
    this.ui.shield.setVisible(shieldMax > 0);
    if (shieldMax > 0) {
      this.ui.shield.setText(`보호막 ${this.playerShield}/${shieldMax}`);
    }
    this.ui.gold.setText(`${SaveSystem.getTotalGold()} (+${this.runGold})`);
    const flags = this.abilitySystem.synergyFlags();
    const sy = [];
    if (flags.MECHANIC) sy.push('기계(액티브 사거리 +25%)');
    if (flags.SWORDSMAN) sy.push('검사(생명력 흡수 +12%)');
    if (flags.RANGER) sy.push('레인저(기본 공격 관통)');
    if (flags.MAGE) sy.push('마법사(액티브 쿨타임 -40%)');
    this.ui.synergy.setText(sy.length > 0 ? sy.join(', ') : '');
    this.ui.stage.setText(`스테이지 ${stage}`);
    this.ui.stageSub.setText(`${this.stageDirector.stageKills}/${spec.killGoal}`);
    this.ui.time.setText(`${tSec}s`);
    this.drawMinimap();

    const ratio = this.progression.getXpRatio();
    this.ui.xpBarFill.width = this.scale.width * ratio;
    this.ui.statusLine.width = (this.ui.statusLayout.w - 28) * hpRatio;

    for (let s = 1; s <= 4; s += 1) {
      const slotUi = this.ui.skillSlots[s - 1];
      const key = this.abilitySystem.activeSlots[s];
      const rank = key ? this.abilitySystem.rank(key) : 0;
      const cd = key ? Math.max(0, this.skillCooldowns[key] ?? 0) : 0;
      const cdDur = key ? this.getSkillCooldownDuration(key) : 0;
      const unlocked = !!key && rank > 0;
      const iconKey = unlocked ? this.getSkillIconKey(key) : null;
      if (this.isMobileTouch) {
        slotUi.iconSprite.setVisible(false);
        slotUi.icon.setVisible(false).setText('');
        slotUi.rank.setVisible(false).setText('');
        slotUi.num.setVisible(false);
        slotUi.bg.setVisible(false);
        slotUi.border.setVisible(false);
        slotUi.cdText.setVisible(false).setText('');
        slotUi.cdOverlay.setVisible(false).clear();
      } else {
        if (iconKey) {
          slotUi.iconSprite.setTexture(iconKey).setVisible(true);
          slotUi.icon.setText('');
        } else {
          slotUi.iconSprite.setVisible(false);
          slotUi.icon.setText(unlocked ? this.shortSkillLabel(key) : '-');
        }
        slotUi.rank.setText('');
        slotUi.border.setStrokeStyle(2, (unlocked && cd <= 0) ? 0x7ea0ff : 0x3b4d75, 1);
        slotUi.cdText.setText(cd > 0 ? `${cd.toFixed(1)}s` : '');
        this.drawSlotCooldown(slotUi, cdDur > 1e-6 ? cd / cdDur : 0);
      }
    }

    if (this.mobileUi) {
      this.mobileUi.skillButtons.forEach((b) => {
        const key = this.abilitySystem.activeSlots[b.slot];
        const rank = key ? this.abilitySystem.rank(key) : 0;
        const unlocked = !!key && rank > 0;
        const cd = key ? Math.max(0, this.skillCooldowns[key] ?? 0) : 0;
        const cdDur = key ? this.getSkillCooldownDuration(key) : 0;
        const iconKey = unlocked ? (this.getSkillIconKey(key) ?? null) : null;
        b.icon.setVisible(!!iconKey);
        if (iconKey) b.icon.setTexture(iconKey);
        b.btn.setStrokeStyle(2, (unlocked && cd <= 0) ? 0x7ea0ff : 0x3b4d75, 0.9);
        b.cd.setText(cd > 0 ? `${cd.toFixed(1)}s` : '');
        this.drawSlotCooldown({ cdOverlay: b.cdOverlay, rect: b.rect }, cdDur > 1e-6 ? cd / cdDur : 0);
      });
    }

    if (this.ui.traitLayout?.visible) {
      const owned = ABILITY_KEYS.filter((k) => this.abilitySystem.rank(k) > 0);
      this.ui.traitSlots.forEach((slot, i) => {
        const key = owned[i];
        if (!key) {
          slot.icon.setVisible(false);
          slot.rank.setVisible(false);
          return;
        }
        const tex = this.getSkillIconKey(key) ?? 'tex_gold';
        slot.icon.setTexture(tex).setVisible(true);
        slot.rank.setText(`${this.abilitySystem.rank(key)}`).setVisible(true);
      });
    }
  }

  tickSkillCooldowns(dtSec) {
    Object.keys(this.skillCooldowns).forEach((k) => {
      this.skillCooldowns[k] = Math.max(0, (this.skillCooldowns[k] ?? 0) - dtSec);
    });
  }

  playSfx(key, volume = 0.3) {
    if (!this.settings.sfxEnabled) return;
    try {
      this.sound.play(key, { volume: volume * this.settings.sfxVolume });
    } catch {
      // Ignore missing/blocked keys to keep gameplay stable.
    }
  }

  playActionSfx(action) {
    const cfg = AUDIO_ACTION_PROFILE[action] ?? AUDIO_DEFAULT_PROFILE;
    this.playSfx(cfg.key, cfg.volume);
  }

  getAimVector() {
    if (this.skillAimOverride) return this.skillAimOverride.clone();
    this.autoTarget = null;
    if (!this.settings.autoAim) return this.inputSystem.getAimVec();

    const pointer = this.input.activePointer;
    const mx = pointer?.worldX ?? this.player.x;
    const my = pointer?.worldY ?? this.player.y;

    const maxPlayerDist = 900;
    const snapRadius = 220;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    // Pass 1: enemies near mouse cursor.
    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const dxp = e.x - this.player.x;
      const dyp = e.y - this.player.y;
      const d2Player = dxp * dxp + dyp * dyp;
      if (d2Player > maxPlayerDist * maxPlayerDist) return;

      const dxm = e.x - mx;
      const dym = e.y - my;
      const d2Mouse = dxm * dxm + dym * dym;
      if (d2Mouse > snapRadius * snapRadius) return;

      const score = d2Mouse + d2Player * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    });

    // Pass 2: nearest to player if nothing near cursor.
    if (!best) {
      this.enemies.children.iterate((e) => {
        if (!e || !e.active) return;
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxPlayerDist * maxPlayerDist) return;
        if (d2 < bestScore) {
          bestScore = d2;
          best = e;
        }
      });
    }

    if (!best) return this.inputSystem.getAimVec();
    this.autoTarget = best;
    const v = new Phaser.Math.Vector2(best.x - this.player.x, best.y - this.player.y);
    if (v.lengthSq() < 1e-6) return this.inputSystem.getAimVec();
    return v.normalize();
  }

  updateAimCursor(dtSec) {
    let desired;
    if (this.settings.autoAim && this.autoTarget?.active) {
      desired = new Phaser.Math.Vector2(this.autoTarget.x, this.autoTarget.y);
    } else if (this.settings.autoAim) {
      const pointer = this.input.activePointer;
      desired = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    } else {
      const isMobileManualAim = this.isMobileTouch && this.inputSystem.getAimPadState().active;
      if (isMobileManualAim) {
        const st = this.inputSystem.getAimPadState();
        const dx = st.cur.x - st.start.x;
        const dy = st.cur.y - st.start.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-4) {
          const t = Phaser.Math.Clamp(len / Math.max(1, st.radius), 0, 1);
          const nx = dx / len;
          const ny = dy / len;
          const r = 160 * t;
          desired = new Phaser.Math.Vector2(
            this.player.x + nx * r,
            this.player.y + ny * r
          );
        } else {
          desired = new Phaser.Math.Vector2(this.player.x, this.player.y);
        }
      } else if (!this.isMobileTouch) {
        const pointer = this.input.activePointer;
        desired = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      } else {
        const aim = this.inputSystem.getAimVec();
        desired = new Phaser.Math.Vector2(
          this.player.x + aim.x * 140,
          this.player.y + aim.y * 140
        );
      }
    }

    if (this.settings.autoAim && this.autoTarget?.active) {
      desired.set(this.autoTarget.x, this.autoTarget.y);
    }
    const a = 1 - Math.exp(-dtSec * 18);
    this.aimCursorPos.lerp(desired, a);
  }

  drawAimCursor() {
    if (this.pauseActive || this.levelupActive) {
      this.aimCursorGfx.clear();
      return;
    }
    const cam = this.cameras.main;
    const sx = this.aimCursorPos.x - cam.worldView.x;
    const sy = this.aimCursorPos.y - cam.worldView.y;
    const g = this.aimCursorGfx;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.75);
    g.strokeCircle(sx, sy, 12);
    g.lineBetween(sx - 18, sy, sx - 6, sy);
    g.lineBetween(sx + 6, sy, sx + 18, sy);
    g.lineBetween(sx, sy - 18, sx, sy - 6);
    g.lineBetween(sx, sy + 6, sx, sy + 18);
    if (this.autoTarget?.active) {
      g.lineStyle(2, 0x7ea0ff, 0.75);
      const tx = this.autoTarget.x - cam.worldView.x;
      const ty = this.autoTarget.y - cam.worldView.y;
      g.strokeCircle(tx, ty, (this.autoTarget.body?.halfWidth ?? 14) + 10);
    }
  }

  onShieldUsed() {
    this.shieldRegenDelaySec = 2.4;
    this.shieldRegenAcc = 0;
  }

  createPauseUi() {
    const root = this.add.container(0, 0).setDepth(2000).setVisible(false).setScrollFactor(0);
    const dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.62).setOrigin(0).setScrollFactor(0);
    const cardW = Math.min(560, this.scale.width - 32);
    const cardH = Math.min(560, this.scale.height - 32);
    const card = this.add.rectangle(this.scale.width * 0.5, this.scale.height * 0.5, cardW, cardH, 0x172033, 0.97).setScrollFactor(0);
    card.setStrokeStyle(2, 0x3b4d75, 1);
    const top = card.y - cardH * 0.5;
    const bottom = card.y + cardH * 0.5;
    const title = this.add.text(card.x, top + 38, '일시정지', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '32px',
      color: '#eaf0ff'
    }).setOrigin(0.5).setScrollFactor(0);

    const mkBtn = (y, label, onClick) => {
      const bg = this.add.rectangle(card.x, y, Math.min(320, cardW - 90), 42, 0x2a3552, 0.98).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      bg.setStrokeStyle(1, 0x7ea0ff, 0.8);
      const tx = this.add.text(card.x, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#eaf0ff'
      }).setOrigin(0.5).setScrollFactor(0);
      bg.on('pointerdown', onClick);
      return { bg, tx };
    };

    const mkRow = (y, leftLabel, onLeft, valueText, onRight) => {
      const lbl = this.add.text(card.x - 170, y, leftLabel, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#aab6d6'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const left = this.add.text(card.x + 78, y, '<', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '22px',
        color: '#eaf0ff'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const val = this.add.text(card.x + 120, y, valueText, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#eaf0ff'
      }).setOrigin(0.5).setScrollFactor(0);
      const right = this.add.text(card.x + 162, y, '>', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '22px',
        color: '#eaf0ff'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      left.on('pointerdown', onLeft);
      right.on('pointerdown', onRight);
      return { lbl, left, val, right };
    };

    const bgmToggle = mkBtn(top + 108, '', () => {
      this.settings.bgmEnabled = !this.settings.bgmEnabled;
      this.applyAudioSettings();
      this.saveSettings();
      this.refreshPauseUi();
    });
    const sfxToggle = mkBtn(top + 156, '', () => {
      this.settings.sfxEnabled = !this.settings.sfxEnabled;
      this.saveSettings();
      this.refreshPauseUi();
    });
    const autoAimToggle = mkBtn(top + 204, '', () => {
      this.settings.autoAim = !this.settings.autoAim;
      this.saveSettings();
      this.refreshPauseUi();
    });

    const bgmVol = mkRow(
      top + 264,
      '배경음 볼륨',
      () => {
        this.settings.bgmVolume = Math.max(0, this.settings.bgmVolume - 0.1);
        this.applyAudioSettings();
        this.saveSettings();
        this.refreshPauseUi();
      },
      '',
      () => {
        this.settings.bgmVolume = Math.min(1, this.settings.bgmVolume + 0.1);
        this.applyAudioSettings();
        this.saveSettings();
        this.refreshPauseUi();
      }
    );

    const sfxVol = mkRow(
      top + 302,
      '효과음 볼륨',
      () => {
        this.settings.sfxVolume = Math.max(0, this.settings.sfxVolume - 0.1);
        this.saveSettings();
        this.refreshPauseUi();
      },
      '',
      () => {
        this.settings.sfxVolume = Math.min(1, this.settings.sfxVolume + 0.1);
        this.saveSettings();
        this.refreshPauseUi();
      }
    );

    const lobbyY = bottom - 34;
    const restartY = lobbyY - 50;
    const resumeY = restartY - 50;
    const resumeBtn = mkBtn(resumeY, '계속하기', () => this.setPaused(false));
    const restartBtn = mkBtn(restartY, '다시 시작', () => this.scene.restart());
    const lobbyBtn = mkBtn(lobbyY, '로비로', () => {
      this.bgm?.stop();
      this.scene.start('Lobby');
    });

    root.add([
      dim, card, title,
      bgmToggle.bg, bgmToggle.tx,
      sfxToggle.bg, sfxToggle.tx,
      autoAimToggle.bg, autoAimToggle.tx,
      bgmVol.lbl, bgmVol.left, bgmVol.val, bgmVol.right,
      sfxVol.lbl, sfxVol.left, sfxVol.val, sfxVol.right,
      resumeBtn.bg, resumeBtn.tx,
      restartBtn.bg, restartBtn.tx,
      lobbyBtn.bg, lobbyBtn.tx
    ]);

    const pauseBtn = this.add.rectangle(this.scale.width - 18, 58, 30, 30, 0x2a3552, 0.96)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    pauseBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const pauseTxt = this.add.text(this.scale.width - 18, 58, 'II', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#eaf0ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    pauseBtn.on('pointerdown', () => this.togglePause());

    this.pauseUi = {
      root,
      dim,
      card,
      title,
      bgmToggle,
      sfxToggle,
      autoAimToggle,
      bgmVol,
      sfxVol,
      resumeBtn,
      restartBtn,
      lobbyBtn,
      pauseBtn,
      pauseTxt
    };

    this.scale.on('resize', (size) => {
      if (!this.pauseUi) return;
      this.pauseUi.dim.setSize(size.width, size.height);
      this.pauseUi.pauseBtn.setPosition(size.width - 18, 58);
      this.pauseUi.pauseTxt.setPosition(size.width - 18, 58);
    });

    this.refreshPauseUi();
  }

  refreshPauseUi() {
    if (!this.pauseUi) return;
    this.pauseUi.bgmToggle.tx.setText(`배경음: ${this.settings.bgmEnabled ? '켜짐' : '꺼짐'}`);
    this.pauseUi.sfxToggle.tx.setText(`효과음: ${this.settings.sfxEnabled ? '켜짐' : '꺼짐'}`);
    this.pauseUi.autoAimToggle.tx.setText(`자동 조준: ${this.settings.autoAim ? '켜짐' : '꺼짐'}`);
    this.pauseUi.bgmVol.val.setText(`${Math.round(this.settings.bgmVolume * 100)}%`);
    this.pauseUi.sfxVol.val.setText(`${Math.round(this.settings.sfxVolume * 100)}%`);
  }

  saveSettings() {
    this.settings = SettingsSystem.save(this.settings);
  }

  applyAudioSettings() {
    if (!this.bgm) return;
    this.bgm.setVolume(this.settings.bgmVolume);
    if (this.settings.bgmEnabled) {
      if (!this.bgm.isPlaying) this.bgm.play();
    } else if (this.bgm.isPlaying) {
      this.bgm.stop();
    }
  }

  updateShieldRegen(dtSec) {
    const shieldMax = this.abilitySystem.rank('SHIELD');
    if (shieldMax <= 0) {
      this.shieldRegenDelaySec = 0;
      this.shieldRegenAcc = 0;
      this.playerShield = 0;
      return;
    }

    if (this.shieldRegenDelaySec > 0) {
      this.shieldRegenDelaySec = Math.max(0, this.shieldRegenDelaySec - dtSec);
      this.shieldRegenAcc = 0;
      return;
    }

    if (this.playerShield >= shieldMax) {
      this.shieldRegenAcc = 0;
      this.playerShield = shieldMax;
      return;
    }

    const interval = Math.max(1.4, 3.2 - 0.25 * shieldMax);
    this.shieldRegenAcc += dtSec;
    while (this.shieldRegenAcc >= interval && this.playerShield < shieldMax) {
      this.shieldRegenAcc -= interval;
      this.playerShield += 1;
    }
  }

  getSkillCooldownDuration(key) {
    const r = this.abilitySystem.rank(key);
    const cdMul = this.abilitySystem.activeCooldownMul() * 0.92 * this.relicSkillCooldownMul;
    if (key === 'SHOCKWAVE') return Math.max(0.9, (2.6 - 0.25 * r) * cdMul);
    if (key === 'LASER') return Math.max(0.7, (1.8 - 0.14 * r) * cdMul);
    if (key === 'GRENADE') return Math.max(1.6, (4.0 - 0.3 * r) * cdMul);
    if (key === 'FWD_SLASH') return Math.max(0.7, (1.9 - 0.12 * r) * cdMul);
    if (key === 'DASH') return Math.max(1.0, (3.4 - 0.22 * r) * cdMul);
    if (key === 'SPIN_SLASH') return Math.max(2.0, (7.0 - 0.4 * r) * cdMul);
    if (key === 'CHAIN_LIGHTNING') return Math.max(1.0, (4.6 - 0.28 * r) * cdMul);
    if (key === 'BLIZZARD') return Math.max(2.0, (8.0 - 0.45 * r) * cdMul);
    if (key === 'FIRE_BOLT') return Math.max(0.9, (4.8 - 0.3 * r) * cdMul);
    return 1.5;
  }

  tryCastSkillSlot(slot, aimOverride = null) {
    const key = this.abilitySystem.activeSlots[slot];
    if (!key) return;
    if ((this.skillCooldowns[key] ?? 0) > 0) return;
    this.skillAimOverride = aimOverride ? aimOverride.clone().normalize() : null;

    let casted = false;
    if (key === 'SHOCKWAVE') casted = this.castShockwave();
    else if (key === 'LASER') casted = this.castLaser();
    else if (key === 'GRENADE') casted = this.castGrenade();
    else if (key === 'FWD_SLASH') casted = this.castForwardSlash();
    else if (key === 'DASH') casted = this.castDash();
    else if (key === 'SPIN_SLASH') casted = this.castSpinSlash();
    else if (key === 'CHAIN_LIGHTNING') casted = this.castChainLightning();
    else if (key === 'BLIZZARD') casted = this.castBlizzard();
    else if (key === 'FIRE_BOLT') casted = this.castFireBolt();

    if (casted) {
      this.skillCooldowns[key] = this.getSkillCooldownDuration(key);
    }
    this.skillAimOverride = null;
  }

  updateMobileControls() {
    if (!this.mobileUi) return;
    const mv = this.inputSystem.getMovePadState();
    const av = this.inputSystem.getAimPadState();

    const updateThumb = (pad, st) => {
      const dx = st.cur.x - st.start.x;
      const dy = st.cur.y - st.start.y;
      const len = Math.hypot(dx, dy);
      const maxLen = st.radius * 0.55;
      const s = len > 1e-6 ? Math.min(maxLen, len) / len : 0;
      const tx = st.start.x + dx * s;
      const ty = st.start.y + dy * s;
      pad.thumb.setPosition(st.active ? tx : st.start.x, st.active ? ty : st.start.y);
      pad.base.setAlpha(st.active ? 0.38 : 0.28);
    };
    updateThumb(this.mobileUi.leftPad, mv);
    updateThumb(this.mobileUi.rightPad, av);

    this.mobileUi.aimGuide.clear();
    if (this.skillDragState?.drag) {
      const cam = this.cameras.main;
      const vx = this.skillDragState.pointerX - this.skillDragState.originX;
      const vy = this.skillDragState.pointerY - this.skillDragState.originY;
      const vlen = Math.hypot(vx, vy);
      if (vlen < 1e-6) return;
      const nx = vx / vlen;
      const ny = vy / vlen;
      const guideLen = 160;
      const sx = this.player.x - cam.worldView.x;
      const sy = this.player.y - cam.worldView.y;
      const ex = sx + nx * guideLen;
      const ey = sy + ny * guideLen;
      this.mobileUi.aimGuide.lineStyle(3, 0xeaf0ff, 0.75);
      this.mobileUi.aimGuide.beginPath();
      this.mobileUi.aimGuide.moveTo(sx, sy);
      this.mobileUi.aimGuide.lineTo(ex, ey);
      this.mobileUi.aimGuide.strokePath();
    }
  }

  dealDamageToEnemy(enemy, dmg, isSkill = false) {
    if (!enemy?.active) return;
    const finalDmg = Math.max(1, Math.floor(dmg * this.relicDamageMul));
    enemy.hp -= finalDmg;
    this.flashActor(enemy, 0x9ed0ff, 50);
    this.applyLifesteal(finalDmg);

    if (isSkill) {
      this.playActionSfx('enemy_hit');
      new FloatingText(this, enemy.x, enemy.y - 10, String(finalDmg), { fontSize: 16, color: '#7ea0ff' });
    }

    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  flashActor(actor, tint = 0xffffff, duration = 60) {
    if (!actor || !actor.active) return;
    actor.setTintFill(tint);
    this.time.delayedCall(duration, () => {
      if (actor?.active) actor.clearTint();
    });
  }

  skillShake(intensity = 0.002, duration = 90) {
    this.cameras.main.shake(duration, intensity, true);
  }

  applyLifesteal(dmg) {
    const ratio = this.abilitySystem.lifeStealRatio() + this.relicLifestealFlat;
    if (ratio <= 0) return;
    const heal = Math.max(0, Math.floor(dmg * ratio));
    if (heal <= 0) return;
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
  }

  castShockwave() {
    const r = this.abilitySystem.rank('SHOCKWAVE');
    if (r <= 0) return false;
    const rangeMul = this.abilitySystem.activeRangeMul();
    const radius = (70 + 5 * r) * rangeMul * 1.5;
    const dmg = Math.max(2 + r, Math.floor(this.baseDamage * (0.45 + 0.08 * r)));

    const ring = this.add.circle(this.player.x, this.player.y, 12, 0x7ea0ff, 0.15).setDepth(8);
    ring.setStrokeStyle(3, 0x7ea0ff, 0.8);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy()
    });
    const ring2 = this.add.circle(this.player.x, this.player.y, 8, 0xeaf4ff, 0.08).setDepth(8);
    ring2.setStrokeStyle(2, 0xeaf4ff, 0.72);
    this.tweens.add({
      targets: ring2,
      radius: radius * 0.82,
      alpha: 0,
      duration: 220,
      onComplete: () => ring2.destroy()
    });
    ring.setBlendMode(Phaser.BlendModes.ADD);
    ring2.setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.circle(this.player.x, this.player.y, 14, 0xb8dbff, 0.34).setDepth(8);
    core.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: core, radius: radius * 0.48, alpha: 0, duration: 190, onComplete: () => core.destroy() });
    this.emitBurst(this.player.x, this.player.y, { count: 18, tint: 0x8bc6ff, speedMin: 90, speedMax: 280, lifespan: 280 });
    this.emitBurst(this.player.x, this.player.y, { count: 26, tint: 0xd8ecff, speedMin: 120, speedMax: 360, lifespan: 260 });
    this.emitMagicSpark(this.player.x, this.player.y, 0xbad9ff, 1.2);
    this.emitScreenFlash(0x9bc3ff, 0.08, 110);
    this.skillShake(0.0032, 120);

    this.playActionSfx('shockwave');

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d <= radius + 10) {
        this.dealDamageToEnemy(e, dmg, true);
      }
    });
    return true;
  }

  castLaser() {
    const r = this.abilitySystem.rank('LASER');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const range = (720 + 40 * r) * rangeMul;
    const width = (14 + 2 * r) * (1 + (rangeMul - 1) * 0.7);
    const dmg = Math.max(1, Math.floor(this.baseDamage * (2.6 + 0.25 * r)));

    const x1 = this.player.x;
    const y1 = this.player.y;
    const x2 = x1 + aim.x * range;
    const y2 = y1 + aim.y * range;

    const g = this.add.graphics().setDepth(8);
    g.lineStyle(width, 0x7ea0ff, 0.35);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
    g.lineStyle(Math.max(2, width * 0.28), 0xeaf4ff, 0.75);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
    g.setBlendMode(Phaser.BlendModes.ADD);
    const g2 = this.add.graphics().setDepth(8);
    g2.lineStyle(Math.max(1.5, width * 0.14), 0xffffff, 0.95);
    g2.beginPath();
    g2.moveTo(x1, y1);
    g2.lineTo(x2, y2);
    g2.strokePath();
    g2.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
    this.tweens.add({ targets: g2, alpha: 0, duration: 120, onComplete: () => g2.destroy() });
    this.emitBurst(x1, y1, { count: 10, tint: 0x8bc6ff, speedMin: 80, speedMax: 180, lifespan: 180 });
    this.emitBurst(x2, y2, { count: 16, tint: 0xe3f2ff, speedMin: 90, speedMax: 240, lifespan: 150 });
    this.emitMagicSpark(x2, y2, 0xe8f4ff, 1.0);
    this.emitScreenFlash(0xb8d6ff, 0.055, 80);
    this.skillShake(0.0022, 95);

    this.playActionSfx('laser');

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const d2 = this.pointSegDistSq(e.x, e.y, x1, y1, x2, y2);
      const rr = (e.body?.halfWidth ?? 12) + width * 0.5;
      if (d2 <= rr * rr) {
        this.dealDamageToEnemy(e, dmg, true);
      }
    });
    return true;
  }

  castGrenade() {
    const r = this.abilitySystem.rank('GRENADE');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const throwRange = (210 + 14 * r) * rangeMul;
    const explodeRadius = (110 + 10 * r) * rangeMul;
    const dmg = Math.max(1, Math.floor(this.baseDamage * (3.2 + 0.35 * r)));
    const travelTime = 0.45 / this.combatPace;

    const targetX = this.player.x + aim.x * throwRange;
    const targetY = this.player.y + aim.y * throwRange;
    const vx = (targetX - this.player.x) / travelTime;
    const vy = (targetY - this.player.y) / travelTime;

    const spr = this.add.circle(this.player.x, this.player.y, 8, 0xffb86b, 0.95).setDepth(8);
    spr.setStrokeStyle(2, 0xffffff, 0.55);
    spr.setBlendMode(Phaser.BlendModes.ADD);
    this.grenades.push({
      x: this.player.x,
      y: this.player.y,
      vx,
      vy,
      t: travelTime,
      radius: explodeRadius,
      damage: dmg,
      sprite: spr
    });

    const marker = this.add.circle(targetX, targetY, Math.max(24, explodeRadius * 0.36), 0xffb86b, 0.06).setDepth(6);
    marker.setStrokeStyle(2, 0xffb86b, 0.45);
    marker.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: marker,
      alpha: 0,
      duration: Math.floor(travelTime * 1000),
      onComplete: () => marker.destroy()
    });
    this.emitBurst(this.player.x, this.player.y, { count: 8, tint: 0xffc385, speedMin: 70, speedMax: 170, lifespan: 180 });
    this.emitFlameSmoke(this.player.x, this.player.y, aim.x, aim.y, 0.7);

    this.playActionSfx('grenade');
    return true;
  }

  castForwardSlash() {
    const r = this.abilitySystem.rank('FWD_SLASH');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const range = (120 + 10 * r) * rangeMul;
    const halfAng = Phaser.Math.DegToRad(38);
    const dmg = Math.max(1, Math.floor(this.baseDamage * (2.2 + 0.22 * r)));

    this.playActionSfx('sword');
    const arc = this.add.graphics().setDepth(8);
    const rArc = Math.max(28, range * 0.72);
    const baseAng = Math.atan2(aim.y, aim.x);
    arc.lineStyle(5, 0xffd178, 0.94);
    arc.beginPath();
    arc.arc(this.player.x, this.player.y, rArc, baseAng - halfAng, baseAng + halfAng, false);
    arc.strokePath();
    arc.lineStyle(2, 0xfff2cf, 0.72);
    arc.beginPath();
    arc.arc(this.player.x, this.player.y, rArc - 8, baseAng - halfAng * 0.84, baseAng + halfAng * 0.84, false);
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, duration: 160, onComplete: () => arc.destroy() });
    arc.setBlendMode(Phaser.BlendModes.ADD);

    const bladeTrail = this.add.graphics().setDepth(8);
    bladeTrail.lineStyle(4, 0xffe6ba, 0.86);
    bladeTrail.beginPath();
    bladeTrail.moveTo(this.player.x - aim.x * 8, this.player.y - aim.y * 8);
    bladeTrail.lineTo(this.player.x + aim.x * (range * 0.55), this.player.y + aim.y * (range * 0.55));
    bladeTrail.strokePath();
    this.tweens.add({ targets: bladeTrail, alpha: 0, duration: 120, onComplete: () => bladeTrail.destroy() });
    bladeTrail.setBlendMode(Phaser.BlendModes.ADD);

    this.emitBurst(this.player.x + aim.x * 28, this.player.y + aim.y * 28, { count: 10, tint: 0xffdca8, speedMin: 80, speedMax: 200, lifespan: 170 });
    this.emitBurst(this.player.x + aim.x * 58, this.player.y + aim.y * 58, { count: 14, tint: 0xfff0cf, speedMin: 120, speedMax: 260, lifespan: 140 });
    this.emitMagicSpark(this.player.x + aim.x * 44, this.player.y + aim.y * 44, 0xfff1d1, 0.85);
    this.emitSwish(this.player.x, this.player.y, baseAng, rArc, 0xfff0cf, 140);
    this.emitScreenFlash(0xffd7a4, 0.045, 70);
    this.skillShake(0.002, 80);
    new FloatingText(this, this.player.x, this.player.y - 20, '베기', { fontSize: 12, color: '#ffdca8' });

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const vx = e.x - this.player.x;
      const vy = e.y - this.player.y;
      const d = Math.hypot(vx, vy);
      if (d > range || d < 1) return;
      const dot = (vx / d) * aim.x + (vy / d) * aim.y;
      const ang = Math.acos(Phaser.Math.Clamp(dot, -1, 1));
      if (ang <= halfAng) this.dealDamageToEnemy(e, dmg, true);
    });
    return true;
  }
  castDash() {
    const r = this.abilitySystem.rank('DASH');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const dist = (210 + 16 * r) * rangeMul;
    const width = 34 + 2 * r;
    const dmg = Math.max(1, Math.floor(this.baseDamage * (1.8 + 0.18 * r)));

    const sx = this.player.x;
    const sy = this.player.y;
    const ex = Phaser.Math.Clamp(sx + aim.x * dist, 30, this.physics.world.bounds.width - 30);
    const ey = Phaser.Math.Clamp(sy + aim.y * dist, 30, this.physics.world.bounds.height - 30);
    const dashTrail = this.add.graphics().setDepth(7);
    dashTrail.lineStyle(5, 0x7ea0ff, 0.42);
    dashTrail.beginPath();
    dashTrail.moveTo(sx, sy);
    dashTrail.lineTo(ex, ey);
    dashTrail.strokePath();
    dashTrail.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: dashTrail, alpha: 0, duration: 140, onComplete: () => dashTrail.destroy() });
    this.player.setPosition(ex, ey);
    this.emitBurst(sx, sy, { count: 10, tint: 0x8bc6ff, speedMin: 80, speedMax: 220, lifespan: 180 });
    this.emitBurst(ex, ey, { count: 12, tint: 0x8bc6ff, speedMin: 80, speedMax: 220, lifespan: 190 });
    this.emitBurst(ex, ey, { count: 18, tint: 0xeaf4ff, speedMin: 120, speedMax: 300, lifespan: 160 });
    this.emitParticleBurst('tex_smoke', sx, sy, {
      count: 8, lifespanMin: 220, lifespanMax: 460, speedMin: 20, speedMax: 80,
      angleMin: Phaser.Math.RadToDeg(Math.atan2(aim.y, aim.x)) + 150,
      angleMax: Phaser.Math.RadToDeg(Math.atan2(aim.y, aim.x)) + 210,
      scaleStart: 0.35, scaleEnd: 0.9, alphaStart: 0.35, alphaEnd: 0, tint: 0x9bb4d8, blendMode: Phaser.BlendModes.NORMAL
    });
    this.emitScreenFlash(0x9ec3ff, 0.05, 65);
    this.skillShake(0.0022, 90);
    this.playActionSfx('dash');

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const d2 = this.pointSegDistSq(e.x, e.y, sx, sy, ex, ey);
      const rr = (e.body?.halfWidth ?? 12) + width * 0.5;
      if (d2 <= rr * rr) this.dealDamageToEnemy(e, dmg, true);
    });
    return true;
  }

  castSpinSlash() {
    const r = this.abilitySystem.rank('SPIN_SLASH');
    if (r <= 0) return false;
    const rangeMul = this.abilitySystem.activeRangeMul();
    const radius = (85 + 8 * r) * rangeMul;
    const duration = 2.2 + 0.35 * r;
    const tick = 0.24;
    const dmg = Math.max(1, Math.floor(this.baseDamage * (0.75 + 0.12 * r)));
    const gfx = this.add.graphics().setDepth(7);
    gfx.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.64, to: 0.32 },
      duration: 260,
      yoyo: true,
      repeat: -1
    });

    this.spinAuras.push({ t: duration, tick, acc: 0, radius, dmg, gfx, ang: 0 });
    this.emitBurst(this.player.x, this.player.y, { count: 24, tint: 0xff9f7f, speedMin: 80, speedMax: 240, lifespan: 260 });
    this.emitParticleBurst('tex_smoke', this.player.x, this.player.y, {
      count: 7, lifespanMin: 240, lifespanMax: 520, speedMin: 14, speedMax: 65,
      scaleStart: 0.32, scaleEnd: 0.95, alphaStart: 0.32, alphaEnd: 0, tint: 0xaeb4c4, blendMode: Phaser.BlendModes.NORMAL
    });
    this.emitScreenFlash(0xffbf96, 0.045, 70);
    this.skillShake(0.0018, 90);
    this.playActionSfx('spin');
    return true;
  }
  castChainLightning() {
    const r = this.abilitySystem.rank('CHAIN_LIGHTNING');
    if (r <= 0) return false;
    const rangeMul = this.abilitySystem.activeRangeMul();
    const range = (520 + 25 * r) * rangeMul;
    const bounce = (165 + 10 * r) * rangeMul;
    const dmg = Math.max(1, Math.floor(this.baseDamage * (2.1 + 0.18 * r)));
    const maxTargets = 1 + r;

    const alive = this.enemies.getChildren().filter((e) => e.active);
    if (alive.length === 0) return false;

    let current = null;
    let best = Infinity;
    alive.forEach((e) => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < best && d <= range) {
        best = d;
        current = e;
      }
    });
    if (!current) return false;

    const hit = new Set();
    let fromX = this.player.x;
    let fromY = this.player.y;
    for (let i = 0; i < maxTargets && current; i += 1) {
      hit.add(current);
      this.drawLightning(fromX, fromY, current.x, current.y, 0xb18cff);
      this.dealDamageToEnemy(current, dmg, true);

      let next = null;
      let nextD = Infinity;
      alive.forEach((e) => {
        if (!e.active || hit.has(e)) return;
        const d = Phaser.Math.Distance.Between(current.x, current.y, e.x, e.y);
        if (d < nextD && d <= bounce) {
          nextD = d;
          next = e;
        }
      });
      fromX = current.x;
      fromY = current.y;
      current = next;
    }

    this.playActionSfx('lightning');
    this.emitScreenFlash(0xc9b6ff, 0.07, 90);
    this.skillShake(0.0024, 100);
    return true;
  }

  castBlizzard() {
    const r = this.abilitySystem.rank('BLIZZARD');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const castRange = (180 + 8 * r) * rangeMul;
    const radius = (95 + 10 * r) * rangeMul;
    const duration = 3.0 + 0.3 * r;
    const tick = 0.35;
    const dmg = Math.max(1, Math.floor(this.baseDamage * (0.95 + 0.1 * r)));
    const slowMul = 0.55;

    const x = this.player.x + aim.x * castRange;
    const y = this.player.y + aim.y * castRange;
    const gfx = this.add.circle(x, y, radius, 0x79e6ff, 0.10).setDepth(7);
    gfx.setStrokeStyle(2, 0x79e6ff, 0.58);
    gfx.setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.circle(x, y, radius * 0.42, 0xd4fffb, 0.09).setDepth(7);
    core.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: core, alpha: { from: 0.14, to: 0.03 }, duration: 380, yoyo: true, repeat: -1 });
    this.emitBurst(x, y, { count: 18, tint: 0xbef6ff, speedMin: 60, speedMax: 170, lifespan: 300 });
    this.emitParticleBurst('tex_smoke', x, y, {
      count: 10, lifespanMin: 300, lifespanMax: 620, speedMin: 10, speedMax: 40,
      scaleStart: 0.42, scaleEnd: 1.2, alphaStart: 0.34, alphaEnd: 0, tint: 0xb6f2ff, blendMode: Phaser.BlendModes.NORMAL
    });
    this.emitSpokes(x, y, { count: 12, inner: 16, outer: radius * 0.8, color: 0xbffeff, duration: 210 });
    this.emitScreenFlash(0xbdf9ff, 0.05, 80);
    this.blizzards.push({ x, y, t: duration, tick, acc: 0, radius, dmg, slowMul, gfx, core });
    this.skillShake(0.0016, 70);
    this.playActionSfx('blizzard');
    return true;
  }

  castFireBolt() {
    const r = this.abilitySystem.rank('FIRE_BOLT');
    if (r <= 0) return false;
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.001) return false;

    const rangeMul = this.abilitySystem.activeRangeMul();
    const speed = 760 * this.combatPace;
    const maxRange = (560 + 30 * r) * rangeMul;
    const explodeRadius = (85 + 10 * r) * rangeMul;
    const damage = Math.max(1, Math.floor(this.baseDamage * (3.0 + 0.3 * r)));
    const sprite = this.add.circle(this.player.x, this.player.y, 7, 0xffa46b, 0.95).setDepth(8);
    sprite.setStrokeStyle(2, 0xffe0c2, 0.8);
    sprite.setBlendMode(Phaser.BlendModes.ADD);

    this.fireBolts.push({
      x: this.player.x, y: this.player.y, dx: aim.x, dy: aim.y,
      speed, travel: 0, maxRange, explodeRadius, damage, sprite
    });
    this.emitBurst(this.player.x, this.player.y, { count: 12, tint: 0xffa46b, speedMin: 80, speedMax: 220, lifespan: 210 });
    this.emitFlameSmoke(this.player.x, this.player.y, aim.x, aim.y, 0.9);
    this.skillShake(0.0018, 75);
    this.playActionSfx('fire_bolt');
    return true;
  }

  updateGrenades(dtSec) {
    for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
      const g = this.grenades[i];
      g.t -= dtSec;
      g.x += g.vx * dtSec;
      g.y += g.vy * dtSec;
      g.sprite.setPosition(g.x, g.y);

      if (g.t <= 0) {
        this.explodeGrenade(g);
        g.sprite.destroy();
        this.grenades.splice(i, 1);
      }
    }
  }

  explodeGrenade(g) {
    const ring = this.add.circle(g.x, g.y, 20, 0xffb86b, 0.18).setDepth(8);
    ring.setStrokeStyle(3, 0xffb86b, 0.9);
    ring.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      radius: g.radius,
      alpha: 0,
      duration: 200,
      onComplete: () => ring.destroy()
    });
    this.emitBurst(g.x, g.y, { count: 24, tint: 0xffb86b, speedMin: 90, speedMax: 260, lifespan: 280 });
    this.emitBurst(g.x, g.y, { count: 30, tint: 0xffe6bf, speedMin: 130, speedMax: 360, lifespan: 230 });
    this.emitFlameSmoke(g.x, g.y, 0, -1, 1.8);
    this.emitScreenFlash(0xffd0a0, 0.07, 95);
    this.skillShake(0.0036, 130);
    this.playActionSfx('enemy_death');

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const d = Phaser.Math.Distance.Between(g.x, g.y, e.x, e.y);
      if (d <= g.radius + 10) {
        this.dealDamageToEnemy(e, g.damage, true);
      }
    });
  }

  updateBlizzards(dtSec) {
    for (let i = this.blizzards.length - 1; i >= 0; i -= 1) {
      const b = this.blizzards[i];
      b.t -= dtSec;
      b.acc += dtSec;
      if (b.t <= 0) {
        b.gfx.destroy();
        b.core?.destroy();
        this.blizzards.splice(i, 1);
        continue;
      }
      if (b.core) {
        b.core.setPosition(b.x, b.y);
        b.core.rotation += dtSec * 0.45;
      }
      if (b.acc >= b.tick) {
        b.acc = 0;
        this.enemies.children.iterate((e) => {
          if (!e || !e.active) return;
          const d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
          if (d <= b.radius + 10) {
            e._blizzardSlowUntil = this.time.now + 300;
            e._blizzardSlowMul = b.slowMul;
            this.dealDamageToEnemy(e, b.dmg, true);
          }
        });
      }
    }
  }

  updateSpinAuras(dtSec) {
    for (let i = this.spinAuras.length - 1; i >= 0; i -= 1) {
      const a = this.spinAuras[i];
      a.t -= dtSec;
      a.acc += dtSec;
      a.ang += dtSec * 7.6;
      const pulse = 0.82 + 0.18 * Math.sin(this.time.now * 0.018 + i);
      a.gfx.clear();
      a.gfx.lineStyle(10, 0xfff0d4, 0.34 * pulse);
      a.gfx.strokeCircle(this.player.x, this.player.y, a.radius * 0.76);
      a.gfx.lineStyle(4, 0xffb786, 0.78 * pulse);
      a.gfx.strokeCircle(this.player.x, this.player.y, a.radius * 0.86);
      a.gfx.lineStyle(8, 0xfff3dc, 0.95 * pulse);
      for (let k = 0; k < 2; k += 1) {
        const ang = a.ang + k * Math.PI;
        const x1 = this.player.x + Math.cos(ang) * (a.radius * 0.22);
        const y1 = this.player.y + Math.sin(ang) * (a.radius * 0.22);
        const x2 = this.player.x + Math.cos(ang) * (a.radius * 0.96);
        const y2 = this.player.y + Math.sin(ang) * (a.radius * 0.96);
        a.gfx.beginPath();
        a.gfx.moveTo(x1, y1);
        a.gfx.lineTo(x2, y2);
        a.gfx.strokePath();
        const x3 = this.player.x + Math.cos(ang + 0.16) * (a.radius * 0.34);
        const y3 = this.player.y + Math.sin(ang + 0.16) * (a.radius * 0.34);
        const x4 = this.player.x + Math.cos(ang + 0.16) * (a.radius * 0.9);
        const y4 = this.player.y + Math.sin(ang + 0.16) * (a.radius * 0.9);
        a.gfx.lineStyle(4, 0xff9e5f, 0.66 * pulse);
        a.gfx.beginPath();
        a.gfx.moveTo(x3, y3);
        a.gfx.lineTo(x4, y4);
        a.gfx.strokePath();
        a.gfx.lineStyle(8, 0xfff3dc, 0.95 * pulse);
      }
      a.gfx.lineStyle(3, 0xffffff, 0.72 * pulse);
      a.gfx.strokeCircle(this.player.x, this.player.y, a.radius * 0.82);
      if (a.t <= 0) {
        a.gfx.destroy();
        this.spinAuras.splice(i, 1);
        continue;
      }
      if (a.acc >= a.tick) {
        a.acc = 0;
        this.enemies.children.iterate((e) => {
          if (!e || !e.active) return;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
          if (d <= a.radius + 10) this.dealDamageToEnemy(e, a.dmg, true);
        });
      }
    }
  }

  updateFireBolts(dtSec) {
    for (let i = this.fireBolts.length - 1; i >= 0; i -= 1) {
      const f = this.fireBolts[i];
      const step = f.speed * dtSec;
      f.x += f.dx * step;
      f.y += f.dy * step;
      f.travel += step;
      f.sprite.setPosition(f.x, f.y);
      if (Math.random() < 0.55) {
        this.emitBurst(f.x - f.dx * 8, f.y - f.dy * 8, { count: 1, tint: 0xffc08f, speedMin: 20, speedMax: 70, lifespan: 110, scaleStart: 0.75 });
        this.emitFlameSmoke(f.x - f.dx * 6, f.y - f.dy * 6, f.dx, f.dy, 0.2);
      }

      let hitEnemy = false;
      this.enemies.children.iterate((e) => {
        if (hitEnemy || !e || !e.active) return;
        const d = Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y);
        if (d <= (e.body?.halfWidth ?? 12) + 8) hitEnemy = true;
      });

      const out = f.x < -20 || f.x > this.physics.world.bounds.width + 20 || f.y < -20 || f.y > this.physics.world.bounds.height + 20;
      if (hitEnemy || out || f.travel >= f.maxRange) {
        this.explodeFireBolt(f);
        f.sprite.destroy();
        this.fireBolts.splice(i, 1);
      }
    }
  }

  explodeFireBolt(f) {
    const ring = this.add.circle(f.x, f.y, 18, 0xffa46b, 0.16).setDepth(8);
    ring.setStrokeStyle(3, 0xffa46b, 0.8);
    ring.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, radius: f.explodeRadius, alpha: 0, duration: 180, onComplete: () => ring.destroy() });
    this.emitBurst(f.x, f.y, { count: 20, tint: 0xffa46b, speedMin: 90, speedMax: 240, lifespan: 240 });
    this.emitBurst(f.x, f.y, { count: 18, tint: 0xfff1db, speedMin: 120, speedMax: 300, lifespan: 180 });
    this.emitFlameSmoke(f.x, f.y, 0, -1, 1.5);
    this.emitScreenFlash(0xffc894, 0.06, 80);
    this.skillShake(0.003, 110);
    this.playActionSfx('enemy_death');
    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const d = Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y);
      if (d <= f.explodeRadius + 10) this.dealDamageToEnemy(e, f.damage, true);
    });
  }

  drawLightning(x1, y1, x2, y2, color = 0x8bc6ff) {
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(3, color, 0.86);
    g.beginPath();
    g.moveTo(x1, y1);
    const mx = (x1 + x2) * 0.5 + Phaser.Math.Between(-12, 12);
    const my = (y1 + y2) * 0.5 + Phaser.Math.Between(-12, 12);
    g.lineTo(mx, my);
    g.lineTo(x2, y2);
    g.strokePath();
    g.setBlendMode(Phaser.BlendModes.ADD);
    const g2 = this.add.graphics().setDepth(8);
    g2.lineStyle(1.6, 0xffffff, 0.95);
    g2.beginPath();
    g2.moveTo(x1, y1);
    g2.lineTo(mx + Phaser.Math.Between(-4, 4), my + Phaser.Math.Between(-4, 4));
    g2.lineTo(x2, y2);
    g2.strokePath();
    g2.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration: 100, onComplete: () => g.destroy() });
    this.tweens.add({ targets: g2, alpha: 0, duration: 90, onComplete: () => g2.destroy() });
    this.emitBurst(x2, y2, { count: 6, tint: 0xcde7ff, speedMin: 50, speedMax: 130, lifespan: 120 });
  }

  pointSegDistSq(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-6) {
      const dx = px - x1;
      const dy = py - y1;
      return dx * dx + dy * dy;
    }
    let t = (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + vx * t;
    const cy = y1 + vy * t;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
  }

  queueEnemySpawn(x, y, type, delaySec = 0.55) {
    const color = type === EnemyType.MINIBOSS ? 0xff3bd7 : (type === EnemyType.ELITE ? 0xb96bff : 0x7ea0ff);
    const radius = type === EnemyType.MINIBOSS ? 68 : 42;
    const gfx = this.add.circle(x, y, radius, color, 0.08).setDepth(2);
    gfx.setStrokeStyle(2, color, 0.65);
    this.spawnWarnings.push({ x, y, type, t: delaySec, maxT: delaySec, gfx });
  }

  updateSpawnWarnings(dtSec) {
    for (let i = this.spawnWarnings.length - 1; i >= 0; i -= 1) {
      const w = this.spawnWarnings[i];
      w.t -= dtSec;
      const p = Phaser.Math.Clamp(w.t / Math.max(0.001, w.maxT), 0, 1);
      w.gfx.setAlpha(0.15 + (1 - p) * 0.35);
      w.gfx.setScale(1 + (1 - p) * 0.18);
      if (w.t <= 0) {
        w.gfx.destroy();
        this.spawnEnemyAt(w.x, w.y, w.type);
        this.spawnWarnings.splice(i, 1);
      }
    }
  }

  addLineWarning(x1, y1, x2, y2, delaySec, color = 0xffc857, width = 8) {
    const gfx = this.add.graphics().setDepth(2);
    this.lineWarnings.push({ x1, y1, x2, y2, t: delaySec, maxT: delaySec, color, width, gfx });
  }

  updateLineWarnings(dtSec) {
    for (let i = this.lineWarnings.length - 1; i >= 0; i -= 1) {
      const w = this.lineWarnings[i];
      w.t -= dtSec;
      const p = Phaser.Math.Clamp(w.t / Math.max(0.001, w.maxT), 0, 1);
      w.gfx.clear();
      w.gfx.lineStyle(w.width, w.color, 0.18 + (1 - p) * 0.32);
      w.gfx.beginPath();
      w.gfx.moveTo(w.x1, w.y1);
      w.gfx.lineTo(w.x2, w.y2);
      w.gfx.strokePath();
      if (w.t <= 0) {
        w.gfx.destroy();
        this.lineWarnings.splice(i, 1);
      }
    }
  }

  addBossLaser(x1, y1, x2, y2, durationSec = 0.55, width = 16, damage = 20) {
    const gfx = this.add.graphics().setDepth(3);
    this.bossLasers.push({
      x1, y1, x2, y2, t: durationSec, maxT: durationSec, width, damage, gfx, hitAcc: 0
    });
  }

  updateBossLasers(dtSec) {
    for (let i = this.bossLasers.length - 1; i >= 0; i -= 1) {
      const b = this.bossLasers[i];
      b.t -= dtSec;
      b.hitAcc += dtSec;
      const p = Phaser.Math.Clamp(b.t / Math.max(0.001, b.maxT), 0, 1);
      b.gfx.clear();
      b.gfx.lineStyle(b.width, 0xff3bd7, 0.22 + (1 - p) * 0.36);
      b.gfx.beginPath();
      b.gfx.moveTo(b.x1, b.y1);
      b.gfx.lineTo(b.x2, b.y2);
      b.gfx.strokePath();

      if (b.hitAcc >= 0.12) {
        b.hitAcc = 0;
        const d2 = this.pointSegDistSq(this.player.x, this.player.y, b.x1, b.y1, b.x2, b.y2);
        const rr = (this.player.body?.halfWidth ?? 15) + b.width * 0.5;
        if (d2 <= rr * rr) {
          this.playerTakeDamage(b.damage);
        }
      }

      if (b.t <= 0) {
        b.gfx.destroy();
        this.bossLasers.splice(i, 1);
      }
    }
  }

  playerTakeDamage(amount) {
    if (this.playerInvulnSec > 0 || amount <= 0) return;
    const applied = Math.max(1, Math.floor(amount * this.relicDamageTakenMul));
    this.playerHp -= applied;
    this.playerInvulnSec = 0.35;
    new FloatingText(this, this.player.x, this.player.y - 18, `-${applied}`, { fontSize: 17, color: '#ff6b6b' });
    if (this.playerHp <= 0) this.gameOver();
  }

  rayToBounds(x, y, dx, dy) {
    const L = Math.max(this.physics.world.bounds.width, this.physics.world.bounds.height) * 2.2;
    return { x: x + dx * L, y: y + dy * L };
  }

  updateMiniBossPattern(e, dtSec) {
    if (!e.isBossActor && e.type !== EnemyType.BOSS && e.type !== EnemyType.MINIBOSS) return false;

    if (!e._bossState) {
      e._bossState = {
        phase: 'idle',
        phaseT: 0,
        cd: 2.2,
        dirX: 0,
        dirY: 1,
        dashT: 0,
        laserT: 0
      };
    }
    const s = e._bossState;

    if (s.phase === 'idle') {
      s.cd = Math.max(0, s.cd - dtSec);
      if (s.cd <= 0) {
        const vx = this.player.x - e.x;
        const vy = this.player.y - e.y;
        const len = Math.hypot(vx, vy) || 1;
        s.dirX = vx / len;
        s.dirY = vy / len;
        const wantDash = Math.random() < 0.55;
        const end = this.rayToBounds(e.x, e.y, s.dirX, s.dirY);
        if (wantDash) {
          s.phase = 'dash_warn';
          s.phaseT = 0.65;
          this.addLineWarning(e.x, e.y, end.x, end.y, 0.65, 0xffc857, 10);
        } else {
          s.phase = 'laser_warn';
          s.phaseT = 0.75;
          this.addLineWarning(e.x, e.y, end.x, end.y, 0.75, 0x7ea0ff, 8);
        }
      }
      return false;
    }

    if (s.phase === 'dash_warn') {
      s.phaseT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.phaseT <= 0) {
        s.phase = 'dash';
        s.dashT = 0.33;
        s.cd = 2.4;
      }
      return true;
    }

    if (s.phase === 'dash') {
      const dashSpeed = 760 * this.enemyPace;
      e.x += s.dirX * dashSpeed * dtSec;
      e.y += s.dirY * dashSpeed * dtSec;
      e.body.setVelocity(0, 0);
      s.dashT -= dtSec;

      const b = this.physics.world.bounds;
      let hitWall = false;
      if (e.x < 24) { e.x = 24; hitWall = true; }
      if (e.x > b.width - 24) { e.x = b.width - 24; hitWall = true; }
      if (e.y < 24) { e.y = 24; hitWall = true; }
      if (e.y > b.height - 24) { e.y = b.height - 24; hitWall = true; }
      if (hitWall || s.dashT <= 0) {
        s.phase = 'idle';
        s.cd = 2.1;
      }
      return true;
    }

    if (s.phase === 'laser_warn') {
      s.phaseT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.phaseT <= 0) {
        s.phase = 'laser';
        s.laserT = 0.55;
        s.cd = 2.6;
        const end = this.rayToBounds(e.x, e.y, s.dirX, s.dirY);
        this.addBossLaser(e.x, e.y, end.x, end.y, 0.55, 16, 20);
      }
      return true;
    }

    if (s.phase === 'laser') {
      s.laserT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.laserT <= 0) {
        s.phase = 'idle';
        s.cd = 2.2;
      }
      return true;
    }

    return false;
  }

  fireBullet() {
    const aim = this.getAimVector();
    if (aim.lengthSq() < 0.01) return;

    const sx = this.player.x + aim.x * 18;
    const sy = this.player.y + aim.y * 18;
    const b = this.bullets.get(sx, sy, 'tex_bullet');
    if (!b) return;
    b.enableBody(true, sx, sy, true, true);
    b.setTexture('tex_bullet');
    b.setDisplaySize(20, 7);
    b.setDepth(4);
    b.body.setAllowGravity(false);
    b.body.setSize(16, 6, true);
    b.body.setVelocity(0, 0);
    b.setRotation(Math.atan2(aim.y, aim.x));
    b.setTint(0xeaf4ff);

    const speed = 720 * this.combatPace;
    b.body.setVelocity(aim.x * speed, aim.y * speed);
    this.emitBurst(sx, sy, { count: 5, tint: 0xcfe9ff, speedMin: 40, speedMax: 120, scaleStart: 0.7, lifespan: 120 });

    const minDmg = Math.max(1, Math.floor(this.baseDamage) - 1);
    const maxDmg = Math.max(minDmg, Math.floor(this.baseDamage) + 1);
    b.damage = Phaser.Math.Between(minDmg, maxDmg);
    b.pierce = this.abilitySystem.bulletPierceEnabled();
    b.hitIds = new Set();
  }

  spawnEnemy(type) {
    const b = this.physics.world.bounds;
    const cam = this.cameras.main;
    const padding = 160;
    const side = Phaser.Math.Between(0, 3);

    let x;
    let y;
    if (side === 0) {
      x = Phaser.Math.Between(cam.worldView.x - padding, cam.worldView.right + padding);
      y = cam.worldView.y - padding;
    } else if (side === 1) {
      x = Phaser.Math.Between(cam.worldView.x - padding, cam.worldView.right + padding);
      y = cam.worldView.bottom + padding;
    } else if (side === 2) {
      x = cam.worldView.x - padding;
      y = Phaser.Math.Between(cam.worldView.y - padding, cam.worldView.bottom + padding);
    } else {
      x = cam.worldView.right + padding;
      y = Phaser.Math.Between(cam.worldView.y - padding, cam.worldView.bottom + padding);
    }

    x = Phaser.Math.Clamp(x, b.x + 40, b.width - 40);
    y = Phaser.Math.Clamp(y, b.y + 40, b.height - 40);

    const d = this.stageDirector.getDifficultyScalar();

    let hp = 18;
    let speed = 110;

    switch (type) {
      case EnemyType.SCOUT:
        hp = Math.floor(10 * d);
        speed = 140 * d;
        break;
      case EnemyType.NORMAL:
        hp = Math.floor(18 * d);
        speed = 120 * d;
        break;
      case EnemyType.TANK:
        hp = Math.floor(34 * d);
        speed = 90 * d;
        break;
      case EnemyType.ELITE:
        hp = Math.floor(24 * d);
        speed = 135 * d;
        break;
      case EnemyType.MINIBOSS:
        hp = Math.floor(180 * d);
        speed = 110 * d;
        break;
      default:
        break;
    }

    const e = new Enemy(this, x, y, type, hp, speed);
    this.enemies.add(e);
  }

  spawnEnemyAt(x, y, type) {
    const b = this.physics.world.bounds;
    const sx = Phaser.Math.Clamp(x, b.x + 40, b.width - 40);
    const sy = Phaser.Math.Clamp(y, b.y + 40, b.height - 40);
    const d = this.stageDirector.getDifficultyScalar();

    let hp = 18;
    let speed = 110;

    switch (type) {
      case EnemyType.SCOUT:
        hp = Math.floor(10 * d);
        speed = 140 * d;
        break;
      case EnemyType.NORMAL:
        hp = Math.floor(18 * d);
        speed = 120 * d;
        break;
      case EnemyType.TANK:
        hp = Math.floor(34 * d);
        speed = 90 * d;
        break;
      case EnemyType.ELITE:
        hp = Math.floor(24 * d);
        speed = 135 * d;
        break;
      case EnemyType.MINIBOSS:
        hp = Math.floor(180 * d);
        speed = 110 * d;
        break;
      default:
        break;
    }

    const e = new Enemy(this, sx, sy, type, hp, speed);
    if (type === EnemyType.MINIBOSS) {
      e.isBossActor = true;
    }
    this.enemies.add(e);
  }

  getEnemySoftCap() {
    return Math.min(36, 14 + 2 * this.stageDirector.stage);
  }

  onStageClear(stage) {
    new FloatingText(this, this.player.x, this.player.y - 70, `스테이지 ${stage} 클리어`, { fontSize: 20, color: '#7ea0ff' });
    this.progression.pendingLevelups += 1;
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 18);
  }

  spawnBoss() {
    const b = this.physics.world.bounds;
    const x = Phaser.Math.Between(b.width * 0.2, b.width * 0.8);
    const y = Phaser.Math.Between(b.height * 0.2, b.height * 0.8);

    const d = this.stageDirector.getDifficultyScalar();
    const hp = Math.floor(320 * d);
    const speed = 80 * d;

    const boss = new Enemy(this, x, y, EnemyType.BOSS, hp, speed);
    boss.setScale(1.1);
    boss.isBossActor = true;
    this.enemies.add(boss);

    new FloatingText(this, boss.x, boss.y - 45, '보스 등장!', { fontSize: 22, color: '#ff3bd7' });
  }

  onBulletHit(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    if (bullet.hitIds?.has(enemy)) return;

    let dmg = Math.max(1, Math.floor((bullet.damage ?? 10) * this.relicDamageMul));
    const critChanceTotal = this.critChance + this.relicCritChanceFlat;
    if (critChanceTotal > 0 && Math.random() < critChanceTotal) {
      dmg = Math.floor(dmg * 1.6 * this.relicCritDamageMul);
      new FloatingText(this, enemy.x, enemy.y - 26, '치명타', { fontSize: 12, color: '#ffd700' });
    }

    enemy.hp -= dmg;
    this.flashActor(enemy, 0xffffff, 55);
    this.emitBurst(enemy.x, enemy.y, { count: 7, tint: 0xffffff, speedMin: 50, speedMax: 160, scaleStart: 0.7, lifespan: 140 });

    this.playActionSfx('enemy_hit');
    new FloatingText(this, enemy.x, enemy.y - 10, String(dmg), { fontSize: 17, color: '#ffffff' });
    this.applyLifesteal(dmg);
    bullet.hitIds?.add(enemy);
    if (!bullet.pierce) bullet.destroy();

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  getXpForEnemy(type) {
    const base = XP_PER_TYPE[type] ?? 8;
    return Math.max(1, Math.floor(base * this.xpGainMul * this.relicXpGainMul));
  }

  killEnemy(enemy) {
    if (!enemy.active) return;

    this.playActionSfx('enemy_death');
    const deathTint = enemy.type === EnemyType.BOSS ? 0xff66df
      : enemy.type === EnemyType.MINIBOSS ? 0xd98cff
      : enemy.type === EnemyType.ELITE ? 0xc692ff
      : enemy.type === EnemyType.TANK ? 0x8fffad
      : enemy.type === EnemyType.NORMAL ? 0xffc48b
      : 0xff8a8a;
    this.emitBurst(enemy.x, enemy.y, { count: 18, tint: deathTint, speedMin: 90, speedMax: 250, lifespan: 260 });
    this.kills += 1;
    this.baseScore += SCORE_PER_TYPE[enemy.type] ?? 10;

    const xp = this.getXpForEnemy(enemy.type);
    const leveled = this.progression.grantXp(xp);
    if (leveled > 0) {
      this.applyLevelGrowth(leveled);
      new FloatingText(this, this.player.x, this.player.y - 60, `레벨 ${this.progression.level}`, { fontSize: 20, color: '#7ea0ff' });
    }

    const { chance, min, max } = this.getGoldDropTable(enemy.type);
    if (Math.random() < chance) {
      const amount = Phaser.Math.Between(min, max);
      const g = new GoldPickup(this, enemy.x, enemy.y, amount);
      this.goldPickups.add(g);
    }

    enemy.destroy();
    this.stageDirector.onEnemyKilled();

    if (enemy.type === EnemyType.BOSS) {
      this.stageDirector.startNextStage();
      new FloatingText(this, this.player.x, this.player.y - 60, '스테이지 클리어', { fontSize: 20, color: '#7ea0ff' });
    }
  }

  getGoldDropTable(type) {
    switch (type) {
      case EnemyType.SCOUT:
        return { chance: 0.12, min: 1, max: 2 };
      case EnemyType.NORMAL:
        return { chance: 0.18, min: 2, max: 4 };
      case EnemyType.TANK:
        return { chance: 0.25, min: 3, max: 6 };
      case EnemyType.ELITE:
        return { chance: 0.35, min: 6, max: 12 };
      case EnemyType.MINIBOSS:
        return { chance: 1.0, min: 24, max: 46 };
      case EnemyType.BOSS:
        return { chance: 1.0, min: 40, max: 70 };
      default:
        return { chance: 0.15, min: 1, max: 3 };
    }
  }

  onPlayerTouchEnemy(player, enemy) {
    if (!enemy.active) return;

    if (this.playerShield > 0 && enemy.type !== EnemyType.BOSS && enemy.type !== EnemyType.MINIBOSS) {
      this.playerShield -= 1;
      this.onShieldUsed();
      new FloatingText(this, this.player.x, this.player.y - 18, '방어', { fontSize: 16, color: '#7ea0ff' });
      this.killEnemy(enemy);
      return;
    }

    const state = enemy._bossState;
    const inDash = state?.phase === 'dash';
    const dmg = enemy.type === EnemyType.BOSS
      ? (inDash ? 55 : 40)
      : enemy.type === EnemyType.MINIBOSS
        ? (inDash ? 45 : 30)
        : enemy.type === EnemyType.TANK
          ? 10
          : 7;
    this.playerTakeDamage(dmg);

    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const len = Math.hypot(dx, dy) || 1;
    this.player.body.velocity.x += (dx / len) * 200;
    this.player.body.velocity.y += (dy / len) * 200;
  }

  onGoldPickup(player, gold) {
    if (!gold.active) return;

    const amount = Math.max(1, Math.floor(gold.amount * this.goldGainMul * this.relicGoldGainMul));
    this.runGold += amount;
    SaveSystem.addGold(amount);

    new FloatingText(this, gold.x, gold.y - 8, `+${amount}`, { fontSize: 14, color: '#ffd700' });
    this.emitBurst(gold.x, gold.y, { count: 10, tint: 0xffd700, speedMin: 40, speedMax: 130, scaleStart: 0.8, lifespan: 180 });
    gold.destroy();
  }

  gameOver() {
    const timeSec = this.elapsedMs / 1000;
    const timeBonus = Math.floor(timeSec * 7);
    const totalScore = this.baseScore + timeBonus;
    SaveSystem.saveRecord({
      name: '플레이어',
      totalScore,
      timeSec,
      kills: this.kills,
      stage: this.stageDirector.stage,
      level: this.progression.level
    });
    this.bgm?.stop();
    this.scene.start('GameOver', {
      stage: this.stageDirector.stage,
      runGold: this.runGold,
      level: this.progression.level,
      kills: this.kills,
      timeSec,
      totalScore
    });
  }
}

