import Phaser from 'phaser';
import { Client as ColyseusClient } from '@colyseus/sdk';
import SaveSystem from '../systems/SaveSystem.js';
import AuthSystem from '../systems/AuthSystem.js';
import StageDirector, { EnemyType } from '../systems/StageDirector.js';
import InputSystem from '../systems/InputSystem.js';
import { FloatingText } from '../systems/Fx.js';
import ProgressionSystem from '../systems/ProgressionSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import LevelUpOverlay from '../systems/LevelUpOverlay.js';
import LeaderboardSystem from '../systems/LeaderboardSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import { ABILITY_KEYS, ABILITY_META, MAX_UNIQUE_TRAITS_PER_RUN } from '../data/abilities.js';
import { AUDIO_ACTION_PROFILE, AUDIO_DEFAULT_PROFILE } from '../data/audioProfile.js';
import {
  RELIC_BY_ID,
  combineEffects,
  getCompletedCodexSets
} from '../data/relics.js';
import { isMobileDevice } from '../utils/device.js';
import { getPvpServerBaseUrl, toWsBaseUrl } from '../utils/network.js';

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

const DEFENSE_CORE_REGEN_PER_SEC = 3;
const DEFENSE_CORE_REGEN_DELAY_SEC = 2.5;
const STAGE_MODE_FINAL_STAGE = 20;
const COOP_REVIVE_HOLD_MS = 4000;
const HUD_FONT_DISPLAY = 'Rajdhani, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const HUD_FONT_BODY = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const HUD_COLOR_PANEL = 0x0f1f33;
const HUD_COLOR_PANEL_DARK = 0x0b1526;
const HUD_COLOR_PANEL_STROKE = 0x305a83;
const HUD_COLOR_ACCENT = 0x4cc9f0;
const HUD_COLOR_TEXT_MAIN = '#e8f3ff';
const HUD_COLOR_TEXT_SUB = '#9ab4d2';
const HUD_COLOR_WARN = '#ff9b9b';
const HUD_COLOR_HP = 0xff7361;
const HUD_COLOR_HP_SAFE = 0x55d98d;
const HUD_COLOR_XP = 0x47d3ff;
const HUD_COLOR_GOLD = '#ffd166';

function getMmrTierLabel(mmr) {
  const v = Number(mmr || 1000);
  if (v >= 1800) return 'Diamond';
  if (v >= 1500) return 'Platinum';
  if (v >= 1300) return 'Gold';
  if (v >= 1150) return 'Silver';
  return 'Bronze';
}

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

  init(data) {
    const mode = String(data?.mode ?? 'survival').toLowerCase();
    this.isCoopMode = mode === 'coop';
    this.isPvpMode = mode === 'pvp' || this.isCoopMode;
    this.runMode = mode === 'defense' ? 'defense' : 'survival';
    this.displayMode = this.isCoopMode ? 'coop' : this.runMode;
    this.partyKey = String(data?.partyKey || '');
    this.pvpToken = String(data?.token || '');
    this.pvpServerBaseUrl = String(data?.serverBaseUrl || getPvpServerBaseUrl());
    this.pvpUser = data?.user || null;
    if (!this.pvpToken) {
      const session = AuthSystem.loadSession();
      if (session?.token) {
        this.pvpToken = String(session.token);
        this.pvpServerBaseUrl = String(session.serverBaseUrl || this.pvpServerBaseUrl);
        this.pvpUser = session.user || this.pvpUser;
      }
    }
  }

  create() {
    if (!this.runMode) this.runMode = 'survival';
    this.pauseUi = null;
    this.pvpRoom = null;
    this.pvpClient = null;
    this.pvpSelfSid = '';
    this.pvpOpponentSid = '';
    this.pvpOpponent = null;
    this.pvpStatusText = null;
    this.pvpSendAccMs = 0;
    this.pvpMatchEnded = false;
    this.pvpProfile = null;
    this.pvpEnemySpawnAcc = 0;
    this.pvpCanControl = !this.isPvpMode;
    this.pvpRoundStarted = !this.isPvpMode;
    this.pvpCountdownStarted = false;
    this.pvpCountdownStartedAt = 0;
    this.pvpCountdownDurationMs = 5000;
    this.pvpOpponentRevealed = false;
    this.pvpRemoteShots = [];
    this.pvpEnemyHost = false;
    this.pvpSpawnSeq = 0;
    this.pvpSpawnSeen = new Set();
    this.pvpEnemyIndex = new Map();
    this.pvpSkillHitUntil = Object.create(null);
    this.pvpNetAim = new Phaser.Math.Vector2(1, 0);
    this.pvpLevelupPending = false;
    this.pvpHitSeq = 1;
    this.pvpPingMs = null;
    this.pvpPingAccMs = 0;
    this.coopStage = 1;
    this.coopStageKills = 0;
    this.coopStageKillGoal = 24;
    this.coopReviveState = this.makeDefaultCoopReviveState();
    this.coopReviveHoldIntent = false;
    this.coopReviveHoldSources = { pointer: false, key: false };
    this.reviveHoldKey = null;
    this.coopRevivePointerUpHandler = null;
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
    this.physics.world.resume();
    this.createWorldBackdrop(worldW, worldH);

    this.player = this.physics.add.image(worldW / 2, worldH / 2, 'tex_player');
    this.player.setDepth(4);
    this.player.setCircle(15);
    this.player.setCollideWorldBounds(true);
    this.playerShadow = this.add.image(this.player.x, this.player.y + 20, 'tex_shadow').setDepth(2).setAlpha(0.45);
    this.playerShadow.setDisplaySize(42, 18);
    this.playerAura = this.add.image(this.player.x, this.player.y, 'tex_aura_ring').setDepth(3).setAlpha(0.55);
    this.playerAura.setBlendMode(Phaser.BlendModes.ADD);
    this.defenseCore = null;
    this.defenseCoreBody = null;
    this.defenseCoreHpMax = 0;
    this.defenseCoreHp = 0;
    this.defenseCorePulse = 0;
    this.defenseCoreRegenPerSec = DEFENSE_CORE_REGEN_PER_SEC;
    this.defenseCoreRegenDelaySec = 0;
    this.defenseCoreHpText = null;
    if (this.runMode === 'defense') {
      this.createDefenseCore(worldW * 0.5, worldH * 0.5);
    }

    this.playerMaxHpBase = 50;
    this.playerMaxHp = this.playerMaxHpBase;
    this.playerHp = this.playerMaxHp;
    this.playerShield = 0;

    this.playerSpeedBase = 270;
    this.playerSpeed = this.playerSpeedBase;
    this.baseDamageBase = 3;
    this.baseDamage = this.baseDamageBase;
    this.fireRateBase = 370;
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

    this.isMobileTouch = isMobileDevice();
    this.inputSystem = new InputSystem(this, () => ({ x: this.player.x, y: this.player.y }), { isMobile: this.isMobileTouch });
    if (this.isPvpMode) this.inputSystem.setLocked(true);
    this.mobileUi = null;
    this.skillDragState = null;
    this.skillAimOverride = null;
    this.aimCursorPos = new Phaser.Math.Vector2(this.scale.width * 0.5, this.scale.height * 0.5);
    this.mobileAimPadPrev = new Phaser.Math.Vector2(0, 0);
    this.mobileAimRadius = 110;
    this.wasMobileManualAim = false;
    this.aimCursorGfx = this.add.graphics().setDepth(1500).setScrollFactor(0);
    if (!this.isMobileTouch) {
      this.input.setDefaultCursor('crosshair');
      if (this.sys?.game?.canvas) this.sys.game.canvas.style.cursor = 'crosshair';
    }

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
    if (this.defenseCoreBody) {
      this.physics.add.overlap(this.defenseCoreBody, this.enemies, (_c, e) => this.onDefenseCoreTouchEnemy(e));
    }
    if (this.isPvpMode) {
      this.setupPvpOpponent();
    }

    this.createHud();
    if (this.isMobileTouch) this.createMobileControls();
    this.createPauseUi();

    this.levelUpOverlay = new LevelUpOverlay(this, (key) => this.chooseLevelup(key));
    this.keyHandler = (event) => this.onKeyDown(event);
    this.input.keyboard.on('keydown', this.keyHandler);
    this.reviveHoldKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    if (this.isPvpMode) {
      this.connectPvp().catch((err) => {
        const msg = String(err?.message || err || '').slice(0, 90);
        this.pvpStatusText?.setText(`${this.isCoopMode ? '협동' : 'PVP'} 연결 실패: ${msg}`);
      });
    }

    this.events.once('shutdown', () => {
      this.input.keyboard.off('keydown', this.keyHandler);
      if (this.coopReviveHoldIntent && this.pvpRoom) {
        this.pvpRoom.send('coop.revive.hold', { active: false });
      }
      if (this.coopRevivePointerUpHandler) {
        this.input.off('pointerup', this.coopRevivePointerUpHandler);
        this.coopRevivePointerUpHandler = null;
      }
      this.input.setDefaultCursor('default');
      if (this.sys?.game?.canvas) this.sys.game.canvas.style.cursor = 'default';
      this.levelUpOverlay.destroy();
      this.spawnWarnings.forEach((w) => w.gfx?.destroy());
      this.lineWarnings.forEach((w) => w.gfx?.destroy());
      this.bossLasers.forEach((b) => b.gfx?.destroy());
      this.aimCursorGfx?.destroy();
      this.pauseUi?.pauseBtn?.destroy();
      this.pauseUi?.pauseTxt?.destroy();
      this.pauseUi?.root?.destroy(true);
      this.pauseUi = null;
      this.fxParticles?.destroy();
      this.mobileUi?.root?.destroy(true);
      this.bgLayer?.destroy();
      this.bgNebula?.destroy();
      this.playerShadow?.destroy();
      this.playerAura?.destroy();
      this.pvpStatusText?.destroy();
      this.pvpStatusText = null;
      this.pvpRemoteShots.forEach((s) => s?.destroy?.());
      this.pvpRemoteShots = [];
      this.pvpEnemyIndex.clear();
      if (this.pvpOpponent) {
        this.pvpOpponent.body?.destroy();
        this.pvpOpponent.visual?.destroy();
        this.pvpOpponent.shadow?.destroy();
        this.pvpOpponent.label?.destroy();
        this.pvpOpponent = null;
      }
      if (this.pvpRoom) {
        this.pvpRoom.removeAllListeners?.();
        this.pvpRoom.leave();
        this.pvpRoom = null;
      }
      this.pvpClient = null;
      this.defenseCore?.root?.destroy(true);
      this.defenseCore = null;
      this.defenseCoreBody?.destroy();
      this.defenseCoreBody = null;
    });
  }

  createDefenseCore(x, y) {
    const root = this.add.container(x, y).setDepth(6);
    const glow = this.add.circle(0, 0, 74, 0x7ea0ff, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    const aura = this.add.circle(0, 0, 56).setStrokeStyle(3, 0x8bc6ff, 0.55).setBlendMode(Phaser.BlendModes.ADD);
    const poly = this.add.polygon(0, 0, [0, -34, 30, -17, 30, 17, 0, 34, -30, 17, -30, -17], 0x193152, 0.85)
      .setStrokeStyle(2, 0xb7d8ff, 0.95);
    const core = this.add.circle(0, 0, 12, 0xbde3ff, 0.85).setBlendMode(Phaser.BlendModes.ADD);
    root.add([glow, aura, poly, core]);
    this.tweens.add({ targets: root, rotation: Math.PI * 2, duration: 10000, repeat: -1 });
    this.tweens.add({ targets: glow, alpha: { from: 0.06, to: 0.16 }, duration: 1200, yoyo: true, repeat: -1 });

    this.defenseCoreBody = this.physics.add.image(x, y, 'tex_particle_soft')
      .setVisible(false)
      .setImmovable(true);
    this.defenseCoreBody.body.setAllowGravity(false);
    this.defenseCoreBody.setCircle(34);

    this.defenseCore = { root, glow, aura, poly, core, x, y };
    this.defenseCoreHpMax = 420;
    this.defenseCoreHp = this.defenseCoreHpMax;
  }

  getSpawnAnchor() {
    if (this.runMode === 'defense' && this.defenseCore) return { x: this.defenseCore.x, y: this.defenseCore.y };
    return { x: this.player.x, y: this.player.y };
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

  setupPvpOpponent() {
    const x = this.player.x + 140;
    const y = this.player.y;
    const body = this.physics.add.image(x, y, 'tex_player');
    body.setDepth(4);
    body.setCircle(15);
    body.setTint(this.isCoopMode ? 0x8fb4ff : 0xff8fb4);
    body.setCollideWorldBounds(true);
    body.body.setAllowGravity(false);
    const visual = this.add.image(x, y, 'tex_player').setDepth(4).setTint(this.isCoopMode ? 0x8fb4ff : 0xff8fb4);

    const shadow = this.add.image(x, y + 20, 'tex_shadow').setDepth(2).setAlpha(0.45);
    shadow.setDisplaySize(42, 18);
    const label = this.add.text(x, y + 30, this.isCoopMode ? '팀원' : '상대', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#aab6d6'
    }).setOrigin(0.5).setDepth(7);
    const hpLabel = this.add.text(x, y - 30, 'HP -', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#eaf0ff'
    }).setOrigin(0.5).setDepth(7);

    this.pvpOpponent = {
      body,
      visual,
      shadow,
      label,
      hpLabel,
      x,
      y,
      tx: x,
      ty: y,
      netVx: 0,
      netVy: 0,
      netTs: this.time.now,
      hp: 50,
      maxHp: 50,
      level: 1,
      name: '상대'
    };
    body.setVisible(false);
    shadow.setVisible(false);
    visual.setVisible(false);
    label.setVisible(false);
    hpLabel.setVisible(false);
    this.pvpStatusText = this.add.text(this.scale.width * 0.5, 82, this.isCoopMode ? '협동 매칭 중...' : 'PVP 매칭 중...', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#8fa4cd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1200);

    this.physics.add.overlap(this.bullets, body, (bullet) => this.onBulletHitPvpOpponent(bullet));
  }

  async connectPvp() {
    if (!this.pvpToken) throw new Error('pvp_token_missing');
    const wsBase = toWsBaseUrl(this.pvpServerBaseUrl || getPvpServerBaseUrl());
    this.pvpClient = new ColyseusClient(wsBase);
    this.pvpClient.auth.token = this.pvpToken;
    const joinOptions = this.isCoopMode && this.partyKey
      ? { partyKey: this.partyKey }
      : {};
    this.pvpRoom = await this.pvpClient.joinOrCreate(this.isCoopMode ? 'battle_coop' : 'battle_survival', joinOptions);
    this.pvpSelfSid = this.pvpRoom.sessionId;
    this.pvpStatusText?.setText(this.isCoopMode ? '협동 대기 중...' : 'PVP 대기 중...');

    this.pvpRoom.onMessage('match.waiting', () => {
      this.pvpStatusText?.setText(this.isCoopMode ? '협동 파트너 매칭 대기 중...' : 'PVP 상대 매칭 대기 중...');
    });
    this.pvpRoom.onMessage('match.start', (msg) => {
      if (this.isCoopMode) this.resetCoopReviveState(true);
      const startsInMs = Math.max(1000, Math.floor(Number(msg?.startsInMs || 5000)));
      const centerX = Number(msg?.centerX);
      const centerY = Number(msg?.centerY);
      const spread = Number(msg?.spread);
      const leftSid = String(msg?.leftSid || '');
      const rightSid = String(msg?.rightSid || '');
      if (Number.isFinite(centerX) && Number.isFinite(centerY) && Number.isFinite(spread) && leftSid && rightSid && this.pvpSelfSid) {
        const isLeft = this.pvpSelfSid === leftSid;
        const myX = centerX + (isLeft ? -spread : spread);
        const oppX = centerX + (isLeft ? spread : -spread);
        this.player.setPosition(myX, centerY);
        this.player.body?.setVelocity(0, 0);
        if (this.pvpOpponent) {
          this.pvpOpponent.tx = oppX;
          this.pvpOpponent.ty = centerY;
          this.pvpOpponent.x = oppX;
          this.pvpOpponent.y = centerY;
          this.pvpOpponent.body.setPosition(oppX, centerY);
          this.pvpOpponent.visual.setPosition(oppX, centerY);
        }
      }
      this.beginPvpRoundCountdown(startsInMs);
    });
    this.pvpRoom.onMessage('match.go', () => {
      if (this.isCoopMode) this.resetCoopReviveState(true);
      this.startPvpRoundNow();
    });
    this.pvpRoom.onMessage('pvp.profile', (profile) => {
      this.pvpProfile = profile || null;
      const wins = Number(profile?.wins || 0);
      const losses = Number(profile?.losses || 0);
      this.pvpStatusText?.setText(this.isCoopMode ? '협동 준비 완료' : `PVP 전적 ${wins}승 ${losses}패`);
    });
    this.pvpRoom.onMessage('pvp.damage', (msg) => {
      const toSid = String(msg?.toSid || '');
      const dmg = Math.max(0, Number(msg?.damage || 0));
      const fromSid = String(msg?.fromSid || '');
      if (toSid === this.pvpSelfSid && dmg > 0) {
        this.playerHp = Math.max(0, this.playerHp - dmg);
        this.emitBurst(this.player.x, this.player.y, {
          count: 4,
          tint: 0xff9db3,
          speedMin: 40,
          speedMax: 120,
          scaleStart: 0.6,
          lifespan: 120
        });
        new FloatingText(this, this.player.x, this.player.y - 18, `-${Math.floor(dmg)}`, { fontSize: 17, color: '#ff6b6b' });
      } else if (toSid === this.pvpOpponentSid) {
        const hp = Number(msg?.hp);
        if (Number.isFinite(hp) && this.pvpOpponent) {
          this.pvpOpponent.hp = Math.max(0, hp);
          if (fromSid && fromSid === this.pvpSelfSid && dmg > 0) {
            this.applyLifesteal(dmg);
          }
          this.emitBurst(this.pvpOpponent.x, this.pvpOpponent.y, {
            count: 4,
            tint: 0xffffff,
            speedMin: 30,
            speedMax: 110,
            scaleStart: 0.55,
            lifespan: 90
          });
        }
      }
    });
    this.pvpRoom.onMessage('match.end', (msg) => {
      if (this.pvpMatchEnded) return;
      this.pvpMatchEnded = true;
      if (this.isCoopMode) this.resetCoopReviveState(true);
      const winnerSid = String(msg?.winnerSid || '');
      const win = winnerSid === this.pvpSelfSid;
      if (this.isCoopMode) {
        this.pvpStatusText?.setText('협동 종료');
        this.time.delayedCall(700, () => {
          this.gameOver(String(msg?.reason || 'all_down'));
        });
        return;
      }
      if (winnerSid === this.pvpSelfSid) {
        new FloatingText(this, this.player.x, this.player.y - 80, '승리!', { fontSize: 28, color: '#8ef0a7' });
        this.pvpStatusText?.setText('매치 종료: 승리');
      } else {
        this.pvpStatusText?.setText('매치 종료: 패배');
      }
      this.time.delayedCall(1800, () => {
        this.bgm?.stop();
        this.scene.start('PvpGameOver', {
          result: win ? 'win' : 'lose',
          reason: String(msg?.reason || 'hp_zero'),
          profile: this.pvpProfile,
          pvp: {
            token: this.pvpToken,
            serverBaseUrl: this.pvpServerBaseUrl,
            user: this.pvpUser
          }
        });
      });
    });
    this.pvpRoom.onMessage('pvp.result', (msg) => {
      const winnerSid = String(msg?.winnerSid || '');
      const mine = winnerSid === this.pvpSelfSid ? msg?.winner : msg?.loser;
      if (!mine) return;
      this.pvpProfile = mine;
      const wins = Number(mine?.wins || 0);
      const losses = Number(mine?.losses || 0);
      this.pvpStatusText?.setText(`결과 반영됨: ${wins}승 ${losses}패`);
    });
    this.pvpRoom.onMessage('pvp.fx', (msg) => {
      this.onPvpFxMessage(msg);
    });
    this.pvpRoom.onMessage('pve.spawn', (msg) => {
      const id = String(msg?.id || '');
      const type = String(msg?.type || '');
      const x = Number(msg?.x);
      const y = Number(msg?.y);
      const hp = Number(msg?.hp);
      const speed = Number(msg?.speed);
      const vx = Number(msg?.vx);
      const vy = Number(msg?.vy);
      if (!id || this.pvpSpawnSeen.has(id)) return;
      this.pvpSpawnSeen.add(id);
      const typeNorm = type.trim();
      const t = EnemyType[typeNorm]
        ?? EnemyType[typeNorm.toUpperCase()]
        ?? (Object.values(EnemyType).includes(typeNorm) ? typeNorm : null);
      if (t == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.spawnEnemyAt(x, y, t, {
        netId: id,
        hp: Number.isFinite(hp) ? hp : undefined,
        speed: Number.isFinite(speed) ? speed : undefined,
        vx: Number.isFinite(vx) ? vx : 0,
        vy: Number.isFinite(vy) ? vy : 0
      });
    });
    this.pvpRoom.onMessage('pve.damage', (msg) => {
      const id = String(msg?.id || '');
      if (!id) return;
      const hp = Number(msg?.hp);
      const damage = Math.max(0, Number(msg?.damage || 0));
      const fromSid = String(msg?.fromSid || '');
      const enemy = this.pvpEnemyIndex.get(id);
      if (!enemy || !enemy.active) return;
      if (Number.isFinite(hp)) enemy.hp = Math.max(0, hp);
      if (damage > 0) {
        this.emitBurst(enemy.x, enemy.y, { count: 6, tint: 0xffffff, speedMin: 40, speedMax: 130, scaleStart: 0.65, lifespan: 120 });
        new FloatingText(this, enemy.x, enemy.y - 10, String(Math.floor(damage)), { fontSize: 16, color: '#ffffff' });
        if (fromSid && fromSid === this.pvpSelfSid) {
          this.applyLifesteal(damage);
        }
      }
      if (enemy.hp <= 0) {
        this.killEnemy(enemy, false);
      }
    });
    this.pvpRoom.onMessage('pve.sync', (msg) => {
      const rows = Array.isArray(msg?.enemies) ? msg.enemies : [];
      const sentAt = Number(msg?.sentAt);
      const lagSec = Number.isFinite(sentAt) ? Phaser.Math.Clamp((Date.now() - sentAt) / 1000, 0, 0.25) : 0;
      const seen = new Set();
      rows.forEach((row) => {
        const id = String(row?.id || '');
        if (!id) return;
        seen.add(id);
        let enemy = this.pvpEnemyIndex.get(id);
        const x = Number(row?.x);
        const y = Number(row?.y);
        const hp = Number(row?.hp);
        const typeName = String(row?.type || '');
        const speed = Number(row?.speed);
        const vx = Number(row?.vx);
        const vy = Number(row?.vy);
        if (!enemy) {
          const typeNorm = typeName.trim();
          const t = EnemyType[typeNorm]
            ?? EnemyType[typeNorm.toUpperCase()]
            ?? (Object.values(EnemyType).includes(typeNorm) ? typeNorm : null);
          if (t != null && Number.isFinite(x) && Number.isFinite(y)) {
            enemy = this.spawnEnemyAt(x, y, t, {
              netId: id,
              hp: Number.isFinite(hp) ? hp : undefined,
              speed: Number.isFinite(speed) ? speed : undefined,
              vx: Number.isFinite(vx) ? vx : 0,
              vy: Number.isFinite(vy) ? vy : 0
            });
          }
        }
        if (!enemy || !enemy.active) return;
        if (Number.isFinite(vx)) enemy.netVx = vx;
        if (Number.isFinite(vy)) enemy.netVy = vy;
        if (Number.isFinite(x)) enemy.netTx = x + ((Number.isFinite(vx) ? vx : 0) * lagSec);
        if (Number.isFinite(y)) enemy.netTy = y + ((Number.isFinite(vy) ? vy : 0) * lagSec);
        if (Number.isFinite(hp)) enemy.hp = Math.max(0, hp);
      });
      this.enemies.children.iterate((e) => {
        if (!e || !e.active || !e.netId) return;
        if (!seen.has(String(e.netId))) this.killEnemy(e, false);
      });
    });
    this.pvpRoom.onMessage('pve.boss.attack', (msg) => {
      if (!this.isCoopMode) return;
      const kind = String(msg?.kind || '');
      if (!kind) return;
      const durationSec = Math.max(0.08, Number(msg?.durationMs || 0) / 1000);
      const safeWidth = Math.max(4, Math.floor(Number(msg?.width || 10)));
      const lines = Array.isArray(msg?.lines) ? msg.lines : [];
      if (kind === 'spawn') {
        const x = Number(msg?.x);
        const y = Number(msg?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          new FloatingText(this, x, y - 44, '보스 출현!', { fontSize: 22, color: '#ff3bd7' });
        }
        return;
      }
      if (kind === 'summon') {
        const x = Number(msg?.x);
        const y = Number(msg?.y);
        const count = Math.max(1, Math.floor(Number(msg?.count || 0)));
        if (Number.isFinite(x) && Number.isFinite(y)) {
          new FloatingText(this, x, y - 34, `증원 소환 x${count}`, { fontSize: 17, color: '#ffd86f' });
        }
        return;
      }
      if (kind === 'dash_warn') {
        const line = msg?.line || null;
        if (!line) return;
        const x1 = Number(line?.x1);
        const y1 = Number(line?.y1);
        const x2 = Number(line?.x2);
        const y2 = Number(line?.y2);
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
        this.addLineWarning(x1, y1, x2, y2, durationSec, 0xffc857, safeWidth);
        return;
      }
      if (kind === 'line_warn') {
        lines.forEach((line) => {
          const x1 = Number(line?.x1);
          const y1 = Number(line?.y1);
          const x2 = Number(line?.x2);
          const y2 = Number(line?.y2);
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
          this.addLineWarning(x1, y1, x2, y2, durationSec, 0x7ea0ff, safeWidth);
        });
        return;
      }
      if (kind === 'laser') {
        lines.forEach((line) => {
          const x1 = Number(line?.x1);
          const y1 = Number(line?.y1);
          const x2 = Number(line?.x2);
          const y2 = Number(line?.y2);
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
          // Server authoritative damage: client only renders beam VFX here.
          this.addBossLaser(x1, y1, x2, y2, durationSec, safeWidth, 0);
        });
        return;
      }
      if (kind === 'nova_warn') {
        const x = Number(msg?.x);
        const y = Number(msg?.y);
        const radius = Math.max(20, Number(msg?.radius || 180));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const ring = this.add.circle(x, y, radius, 0xff6fa3, 0.06).setDepth(2);
        ring.setStrokeStyle(2, 0xff6fa3, 0.5);
        this.tweens.add({
          targets: ring,
          alpha: { from: 0.06, to: 0.22 },
          scale: { from: 0.92, to: 1.05 },
          yoyo: true,
          repeat: -1,
          duration: 180
        });
        this.time.delayedCall(Math.max(100, Math.floor(durationSec * 1000)), () => ring.destroy());
      }
    });
    this.pvpRoom.onMessage('pvp.level', (msg) => {
      const sid = String(msg?.sid || '');
      const level = Math.max(1, Math.floor(Number(msg?.level || 1)));
      const maxHp = Math.max(1, Math.floor(Number(msg?.maxHp || this.playerMaxHp)));
      const hp = Math.max(0, Math.floor(Number(msg?.hp || this.playerHp)));
      if (!sid) return;
      if (sid === this.pvpSelfSid) {
        this.progression.level = level;
        this.playerMaxHp = maxHp;
        this.playerHp = Math.min(this.playerMaxHp, hp);
      } else if (sid === this.pvpOpponentSid && this.pvpOpponent) {
        this.pvpOpponent.level = level;
        this.pvpOpponent.maxHp = maxHp;
        this.pvpOpponent.hp = Math.max(0, hp);
      }
    });
    this.pvpRoom.onMessage('pvp.progress', (msg) => {
      const sid = String(msg?.sid || '');
      if (!sid) return;
      const level = Math.max(1, Math.floor(Number(msg?.level || 1)));
      const maxHp = Math.max(1, Math.floor(Number(msg?.maxHp || this.playerMaxHp)));
      const hp = Math.max(0, Math.floor(Number(msg?.hp || this.playerHp)));
      const xpToNext = Math.max(1, Math.floor(Number(msg?.xpToNext || this.progression.xpToNext || 1)));
      const xp = Phaser.Math.Clamp(Math.floor(Number(msg?.xp || 0)), 0, xpToNext);
      const levelsGained = Math.max(0, Math.floor(Number(msg?.levelsGained || 0)));
      if (sid === this.pvpSelfSid) {
        const prevLevel = Math.max(1, Math.floor(Number(this.progression.level || 1)));
        this.progression.level = level;
        this.progression.xp = xp;
        this.progression.xpToNext = xpToNext;
        this.playerMaxHp = maxHp;
        this.playerHp = Math.min(this.playerMaxHp, hp);
        const delta = Math.max(levelsGained, level - prevLevel);
        if (delta > 0) this.progression.pendingLevelups += delta;
      } else if (sid === this.pvpOpponentSid && this.pvpOpponent) {
        this.pvpOpponent.level = level;
        this.pvpOpponent.maxHp = maxHp;
        this.pvpOpponent.hp = hp;
      }
    });
    this.pvpRoom.onMessage('pvp.levelup.result', (msg) => {
      this.pvpLevelupPending = false;
      if (!this.isPvpMode) return;
      const ok = !!msg?.ok;
      const rawKey = String(msg?.key || '');
      const keyAlias = {
        XPGAIN: 'XPGain',
        FIREBOLT: 'FIRE_BOLT'
      };
      const key = keyAlias[rawKey] || rawKey;
      if (!ok || !key) {
        const reason = String(msg?.reason || 'rejected');
        if (reason === 'no_unspent') {
          this.progression.pendingLevelups = 0;
          this.levelUpOverlay.hide();
          this.setLevelupActive(false);
        }
        return;
      }
      const applied = this.abilitySystem.applyAbility(key, this);
      if (!applied) return;
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
    });
    this.pvpRoom.onMessage('pvp.pong', (msg) => {
      const clientTs = Number(msg?.clientTs || 0);
      if (!Number.isFinite(clientTs) || clientTs <= 0) return;
      const rtt = Math.max(0, Date.now() - clientTs);
      this.pvpPingMs = rtt;
    });
    this.pvpRoom.onMessage('coop.stage', (msg) => {
      if (!this.isCoopMode) return;
      const stage = Math.max(1, Math.floor(Number(msg?.stage || this.coopStage || 1)));
      const stageKills = Math.max(0, Math.floor(Number(msg?.stageKills || 0)));
      const stageKillGoal = Math.max(1, Math.floor(Number(msg?.stageKillGoal || this.coopStageKillGoal || 1)));
      const clearedStage = Math.max(0, Math.floor(Number(msg?.clearedStage || 0)));
      const prevStage = this.coopStage;
      this.coopStage = stage;
      this.coopStageKills = Math.min(stageKillGoal, stageKills);
      this.coopStageKillGoal = stageKillGoal;
      if (clearedStage > 0 || stage > prevStage) {
        new FloatingText(this, this.player.x, this.player.y - 70, `스테이지 ${clearedStage || prevStage} 클리어`, { fontSize: 20, color: '#7ea0ff' });
      }
      if (msg?.finished) {
        this.coopStageKills = this.coopStageKillGoal;
      }
    });
    this.pvpRoom.onMessage('coop.revive.status', (msg) => {
      this.applyCoopReviveStatus(msg);
    });
    this.pvpRoom.onMessage('coop.revive.done', (msg) => {
      this.onCoopReviveDone(msg);
    });
    this.pvpRoom.onStateChange((state) => {
      if (!state?.players) return;
      const phase = String(state?.phase || '');
      if (phase === 'running' && !this.pvpRoundStarted) {
        this.startPvpRoundNow();
      } else if (phase !== 'running' && this.pvpRoundStarted) {
        this.pvpRoundStarted = false;
        this.pvpCanControl = false;
        this.inputSystem.setLocked(true);
      }
      state.players.forEach((st, sid) => {
        const id = String(sid);
        if (id === this.pvpSelfSid) {
          const sx = Number(st?.x);
          const sy = Number(st?.y);
          const shp = Number(st?.hp);
          const smaxHp = Number(st?.maxHp);
          const slevel = Number(st?.level);
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            const dx = sx - this.player.x;
            const dy = sy - this.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 40) {
              this.player.setPosition(sx, sy);
            } else {
              this.player.setPosition(this.player.x + dx * 0.35, this.player.y + dy * 0.35);
            }
          }
          if (Number.isFinite(shp)) this.playerHp = Math.max(0, shp);
          if (Number.isFinite(smaxHp)) this.playerMaxHp = Math.max(1, smaxHp);
          if (Number.isFinite(slevel)) this.progression.level = Math.max(1, slevel);
          return;
        }
        this.pvpOpponentSid = id;
        if (!this.pvpOpponent) return;
        const sx = Number(st?.x);
        const sy = Number(st?.y);
        const shp = Number(st?.hp);
        const smaxHp = Number(st?.maxHp);
        const slevel = Number(st?.level);
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
          const now = this.time.now;
          const prevTs = Number(this.pvpOpponent.netTs || now);
          const dtMs = Math.max(1, now - prevTs);
          this.pvpOpponent.netVx = (sx - this.pvpOpponent.tx) / (dtMs / 1000);
          this.pvpOpponent.netVy = (sy - this.pvpOpponent.ty) / (dtMs / 1000);
          this.pvpOpponent.netTs = now;
          this.pvpOpponent.tx = sx;
          this.pvpOpponent.ty = sy;
        } else {
          if (Number.isFinite(sx)) this.pvpOpponent.tx = sx;
          if (Number.isFinite(sy)) this.pvpOpponent.ty = sy;
        }
        if (Number.isFinite(shp)) this.pvpOpponent.hp = Math.max(0, shp);
        if (Number.isFinite(smaxHp)) this.pvpOpponent.maxHp = Math.max(1, smaxHp);
        if (Number.isFinite(slevel)) this.pvpOpponent.level = Math.max(1, slevel);
        this.pvpOpponent.name = String(st.name || '상대');
      });
      if (!this.pvpCountdownStarted && String(state?.phase || '') === 'countdown' && this.pvpOpponentSid) {
        this.beginPvpRoundCountdown(5000);
      }
    });
    this.pvpRoom.onLeave(() => {
      if (this.isCoopMode) this.resetCoopReviveState(false);
      this.pvpStatusText?.setText(this.isCoopMode ? '협동 연결 종료' : 'PVP 연결 종료');
    });
    this.pvpRoom.onError((_code, message) => {
      if (this.isCoopMode) this.resetCoopReviveState(false);
      this.pvpStatusText?.setText(`${this.isCoopMode ? '협동' : 'PVP'} 오류: ${String(message || '').slice(0, 80)}`);
    });
  }

  beginPvpRoundCountdown(durationMs = 5000) {
    if (this.pvpCountdownStarted) return;
    this.pvpCountdownStarted = true;
    this.pvpCountdownStartedAt = this.time.now;
    this.pvpCountdownDurationMs = Math.max(1000, Math.floor(Number(durationMs || 5000)));
    this.pvpOpponentRevealed = true;
    this.pvpCanControl = false;
    this.pvpRoundStarted = false;
    this.inputSystem.setLocked(true);

    this.player.body?.setVelocity(0, 0);
    this.pvpEnemyHost = this.pvpSelfSid < this.pvpOpponentSid;
    if (this.pvpOpponent) {
      this.pvpOpponent.body.setVisible(true);
      this.pvpOpponent.visual.setVisible(true);
      this.pvpOpponent.shadow.setVisible(true);
      this.pvpOpponent.label.setVisible(true);
      this.pvpOpponent.hpLabel.setVisible(true);
    }

    let left = Math.max(1, Math.ceil(this.pvpCountdownDurationMs / 1000));
    this.pvpStatusText?.setText(`${this.isCoopMode ? '협동 시작까지' : '전투 시작까지'} ${left}`);
    this.time.addEvent({
      delay: 1000,
      repeat: Math.max(0, left - 1),
      callback: () => {
        left -= 1;
        if (left > 0) {
          this.pvpStatusText?.setText(`${this.isCoopMode ? '협동 시작까지' : '전투 시작까지'} ${left}`);
        } else {
          this.pvpStatusText?.setText('');
        }
      }
    });
  }

  startPvpRoundNow() {
    if (this.pvpRoundStarted) return;
    this.pvpRoundStarted = true;
    this.pvpCanControl = true;
    this.inputSystem.setLocked(this.pauseActive);
    this.elapsedMs = 0;
    this.pvpEnemySpawnAcc = 0;
    this.pvpStatusText?.setText('');
  }

  makeDefaultCoopReviveState() {
    return {
      canHold: false,
      holdActive: false,
      holdTargetSid: '',
      holdStartedAt: 0,
      holdDurationMs: COOP_REVIVE_HOLD_MS,
      beingRevived: false,
      revivedBySid: '',
      beingRevivedStartedAt: 0
    };
  }

  resetCoopReviveState(sendCancel = false) {
    this.coopReviveState = this.makeDefaultCoopReviveState();
    if (!this.coopReviveHoldSources) {
      this.coopReviveHoldSources = { pointer: false, key: false };
    }
    this.coopReviveHoldSources.pointer = false;
    this.coopReviveHoldSources.key = false;
    if (sendCancel) {
      this.syncCoopReviveHoldIntent(true);
    } else {
      this.coopReviveHoldIntent = false;
    }
  }

  setCoopReviveHoldSource(source, active) {
    if (!this.isCoopMode) return;
    if (!this.coopReviveHoldSources) this.coopReviveHoldSources = { pointer: false, key: false };
    const key = source === 'pointer' ? 'pointer' : 'key';
    const next = !!active;
    if (this.coopReviveHoldSources[key] === next) return;
    this.coopReviveHoldSources[key] = next;
    this.syncCoopReviveHoldIntent();
  }

  syncCoopReviveHoldIntent(force = false) {
    if (!this.isCoopMode) return;
    const status = this.coopReviveState || this.makeDefaultCoopReviveState();
    const wantsHold = !!this.coopReviveHoldSources?.pointer || !!this.coopReviveHoldSources?.key;
    const canHold = !!(
      this.isPvpMode
      && this.pvpRoom
      && this.pvpRoundStarted
      && this.playerHp > 0
      && (status.canHold || status.holdActive)
    );
    const next = wantsHold && canHold;
    if (!force && this.coopReviveHoldIntent === next) return;
    this.coopReviveHoldIntent = next;
    if (this.pvpRoom) {
      this.pvpRoom.send('coop.revive.hold', { active: next });
    }
  }

  applyCoopReviveStatus(msg) {
    if (!this.isCoopMode) return;
    this.coopReviveState = {
      canHold: !!msg?.canHold,
      holdActive: !!msg?.holdActive,
      holdTargetSid: String(msg?.holdTargetSid || ''),
      holdStartedAt: Math.max(0, Math.floor(Number(msg?.holdStartedAt || 0))),
      holdDurationMs: Math.max(500, Math.floor(Number(msg?.holdDurationMs || COOP_REVIVE_HOLD_MS))),
      beingRevived: !!msg?.beingRevived,
      revivedBySid: String(msg?.revivedBySid || ''),
      beingRevivedStartedAt: Math.max(0, Math.floor(Number(msg?.beingRevivedStartedAt || 0)))
    };
    this.syncCoopReviveHoldIntent();
  }

  onCoopReviveDone(msg) {
    if (!this.isCoopMode) return;
    const bySid = String(msg?.bySid || '');
    const targetSid = String(msg?.targetSid || '');
    const hp = Number(msg?.hp);
    if (targetSid === this.pvpSelfSid && Number.isFinite(hp)) {
      this.playerHp = Math.max(0, hp);
      new FloatingText(this, this.player.x, this.player.y - 72, '부활!', { fontSize: 20, color: '#8ef0a7' });
    } else if (targetSid === this.pvpOpponentSid && this.pvpOpponent && Number.isFinite(hp)) {
      this.pvpOpponent.hp = Math.max(0, hp);
      new FloatingText(this, this.pvpOpponent.x, this.pvpOpponent.y - 72, '부활!', { fontSize: 20, color: '#8ef0a7' });
    }
    if (bySid === this.pvpSelfSid && targetSid && targetSid !== this.pvpSelfSid) {
      this.pvpStatusText?.setText('팀원 부활 성공');
      this.time.delayedCall(900, () => {
        if (this.pvpStatusText?.text === '팀원 부활 성공') this.pvpStatusText.setText('');
      });
    }
  }

  updateCoopReviveInput() {
    if (!this.isCoopMode) return;
    const keyDown = !!this.reviveHoldKey?.isDown;
    if (this.coopReviveHoldSources?.key !== keyDown) {
      this.coopReviveHoldSources.key = keyDown;
    }
    this.syncCoopReviveHoldIntent();
  }

  updatePvpNet(_dtSec, dtMs) {
    if (!this.pvpRoom || !this.pvpSelfSid) return;
    this.pvpSendAccMs += dtMs;
    if (this.pvpSendAccMs < 50) return;
    this.pvpSendAccMs = 0;
    const aim = this.getAimVector();
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y) && aim.lengthSq() > 1e-6) {
      this.pvpNetAim.set(aim.x, aim.y).normalize();
    }
    const mv = this.inputSystem.getMoveVec();
    this.pvpRoom.send('state', {
      mx: Number.isFinite(mv?.x) ? mv.x : 0,
      my: Number.isFinite(mv?.y) ? mv.y : 0,
      ax: this.pvpNetAim.x,
      ay: this.pvpNetAim.y,
      name: this.pvpUser?.name || 'Player'
    });
    this.pvpPingAccMs += dtMs;
    if (this.pvpPingAccMs >= 1000) {
      this.pvpPingAccMs = 0;
      this.pvpRoom.send('pvp.ping', { clientTs: Date.now() });
    }
  }

  updatePvpOpponentVisual(dtSec) {
    if (!this.pvpOpponent) return;
    const visible = !!this.pvpOpponentRevealed;
    this.pvpOpponent.body.setActive(true);
    this.pvpOpponent.body.setVisible(false);
    this.pvpOpponent.visual.setVisible(visible);
    this.pvpOpponent.body.setDepth(4);
    this.pvpOpponent.visual.setDepth(4);
    this.pvpOpponent.shadow.setVisible(visible);
    this.pvpOpponent.label.setVisible(visible);
    this.pvpOpponent.hpLabel.setVisible(visible);
    if (!visible) return;
    const predX = this.pvpOpponent.tx + (Number.isFinite(this.pvpOpponent.netVx) ? this.pvpOpponent.netVx : 0) * dtSec;
    const predY = this.pvpOpponent.ty + (Number.isFinite(this.pvpOpponent.netVy) ? this.pvpOpponent.netVy : 0) * dtSec;
    const dx = predX - this.pvpOpponent.x;
    const dy = predY - this.pvpOpponent.y;
    const dist = Math.hypot(dx, dy);
    const lerpT = Math.min(1, dtSec * 10);
    this.player.setAlpha(1);
    if (dist > 360) {
      this.pvpOpponent.x = predX;
      this.pvpOpponent.y = predY;
    } else {
      this.pvpOpponent.x += dx * lerpT;
      this.pvpOpponent.y += dy * lerpT;
    }
    this.pvpOpponent.body.setPosition(this.pvpOpponent.x, this.pvpOpponent.y);
    this.pvpOpponent.visual.setPosition(this.pvpOpponent.x, this.pvpOpponent.y).setAlpha(1).clearTint().setTint(this.isCoopMode ? 0x8fb4ff : 0xff8fb4);
    if (this.pvpOpponent.body.body) {
      this.pvpOpponent.body.body.enable = true;
      this.pvpOpponent.body.body.checkCollision.none = false;
      this.pvpOpponent.body.body.setAllowGravity(false);
      this.pvpOpponent.body.body.setVelocity(0, 0);
    }
    this.pvpOpponent.shadow.setPosition(this.pvpOpponent.x, this.pvpOpponent.y + 20);
    this.pvpOpponent.label.setPosition(this.pvpOpponent.x, this.pvpOpponent.y + 30).setText(this.pvpOpponent.name || (this.isCoopMode ? '팀원' : '상대')).setAlpha(1);
    this.pvpOpponent.hpLabel.setPosition(this.pvpOpponent.x, this.pvpOpponent.y - 30).setText(`HP ${Math.max(0, Math.floor(this.pvpOpponent.hp))} Lv.${Math.max(1, Math.floor(this.pvpOpponent.level))}`).setAlpha(1);
  }

  updatePvpRemoteShots(dtSec) {
    if (!this.pvpRemoteShots?.length) return;
    for (let i = this.pvpRemoteShots.length - 1; i >= 0; i -= 1) {
      const s = this.pvpRemoteShots[i];
      if (!s || !s.active) {
        this.pvpRemoteShots.splice(i, 1);
        continue;
      }
      s.life -= dtSec;
      s.x += s.vx * dtSec;
      s.y += s.vy * dtSec;
      s.setPosition(s.x, s.y);
      if (s.life <= 0) {
        s.destroy();
        this.pvpRemoteShots.splice(i, 1);
      }
    }
  }

  onBulletHitPvpOpponent(bullet) {
    if (this.isCoopMode) return;
    if (!this.isPvpMode || !this.pvpRoom) return;
    if (!this.pvpRoundStarted) return;
    if (!bullet?.active) return;
    if (!bullet.hitIds) bullet.hitIds = new Set();
    if (bullet.hitIds?.has('pvp-opponent')) return;

    let dmg = Math.max(1, Math.floor((bullet.damage ?? 10) * this.relicDamageMul));
    const critChanceTotal = this.critChance + this.relicCritChanceFlat;
    if (critChanceTotal > 0 && Math.random() < critChanceTotal) {
      dmg = Math.floor(dmg * 1.6 * this.relicCritDamageMul);
    }

    bullet.hitIds?.add('pvp-opponent');
    if (!bullet.pierce) bullet.destroy();
    const aim = this.getAimVector();
    this.pvpRoom.send('pvp.damage', {
      toSid: this.pvpOpponentSid || '',
      damage: dmg,
      kind: 'basic',
      key: 'BASIC',
      hitId: this.nextPvpHitId('pb'),
      ax: Number.isFinite(aim?.x) ? aim.x : undefined,
      ay: Number.isFinite(aim?.y) ? aim.y : undefined
    });
  }

  getPvpOpponentPoint() {
    if (!this.pvpOpponent) return null;
    return {
      x: Number.isFinite(this.pvpOpponent.x) ? this.pvpOpponent.x : this.pvpOpponent.body?.x,
      y: Number.isFinite(this.pvpOpponent.y) ? this.pvpOpponent.y : this.pvpOpponent.body?.y
    };
  }

  canHitPvpOpponent() {
    if (this.isCoopMode) return false;
    return !!(this.isPvpMode && this.pvpRoom && this.pvpOpponentSid && this.pvpRoundStarted && this.pvpOpponentRevealed);
  }

  nextPvpHitId(prefix = 'h') {
    this.pvpHitSeq = (Number(this.pvpHitSeq || 0) + 1) % 2147483647;
    if (this.pvpHitSeq <= 0) this.pvpHitSeq = 1;
    return `${prefix}_${Date.now().toString(36)}_${this.pvpHitSeq.toString(36)}`;
  }

  tryPvpSkillDamage(rawDamage, key = 'SKILL', cooldownMs = 0) {
    if (!this.canHitPvpOpponent()) return false;
    const now = this.time.now;
    const cdKey = String(key || 'SKILL');
    if (cooldownMs > 0) {
      const until = Number(this.pvpSkillHitUntil[cdKey] || 0);
      if (until > now) return false;
      this.pvpSkillHitUntil[cdKey] = now + cooldownMs;
    }
    const dmg = Math.max(1, Math.floor(Number(rawDamage || 0) * this.relicDamageMul));
    if (!dmg) return false;
    const aim = this.getAimVector();
    this.pvpRoom.send('pvp.damage', {
      toSid: this.pvpOpponentSid || '',
      damage: dmg,
      kind: 'skill',
      key: cdKey,
      hitId: this.nextPvpHitId('ps'),
      ax: Number.isFinite(aim?.x) ? aim.x : undefined,
      ay: Number.isFinite(aim?.y) ? aim.y : undefined
    });
    return true;
  }

  sendPvpFx(type, payload = {}) {
    if (!this.isPvpMode || !this.pvpRoom || !this.pvpRoundStarted) return;
    this.pvpRoom.send('pvp.fx', { type, ...payload });
  }

  sendPveDamage(enemyId, damage, key = 'BASIC', kind = 'basic', aim = null, hitId = '') {
    if (!this.isPvpMode || !this.pvpRoom || !this.pvpRoundStarted) return;
    if (!enemyId) return;
    const dmg = Math.max(1, Math.floor(Number(damage || 0)));
    if (!dmg) return;
    const ax = Number.isFinite(aim?.x) ? Number(aim.x) : undefined;
    const ay = Number.isFinite(aim?.y) ? Number(aim.y) : undefined;
    this.pvpRoom.send('pve.damage', {
      id: enemyId,
      damage: dmg,
      key: String(key || 'BASIC'),
      kind: String(kind || 'basic'),
      hitId: String(hitId || this.nextPvpHitId('pe')),
      ...(Number.isFinite(ax) ? { ax } : {}),
      ...(Number.isFinite(ay) ? { ay } : {})
    });
  }

  onPvpFxMessage(msg) {
    if (!this.isPvpMode) return;
    const fromSid = String(msg?.fromSid || '');
    if (!fromSid || fromSid === this.pvpSelfSid) return;
    if (this.pvpOpponentSid && fromSid !== this.pvpOpponentSid) return;

    const type = String(msg?.type || '');
    const key = String(msg?.key || '');
    const x = Number(msg?.x);
    const y = Number(msg?.y);
    const ax = Number(msg?.ax);
    const ay = Number(msg?.ay);
    const ox = Number.isFinite(x) ? x : (this.pvpOpponent?.x ?? this.player.x);
    const oy = Number.isFinite(y) ? y : (this.pvpOpponent?.y ?? this.player.y);
    const vx = Number.isFinite(ax) ? ax : (this.player.x - ox);
    const vy = Number.isFinite(ay) ? ay : (this.player.y - oy);
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;

    if (type === 'fire') {
      const shot = this.add.image(ox, oy, 'tex_bullet').setDepth(4);
      shot.setDisplaySize(20, 7);
      shot.setTint(0xeaf4ff);
      shot.setRotation(Math.atan2(ny, nx));
      const speed = 660 * this.combatPace;
      shot.vx = nx * speed;
      shot.vy = ny * speed;
      const distToMe = Math.hypot(this.player.x - ox, this.player.y - oy);
      shot.life = Phaser.Math.Clamp(distToMe / Math.max(1, speed) + 0.12, 0.18, 1.8);
      this.pvpRemoteShots.push(shot);
      this.emitBurst(ox, oy, { count: 5, tint: 0xcfe9ff, speedMin: 40, speedMax: 120, scaleStart: 0.7, lifespan: 120 });
      return;
    }

    if (type === 'skill') {
      const rank = Math.max(1, Math.floor(Number(msg?.rank || 1)));
      const rangeMul = Math.max(0.5, Number(msg?.rangeMul || 1));
      switch (key) {
        case 'SHOCKWAVE': {
          const radius = (70 + 5 * rank) * rangeMul * 1.5;
          const ring = this.add.circle(ox, oy, 12, 0x7ea0ff, 0.15).setDepth(8);
          ring.setStrokeStyle(3, 0x7ea0ff, 0.8).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: ring, radius, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
          const ring2 = this.add.circle(ox, oy, 8, 0xeaf4ff, 0.08).setDepth(8);
          ring2.setStrokeStyle(2, 0xeaf4ff, 0.72).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: ring2, radius: radius * 0.82, alpha: 0, duration: 220, onComplete: () => ring2.destroy() });
          this.emitBurst(ox, oy, { count: 20, tint: 0x8bc6ff, speedMin: 90, speedMax: 280, lifespan: 260 });
          break;
        }
        case 'LASER': {
          const width = (14 + 2 * rank) * (1 + (rangeMul - 1) * 0.7);
          const range = (720 + 40 * rank) * rangeMul;
          const x2 = ox + nx * range;
          const y2 = oy + ny * range;
          const g = this.add.graphics().setDepth(8);
          g.lineStyle(width, 0x7ea0ff, 0.35);
          g.beginPath();
          g.moveTo(ox, oy);
          g.lineTo(x2, y2);
          g.strokePath();
          g.lineStyle(Math.max(2, width * 0.28), 0xeaf4ff, 0.75);
          g.beginPath();
          g.moveTo(ox, oy);
          g.lineTo(x2, y2);
          g.strokePath();
          g.setBlendMode(Phaser.BlendModes.ADD);
          const g2 = this.add.graphics().setDepth(8);
          g2.lineStyle(Math.max(1.5, width * 0.14), 0xffffff, 0.95);
          g2.beginPath();
          g2.moveTo(ox, oy);
          g2.lineTo(x2, y2);
          g2.strokePath();
          g2.setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: g, alpha: 0, duration: 130, onComplete: () => g.destroy() });
          this.tweens.add({ targets: g2, alpha: 0, duration: 120, onComplete: () => g2.destroy() });
          break;
        }
        case 'GRENADE': {
          const throwRange = (210 + 14 * rank) * rangeMul;
          const gx = ox + nx * throwRange;
          const gy = oy + ny * throwRange;
          const marker = this.add.circle(gx, gy, 24, 0xffb86b, 0.06).setDepth(6);
          marker.setStrokeStyle(2, 0xffb86b, 0.45).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: marker, alpha: 0, duration: 250, onComplete: () => marker.destroy() });
          this.emitBurst(gx, gy, { count: 10, tint: 0xffc857, speedMin: 40, speedMax: 150, scaleStart: 0.7, lifespan: 160 });
          break;
        }
        case 'DASH': {
          const dist = (210 + 16 * rank) * rangeMul;
          const ex = ox + nx * dist;
          const ey = oy + ny * dist;
          const g = this.add.graphics().setDepth(7);
          g.lineStyle(5, 0x7ea0ff, 0.42);
          g.beginPath();
          g.moveTo(ox, oy);
          g.lineTo(ex, ey);
          g.strokePath();
          g.setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() });
          this.emitBurst(ex, ey, { count: 12, tint: 0x8bc6ff, speedMin: 80, speedMax: 220, lifespan: 190 });
          break;
        }
        case 'FWD_SLASH':
          this.emitSwish(ox, oy, Math.atan2(ny, nx), 76, 0xfff0cf, 140);
          this.emitBurst(ox + nx * 52, oy + ny * 52, { count: 12, tint: 0xfff0cf, speedMin: 110, speedMax: 240, lifespan: 140 });
          break;
        case 'SPIN_SLASH':
          this.emitSpokes(ox, oy, { count: 12, inner: 16, outer: 86, color: 0xff9f7f, width: 3, alpha: 0.72, duration: 160 });
          break;
        case 'CHAIN_LIGHTNING':
          this.drawLightning(ox, oy, ox + nx * 140, oy + ny * 140, 0xb18cff);
          break;
        case 'BLIZZARD':
          this.emitBurst(ox + nx * 88, oy + ny * 88, { count: 16, tint: 0xbad9ff, speedMin: 40, speedMax: 140, scaleStart: 0.65, lifespan: 210 });
          break;
        case 'FIRE_BOLT':
          this.emitFlameSmoke(ox, oy, nx, ny, 0.8);
          this.emitBurst(ox + nx * 84, oy + ny * 84, { count: 9, tint: 0xffbf7a, speedMin: 55, speedMax: 160, scaleStart: 0.65, lifespan: 170 });
          break;
        default:
          this.emitBurst(ox, oy, { count: 5, tint: 0xb6c7ff, speedMin: 30, speedMax: 100, scaleStart: 0.55, lifespan: 110 });
          break;
      }
    }
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
        const key = this.abilitySystem.activeSlots[slot];
        if (!this.isDragAimSkill(key)) {
          this.tryCastSkillSlot(slot);
          return;
        }
        this.skillDragState = {
          slot,
          pointerId: p.id,
          startX: p.x,
          startY: p.y,
          originX: btn.x,
          originY: btn.y,
          drag: false,
          pointerX: p.x,
          pointerY: p.y,
          requiresAim: true
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
        if (st.requiresAim && st.drag) {
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
      if (st.requiresAim && st.drag) {
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
    const fontDisplay = HUD_FONT_DISPLAY;
    const fontBody = HUD_FONT_BODY;

    this.ui.topRibbon = this.add.rectangle(0, 0, 360, 50, HUD_COLOR_PANEL_DARK, 0.54).setOrigin(0.5, 0).setScrollFactor(0).setVisible(false);
    this.ui.topRibbon.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.92);
    this.ui.topRibbonGlow = this.add.rectangle(0, 0, 356, 2, HUD_COLOR_ACCENT, 0.58).setOrigin(0.5, 0).setScrollFactor(0).setVisible(false);

    this.ui.goldPanel = this.add.rectangle(0, 0, 144, 30, HUD_COLOR_PANEL, 0.78).setOrigin(0, 0).setScrollFactor(0).setVisible(false);
    this.ui.goldPanel.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.gold = this.add.text(0, 0, '', { fontFamily: fontDisplay, fontSize: '16px', color: HUD_COLOR_GOLD }).setScrollFactor(0);
    this.ui.coin = this.add.image(0, 0, 'tex_gold').setScale(0.78).setScrollFactor(0);

    this.ui.minimapBg = this.add.rectangle(0, 0, 122, 84, HUD_COLOR_PANEL_DARK, 0.84).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimapBg.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.minimap = this.add.graphics().setScrollFactor(0);

    this.ui.stage = this.add.text(this.scale.width / 2, 11, '', {
      fontFamily: fontDisplay,
      fontSize: '18px',
      color: HUD_COLOR_TEXT_MAIN
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.stageSub = this.add.text(this.scale.width / 2, 27, '', {
      fontFamily: fontBody,
      fontSize: '10px',
      color: HUD_COLOR_TEXT_SUB
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.modeObjective = this.add.text(this.scale.width / 2, 41, '', {
      fontFamily: fontBody,
      fontSize: '10px',
      color: '#89d5ff'
    }).setOrigin(0.5, 0).setScrollFactor(0);

    this.ui.timePanel = this.add.rectangle(0, 0, 86, 30, HUD_COLOR_PANEL, 0.78).setOrigin(0, 0).setScrollFactor(0);
    this.ui.timePanel.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.time = this.add.text(this.scale.width - 18, 13, '', {
      fontFamily: fontDisplay,
      fontSize: '17px',
      color: HUD_COLOR_TEXT_MAIN
    }).setOrigin(1, 0.5).setScrollFactor(0);
    this.ui.ping = this.add.text(this.scale.width - 18, 34, '', {
      fontFamily: fontBody,
      fontSize: '10px',
      color: HUD_COLOR_TEXT_SUB
    }).setOrigin(1, 0).setScrollFactor(0);

    this.ui.bossHpFrame = this.add.rectangle(this.scale.width * 0.5, 94, Math.min(420, this.scale.width - 120) + 16, 22, HUD_COLOR_PANEL_DARK, 0.9)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.ui.bossHpFrame.setStrokeStyle(2, 0x6c3146, 0.95);
    this.ui.bossHpBg = this.add.rectangle(this.scale.width * 0.5, 94, Math.min(420, this.scale.width - 120), 10, 0x2f1823, 0.98)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.ui.bossHpFill = this.add.rectangle(this.scale.width * 0.5, 94, Math.min(420, this.scale.width - 120), 10, 0xff7361, 0.98)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.ui.bossHpLabel = this.add.text(this.scale.width * 0.5, 77, '보스', {
      fontFamily: fontDisplay,
      fontSize: '13px',
      color: '#ffd9c8'
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

    this.ui.xpBarBg = this.add.rectangle(0, 0, this.scale.width, 8, 0x0f1d31, 0.98).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarBg.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 1);
    this.ui.xpBarFill = this.add.rectangle(0, 0, this.scale.width, 8, HUD_COLOR_XP, 0.96).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarEdge = this.add.rectangle(0, 0, this.scale.width, 1, 0xa8ebff, 0.65).setOrigin(0, 1).setScrollFactor(0);

    this.ui.statusBg = this.add.rectangle(0, 0, 300, 72, HUD_COLOR_PANEL, 0.84).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusBg.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.96);
    this.ui.statusAccent = this.add.rectangle(0, 0, 4, 70, HUD_COLOR_ACCENT, 0.3).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusLine = this.add.rectangle(0, 0, 0, 10, 0x0c1628, 0.98).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusLine.setStrokeStyle(1, 0x294d74, 1);
    this.ui.statusLineFill = this.add.rectangle(0, 0, 0, 8, HUD_COLOR_HP_SAFE, 0.98).setOrigin(0, 0).setScrollFactor(0);
    this.ui.hp = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '15px', color: HUD_COLOR_TEXT_MAIN }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.shield = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '13px', color: '#8fcfff' }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.synergy = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '11px', color: '#79caef' }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.shieldCells = [];
    for (let i = 0; i < 5; i += 1) {
      const cell = this.add.rectangle(0, 0, 10, 8, 0x1a2e47, 0.62).setOrigin(0.5, 0.5).setScrollFactor(0);
      cell.setStrokeStyle(1, 0x3e6288, 0.95);
      cell._shieldFilled = false;
      this.ui.shieldCells.push(cell);
    }

    this.ui.skillSlots = [];
    for (let i = 0; i < 4; i += 1) {
      const bg = this.add.rectangle(0, 0, 52, 52, 0x0f1b2e, 0.86).setOrigin(0.5).setScrollFactor(0);
      const border = this.add.rectangle(0, 0, 52, 52).setOrigin(0.5).setScrollFactor(0);
      border.setStrokeStyle(2, 0x33577d, 1);
      const num = this.add.text(0, 0, String(i + 1), {
        fontFamily: fontDisplay,
        fontSize: '12px',
        color: '#8db1d4'
      }).setOrigin(0, 0).setScrollFactor(0);
      const iconSprite = this.add.image(0, 0, 'tex_gold').setVisible(false).setScrollFactor(0);
      const icon = this.add.text(0, 0, '-', {
        fontFamily: fontDisplay,
        fontSize: '12px',
        color: '#e5f2ff',
        align: 'center'
      }).setOrigin(0.5).setScrollFactor(0);
      const rank = this.add.text(0, 0, '', {
        fontFamily: fontDisplay,
        fontSize: '11px',
        color: '#ffe29b'
      }).setOrigin(1, 1).setScrollFactor(0);
      const cdText = this.add.text(0, 0, '', {
        fontFamily: fontBody,
        fontSize: '12px',
        color: '#d7eaff'
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
        rect: { x: 0, y: 0, w: 52, h: 52 }
      });
    }

    this.ui.traitArea = this.add.rectangle(0, 0, 0, 0, HUD_COLOR_PANEL_DARK, 0.62).setOrigin(0, 0).setScrollFactor(0);
    this.ui.traitArea.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 0.85);
    this.ui.traitSlots = [];
    for (let i = 0; i < MAX_UNIQUE_TRAITS_PER_RUN; i += 1) {
      const slotBg = this.add.rectangle(0, 0, 20, 20, 0x13253c, 0.84).setOrigin(0, 0).setScrollFactor(0);
      slotBg.setStrokeStyle(1, 0x2f557d, 0.92);
      const icon = this.add.image(0, 0, 'tex_gold').setVisible(false).setScrollFactor(0);
      const rank = this.add.text(0, 0, '', {
        fontFamily: fontDisplay,
        fontSize: '10px',
        color: '#ffd991'
      }).setOrigin(1, 1).setScrollFactor(0);
      this.ui.traitSlots.push({ slotBg, icon, rank });
    }

    this.ui.reviveBg = null;
    this.ui.reviveFill = null;
    this.ui.reviveLabel = null;
    this.ui.reviveHint = null;
    this.ui.reviveLayout = null;
    if (this.isCoopMode) {
      this.ui.reviveBg = this.add.rectangle(0, 0, 240, 42, 0x163457, 0.84)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      this.ui.reviveBg.setStrokeStyle(2, 0x3e6e97, 0.95);
      this.ui.reviveFill = this.add.rectangle(0, 0, 0, 38, 0x53d8a7, 0.75)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setVisible(false);
      this.ui.reviveLabel = this.add.text(0, 0, '사망한 팀원 근처로 이동', {
        fontFamily: fontBody,
        fontSize: '14px',
        color: HUD_COLOR_TEXT_MAIN
      }).setOrigin(0.5).setScrollFactor(0);
      this.ui.reviveHint = this.add.text(0, 0, '', {
        fontFamily: fontBody,
        fontSize: '12px',
        color: HUD_COLOR_TEXT_SUB
      }).setOrigin(0.5).setScrollFactor(0);

      this.ui.reviveBg.on('pointerdown', () => this.setCoopReviveHoldSource('pointer', true));
      this.ui.reviveBg.on('pointerup', () => this.setCoopReviveHoldSource('pointer', false));
      this.ui.reviveBg.on('pointerout', () => this.setCoopReviveHoldSource('pointer', false));
      this.coopRevivePointerUpHandler = () => this.setCoopReviveHoldSource('pointer', false);
      this.input.on('pointerup', this.coopRevivePointerUpHandler);
    }

    const hudDepth = 1000;
    [
      this.ui.topRibbon,
      this.ui.topRibbonGlow,
      this.ui.goldPanel,
      this.ui.gold,
      this.ui.coin,
      this.ui.minimapBg,
      this.ui.stage,
      this.ui.stageSub,
      this.ui.modeObjective,
      this.ui.timePanel,
      this.ui.time,
      this.ui.ping,
      this.ui.bossHpFrame,
      this.ui.bossHpBg,
      this.ui.bossHpFill,
      this.ui.bossHpLabel,
      this.ui.xpBarBg,
      this.ui.xpBarFill,
      this.ui.xpBarEdge,
      this.ui.statusBg,
      this.ui.statusAccent,
      this.ui.statusLine,
      this.ui.statusLineFill,
      this.ui.hp,
      this.ui.shield,
      this.ui.synergy,
      this.ui.traitArea
    ].filter(Boolean).forEach((obj) => obj.setDepth(hudDepth));

    if (this.ui.reviveBg) {
      this.ui.reviveBg.setDepth(hudDepth + 5);
      this.ui.reviveFill?.setDepth(hudDepth + 6);
      this.ui.reviveLabel?.setDepth(hudDepth + 7);
      this.ui.reviveHint?.setDepth(hudDepth + 7);
    }

    this.ui.minimap.setDepth(hudDepth + 1);
    this.ui.skillSlots.forEach((slot) => {
      slot.bg.setDepth(hudDepth);
      slot.border.setDepth(hudDepth + 1);
      slot.num.setDepth(hudDepth + 2);
      slot.iconSprite.setDepth(hudDepth + 1);
      slot.icon.setDepth(hudDepth + 1);
      slot.rank.setDepth(hudDepth + 2);
      slot.cdText.setDepth(hudDepth + 2);
      slot.cdOverlay.setDepth(hudDepth + 3);
    });
    this.ui.traitSlots.forEach((slot) => {
      slot.slotBg.setDepth(hudDepth);
      slot.icon.setDepth(hudDepth + 1);
      slot.rank.setDepth(hudDepth + 2);
    });
    this.ui.shieldCells.forEach((cell) => cell.setDepth(hudDepth + 2));

    this.layoutHud(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize) => this.layoutHud(gameSize.width, gameSize.height));
  }

  layoutHud(w, h) {
    const xpH = 8;
    const pad = w < 720 ? 8 : 12;

    const goldW = w < 720 ? 132 : 144;
    this.ui.goldPanel.setPosition(pad, 8).setSize(goldW, 30);
    this.ui.coin.setPosition(pad + 12, 22);
    this.ui.gold.setPosition(pad + 26, 11);

    const pauseW = 30;
    const timeW = w < 720 ? 78 : 86;
    const topRowY = 8;
    const topRowH = 30;
    const rightX = w - pad;
    const pauseGap = 6;
    const timeX = rightX - pauseW - pauseGap - timeW;
    this.ui.timePanel.setPosition(timeX, topRowY).setSize(timeW, topRowH);
    this.ui.time.setPosition(timeX + timeW - 8, topRowY + topRowH * 0.5);
    if (this.pauseUi?.pauseBtn?.active && this.pauseUi?.pauseTxt?.active) {
      const px = rightX - pauseW * 0.5;
      const py = topRowY + topRowH * 0.5;
      this.pauseUi.pauseBtn.setPosition(px, py);
      this.pauseUi.pauseBtn.setSize(30, 30);
      this.pauseUi.pauseTxt.setPosition(px, py);
    }

    const mmW = w < 720 ? 104 : 122;
    const mmH = w < 720 ? 72 : 84;
    const mmX = w - pad - mmW;
    const mmY = topRowY + topRowH + 6;
    this.ui.minimapBg.setPosition(mmX, mmY).setSize(mmW, mmH);
    this.ui.minimapLayout = { x: mmX, y: mmY, w: mmW, h: mmH, pad: 4 };
    this.ui.ping.setPosition(mmX + mmW, mmY + mmH + 4);

    this.ui.stage.setPosition(w * 0.5, 10);
    this.ui.stageSub.setPosition(w * 0.5, 27);
    this.ui.modeObjective.setPosition(w * 0.5, 41);
    const stageWrap = Math.max(180, Math.min(340, Math.floor(w * 0.32)));
    this.ui.stage.setWordWrapWidth(stageWrap, true);
    this.ui.stageSub.setWordWrapWidth(stageWrap, true);
    this.ui.modeObjective.setWordWrapWidth(stageWrap, true);

    const bossW = Math.min(500, Math.max(260, w - 180));
    this.ui.bossHpFrame.setPosition(w * 0.5, 84).setSize(bossW + 16, 22);
    this.ui.bossHpBg.setPosition(w * 0.5, 84).setSize(bossW, 10);
    this.ui.bossHpFill.setPosition((w * 0.5) - (bossW * 0.5), 84).setSize(bossW, 10);
    this.ui.bossHpLabel.setPosition(w * 0.5, 69);

    this.ui.xpBarBg.setPosition(0, h);
    this.ui.xpBarBg.setSize(w, xpH);
    this.ui.xpBarFill.setPosition(0, h);
    this.ui.xpBarFill.setSize(w, xpH);
    this.ui.xpBarEdge.setPosition(0, h - xpH + 1).setSize(w, 1);

    const statusW = Math.min(300, Math.max(220, Math.floor(w * 0.36)));
    const statusH = 72;
    const statusX = pad;
    const statusY = h - xpH - 8 - statusH;
    this.ui.statusBg.setPosition(statusX, statusY).setSize(statusW, statusH);
    this.ui.statusAccent.setPosition(statusX + 1, statusY + 1).setSize(4, statusH - 2);
    this.ui.statusLine.setPosition(statusX + 14, statusY + 36).setSize(statusW - 28, 10);
    this.ui.statusLineFill.setPosition(statusX + 15, statusY + 37).setSize(Math.max(0, statusW - 30), 8);
    this.ui.hp.setPosition(statusX + 14, statusY + 8);
    this.ui.shield.setPosition(statusX + 14, statusY + 23);
    this.ui.synergy.setPosition(statusX + 14, statusY + 54);
    this.ui.synergy.setWordWrapWidth(Math.max(60, statusW - 116), true);
    const shieldCellSize = 8;
    const shieldGap = 4;
    const shieldCount = this.ui.shieldCells?.length || 0;
    const shieldW = shieldCount > 0 ? (shieldCount * shieldCellSize) + ((shieldCount - 1) * shieldGap) : 0;
    const shieldX = statusX + statusW - 12 - shieldW;
    const shieldY = statusY + statusH - 16;
    this.ui.shieldCells?.forEach((cell, i) => {
      const cx = shieldX + i * (shieldCellSize + shieldGap) + shieldCellSize * 0.5;
      const cy = shieldY + shieldCellSize * 0.5;
      cell.setPosition(cx, cy).setSize(shieldCellSize, shieldCellSize);
    });
    this.ui.statusLayout = { x: statusX, y: statusY, w: statusW, h: statusH };

    const box = w < 720 ? 46 : 52;
    const gap = w < 720 ? 6 : 8;
    const gridW = box * 2 + gap;
    const gridH = box * 2 + gap;
    const gridX = w - pad - gridW;
    const gridY = h - xpH - 8 - gridH;
    this.ui.skillSlots.forEach((slot, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const x = gridX + c * (box + gap);
      const y = gridY + r * (box + gap);
      slot.rect = { x, y, w: box, h: box };
      slot.bg.setPosition(x + box * 0.5, y + box * 0.5).setSize(box, box);
      slot.border.setPosition(x + box * 0.5, y + box * 0.5).setSize(box, box);
      slot.num.setPosition(x + 4, y + 2).setFontSize(Math.max(10, Math.floor(box * 0.18)));
      slot.iconSprite.setPosition(x + box * 0.5, y + box * 0.5 + 1).setDisplaySize(box * 0.4, box * 0.4).setAlpha(0.98);
      slot.icon.setPosition(x + box * 0.5, y + box * 0.5 + 2).setFontSize(Math.max(10, Math.floor(box * 0.21)));
      slot.rank.setPosition(x + box - 5, y + box - 5).setFontSize(Math.max(10, Math.floor(box * 0.18)));
      slot.cdText.setPosition(x + box * 0.5, y + box * 0.5).setFontSize(Math.max(10, Math.floor(box * 0.19)));

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

    if (this.ui.reviveBg && this.ui.reviveFill && this.ui.reviveLabel && this.ui.reviveHint) {
      const reviveW = Math.min(320, Math.max(190, Math.floor(w * (this.isMobileTouch ? 0.52 : 0.28))));
      const reviveH = this.isMobileTouch ? 46 : 42;
      const reviveX = Math.floor(w * 0.5);
      const reviveY = h - xpH - (this.isMobileTouch ? 124 : 34);
      this.ui.reviveBg.setPosition(reviveX, reviveY).setSize(reviveW, reviveH);
      this.ui.reviveFill.setPosition(reviveX - reviveW * 0.5 + 2, reviveY).setSize(0, reviveH - 4);
      this.ui.reviveLabel.setPosition(reviveX, reviveY);
      this.ui.reviveHint.setPosition(reviveX, reviveY - Math.floor(reviveH * 0.92));
      this.ui.reviveLayout = { x: reviveX, y: reviveY, w: reviveW, h: reviveH };
    }

    const traitCols = Math.min(8, Math.max(1, this.ui.traitSlots.length));
    const traitIconSize = w < 720 ? 12 : 13;
    const traitGap = w < 720 ? 8 : 9;
    const traitRowW = (traitCols * traitIconSize) + ((traitCols - 1) * traitGap);
    const traitStartX = statusX + statusW - 12 - traitRowW;
    const traitY = statusY + 8;
    this.ui.traitArea.setVisible(false).setPosition(0, 0).setSize(0, 0);
    this.ui.traitLayout = {
      x: traitStartX,
      y: traitY,
      iconSize: traitIconSize,
      cols: traitCols,
      gap: traitGap,
      visible: true
    };
    this.ui.traitSlots.forEach((slot, i) => {
      const sx = traitStartX + i * (traitIconSize + traitGap);
      const sy = traitY;
      slot.slotBg.setVisible(false).setPosition(sx, sy).setSize(traitIconSize, traitIconSize);
      slot.icon.setVisible(false).setPosition(sx + traitIconSize * 0.5, sy + traitIconSize * 0.5).setDisplaySize(traitIconSize - 2, traitIconSize - 2);
      slot.rank.setVisible(false).setPosition(sx + traitIconSize - 1, sy + traitIconSize - 1).setFontSize(9);
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
    mm.fillStyle(0x081223, 0.92);
    mm.fillRect(ox, oy, iw, ih);
    mm.lineStyle(1, 0x23486c, 0.35);
    mm.strokeRect(ox, oy, iw, ih);

    const gx = ox + iw * 0.5;
    const gy = oy + ih * 0.5;
    mm.lineStyle(1, 0x274d72, 0.22);
    mm.beginPath();
    mm.moveTo(gx, oy);
    mm.lineTo(gx, oy + ih);
    mm.moveTo(ox, gy);
    mm.lineTo(ox + iw, gy);
    mm.strokePath();

    const enemies = this.enemies?.getChildren?.() ?? [];
    const stride = Math.max(1, Math.ceil(enemies.length / 70));
    mm.fillStyle(0xff8d6f, 0.86);
    for (let i = 0; i < enemies.length; i += stride) {
      const e = enemies[i];
      if (!e?.active) continue;
      const ex = ox + e.x * scaleX;
      const ey = oy + e.y * scaleY;
      mm.fillCircle(ex, ey, 1.4);
    }

    const px = ox + this.player.x * scaleX;
    const py = oy + this.player.y * scaleY;
    mm.fillStyle(0xb5ecff, 1);
    mm.fillCircle(px, py, 2.2);
    mm.lineStyle(1, 0x4cc9f0, 0.9);
    mm.strokeCircle(px, py, 3.6);

    if (this.isPvpMode && this.pvpOpponentRevealed && this.pvpOpponent) {
      const oxp = ox + this.pvpOpponent.x * scaleX;
      const oyp = oy + this.pvpOpponent.y * scaleY;
      mm.fillStyle(0xffb1a6, 0.95);
      mm.fillCircle(oxp, oyp, 2.2);
      mm.lineStyle(1, 0xff8d6f, 0.9);
      mm.strokeCircle(oxp, oyp, 3.4);
    }

    const cam = this.cameras?.main;
    if (cam?.worldView) {
      const vx = ox + cam.worldView.x * scaleX;
      const vy = oy + cam.worldView.y * scaleY;
      const vw = cam.worldView.width * scaleX;
      const vh = cam.worldView.height * scaleY;
      mm.lineStyle(1, 0x4cc9f0, 0.55);
      mm.strokeRect(vx, vy, vw, vh);
    }
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
    if (this.isPvpMode && !this.pvpCanControl) return;
    if (this.isCoopMode && this.isPvpMode && this.playerHp <= 0) return;

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
    this.inputSystem.setLocked(this.isPvpMode ? this.pauseActive : next);
    if (this.isPvpMode) return;
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
      if (!this.isPvpMode) this.physics.world.pause();
      this.inputSystem.setLocked(true);
      this.pauseUi.layoutPause?.();
      this.pauseUi.root.setVisible(true).setAlpha(0);
      this.pauseUi.card.setScale(0.96);
      this.pauseUi.cardShadow?.setScale(0.96);
      this.refreshPauseUi();
      this.tweens.killTweensOf(this.pauseUi.root);
      this.tweens.killTweensOf(this.pauseUi.card);
      this.tweens.killTweensOf(this.pauseUi.cardShadow);
      this.tweens.add({ targets: this.pauseUi.root, alpha: 1, duration: 130, ease: 'Sine.Out' });
      this.tweens.add({ targets: [this.pauseUi.card, this.pauseUi.cardShadow], scaleX: 1, scaleY: 1, duration: 180, ease: 'Cubic.Out' });
    } else {
      if (!this.isPvpMode) this.physics.world.resume();
      this.inputSystem.setLocked(this.isPvpMode ? !this.pvpCanControl : false);
      this.pauseUi.root.setVisible(false);
    }
  }

  setPaused(active) {
    if (!!active === this.pauseActive) return;
    this.togglePause();
  }

  tryOpenLevelup() {
    if (this.levelupActive) return;
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
    if (this.isPvpMode && this.pvpRoom) {
      if (this.pvpLevelupPending) return;
      this.pvpLevelupPending = true;
      this.pvpRoom.send('pvp.levelup.pick', { key: String(key || '') });
      return;
    }
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
    this.playerMaxHpBase += 10 * n;
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
    const dtSec = dt / 1000;
    this.updateCoopReviveInput();

    if (this.levelupActive && !this.isPvpMode) {
      this.updateHud();
      return;
    }

    if (this.pauseActive && !this.isPvpMode) {
      this.updateHud();
      return;
    }

    if (this.isPvpMode && !this.pvpRoundStarted) {
      this.player.body.setVelocity(0, 0);
      this.updatePvpOpponentVisual(dtSec);
      this.updateHud();
      this.updateMobileControls();
      this.drawAimCursor();
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
    this.tickSkillCooldowns(dt / 1000);
    this.updateGrenades(dt / 1000);
    this.updateShieldRegen(dt / 1000);
    this.updateBlizzards(dt / 1000);
    this.updateSpinAuras(dt / 1000);
    this.updateFireBolts(dt / 1000);
    this.updateSpawnWarnings(dtSec);
    this.updateLineWarnings(dtSec);
    this.updateBossLasers(dtSec);
    this.updateDefenseCore(dtSec);
    this.playerInvulnSec = Math.max(0, this.playerInvulnSec - dtSec);

    if (!this.isPvpMode) {
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
    } else {
      this.hpRegenAcc = 0;
    }

    this.inputSystem.update();
    const coopSelfDown = !!(this.isCoopMode && this.isPvpMode && this.playerHp <= 0);
    const mv = coopSelfDown ? { x: 0, y: 0 } : this.inputSystem.getMoveVec();
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
    if (!coopSelfDown && this.inputSystem.isFiring() && this.fireAcc >= fireInterval) {
      this.fireAcc = 0;
      this.fireBullet();
      this.playActionSfx('fire');
    }

    if (this.isPvpMode) {
      this.updatePvpEnemyDirector(dt);
    } else {
      this.stageDirector.update(dt, this);
    }

    this.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      if (this.isPvpMode && e.netId) {
        const tx = Number.isFinite(e.netTx) ? e.netTx : e.x;
        const ty = Number.isFinite(e.netTy) ? e.netTy : e.y;
        const predX = tx + (Number.isFinite(e.netVx) ? e.netVx : 0) * dtSec;
        const predY = ty + (Number.isFinite(e.netVy) ? e.netVy : 0) * dtSec;
        const dxn = predX - e.x;
        const dyn = predY - e.y;
        const dist = Math.hypot(dxn, dyn);
        if (dist > 260) {
          e.x = predX;
          e.y = predY;
        } else {
          const lerpT = Math.min(1, dtSec * 10);
          e.x += dxn * lerpT;
          e.y += dyn * lerpT;
        }
        e.body.setVelocity(0, 0);
        e.setPosition(e.x, e.y);
        if (e.shadow) e.shadow.setPosition(e.x, e.y + (e.body?.radius ?? 14) + 7);
        return;
      }
      const skipMove = this.updateMiniBossPattern(e, dtSec);
      if (skipMove) return;
      let speedMul = 1;
      if ((e._blizzardSlowUntil ?? 0) > this.time.now) {
        speedMul = Math.min(speedMul, e._blizzardSlowMul ?? 1);
      }
      let target = this.runMode === 'defense' && this.defenseCore
        ? { x: this.defenseCore.x, y: this.defenseCore.y }
        : { x: this.player.x, y: this.player.y };
      if (this.isPvpMode && this.pvpOpponentRevealed && this.pvpOpponent) {
        const p1 = { x: this.player.x, y: this.player.y };
        const p2 = { x: this.pvpOpponent.x, y: this.pvpOpponent.y };
        const d1 = Phaser.Math.Distance.Between(e.x, e.y, p1.x, p1.y);
        const d2 = Phaser.Math.Distance.Between(e.x, e.y, p2.x, p2.y);
        target = d1 <= d2 ? p1 : p2;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.body.setVelocity((dx / len) * e.speed * speedMul * this.enemyPace, (dy / len) * e.speed * speedMul * this.enemyPace);
      if (e.shadow) e.shadow.setPosition(e.x, e.y + (e.body?.radius ?? 14) + 7);
    });

    this.bullets.children.iterate((b) => {
      if (!b || !b.active) return;
      if (this.isPvpMode && this.pvpRoundStarted && this.pvpOpponentSid && this.pvpOpponent) {
        const ox = Number.isFinite(this.pvpOpponent.body?.x) ? this.pvpOpponent.body.x : this.pvpOpponent.x;
        const oy = Number.isFinite(this.pvpOpponent.body?.y) ? this.pvpOpponent.body.y : this.pvpOpponent.y;
        const dx = b.x - ox;
        const dy = b.y - oy;
        const rr = 24;
        if ((dx * dx + dy * dy) <= rr * rr) {
          this.onBulletHitPvpOpponent(b);
          if (!b.active) return;
        }
      }
      if (b.x < -50 || b.x > this.physics.world.bounds.width + 50 || b.y < -50 || b.y > this.physics.world.bounds.height + 50) {
        b.destroy();
      }
    });

    if (this.isPvpMode) {
      this.player.setAlpha(1).clearTint();
      if (this.player.body) {
        this.player.body.enable = true;
        this.player.body.checkCollision.none = false;
      }
      if (this.pvpOpponent) {
        this.pvpOpponent.body.setVisible(false).setActive(true);
        this.pvpOpponent.visual.setAlpha(1).setVisible(!!this.pvpOpponentRevealed).setActive(true);
        this.pvpOpponent.shadow.setVisible(!!this.pvpOpponentRevealed).setAlpha(0.45);
        this.pvpOpponent.label.setVisible(!!this.pvpOpponentRevealed).setAlpha(1);
        this.pvpOpponent.hpLabel.setVisible(!!this.pvpOpponentRevealed).setAlpha(1);
      }
      this.updatePvpRemoteShots(dtSec);
      this.updatePvpNet(dtSec, dt);
      this.updatePvpOpponentVisual(dtSec);
    }

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
    const mm = String(Math.floor(tSec / 60)).padStart(2, '0');
    const ss = String(tSec % 60).padStart(2, '0');

    this.ui.hp.setColor(hpRatio < 0.35 ? HUD_COLOR_WARN : HUD_COLOR_TEXT_MAIN);
    this.ui.hp.setText(`Lv.${this.progression.level}  HP ${hpNow}/${this.playerMaxHp}`);
    this.ui.shield.setVisible(false);
    this.ui.shield.setText('');
    const shieldMaxClamped = Math.max(0, Math.floor(Number(shieldMax || 0)));
    const shieldCurrent = Math.max(0, Math.floor(Number(this.playerShield || 0)));
    const shieldVisible = shieldMaxClamped > 0;
    const shieldSlotCount = this.ui.shieldCells?.length || 0;
    const unlockedSlots = Math.min(shieldSlotCount, Math.max(0, shieldMaxClamped));
    const filledSlots = shieldVisible
      ? Math.min(unlockedSlots, shieldCurrent)
      : 0;
    this.ui.shieldCells?.forEach((cell, i) => {
      const unlocked = i < unlockedSlots;
      const filled = i < filledSlots;
      cell.setVisible(shieldVisible);
      cell.setStrokeStyle(1, unlocked ? 0x5f8fc0 : 0x2d4764, unlocked ? 0.95 : 0.5);
      cell.setFillStyle(
        filled ? (hpRatio < 0.35 ? 0x79b6ff : 0x9fd0ff) : (unlocked ? 0x1b3047 : 0x122237),
        filled ? 0.95 : (unlocked ? 0.72 : 0.48)
      );
      if (!shieldVisible || !unlocked) {
        cell._shieldFilled = false;
        cell.setScale(1);
        cell.setAlpha(1);
        return;
      }
      if (cell._shieldFilled !== filled) {
        cell._shieldFilled = filled;
        this.tweens.killTweensOf(cell);
        if (filled) {
          cell.setScale(0.65);
          cell.setAlpha(0.45);
          this.tweens.add({
            targets: cell,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 170,
            ease: 'Back.Out'
          });
        } else {
          cell.setScale(1.08);
          cell.setAlpha(1);
          this.tweens.add({
            targets: cell,
            scaleX: 1,
            scaleY: 1,
            alpha: 0.82,
            duration: 120,
            ease: 'Sine.Out',
            onComplete: () => {
              if (!cell.active) return;
              cell.setAlpha(1);
            }
          });
        }
      }
    });

    const runGoldText = this.runGold >= 0 ? `+${this.runGold}` : String(this.runGold);
    this.ui.gold.setText(`${SaveSystem.getTotalGold()} (${runGoldText})`);
    this.ui.gold.setColor(this.runGold > 0 ? '#ffe8a6' : HUD_COLOR_GOLD);

    const flags = this.abilitySystem.synergyFlags();
    const sy = [];
    if (flags.MECHANIC) sy.push('기계(액티브 사거리 +25%)');
    if (flags.SWORDSMAN) sy.push('검사(생명력 흡수 +12%)');
    if (flags.RANGER) sy.push('레인저(기본 공격 관통)');
    if (flags.MAGE) sy.push('마법사(액티브 쿨타임 -40%)');
    this.ui.synergy.setText(sy.length > 0 ? sy.join('  ') : '');

    if (this.isPvpMode) {
      if (this.isCoopMode) {
        this.ui.stage.setText(`COOP STAGE ${this.coopStage}`);
        this.ui.stageSub.setText(`목표 ${this.coopStageKills}/${this.coopStageKillGoal}`);
      } else {
        this.ui.stage.setText('PVP DUEL');
        this.ui.stageSub.setText('');
      }
    } else {
      this.ui.stage.setText(`STAGE ${stage}`);
      this.ui.stageSub.setText(`처치 ${this.stageDirector.stageKills}/${spec.killGoal}`);
    }

    const boss = (!this.isPvpMode || this.isCoopMode)
      ? this.enemies.getChildren().find((e) => e?.active && e.type === EnemyType.BOSS)
      : null;

    if (this.runMode === 'defense' && this.defenseCoreHpMax > 0) {
      this.ui.modeObjective.setText(`코어 ${Math.max(0, Math.floor(this.defenseCoreHp))}/${this.defenseCoreHpMax}`);
      this.ui.modeObjective.setColor(this.defenseCoreHp / this.defenseCoreHpMax < 0.35 ? HUD_COLOR_WARN : '#89d5ff');
      this.ui.modeObjective.setVisible(true);
    } else {
      this.ui.modeObjective.setText(this.isPvpMode ? (this.isCoopMode ? '협동 작전' : '') : '스테이지 돌파');
      this.ui.modeObjective.setColor('#89d5ff');
      this.ui.modeObjective.setVisible((!this.isPvpMode || this.isCoopMode) && !boss);
    }

    this.ui.time.setText(`${mm}:${ss}`);
    if (this.isPvpMode) {
      this.ui.ping.setVisible(true);
      const pingMs = Number.isFinite(this.pvpPingMs) ? Math.round(this.pvpPingMs) : null;
      const pingText = pingMs !== null ? `${pingMs}ms` : '--';
      this.ui.ping.setText(pingText);
      this.ui.ping.setColor(pingMs === null ? HUD_COLOR_TEXT_SUB : (pingMs > 140 ? '#ffb4a6' : '#9ad4d2'));
    } else {
      this.ui.ping.setVisible(false);
      this.ui.ping.setText('');
    }

    if (!this.isPvpMode || this.isCoopMode) {
      if (boss) {
        const ratioBoss = boss.maxHp > 0 ? Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1) : 0;
        this.ui.bossHpFrame.setVisible(true);
        this.ui.bossHpBg.setVisible(true);
        this.ui.bossHpFill.setVisible(true);
        this.ui.bossHpLabel.setVisible(true);
        const fullW = this.ui.bossHpBg.width;
        const bossFillColor = ratioBoss < 0.3 ? 0xff6f61 : (ratioBoss < 0.6 ? 0xff9f62 : 0xffc46f);
        this.ui.bossHpFill.setFillStyle(bossFillColor, 0.98);
        this.ui.bossHpFill.width = fullW * ratioBoss;
        this.ui.bossHpFill.x = this.ui.bossHpBg.x - (fullW * 0.5);
        this.ui.bossHpLabel.setText(`BOSS HP ${Math.max(0, Math.floor(boss.hp))}/${Math.max(1, Math.floor(boss.maxHp))}`);
      } else {
        this.ui.bossHpFrame.setVisible(false);
        this.ui.bossHpBg.setVisible(false);
        this.ui.bossHpFill.setVisible(false);
        this.ui.bossHpLabel.setVisible(false);
      }
    } else {
      this.ui.bossHpFrame.setVisible(false);
      this.ui.bossHpBg.setVisible(false);
      this.ui.bossHpFill.setVisible(false);
      this.ui.bossHpLabel.setVisible(false);
    }

    this.drawMinimap();

    const xpRatio = this.progression.getXpRatio();
    this.ui.xpBarFill.width = this.scale.width * xpRatio;
    this.ui.xpBarEdge.width = this.scale.width;

    const hpTrackW = Math.max(0, this.ui.statusLayout.w - 30);
    const hpFillColor = hpRatio < 0.28 ? HUD_COLOR_HP : (hpRatio < 0.58 ? 0xffb85c : HUD_COLOR_HP_SAFE);
    this.ui.statusLineFill.setFillStyle(hpFillColor, 0.98);
    this.ui.statusLineFill.width = hpTrackW * hpRatio;
    this.ui.statusAccent.setAlpha(0.24 + (1 - hpRatio) * 0.35);

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
        slotUi.bg.setFillStyle(unlocked ? 0x12253d : 0x0d192c, unlocked ? 0.9 : 0.74);
        slotUi.num.setColor(unlocked ? '#a7cbe8' : '#6e89a5');
        if (iconKey) {
          slotUi.iconSprite.setTexture(iconKey).setVisible(true);
          slotUi.icon.setText('');
        } else {
          slotUi.iconSprite.setVisible(false);
          slotUi.icon.setText(unlocked ? this.shortSkillLabel(key) : '-');
        }
        slotUi.rank.setText(unlocked && rank > 1 ? `${rank}` : '');
        slotUi.border.setStrokeStyle(2, (unlocked && cd <= 0) ? 0x57d5ff : (unlocked ? 0x3f7099 : 0x2c4866), 1);
        slotUi.cdText.setColor(cd > 0 ? '#f0f8ff' : '#8ea9c7');
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
        b.btn.setStrokeStyle(2, (unlocked && cd <= 0) ? 0x57d5ff : 0x356089, 0.94);
        b.cd.setText(cd > 0 ? `${cd.toFixed(1)}s` : '');
        this.drawSlotCooldown({ cdOverlay: b.cdOverlay, rect: b.rect }, cdDur > 1e-6 ? cd / cdDur : 0);
      });
    }

    const owned = ABILITY_KEYS.filter((k) => this.abilitySystem.rank(k) > 0);
    this.ui.traitArea?.setVisible(false);
    if (this.ui.traitLayout?.visible) {
      const maxSlots = Math.min(
        Math.max(1, Math.floor(Number(this.ui.traitLayout.cols || 8))),
        this.ui.traitSlots.length
      );
      this.ui.traitSlots.forEach((slot) => {
        slot.slotBg.setVisible(false);
        slot.icon.setVisible(false);
        slot.rank.setVisible(false);
      });

      const visibleCount = Math.min(maxSlots, owned.length);
      const offset = maxSlots - visibleCount; // right align
      for (let i = 0; i < visibleCount; i += 1) {
        const key = owned[i];
        const slot = this.ui.traitSlots[offset + i];
        if (!slot || !key) continue;
        const rank = this.abilitySystem.rank(key);
        const tex = this.getSkillIconKey(key) ?? 'tex_gold';
        slot.slotBg
          .setVisible(true)
          .setFillStyle(0x17325a, 0.92)
          .setStrokeStyle(1, 0x4d81b2, 0.9);
        slot.icon.setTexture(tex).setVisible(true);
        slot.rank.setText(rank > 1 ? `${rank}` : '').setVisible(rank > 1);
      }
    }

    this.updateCoopReviveHud();
  }

  updateCoopReviveHud() {
    const bg = this.ui?.reviveBg;
    const fill = this.ui?.reviveFill;
    const label = this.ui?.reviveLabel;
    const hint = this.ui?.reviveHint;
    if (!bg || !fill || !label || !hint) return;

    const status = this.coopReviveState || this.makeDefaultCoopReviveState();
    const canUse = !!(
      this.isCoopMode
      && this.isPvpMode
      && this.pvpRoundStarted
      && this.playerHp > 0
      && (status.canHold || status.holdActive)
    );
    bg.setVisible(canUse);
    label.setVisible(canUse);
    fill.setVisible(canUse);

    if (!canUse) {
      fill.setVisible(false);
      if (this.isCoopMode && this.isPvpMode && this.playerHp <= 0 && status.beingRevived) {
        const dur = Math.max(500, Math.floor(Number(status.holdDurationMs || COOP_REVIVE_HOLD_MS)));
        const pct = Math.floor(
          Phaser.Math.Clamp((Date.now() - Math.max(0, Number(status.beingRevivedStartedAt || 0))) / dur, 0, 1) * 100
        );
        hint.setVisible(true).setText(`팀원이 부활 중 ${pct}%`);
      } else {
        hint.setVisible(false).setText('');
      }
      return;
    }

    hint.setVisible(true);
    const canHold = !!status.canHold;
    const holdActive = !!status.holdActive;
    const holdStartedAt = Math.max(0, Math.floor(Number(status.holdStartedAt || 0)));
    const holdDurationMs = Math.max(500, Math.floor(Number(status.holdDurationMs || COOP_REVIVE_HOLD_MS)));
    const holdSecText = holdDurationMs % 1000 === 0
      ? String(Math.floor(holdDurationMs / 1000))
      : (holdDurationMs / 1000).toFixed(1);
    const progress = holdActive
      ? Phaser.Math.Clamp((Date.now() - holdStartedAt) / holdDurationMs, 0, 1)
      : 0;
    const pct = Math.floor(progress * 100);
    const lo = this.ui?.reviveLayout || { x: bg.x, y: bg.y, w: bg.width, h: bg.height };
    const fillW = Math.max(0, Math.floor((lo.w - 4) * progress));
    fill.setPosition(lo.x - lo.w * 0.5 + 2, lo.y).setSize(fillW, Math.max(2, lo.h - 4));
    fill.setVisible(fillW > 0);

    bg.setFillStyle(canHold || holdActive ? 0x1a3155 : 0x132540, canHold || holdActive ? 0.88 : 0.76);
    bg.setStrokeStyle(2, holdActive ? 0x66d89a : (canHold ? 0x7ea0ff : 0x3b4d75), 0.95);

    const targetName = status.holdTargetSid && status.holdTargetSid === this.pvpOpponentSid
      ? (this.pvpOpponent?.name || '팀원')
      : '팀원';
    if (holdActive) {
      label.setText(`부활 중 ${pct}%`);
      hint.setText(`${targetName} 부활 진행`);
    } else if (canHold) {
      label.setText(`부활 버튼 ${holdSecText}초 꾹 누르기`);
      hint.setText(`${targetName} 부활`);
    } else {
      label.setText('사망한 팀원 근처로 이동');
      hint.setText('');
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
    if (this.isMobileTouch) {
      const cam = this.cameras.main;
      const cursorWorldX = cam.worldView.x + this.aimCursorPos.x;
      const cursorWorldY = cam.worldView.y + this.aimCursorPos.y;
      const v = new Phaser.Math.Vector2(
        cursorWorldX - this.player.x,
        cursorWorldY - this.player.y
      );
      if (v.lengthSq() > 1e-6) return v.normalize();
    }
    return this.inputSystem.getAimVec();
  }

  updateAimCursor(dtSec) {
    let desired;
    const isMobileManualAim = this.isMobileTouch && this.inputSystem.getAimPadState().active;
    const st = this.inputSystem.getAimPadState();

    if (isMobileManualAim) {
      if (!this.wasMobileManualAim) {
        this.mobileAimPadPrev.set(st.cur.x, st.cur.y);
      }

      const deltaX = st.cur.x - this.mobileAimPadPrev.x;
      const deltaY = st.cur.y - this.mobileAimPadPrev.y;
      this.mobileAimPadPrev.set(st.cur.x, st.cur.y);

      desired = new Phaser.Math.Vector2(
        this.aimCursorPos.x + deltaX,
        this.aimCursorPos.y + deltaY
      );
    } else if (!this.isMobileTouch) {
      const p = this.input.activePointer;
      desired = new Phaser.Math.Vector2(p?.x ?? this.aimCursorPos.x, p?.y ?? this.aimCursorPos.y);
    } else {
      desired = this.aimCursorPos.clone();
    }

    if (!Number.isFinite(desired.x) || !Number.isFinite(desired.y)) {
      desired.set(this.scale.width * 0.5, this.scale.height * 0.5);
    }

    if (this.isMobileTouch) {
      const cam = this.cameras.main;
      const desiredWorld = new Phaser.Math.Vector2(
        cam.worldView.x + desired.x,
        cam.worldView.y + desired.y
      );
      const toCursor = desiredWorld.clone().subtract(new Phaser.Math.Vector2(this.player.x, this.player.y));
      const len = toCursor.length();
      if (len > this.mobileAimRadius && len > 1e-6) {
        toCursor.scale(this.mobileAimRadius / len);
        desiredWorld.set(this.player.x + toCursor.x, this.player.y + toCursor.y);
        desired.set(desiredWorld.x - cam.worldView.x, desiredWorld.y - cam.worldView.y);
      }
    }

    desired.x = Phaser.Math.Clamp(desired.x, 0, this.scale.width);
    desired.y = Phaser.Math.Clamp(desired.y, 0, this.scale.height);

    this.aimCursorPos.copy(desired);
    this.wasMobileManualAim = isMobileManualAim;
  }

  drawAimCursor() {
    if (this.pauseActive || this.levelupActive) {
      this.aimCursorGfx.clear();
      return;
    }
    let sx = this.aimCursorPos.x;
    let sy = this.aimCursorPos.y;
    if (!this.isMobileTouch) {
      const p = this.input.activePointer;
      sx = p?.x ?? sx;
      sy = p?.y ?? sy;
    }

    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      this.aimCursorGfx.clear();
      return;
    }
    const g = this.aimCursorGfx;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.75);
    g.strokeCircle(sx, sy, 12);
    g.lineBetween(sx - 18, sy, sx - 6, sy);
    g.lineBetween(sx + 6, sy, sx + 18, sy);
    g.lineBetween(sx, sy - 18, sx, sy - 6);
    g.lineBetween(sx, sy + 6, sx, sy + 18);
  }

  onShieldUsed() {
    this.shieldRegenDelaySec = 2.4;
    this.shieldRegenAcc = 0;
  }

  createPauseUi() {
    const root = this.add.container(0, 0).setDepth(2000).setVisible(false).setScrollFactor(0);
    const fontDisplay = HUD_FONT_DISPLAY;
    const fontBody = HUD_FONT_BODY;

    const dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x040811, 0.74)
      .setOrigin(0)
      .setScrollFactor(0);
    const frame = this.add.graphics().setScrollFactor(0);
    const cardShadow = this.add.rectangle(0, 0, 420, 360, 0x030812, 0.66).setScrollFactor(0);
    const cardGlow = this.add.rectangle(0, 0, 420, 360, 0x56a8ff, 0.08).setScrollFactor(0);
    const card = this.add.rectangle(0, 0, 420, 360, 0x0f1b2f, 0.97).setScrollFactor(0);
    card.setStrokeStyle(2, 0x4676a7, 0.96);

    const headerBand = this.add.rectangle(0, 0, 320, 58, 0x173352, 0.24).setScrollFactor(0);
    headerBand.setStrokeStyle(1, 0x5aa9e4, 0.35);
    const titleTag = this.add.text(0, 0, 'PAUSE', {
      fontFamily: fontDisplay,
      fontSize: '12px',
      color: '#86cfff'
    }).setOrigin(0.5).setScrollFactor(0);
    const title = this.add.text(0, 0, '일시정지', {
      fontFamily: fontDisplay,
      fontSize: '28px',
      color: '#edf6ff'
    }).setOrigin(0.5).setScrollFactor(0);
    const audioLabel = this.add.text(0, 0, 'AUDIO', {
      fontFamily: fontDisplay,
      fontSize: '11px',
      color: '#7dc7f1'
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const actionDivider = this.add.rectangle(0, 0, 300, 1, 0x34557a, 0.72).setScrollFactor(0);

    const makeButton = (label, onClick, kind = 'normal', opts = {}) => {
      const width = Math.max(24, Math.floor(Number(opts.w || 180)));
      const height = Math.max(24, Math.floor(Number(opts.h || 34)));
      const fontSize = Math.max(10, Math.floor(Number(opts.fontSize || 14)));
      const bg = this.add.rectangle(0, 0, width, height, 0x24364f, 0.96).setScrollFactor(0);
      bg.setStrokeStyle(1, 0x628ab5, 0.88);
      bg.setInteractive({ useHandCursor: true });
      const tx = this.add.text(0, 0, label, {
        fontFamily: fontBody,
        fontSize: `${fontSize}px`,
        color: '#eaf2ff'
      }).setOrigin(0.5).setScrollFactor(0);

      const palette = kind === 'primary'
        ? { baseFill: 0x25557d, hoverFill: 0x326c9e, activeFill: 0x3d80b9, baseStroke: 0x82d1ff, hoverStroke: 0xa8e4ff, text: '#eff8ff' }
        : kind === 'danger'
          ? { baseFill: 0x3a2e42, hoverFill: 0x4a3a52, activeFill: 0x5a455f, baseStroke: 0xa181ba, hoverStroke: 0xc7a6dd, text: '#f4ecff' }
          : kind === 'step'
            ? { baseFill: 0x1e334d, hoverFill: 0x294564, activeFill: 0x335877, baseStroke: 0x6088b2, hoverStroke: 0x85b5df, text: '#e4f0ff' }
            : kind === 'toggle'
              ? { baseFill: 0x253f5b, hoverFill: 0x315273, activeFill: 0x3d6387, baseStroke: 0x6f95bf, hoverStroke: 0x99c9f6, text: '#eaf2ff' }
              : { baseFill: 0x22364f, hoverFill: 0x2f4a6b, activeFill: 0x3c5f88, baseStroke: 0x658cb4, hoverStroke: 0x90bde9, text: '#e8f1ff' };

      let enabled = true;
      let customPalette = { ...palette };
      const applyState = (state = 'base') => {
        if (!enabled) {
          bg.setFillStyle(0x182536, 0.56);
          bg.setStrokeStyle(1, 0x354a66, 0.45);
          tx.setColor('#7085a1');
          return;
        }
        if (state === 'hover') {
          bg.setFillStyle(customPalette.hoverFill, 0.98);
          bg.setStrokeStyle(1, customPalette.hoverStroke, 1);
        } else if (state === 'active') {
          bg.setFillStyle(customPalette.activeFill, 1);
          bg.setStrokeStyle(1, customPalette.hoverStroke, 1);
        } else {
          bg.setFillStyle(customPalette.baseFill, 0.96);
          bg.setStrokeStyle(1, customPalette.baseStroke, 0.92);
        }
        tx.setColor(customPalette.text || '#eaf2ff');
      };

      bg.on('pointerover', () => applyState('hover'));
      bg.on('pointerout', () => applyState('base'));
      bg.on('pointerdown', () => {
        if (!enabled) return;
        applyState('active');
        onClick?.();
      });
      bg.on('pointerup', () => applyState('hover'));
      applyState('base');

      return {
        bg,
        tx,
        setLabel: (next) => tx.setText(next),
        setPalette: (next) => {
          customPalette = { ...customPalette, ...next };
          applyState('base');
        },
        setEnabled: (next) => {
          enabled = !!next;
          if (enabled) bg.setInteractive({ useHandCursor: true });
          else bg.disableInteractive();
          applyState('base');
        }
      };
    };

    const makeToggleRow = (label, onToggle) => {
      const rowBg = this.add.rectangle(0, 0, 320, 36, 0x12253b, 0.82).setScrollFactor(0);
      rowBg.setStrokeStyle(1, 0x3b5e83, 0.74);
      const lbl = this.add.text(0, 0, label, {
        fontFamily: fontBody,
        fontSize: '14px',
        color: '#b6c9e3'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const btn = makeButton('', onToggle, 'toggle', { w: 70, h: 24, fontSize: 11 });
      const layout = (cx, y, width) => {
        rowBg.setPosition(cx, y).setSize(width, 36);
        const left = cx - width * 0.5 + 12;
        lbl.setPosition(left, y);
        btn.bg.setPosition(cx + width * 0.5 - 12 - 35, y);
        btn.tx.setPosition(btn.bg.x, y);
      };
      return { rowBg, lbl, btn, layout };
    };

    const makeVolumeRow = (label, onLeft, onRight) => {
      const rowBg = this.add.rectangle(0, 0, 320, 44, 0x12243a, 0.86).setScrollFactor(0);
      rowBg.setStrokeStyle(1, 0x3b5d82, 0.78);
      const lbl = this.add.text(0, 0, label, {
        fontFamily: fontBody,
        fontSize: '14px',
        color: '#b6c9e3'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const leftBtn = makeButton('-', onLeft, 'step', { w: 24, h: 24, fontSize: 16 });
      const rightBtn = makeButton('+', onRight, 'step', { w: 24, h: 24, fontSize: 16 });
      const val = this.add.text(0, 0, '', {
        fontFamily: fontDisplay,
        fontSize: '12px',
        color: '#e5f3ff'
      }).setOrigin(0.5).setScrollFactor(0);
      const barBg = this.add.rectangle(0, 0, 108, 6, 0x1a2e47, 0.95).setScrollFactor(0);
      barBg.setStrokeStyle(1, 0x466a8f, 0.85);
      const barFill = this.add.rectangle(0, 0, 0, 4, 0x73d4ff, 0.96).setOrigin(0, 0.5).setScrollFactor(0);

      const layout = (cx, y, width) => {
        rowBg.setPosition(cx, y).setSize(width, 44);
        const left = cx - width * 0.5 + 12;
        const right = cx + width * 0.5 - 12;
        lbl.setPosition(left, y - 8);

        rightBtn.bg.setPosition(right - 12, y + 8);
        rightBtn.tx.setPosition(rightBtn.bg.x, rightBtn.bg.y);
        val.setPosition(rightBtn.bg.x - 40, rightBtn.bg.y);
        leftBtn.bg.setPosition(val.x - 40, rightBtn.bg.y);
        leftBtn.tx.setPosition(leftBtn.bg.x, leftBtn.bg.y);

        const barRight = leftBtn.bg.x - 16;
        const barWidth = Math.max(72, Math.min(130, barRight - (left + 6)));
        barBg.setSize(barWidth, 6);
        barBg.setPosition(left + 6 + barWidth * 0.5, y + 8);
        barFill.setPosition(barBg.x - barBg.width * 0.5 + 1, barBg.y);
      };

      const setRatio = (ratio) => {
        const r = Phaser.Math.Clamp(Number(ratio || 0), 0, 1);
        const full = Math.max(2, barBg.width - 2);
        barFill.width = full * r;
      };

      return {
        rowBg,
        lbl,
        leftBtn,
        rightBtn,
        val,
        barBg,
        barFill,
        layout,
        setRatio
      };
    };

    const bgmToggle = makeToggleRow('배경음', () => {
      this.settings.bgmEnabled = !this.settings.bgmEnabled;
      this.applyAudioSettings();
      this.saveSettings();
      this.refreshPauseUi();
    });
    const sfxToggle = makeToggleRow('효과음', () => {
      this.settings.sfxEnabled = !this.settings.sfxEnabled;
      this.saveSettings();
      this.refreshPauseUi();
    });

    const bgmVol = makeVolumeRow(
      '배경음 볼륨',
      () => {
        this.settings.bgmVolume = Math.max(0, this.settings.bgmVolume - 0.1);
        this.applyAudioSettings();
        this.saveSettings();
        this.refreshPauseUi();
      },
      () => {
        this.settings.bgmVolume = Math.min(1, this.settings.bgmVolume + 0.1);
        this.applyAudioSettings();
        this.saveSettings();
        this.refreshPauseUi();
      }
    );
    const sfxVol = makeVolumeRow(
      '효과음 볼륨',
      () => {
        this.settings.sfxVolume = Math.max(0, this.settings.sfxVolume - 0.1);
        this.saveSettings();
        this.refreshPauseUi();
      },
      () => {
        this.settings.sfxVolume = Math.min(1, this.settings.sfxVolume + 0.1);
        this.saveSettings();
        this.refreshPauseUi();
      }
    );

    const resumeBtn = makeButton('계속하기', () => this.setPaused(false), 'primary', { w: 158, h: 34, fontSize: 16 });
    const restartMode = this.isCoopMode ? 'coop' : this.runMode;
    const restartBtn = makeButton('다시 시작', () => this.scene.restart({
      mode: restartMode,
      token: this.pvpToken,
      serverBaseUrl: this.pvpServerBaseUrl,
      user: this.pvpUser,
      partyKey: this.partyKey
    }), 'normal', { w: 158, h: 34, fontSize: 15 });
    const lobbyBtn = makeButton('로비로', () => {
      this.bgm?.stop();
      this.scene.start('Lobby');
    }, 'danger', { w: 320, h: 28, fontSize: 14 });
    const audioOnlyPopup = this.isPvpMode;
    if (audioOnlyPopup) {
      resumeBtn.bg.setVisible(false);
      resumeBtn.tx.setVisible(false);
      restartBtn.bg.setVisible(false);
      restartBtn.tx.setVisible(false);
      resumeBtn.setEnabled(false);
      restartBtn.setEnabled(false);
    }

    root.add([
      dim,
      frame,
      cardShadow,
      cardGlow,
      card,
      headerBand,
      titleTag,
      title,
      audioLabel,
      bgmToggle.rowBg,
      bgmToggle.lbl,
      bgmToggle.btn.bg,
      bgmToggle.btn.tx,
      sfxToggle.rowBg,
      sfxToggle.lbl,
      sfxToggle.btn.bg,
      sfxToggle.btn.tx,
      bgmVol.rowBg,
      bgmVol.lbl,
      bgmVol.leftBtn.bg,
      bgmVol.leftBtn.tx,
      bgmVol.rightBtn.bg,
      bgmVol.rightBtn.tx,
      bgmVol.val,
      bgmVol.barBg,
      bgmVol.barFill,
      sfxVol.rowBg,
      sfxVol.lbl,
      sfxVol.leftBtn.bg,
      sfxVol.leftBtn.tx,
      sfxVol.rightBtn.bg,
      sfxVol.rightBtn.tx,
      sfxVol.val,
      sfxVol.barBg,
      sfxVol.barFill,
      actionDivider,
      resumeBtn.bg,
      resumeBtn.tx,
      restartBtn.bg,
      restartBtn.tx,
      lobbyBtn.bg,
      lobbyBtn.tx
    ]);

    const pauseBtn = this.add.rectangle(this.scale.width - 18, 23, 30, 30, 0x2a3552, 0.96)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2100)
      .setInteractive({ useHandCursor: true });
    pauseBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const pauseTxt = this.add.text(this.scale.width - 18, 23, 'II', {
      fontFamily: fontDisplay,
      fontSize: '13px',
      color: '#eaf0ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2101);
    pauseBtn.on('pointerdown', () => this.togglePause());

    const layoutPause = () => {
      const sw = this.scale.width;
      const sh = this.scale.height;
      dim.setSize(sw, sh);

      frame.clear();
      frame.lineStyle(2, 0x3f6693, 0.17);
      frame.strokeRect(12, 12, Math.max(8, sw - 24), Math.max(8, sh - 24));

      const cardW = Phaser.Math.Clamp(sw - 42, 290, 420);
      const cardH = Phaser.Math.Clamp(sh - 44, 304, 400);
      const cx = sw * 0.5;
      const cy = sh * 0.5;
      const top = cy - cardH * 0.5;
      const bottom = cy + cardH * 0.5;
      const controlW = Phaser.Math.Clamp(cardW - 56, 220, 332);
      const compact = cardH < 352;

      cardShadow.setPosition(cx, cy + 5).setSize(cardW + 8, cardH + 8);
      cardGlow.setPosition(cx, cy).setSize(cardW + 4, cardH + 4);
      card.setPosition(cx, cy).setSize(cardW, cardH);
      const headerY = top + (compact ? 30 : 35);
      const headerH = compact ? 46 : 54;
      const headerTop = headerY - headerH * 0.5;
      headerBand.setPosition(cx, headerY).setSize(controlW, headerH);
      titleTag.setPosition(cx, headerTop + (compact ? 11 : 13));
      title.setPosition(cx, headerTop + (compact ? 31 : 36));

      const lobbyBottomPad = compact ? 12 : 16;
      const lobbyHalfH = 14;
      const lobbyY = bottom - lobbyBottomPad - lobbyHalfH;
      const actionsY = lobbyY - (compact ? 36 : 42);
      const actionDividerY = actionsY - (compact ? 24 : 30);
      const volGap = compact ? 38 : 42;
      const toggleGap = compact ? 34 : 44;
      const sfxVolY = actionDividerY - volGap;
      const bgmVolY = sfxVolY - volGap;
      const sfxToggleY = bgmVolY - toggleGap;
      const bgmToggleY = sfxToggleY - toggleGap;
      const bgmRowTop = bgmToggleY - 18;
      const audioTop = bgmRowTop - (compact ? 10 : 12);

      audioLabel.setPosition(cx - controlW * 0.5 + 2, audioTop);
      bgmToggle.layout(cx, bgmToggleY, controlW);
      sfxToggle.layout(cx, sfxToggleY, controlW);
      bgmVol.layout(cx, bgmVolY, controlW);
      sfxVol.layout(cx, sfxVolY, controlW);

      if (audioOnlyPopup) {
        actionDivider.setVisible(false);
        const singleH = compact ? 30 : 32;
        lobbyBtn.bg.setPosition(cx, lobbyY).setSize(controlW, singleH);
        lobbyBtn.tx.setPosition(cx, lobbyY);
      } else {
        actionDivider.setVisible(true);
        actionDivider.setPosition(cx, actionDividerY).setSize(controlW, 1);
        const gap = compact ? 10 : 14;
        const halfW = Math.floor((controlW - gap) * 0.5);
        resumeBtn.bg.setPosition(cx - (halfW + gap) * 0.5, actionsY).setSize(halfW, 34);
        resumeBtn.tx.setPosition(resumeBtn.bg.x, actionsY);
        restartBtn.bg.setPosition(cx + (halfW + gap) * 0.5, actionsY).setSize(halfW, 34);
        restartBtn.tx.setPosition(restartBtn.bg.x, actionsY);
        lobbyBtn.bg.setPosition(cx, lobbyY).setSize(controlW, 28);
        lobbyBtn.tx.setPosition(cx, lobbyY);
      }
    };

    this.pauseUi = {
      root,
      dim,
      card,
      cardShadow,
      title,
      bgmToggleRow: bgmToggle,
      sfxToggleRow: sfxToggle,
      bgmToggle: bgmToggle.btn,
      sfxToggle: sfxToggle.btn,
      bgmVol,
      sfxVol,
      resumeBtn,
      restartBtn,
      lobbyBtn,
      pauseBtn,
      pauseTxt,
      layoutPause
    };

    this.scale.on('resize', (size) => {
      if (!this.pauseUi) return;
      this.pauseUi.layoutPause();
      this.layoutHud(size.width, size.height);
    });

    this.pauseUi.layoutPause();
    this.refreshPauseUi();
    this.layoutHud(this.scale.width, this.scale.height);
  }

  refreshPauseUi() {
    if (!this.pauseUi) return;
    const applyToggleStyle = (row, on) => {
      row.rowBg.setFillStyle(on ? 0x16314b : 0x12253b, on ? 0.9 : 0.82);
      row.rowBg.setStrokeStyle(1, on ? 0x558ec4 : 0x3b5e83, on ? 0.9 : 0.74);
      row.btn.setLabel(on ? 'ON' : 'OFF');
      row.btn.setPalette(on
        ? { baseFill: 0x1f5977, hoverFill: 0x2e7197, activeFill: 0x3b88b3, baseStroke: 0x89dbff, hoverStroke: 0xb6ebff, text: '#eaf9ff' }
        : { baseFill: 0x273a56, hoverFill: 0x344d70, activeFill: 0x406290, baseStroke: 0x688ab4, hoverStroke: 0x8fbbe7, text: '#dce8f8' });
    };

    applyToggleStyle(this.pauseUi.bgmToggleRow, this.settings.bgmEnabled);
    applyToggleStyle(this.pauseUi.sfxToggleRow, this.settings.sfxEnabled);

    const bgmPct = Math.round(this.settings.bgmVolume * 100);
    const sfxPct = Math.round(this.settings.sfxVolume * 100);
    this.pauseUi.bgmVol.val.setText(`${bgmPct}%`);
    this.pauseUi.sfxVol.val.setText(`${sfxPct}%`);
    this.pauseUi.bgmVol.setRatio(this.settings.bgmVolume);
    this.pauseUi.sfxVol.setRatio(this.settings.sfxVolume);

    const bgmLeftEnabled = this.settings.bgmVolume > 0.001;
    const bgmRightEnabled = this.settings.bgmVolume < 0.999;
    const sfxLeftEnabled = this.settings.sfxVolume > 0.001;
    const sfxRightEnabled = this.settings.sfxVolume < 0.999;
    this.pauseUi.bgmVol.leftBtn.setEnabled(bgmLeftEnabled);
    this.pauseUi.bgmVol.rightBtn.setEnabled(bgmRightEnabled);
    this.pauseUi.sfxVol.leftBtn.setEnabled(sfxLeftEnabled);
    this.pauseUi.sfxVol.rightBtn.setEnabled(sfxRightEnabled);

    this.pauseUi.bgmVol.lbl.setColor(this.settings.bgmEnabled ? '#b8cce7' : '#7f93ad');
    this.pauseUi.sfxVol.lbl.setColor(this.settings.sfxEnabled ? '#b8cce7' : '#7f93ad');
    this.pauseUi.bgmVol.barFill.setFillStyle(this.settings.bgmEnabled ? 0x74d7ff : 0x4d6787, this.settings.bgmEnabled ? 0.96 : 0.7);
    this.pauseUi.sfxVol.barFill.setFillStyle(this.settings.sfxEnabled ? 0x74d7ff : 0x4d6787, this.settings.sfxEnabled ? 0.96 : 0.7);
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

  isDragAimSkill(key) {
    const k = String(key || '').toUpperCase();
    return (
      k === 'LASER'
      || k === 'GRENADE'
      || k === 'FWD_SLASH'
      || k === 'DASH'
      || k === 'BLIZZARD'
      || k === 'FIRE_BOLT'
    );
  }

  tryCastSkillSlot(slot, aimOverride = null) {
    if (this.isCoopMode && this.isPvpMode && this.playerHp <= 0) return;
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
      const aim = this.getAimVector();
      this.sendPvpFx('skill', {
        key,
        x: this.player.x,
        y: this.player.y,
        ax: aim.x,
        ay: aim.y,
        rank: this.abilitySystem.rank(key),
        rangeMul: this.abilitySystem.activeRangeMul()
      });
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

  dealDamageToEnemy(enemy, dmg, isSkill = false, skillKey = 'SKILL') {
    if (!enemy?.active) return;
    const finalDmg = Math.max(1, Math.floor(dmg * this.relicDamageMul));
    if (this.isPvpMode && enemy.netId) {
      const aim = this.getAimVector();
      this.sendPveDamage(
        enemy.netId,
        finalDmg,
        isSkill ? String(skillKey || 'SKILL') : 'BASIC',
        isSkill ? 'skill' : 'basic',
        aim
      );
      return;
    }
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
    if (this.isPvpMode) return;
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
        this.dealDamageToEnemy(e, dmg, true, 'SHOCKWAVE');
      }
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, op.x, op.y);
        if (d <= radius + 14) this.tryPvpSkillDamage(dmg, 'SHOCKWAVE', 120);
      }
    }
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
        this.dealDamageToEnemy(e, dmg, true, 'LASER');
      }
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d2 = this.pointSegDistSq(op.x, op.y, x1, y1, x2, y2);
        const rr = 15 + width * 0.5;
        if (d2 <= rr * rr) this.tryPvpSkillDamage(dmg, 'LASER', 90);
      }
    }
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
      if (ang <= halfAng) this.dealDamageToEnemy(e, dmg, true, 'FWD_SLASH');
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const vx = op.x - this.player.x;
        const vy = op.y - this.player.y;
        const d = Math.hypot(vx, vy);
        if (d > 1 && d <= range) {
          const dot = (vx / d) * aim.x + (vy / d) * aim.y;
          const ang = Math.acos(Phaser.Math.Clamp(dot, -1, 1));
          if (ang <= halfAng) this.tryPvpSkillDamage(dmg, 'FWD_SLASH', 110);
        }
      }
    }
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
    if (this.isPvpMode && this.pvpRoom && this.pvpRoundStarted) {
      this.pvpRoom.send('pvp.move', {
        kind: 'dash',
        x: ex,
        y: ey,
        ax: aim.x,
        ay: aim.y
      });
    }
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
      if (d2 <= rr * rr) this.dealDamageToEnemy(e, dmg, true, 'DASH');
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d2 = this.pointSegDistSq(op.x, op.y, sx, sy, ex, ey);
        const rr = 15 + width * 0.5;
        if (d2 <= rr * rr) this.tryPvpSkillDamage(dmg, 'DASH', 120);
      }
    }
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
    const opponentInRange = (() => {
      if (!this.canHitPvpOpponent()) return false;
      const op = this.getPvpOpponentPoint();
      if (!op) return false;
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, op.x, op.y) <= range + 10;
    })();

    const alive = this.enemies.getChildren().filter((e) => e.active);
    if (alive.length === 0 && !opponentInRange) return false;

    let current = null;
    let best = Infinity;
    alive.forEach((e) => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < best && d <= range) {
        best = d;
        current = e;
      }
    });
    if (!current && !opponentInRange) return false;

    const hit = new Set();
    let fromX = this.player.x;
    let fromY = this.player.y;
    for (let i = 0; i < maxTargets && current; i += 1) {
      hit.add(current);
      this.drawLightning(fromX, fromY, current.x, current.y, 0xb18cff);
      this.dealDamageToEnemy(current, dmg, true, 'CHAIN_LIGHTNING');

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
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, op.x, op.y);
        if (d <= range + 10) {
          this.drawLightning(this.player.x, this.player.y, op.x, op.y, 0xb18cff);
          this.tryPvpSkillDamage(dmg, 'CHAIN_LIGHTNING', 140);
        }
      }
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
        this.dealDamageToEnemy(e, g.damage, true, 'GRENADE');
      }
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d = Phaser.Math.Distance.Between(g.x, g.y, op.x, op.y);
        if (d <= g.radius + 14) this.tryPvpSkillDamage(g.damage, 'GRENADE', 130);
      }
    }
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
            this.dealDamageToEnemy(e, b.dmg, true, 'BLIZZARD');
          }
        });
        if (this.canHitPvpOpponent()) {
          const op = this.getPvpOpponentPoint();
          if (op) {
            const d = Phaser.Math.Distance.Between(b.x, b.y, op.x, op.y);
            if (d <= b.radius + 14) this.tryPvpSkillDamage(b.dmg, 'BLIZZARD', Math.floor(b.tick * 1000 * 0.9));
          }
        }
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
          if (d <= a.radius + 10) this.dealDamageToEnemy(e, a.dmg, true, 'SPIN_SLASH');
        });
        if (this.canHitPvpOpponent()) {
          const op = this.getPvpOpponentPoint();
          if (op) {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, op.x, op.y);
            if (d <= a.radius + 14) this.tryPvpSkillDamage(a.dmg, 'SPIN_SLASH', Math.floor(a.tick * 1000 * 0.9));
          }
        }
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
      let hitOpponent = false;
      if (this.canHitPvpOpponent()) {
        const op = this.getPvpOpponentPoint();
        if (op) {
          const d = Phaser.Math.Distance.Between(f.x, f.y, op.x, op.y);
          if (d <= 22) hitOpponent = true;
        }
      }

      const out = f.x < -20 || f.x > this.physics.world.bounds.width + 20 || f.y < -20 || f.y > this.physics.world.bounds.height + 20;
      if (hitEnemy || hitOpponent || out || f.travel >= f.maxRange) {
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
      if (d <= f.explodeRadius + 10) this.dealDamageToEnemy(e, f.damage, true, 'FIRE_BOLT');
    });
    if (this.canHitPvpOpponent()) {
      const op = this.getPvpOpponentPoint();
      if (op) {
        const d = Phaser.Math.Distance.Between(f.x, f.y, op.x, op.y);
        if (d <= f.explodeRadius + 14) this.tryPvpSkillDamage(f.damage, 'FIRE_BOLT', 120);
      }
    }
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
        laserT: 0,
        comboLeft: 0
      };
    }
    const s = e._bossState;
    const isBoss = e.type === EnemyType.BOSS;
    const rotate = (vx, vy, angle) => {
      const c = Math.cos(angle);
      const si = Math.sin(angle);
      return {
        x: vx * c - vy * si,
        y: vx * si + vy * c
      };
    };
    const refreshAimToPlayer = () => {
      const vx = this.player.x - e.x;
      const vy = this.player.y - e.y;
      const len = Math.hypot(vx, vy) || 1;
      s.dirX = vx / len;
      s.dirY = vy / len;
    };
    const addFanWarning = (delaySec, spreadRad = 0.28, count = 3, color = 0x7ea0ff, width = 8) => {
      const mid = Math.floor(count * 0.5);
      for (let i = 0; i < count; i += 1) {
        const offset = (i - mid) * spreadRad;
        const d = rotate(s.dirX, s.dirY, offset);
        const end = this.rayToBounds(e.x, e.y, d.x, d.y);
        this.addLineWarning(e.x, e.y, end.x, end.y, delaySec, color, width);
      }
    };
    const fireFanLaser = (count = 3, spreadRad = 0.24, width = 18, damage = 24, durationSec = 0.62) => {
      const mid = Math.floor(count * 0.5);
      for (let i = 0; i < count; i += 1) {
        const offset = (i - mid) * spreadRad;
        const d = rotate(s.dirX, s.dirY, offset);
        const end = this.rayToBounds(e.x, e.y, d.x, d.y);
        this.addBossLaser(e.x, e.y, end.x, end.y, durationSec, width, damage);
      }
    };
    const fireNovaLaser = (rays = 8, width = 14, damage = 18, durationSec = 0.5) => {
      for (let i = 0; i < rays; i += 1) {
        const a = (i / rays) * Math.PI * 2;
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const end = this.rayToBounds(e.x, e.y, d.x, d.y);
        this.addBossLaser(e.x, e.y, end.x, end.y, durationSec, width, damage);
      }
    };

    if (s.phase === 'idle') {
      s.cd = Math.max(0, s.cd - dtSec);
      if (s.cd <= 0) {
        refreshAimToPlayer();
        const roll = Math.random();
        if (roll < (isBoss ? 0.32 : 0.5)) {
          s.phase = 'dash_warn';
          s.phaseT = isBoss ? 0.52 : 0.62;
          s.comboLeft = isBoss ? Phaser.Math.Between(2, 3) : 1;
          const end = this.rayToBounds(e.x, e.y, s.dirX, s.dirY);
          this.addLineWarning(e.x, e.y, end.x, end.y, s.phaseT, 0xffc857, isBoss ? 12 : 10);
          return true;
        }
        if (roll < (isBoss ? 0.63 : 0.83)) {
          s.phase = 'laser_fan_warn';
          s.phaseT = isBoss ? 0.72 : 0.78;
          addFanWarning(s.phaseT, isBoss ? 0.25 : 0.3, isBoss ? 5 : 3, 0x7ea0ff, isBoss ? 9 : 8);
          return true;
        }
        if (roll < (isBoss ? 0.85 : 1.0)) {
          s.phase = 'nova_warn';
          s.phaseT = isBoss ? 0.7 : 0.76;
          for (let i = 0; i < (isBoss ? 10 : 8); i += 1) {
            const a = (i / (isBoss ? 10 : 8)) * Math.PI * 2;
            const end = this.rayToBounds(e.x, e.y, Math.cos(a), Math.sin(a));
            this.addLineWarning(e.x, e.y, end.x, end.y, s.phaseT, 0xff6fa3, isBoss ? 7 : 6);
          }
          return true;
        } else {
          if (isBoss) {
            const addCount = Phaser.Math.Between(2, 3);
            for (let i = 0; i < addCount; i += 1) {
              const a = (i / addCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.35, 0.35);
              const radius = Phaser.Math.Between(92, 140);
              const sx = Phaser.Math.Clamp(e.x + Math.cos(a) * radius, 40, this.physics.world.bounds.width - 40);
              const sy = Phaser.Math.Clamp(e.y + Math.sin(a) * radius, 40, this.physics.world.bounds.height - 40);
              this.queueEnemySpawn(sx, sy, Math.random() < 0.5 ? EnemyType.ELITE : EnemyType.TANK, 0.5 + i * 0.12);
            }
            s.cd = 1.6;
            return true;
          }
        }
      }
      return false;
    }

    if (s.phase === 'dash_warn') {
      s.phaseT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.phaseT <= 0) {
        s.phase = 'dash';
        s.dashT = isBoss ? 0.28 : 0.33;
        s.cd = isBoss ? 1.8 : 2.2;
      }
      return true;
    }

    if (s.phase === 'dash') {
      const dashSpeed = (isBoss ? 880 : 760) * this.enemyPace;
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
        if (s.comboLeft > 1) {
          s.comboLeft -= 1;
          refreshAimToPlayer();
          s.phase = 'dash_warn';
          s.phaseT = isBoss ? 0.28 : 0.4;
          const end = this.rayToBounds(e.x, e.y, s.dirX, s.dirY);
          this.addLineWarning(e.x, e.y, end.x, end.y, s.phaseT, 0xffc857, isBoss ? 12 : 10);
        } else {
          s.comboLeft = 0;
          s.phase = 'idle';
          s.cd = isBoss ? 1.5 : 1.9;
        }
      }
      return true;
    }

    if (s.phase === 'laser_fan_warn') {
      s.phaseT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.phaseT <= 0) {
        s.phase = 'laser';
        s.laserT = isBoss ? 0.72 : 0.58;
        s.cd = isBoss ? 2.1 : 2.5;
        fireFanLaser(
          isBoss ? 5 : 3,
          isBoss ? 0.22 : 0.3,
          isBoss ? 18 : 16,
          isBoss ? 32 : 22,
          isBoss ? 0.7 : 0.58
        );
      }
      return true;
    }

    if (s.phase === 'nova_warn') {
      s.phaseT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.phaseT <= 0) {
        s.phase = 'nova';
        s.laserT = isBoss ? 0.56 : 0.5;
        s.cd = isBoss ? 2.3 : 2.7;
        fireNovaLaser(isBoss ? 10 : 8, isBoss ? 14 : 12, isBoss ? 24 : 18, isBoss ? 0.6 : 0.52);
      }
      return true;
    }

    if (s.phase === 'laser') {
      s.laserT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.laserT <= 0) {
        s.phase = 'idle';
        s.cd = isBoss ? 1.7 : 2.2;
      }
      return true;
    }

    if (s.phase === 'nova') {
      s.laserT -= dtSec;
      e.body.setVelocity(0, 0);
      if (s.laserT <= 0) {
        s.phase = 'idle';
        s.cd = isBoss ? 1.9 : 2.4;
      }
      return true;
    }

    return false;
  }

  fireBullet() {
    if (this.isCoopMode && this.isPvpMode && this.playerHp <= 0) return;
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

    const speed = 660 * this.combatPace;
    b.body.setVelocity(aim.x * speed, aim.y * speed);
    this.emitBurst(sx, sy, { count: 5, tint: 0xcfe9ff, speedMin: 40, speedMax: 120, scaleStart: 0.7, lifespan: 120 });
    this.sendPvpFx('fire', { x: sx, y: sy, ax: aim.x, ay: aim.y });

    const minDmg = Math.max(1, Math.floor(this.baseDamage) - 1);
    const maxDmg = Math.max(minDmg, Math.floor(this.baseDamage) + 1);
    b.damage = Phaser.Math.Between(minDmg, maxDmg);
    b.pierce = this.abilitySystem.bulletPierceEnabled();
    b.hitIds = new Set();
  }

  getPvpDifficultyScalar() {
    const t = this.elapsedMs / 1000;
    return Math.min(1.9, 0.72 + t * 0.0075);
  }

  updatePvpEnemyDirector(dtMs) {
    void dtMs;
  }

  pickSpawnPoint() {
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

    return {
      x: Phaser.Math.Clamp(x, b.x + 40, b.width - 40),
      y: Phaser.Math.Clamp(y, b.y + 40, b.height - 40)
    };
  }

  calcEnemyStats(type, difficultyScalar = 1) {
    let hp = 18;
    let speed = 110;

    switch (type) {
      case EnemyType.SCOUT:
        hp = Math.floor(10 * difficultyScalar);
        speed = 140 * difficultyScalar;
        break;
      case EnemyType.NORMAL:
        hp = Math.floor(18 * difficultyScalar);
        speed = 120 * difficultyScalar;
        break;
      case EnemyType.TANK:
        hp = Math.floor(34 * difficultyScalar);
        speed = 90 * difficultyScalar;
        break;
      case EnemyType.ELITE:
        hp = Math.floor(24 * difficultyScalar);
        speed = 135 * difficultyScalar;
        break;
      case EnemyType.MINIBOSS:
        hp = Math.floor(180 * difficultyScalar);
        speed = 110 * difficultyScalar;
        break;
      default:
        break;
    }

    if (this.isPvpMode) {
      const t = this.elapsedMs / 1000;
      const slowMul = t < 45 ? 0.42 : (t < 90 ? 0.56 : 0.74);
      speed *= slowMul;
    }

    return { hp, speed };
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

    const d = this.isPvpMode ? this.getPvpDifficultyScalar() : this.stageDirector.getDifficultyScalar();
    const { hp, speed } = this.calcEnemyStats(type, d);

    const e = new Enemy(this, x, y, type, hp, speed);
    this.enemies.add(e);
  }

  spawnEnemyAt(x, y, type, opts = {}) {
    const b = this.physics.world.bounds;
    const sx = Phaser.Math.Clamp(x, b.x + 40, b.width - 40);
    const sy = Phaser.Math.Clamp(y, b.y + 40, b.height - 40);
    const d = this.isPvpMode ? this.getPvpDifficultyScalar() : this.stageDirector.getDifficultyScalar();
    const stats = this.calcEnemyStats(type, d);
    const hp = Number.isFinite(opts?.hp) ? Number(opts.hp) : stats.hp;
    const speed = Number.isFinite(opts?.speed) ? Number(opts.speed) : stats.speed;
    const e = new Enemy(this, sx, sy, type, hp, speed);
    if (opts?.netId) {
      e.netId = String(opts.netId);
      e.netTx = sx;
      e.netTy = sy;
      e.netVx = Number.isFinite(opts?.vx) ? Number(opts.vx) : 0;
      e.netVy = Number.isFinite(opts?.vy) ? Number(opts.vy) : 0;
      this.pvpEnemyIndex.set(e.netId, e);
      e.once('destroy', () => this.pvpEnemyIndex.delete(e.netId));
    }
    if (type === EnemyType.MINIBOSS) {
      e.isBossActor = true;
    }
    this.enemies.add(e);
    return e;
  }

  getEnemySoftCap() {
    return Math.min(64, 16 + Math.floor(2.4 * this.stageDirector.stage));
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

    const stageNow = Math.max(1, Math.floor(Number(this.stageDirector?.stage || 1)));
    const d = this.stageDirector.getDifficultyScalar();
    const hp = Math.floor(560 * d * (1 + stageNow * 0.03));
    const speed = Math.max(94, 96 + stageNow * 3.4);

    const boss = new Enemy(this, x, y, EnemyType.BOSS, hp, speed);
    boss.setScale(1.22);
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

    bullet.hitIds?.add(enemy);
    if (!bullet.pierce) bullet.destroy();
    if (this.isPvpMode && enemy.netId) {
      const bvx = Number(bullet?.body?.velocity?.x);
      const bvy = Number(bullet?.body?.velocity?.y);
      const bLen = Math.hypot(bvx, bvy);
      const aim = bLen > 1e-4 ? { x: bvx / bLen, y: bvy / bLen } : null;
      this.sendPveDamage(enemy.netId, dmg, 'BASIC', 'basic', aim);
      return;
    }

    enemy.hp -= dmg;
    this.flashActor(enemy, 0xffffff, 55);
    this.emitBurst(enemy.x, enemy.y, { count: 7, tint: 0xffffff, speedMin: 50, speedMax: 160, scaleStart: 0.7, lifespan: 140 });

    this.playActionSfx('enemy_hit');
    new FloatingText(this, enemy.x, enemy.y - 10, String(dmg), { fontSize: 17, color: '#ffffff' });
    this.applyLifesteal(dmg);

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  getXpForEnemy(type) {
    const base = XP_PER_TYPE[type] ?? 8;
    return Math.max(1, Math.floor(base * this.xpGainMul * this.relicXpGainMul));
  }

  killEnemy(enemy, grantRewards = true) {
    if (!enemy.active) return;
    if (enemy.netId) this.pvpEnemyIndex.delete(enemy.netId);

    this.playActionSfx('enemy_death');
    const deathTint = enemy.type === EnemyType.BOSS ? 0xff66df
      : enemy.type === EnemyType.MINIBOSS ? 0xd98cff
      : enemy.type === EnemyType.ELITE ? 0xc692ff
      : enemy.type === EnemyType.TANK ? 0x8fffad
      : enemy.type === EnemyType.NORMAL ? 0xffc48b
      : 0xff8a8a;
    this.emitBurst(enemy.x, enemy.y, { count: 18, tint: deathTint, speedMin: 90, speedMax: 250, lifespan: 260 });
    if (grantRewards) {
      this.kills += 1;
      this.baseScore += SCORE_PER_TYPE[enemy.type] ?? 10;
    }

    if (grantRewards) {
      const xp = this.getXpForEnemy(enemy.type);
      const leveled = this.progression.grantXp(xp);
      if (leveled > 0) {
        this.applyLevelGrowth(leveled);
        new FloatingText(this, this.player.x, this.player.y - 60, `레벨 ${this.progression.level}`, { fontSize: 20, color: '#7ea0ff' });
      }
    }

    if (grantRewards && !this.isPvpMode) {
      const { chance, min, max } = this.getGoldDropTable(enemy.type);
      if (Math.random() < chance) {
        const amount = Phaser.Math.Between(min, max);
        const g = new GoldPickup(this, enemy.x, enemy.y, amount);
        this.goldPickups.add(g);
      }
    }

    enemy.destroy();
    if (!this.isPvpMode) this.stageDirector.onEnemyKilled();

    if (!this.isPvpMode && enemy.type === EnemyType.BOSS) {
      if (this.stageDirector.stage >= STAGE_MODE_FINAL_STAGE) {
        this.gameOver('stage_clear');
        return;
      }
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
    if (this.isPvpMode && enemy.netId) return;

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
      ? (inDash ? 70 : 52)
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

  onDefenseCoreTouchEnemy(enemy) {
    if (this.runMode !== 'defense' || !this.defenseCore || !enemy?.active) return;
    const now = this.time.now;
    if ((enemy._coreHitLockUntil ?? 0) > now) return;
    enemy._coreHitLockUntil = now + 360;

    const dmg = enemy.type === EnemyType.BOSS ? 22
      : enemy.type === EnemyType.MINIBOSS ? 14
        : enemy.type === EnemyType.ELITE ? 8
          : enemy.type === EnemyType.TANK ? 6
            : 4;
    this.defenseCoreHp = Math.max(0, this.defenseCoreHp - dmg);
    this.defenseCorePulse = 0.22;
    this.defenseCoreRegenDelaySec = DEFENSE_CORE_REGEN_DELAY_SEC;
    new FloatingText(this, this.defenseCore.x, this.defenseCore.y - 34, `-${dmg}`, { fontSize: 15, color: '#ff8f8f' });

    const dx = enemy.x - this.defenseCore.x;
    const dy = enemy.y - this.defenseCore.y;
    const len = Math.hypot(dx, dy) || 1;
    enemy.body.velocity.x += (dx / len) * 140;
    enemy.body.velocity.y += (dy / len) * 140;

    if (this.defenseCoreHp <= 0) {
      this.defenseCoreHp = 0;
      this.gameOver('core_destroyed');
    }
  }

  updateDefenseCore(dtSec) {
    if (this.runMode !== 'defense' || !this.defenseCore) return;
    this.defenseCorePulse = Math.max(0, this.defenseCorePulse - dtSec);
    this.defenseCoreRegenDelaySec = Math.max(0, this.defenseCoreRegenDelaySec - dtSec);
    if (this.defenseCoreRegenDelaySec <= 0 && this.defenseCoreHp > 0 && this.defenseCoreHp < this.defenseCoreHpMax) {
      this.defenseCoreHp = Math.min(this.defenseCoreHpMax, this.defenseCoreHp + this.defenseCoreRegenPerSec * dtSec);
    }
    const hpRatio = this.defenseCoreHpMax > 0 ? this.defenseCoreHp / this.defenseCoreHpMax : 0;
    const pulse = 1 + Math.sin(this.elapsedMs * 0.007) * 0.04 + this.defenseCorePulse * 0.24;
    this.defenseCore.root.setScale(pulse);
    this.defenseCore.aura.setAlpha(0.35 + (1 - hpRatio) * 0.15 + this.defenseCorePulse * 0.35);
    this.defenseCore.glow.setAlpha(0.08 + (1 - hpRatio) * 0.08 + this.defenseCorePulse * 0.3);
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

  gameOver(reason = 'player_down') {
    if (this.isPvpMode && !this.isCoopMode) {
      this.bgm?.stop();
      this.scene.start('PvpGameOver', {
        result: 'lose',
        reason,
        profile: this.pvpProfile,
        pvp: {
          token: this.pvpToken,
          serverBaseUrl: this.pvpServerBaseUrl,
          user: this.pvpUser,
          partyKey: this.partyKey
        }
      });
      return;
    }
    const timeSec = this.elapsedMs / 1000;
    const timeBonus = Math.floor(timeSec * 7);
    const totalScore = this.baseScore + timeBonus;
    const finalStage = this.isCoopMode ? this.coopStage : this.stageDirector.stage;
    const displayName = String(this.pvpUser?.name || this.pvpProfile?.name || '플레이어');
    const modeForRecord = this.displayMode || this.runMode;
    SaveSystem.saveRecord({
      name: displayName,
      totalScore,
      timeSec,
      kills: this.kills,
      stage: finalStage,
      level: this.progression.level,
      mode: modeForRecord
    });
    if (this.pvpToken && (modeForRecord === 'survival' || modeForRecord === 'coop')) {
      const session = {
        token: this.pvpToken,
        serverBaseUrl: this.pvpServerBaseUrl
      };
      void LeaderboardSystem.submitRun(session, {
        mode: modeForRecord,
        stage: finalStage,
        score: totalScore,
        timeSec,
        kills: this.kills
      }).catch(() => {});
    }
    this.bgm?.stop();
    this.scene.start('GameOver', {
      stage: finalStage,
      runGold: this.runGold,
      level: this.progression.level,
      kills: this.kills,
      timeSec,
      totalScore,
      mode: this.isPvpMode ? (this.isCoopMode ? 'coop' : 'pvp') : this.runMode,
      pvp: this.pvpToken ? {
        token: this.pvpToken,
        serverBaseUrl: this.pvpServerBaseUrl,
        user: this.pvpUser,
        partyKey: this.partyKey
      } : null,
      reason
    });
  }
}


