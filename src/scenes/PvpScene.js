import Phaser from 'phaser';
import { Client as ColyseusClient } from '@colyseus/sdk';
import { getPvpServerBaseUrl, toWsBaseUrl } from '../utils/network.js';
import LevelUpOverlay from '../systems/LevelUpOverlay.js';
import SaveSystem from '../systems/SaveSystem.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';
const WORLD_W = 4800;
const WORLD_H = 3000;
const HUD_FONT_DISPLAY = 'Rajdhani, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const HUD_FONT_BODY = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const HUD_COLOR_PANEL = 0x0f1f33;
const HUD_COLOR_PANEL_DARK = 0x0b1526;
const HUD_COLOR_PANEL_STROKE = 0x305a83;
const HUD_COLOR_ACCENT = 0x4cc9f0;
const HUD_COLOR_TEXT_MAIN = '#e8f3ff';
const HUD_COLOR_TEXT_SUB = '#9ab4d2';
const HUD_COLOR_XP = 0x47d3ff;

const CARD_META = {
  ATK_UP: { label: '공격력 강화', desc: '기본 공격 피해 +2' },
  FIRE_RATE_UP: { label: '공격 속도 강화', desc: '기본 공격 간격 12% 감소' },
  MAX_HP_UP: { label: '최대 체력 강화', desc: '최대 체력 +12, 체력 회복 +12' },
  MOVE_SPEED_UP: { label: '이동 속도 강화', desc: '이동 속도 +22' },
  SHOT_RANGE_UP: { label: '사거리 강화', desc: '기본 공격 사거리 +70' },
  HEAL_UP: { label: '응급 회복', desc: '현재 체력 +18 회복' }
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function enemyTextureByType(type) {
  if (type === 'elite') return 'tex_enemy_elite';
  if (type === 'brute') return 'tex_enemy_tank';
  return 'tex_enemy_scout';
}

export default class PvpScene extends Phaser.Scene {
  constructor() {
    super('Pvp');
    this.room = null;
    this.client = null;
    this.netTick = null;
    this.players = new Map();
    this.enemies = new Map();
    this.selfSid = null;
    this.matchEnded = false;
    this.levelupOpen = false;
    this.latestState = null;
  }

  init(data) {
    this.authToken = String(data?.token || '');
    this.serverBaseUrl = String(data?.serverBaseUrl || getPvpServerBaseUrl());
    this.selfSid = null;
    this.matchEnded = false;
    this.levelupOpen = false;
    this.latestState = null;
    this.players.clear();
    this.enemies.clear();
  }

  create() {
    this.createWorldBackdrop(WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.noticeText = this.add.text(this.scale.width * 0.5, 86, '매칭 대기 중...', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#8fa4cd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1200);

    this.resultText = this.add.text(this.scale.width * 0.5, this.scale.height * 0.5, '', {
      fontFamily: FONT_KR,
      fontSize: '42px',
      color: '#ffd86f'
    }).setOrigin(0.5).setVisible(false).setScrollFactor(0).setDepth(2100);

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up2: Phaser.Input.Keyboard.KeyCodes.UP,
      down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      shoot: Phaser.Input.Keyboard.KeyCodes.SPACE,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE
    });

    this.levelUpOverlay = new LevelUpOverlay(this, (key) => {
      if (!this.room) return;
      this.room.send('levelup.pick', { key });
      this.levelupOpen = false;
      this.levelUpOverlay.hide();
    });

    this.createHud();

    this.input.keyboard.on('keydown-ESC', () => this.backToLobby());
    this.events.once('shutdown', () => this.cleanup());

    this.connect().catch((err) => {
      const raw = String(err?.message || err || '');
      const msg = raw === '[object ProgressEvent]' ? `네트워크 연결 실패 (${this.serverBaseUrl})` : raw;
      this.noticeText.setText(`연결 실패: ${msg.slice(0, 80)}`);
    });
  }

  createWorldBackdrop(worldW, worldH) {
    this.cameras.main.setBackgroundColor(0x050c1d);
    this.bgLayer = this.add.tileSprite(worldW * 0.5, worldH * 0.5, worldW, worldH, 'tex_bg_tile');
    this.bgLayer.setDepth(-20);

    this.bgNebula = this.add.graphics().setDepth(-18);
    const colors = [0x112748, 0x1e2b54, 0x1c3658];
    colors.forEach((c, idx) => {
      this.bgNebula.fillStyle(c, 0.12 + idx * 0.03);
      const x = worldW * (0.22 + idx * 0.3);
      const y = worldH * (0.32 + idx * 0.2);
      this.bgNebula.fillCircle(x, y, 210 + idx * 55);
    });
  }

  createHud() {
    this.ui = {};
    const fontDisplay = HUD_FONT_DISPLAY;
    const fontBody = HUD_FONT_BODY;

    this.ui.topRibbon = this.add.rectangle(0, 0, 360, 50, HUD_COLOR_PANEL_DARK, 0.54).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.topRibbon.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.92);
    this.ui.topRibbonGlow = this.add.rectangle(0, 0, 356, 2, HUD_COLOR_ACCENT, 0.58).setOrigin(0.5, 0).setScrollFactor(0);

    this.ui.goldPanel = this.add.rectangle(0, 0, 168, 30, HUD_COLOR_PANEL, 0.78).setOrigin(0, 0).setScrollFactor(0);
    this.ui.goldPanel.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.gold = this.add.text(0, 0, '', { fontFamily: fontDisplay, fontSize: '16px', color: '#ffd166' }).setScrollFactor(0);
    this.ui.coin = this.add.image(0, 0, 'tex_gold').setScale(0.78).setScrollFactor(0);

    this.ui.minimapBg = this.add.rectangle(0, 0, 132, 92, HUD_COLOR_PANEL_DARK, 0.84).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimapBg.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.minimapHeader = this.add.rectangle(0, 0, 132, 18, 0x132740, 0.95).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimapLabel = this.add.text(0, 0, 'SENSOR', {
      fontFamily: fontDisplay,
      fontSize: '10px',
      color: '#9dd8ee'
    }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimap = this.add.graphics().setScrollFactor(0);

    this.ui.stage = this.add.text(this.scale.width / 2, 12, '', {
      fontFamily: fontDisplay,
      fontSize: '22px',
      color: HUD_COLOR_TEXT_MAIN
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.stageSub = this.add.text(this.scale.width / 2, 31, '', {
      fontFamily: fontBody,
      fontSize: '12px',
      color: HUD_COLOR_TEXT_SUB
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.modeObjective = this.add.text(this.scale.width / 2, 47, '', {
      fontFamily: fontBody,
      fontSize: '12px',
      color: '#89d5ff'
    }).setOrigin(0.5, 0).setScrollFactor(0);

    this.ui.timePanel = this.add.rectangle(0, 0, 108, 32, HUD_COLOR_PANEL, 0.78).setOrigin(0, 0).setScrollFactor(0);
    this.ui.timePanel.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 0.95);
    this.ui.time = this.add.text(this.scale.width - 18, 14, '', {
      fontFamily: fontDisplay,
      fontSize: '19px',
      color: HUD_COLOR_TEXT_MAIN
    }).setOrigin(1, 0.5).setScrollFactor(0);

    this.ui.xpBarBg = this.add.rectangle(0, 0, this.scale.width, 8, 0x0f1d31, 0.98).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarBg.setStrokeStyle(1, HUD_COLOR_PANEL_STROKE, 1);
    this.ui.xpBarFill = this.add.rectangle(0, 0, this.scale.width, 8, HUD_COLOR_XP, 0.96).setOrigin(0, 1).setScrollFactor(0);
    this.ui.xpBarEdge = this.add.rectangle(0, 0, this.scale.width, 1, 0xa8ebff, 0.65).setOrigin(0, 1).setScrollFactor(0);

    this.ui.statusBg = this.add.rectangle(0, 0, 300, 72, HUD_COLOR_PANEL, 0.84).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusBg.setStrokeStyle(2, HUD_COLOR_PANEL_STROKE, 0.96);
    this.ui.statusAccent = this.add.rectangle(0, 0, 4, 70, HUD_COLOR_ACCENT, 0.3).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusLine = this.add.rectangle(0, 0, 0, 10, 0x0c1628, 0.98).setOrigin(0, 0).setScrollFactor(0);
    this.ui.statusLine.setStrokeStyle(1, 0x294d74, 1);
    this.ui.statusLineFill = this.add.rectangle(0, 0, 0, 8, 0x55d98d, 0.98).setOrigin(0, 0).setScrollFactor(0);
    this.ui.hp = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '15px', color: HUD_COLOR_TEXT_MAIN }).setOrigin(0, 0).setScrollFactor(0);
    this.ui.shield = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '13px', color: '#8fcfff' }).setOrigin(1, 0).setScrollFactor(0);
    this.ui.synergy = this.add.text(0, 0, '', { fontFamily: fontBody, fontSize: '11px', color: '#79caef' }).setOrigin(0, 0).setScrollFactor(0);

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
      const icon = this.add.text(0, 0, '-', {
        fontFamily: fontDisplay,
        fontSize: '12px',
        color: '#e5f2ff',
        align: 'center'
      }).setOrigin(0.5).setScrollFactor(0);
      this.ui.skillSlots.push({ bg, border, num, icon, rect: { x: 0, y: 0, w: 52, h: 52 } });
    }

    const hudDepth = 1000;
    [
      this.ui.topRibbon,
      this.ui.topRibbonGlow,
      this.ui.goldPanel,
      this.ui.gold,
      this.ui.coin,
      this.ui.minimapBg,
      this.ui.minimapHeader,
      this.ui.minimapLabel,
      this.ui.stage,
      this.ui.stageSub,
      this.ui.modeObjective,
      this.ui.timePanel,
      this.ui.time,
      this.ui.xpBarBg,
      this.ui.xpBarFill,
      this.ui.xpBarEdge,
      this.ui.statusBg,
      this.ui.statusAccent,
      this.ui.statusLine,
      this.ui.statusLineFill,
      this.ui.hp,
      this.ui.shield,
      this.ui.synergy
    ].filter(Boolean).forEach((obj) => obj.setDepth(hudDepth));
    this.ui.minimap.setDepth(hudDepth + 1);
    this.ui.skillSlots.forEach((slot) => {
      slot.bg.setDepth(hudDepth);
      slot.border.setDepth(hudDepth + 1);
      slot.num.setDepth(hudDepth + 2);
      slot.icon.setDepth(hudDepth + 1);
    });

    this.layoutHud(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize) => {
      this.layoutHud(gameSize.width, gameSize.height);
      this.noticeText?.setPosition(gameSize.width * 0.5, 86);
      this.resultText?.setPosition(gameSize.width * 0.5, gameSize.height * 0.5);
    });
  }

  layoutHud(w, h) {
    const xpH = 8;
    const pad = w < 720 ? 8 : 12;

    const topW = Math.min(380, Math.max(280, Math.floor(w * 0.34)));
    this.ui.topRibbon.setPosition(Math.floor(w * 0.5), 6).setSize(topW, 50);
    this.ui.topRibbonGlow.setPosition(Math.floor(w * 0.5), 6).setSize(Math.max(40, topW - 4), 2);

    const goldW = w < 720 ? 150 : 168;
    this.ui.goldPanel.setPosition(pad, 8).setSize(goldW, 30);
    this.ui.coin.setPosition(pad + 12, 22);
    this.ui.gold.setPosition(pad + 26, 11);

    const mmW = w < 720 ? 112 : 132;
    const mmH = w < 720 ? 78 : 92;
    const mmX = pad;
    const mmY = 42;
    const mmHeaderH = 18;
    this.ui.minimapBg.setPosition(mmX, mmY).setSize(mmW, mmH);
    this.ui.minimapHeader.setPosition(mmX, mmY).setSize(mmW, mmHeaderH);
    this.ui.minimapLabel.setPosition(mmX + 8, mmY + 3);
    this.ui.minimapLayout = { x: mmX, y: mmY + mmHeaderH, w: mmW, h: mmH - mmHeaderH, pad: 5 };

    this.ui.stage.setPosition(w * 0.5, 10);
    this.ui.stageSub.setPosition(w * 0.5, 31);
    this.ui.modeObjective.setPosition(w * 0.5, 47);

    const timeW = w < 720 ? 96 : 108;
    this.ui.timePanel.setPosition(w - pad - timeW, 8).setSize(timeW, 32);
    this.ui.time.setPosition(w - pad - 8, 24);

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
    this.ui.shield.setPosition(statusX + statusW - 14, statusY + 10);
    this.ui.synergy.setPosition(statusX + 14, statusY + 54);
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
      slot.icon.setPosition(x + box * 0.5, y + box * 0.5 + 2).setFontSize(Math.max(10, Math.floor(box * 0.21)));
    });
  }

  update(_time, dt) {
    const alpha = Math.min(1, dt / 1000 * 12);

    for (const node of this.players.values()) {
      node.x = lerp(node.x, node.targetX, alpha);
      node.y = lerp(node.y, node.targetY, alpha);
      node.body.setPosition(node.x, node.y);
      node.shadow.setPosition(node.x, node.y + 20);
      node.hpText.setPosition(node.x, node.y - 34);
      node.nameText.setPosition(node.x, node.y + 30);
    }

    for (const node of this.enemies.values()) {
      node.x = lerp(node.x, node.targetX, alpha);
      node.y = lerp(node.y, node.targetY, alpha);
      node.body.setPosition(node.x, node.y);
      node.shadow.setPosition(node.x, node.y + 16);
      node.hpText.setPosition(node.x, node.y - 24);
    }

    if (this.levelupOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.pickLevelupByIndex(0);
      if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.pickLevelupByIndex(1);
      if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.pickLevelupByIndex(2);
    }

    this.updateHud();
  }

  updateHud() {
    if (!this.ui || !this.ui.statusLayout) return;

    const me = this.players.get(this.selfSid);
    const enemy = Array.from(this.players.values()).find((p) => p.id !== this.selfSid);
    const elapsed = Number(this.latestState?.elapsedSec || 0);
    const elapsedInt = Math.max(0, Math.floor(elapsed));
    const stage = 1 + Math.floor(elapsed / 45);
    const mm = String(Math.floor(elapsedInt / 60)).padStart(2, '0');
    const ss = String(elapsedInt % 60).padStart(2, '0');

    this.ui.gold.setText(`${SaveSystem.getTotalGold()} (+0)`);
    this.ui.stage.setText(`ARENA ${stage}`);
    this.ui.stageSub.setText('');
    this.ui.modeObjective.setText('PVP 모드');
    this.ui.modeObjective.setColor('#89d5ff');
    this.ui.time.setText(`${mm}:${ss}`);

    const hpNow = me ? Math.max(0, Math.floor(me.hp)) : 0;
    const hpMax = me ? Math.max(1, Math.floor(me.maxHp)) : 1;
    const hpRatio = hpMax > 0 ? Phaser.Math.Clamp(hpNow / hpMax, 0, 1) : 0;

    this.ui.hp.setColor(hpRatio < 0.35 ? '#ff9b9b' : HUD_COLOR_TEXT_MAIN);
    this.ui.hp.setText(`Lv.${me ? me.level : 1}  HP ${hpNow}/${hpMax}`);
    this.ui.shield.setVisible(false);
    this.ui.shield.setText('');
    this.ui.synergy.setText(enemy ? `상대 Lv.${enemy.level}  HP ${Math.max(0, Math.floor(enemy.hp))}` : '상대 탐색 중');

    const ratio = me && me.xpToNext > 0 ? Phaser.Math.Clamp(me.xp / me.xpToNext, 0, 1) : 0;
    this.ui.xpBarFill.width = this.scale.width * ratio;
    const hpTrackW = Math.max(0, this.ui.statusLayout.w - 30);
    const hpFillColor = hpRatio < 0.28 ? 0xff7361 : (hpRatio < 0.58 ? 0xffb85c : 0x55d98d);
    this.ui.statusLineFill.setFillStyle(hpFillColor, 0.98);
    this.ui.statusLineFill.width = hpTrackW * hpRatio;
    this.ui.statusAccent.setAlpha(0.24 + (1 - hpRatio) * 0.35);

    this.ui.skillSlots.forEach((slot) => {
      slot.bg.setFillStyle(0x0d192c, 0.74);
      slot.num.setColor('#6e89a5');
      slot.border.setStrokeStyle(2, 0x2c4866, 1);
      slot.icon.setText('-');
    });

    this.drawMinimap();
  }

  drawMinimap() {
    if (!this.ui?.minimap || !this.ui?.minimapLayout) return;
    const g = this.ui.minimap;
    const { x, y, w, h, pad } = this.ui.minimapLayout;
    g.clear();

    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    g.fillStyle(0x081223, 0.92);
    g.fillRect(innerX, innerY, innerW, innerH);
    g.lineStyle(1, 0x23486c, 0.35);
    g.strokeRect(innerX, innerY, innerW, innerH);

    const gx = innerX + innerW * 0.5;
    const gy = innerY + innerH * 0.5;
    g.lineStyle(1, 0x274d72, 0.22);
    g.beginPath();
    g.moveTo(gx, innerY);
    g.lineTo(gx, innerY + innerH);
    g.moveTo(innerX, gy);
    g.lineTo(innerX + innerW, gy);
    g.strokePath();

    const toMini = (wx, wy) => ({
      x: innerX + Phaser.Math.Clamp(wx / WORLD_W, 0, 1) * innerW,
      y: innerY + Phaser.Math.Clamp(wy / WORLD_H, 0, 1) * innerH
    });

    for (const enemy of this.enemies.values()) {
      const p = toMini(enemy.x, enemy.y);
      g.fillStyle(0xff8d6f, 0.86);
      g.fillCircle(p.x, p.y, 1.4);
    }

    for (const [sid, player] of this.players.entries()) {
      const p = toMini(player.x, player.y);
      if (sid === this.selfSid) {
        g.fillStyle(0xb5ecff, 1);
        g.fillCircle(p.x, p.y, 2.2);
        g.lineStyle(1, 0x4cc9f0, 0.9);
        g.strokeCircle(p.x, p.y, 3.6);
      } else {
        g.fillStyle(0xffb1a6, 0.95);
        g.fillCircle(p.x, p.y, 2.2);
        g.lineStyle(1, 0xff8d6f, 0.9);
        g.strokeCircle(p.x, p.y, 3.4);
      }
    }

    const cam = this.cameras?.main;
    if (cam?.worldView) {
      const vx = innerX + cam.worldView.x / WORLD_W * innerW;
      const vy = innerY + cam.worldView.y / WORLD_H * innerH;
      const vw = cam.worldView.width / WORLD_W * innerW;
      const vh = cam.worldView.height / WORLD_H * innerH;
      g.lineStyle(1, 0x4cc9f0, 0.55);
      g.strokeRect(vx, vy, vw, vh);
    }
  }

  async connect() {
    if (!this.authToken) {
      this.noticeText.setText('로그인이 필요합니다.');
      this.time.delayedCall(1000, () => this.backToLobby());
      return;
    }

    const wsBase = toWsBaseUrl(this.serverBaseUrl);
    this.client = new ColyseusClient(wsBase);
    this.client.auth.token = this.authToken;

    this.noticeText.setText('매칭 대기 중...');
    this.room = await this.client.joinOrCreate('battle', {});
    this.selfSid = this.room.sessionId;

    this.bindRoomHandlers();
    this.startNetTick();
  }

  bindRoomHandlers() {
    if (!this.room) return;

    this.room.onMessage('match.waiting', () => {
      this.noticeText.setText('매칭 대기 중...');
    });

    this.room.onMessage('match.start', () => {
      this.noticeText.setText('전투 시작');
    });

    this.room.onMessage('combat.hit', (msg) => {
      const toSid = String(msg?.toSid || '');
      const targetType = String(msg?.targetType || '');

      if (targetType === 'enemy') {
        const target = this.enemies.get(toSid);
        if (!target) return;
        this.spawnDamageText(target.x, target.y - 36, msg?.damage, '#ffd89b');
        return;
      }

      const target = this.players.get(toSid);
      if (!target) return;
      this.spawnDamageText(target.x, target.y - 44, msg?.damage, '#ff8f8f');
    });

    this.room.onMessage('levelup.offer', (msg) => {
      const choices = Array.isArray(msg?.choices) ? msg.choices.map((v) => String(v || '')) : [];
      if (choices.length === 0) return;

      this.levelupChoices = choices;
      this.levelupOpen = true;
      this.levelUpOverlay.show(
        choices,
        (key) => CARD_META[key]?.label || key,
        (key) => CARD_META[key]?.desc || ''
      );
      this.noticeText.setText('레벨업 카드 선택');
    });

    this.room.onMessage('levelup.applied', () => {
      this.levelupOpen = false;
      this.levelUpOverlay.hide();
      this.noticeText.setText('전투 진행 중');
    });

    this.room.onMessage('match.end', (msg) => {
      this.matchEnded = true;
      this.stopNetTick();
      this.levelupOpen = false;
      this.levelUpOverlay.hide();

      const win = String(msg?.winnerSid || '') === this.selfSid;
      this.resultText
        .setText(win ? '승리' : '패배')
        .setColor(win ? '#8ef0a7' : '#ff8f8f')
        .setVisible(true);
      this.noticeText.setText(msg?.reason === 'disconnect' ? '상대 연결 종료' : '경기 종료');
      this.time.delayedCall(2200, () => this.backToLobby());
    });

    this.room.onStateChange((state) => {
      this.latestState = state;
      try {
        this.syncPlayers(state);
        this.syncEnemies(state);
      } catch (err) {
        this.noticeText.setText(`상태 처리 오류: ${String(err?.message || err).slice(0, 80)}`);
      }
    });

    this.room.onLeave(() => {
      if (this.matchEnded) return;
      this.noticeText.setText('연결이 종료되었습니다.');
      this.stopNetTick();
    });

    this.room.onError((_code, message) => {
      this.noticeText.setText(`오류: ${String(message || 'unknown').slice(0, 80)}`);
    });
  }

  startNetTick() {
    this.stopNetTick();
    this.netTick = this.time.addEvent({
      delay: 33,
      loop: true,
      callback: () => {
        if (!this.room || this.matchEnded) return;

        const mx = (this.keys.left.isDown || this.keys.left2.isDown ? -1 : 0)
          + (this.keys.right.isDown || this.keys.right2.isDown ? 1 : 0);
        const my = (this.keys.up.isDown || this.keys.up2.isDown ? -1 : 0)
          + (this.keys.down.isDown || this.keys.down2.isDown ? 1 : 0);

        const pointer = this.input.activePointer;
        const self = this.players.get(this.selfSid);
        const ax = self ? pointer.worldX - self.x : 1;
        const ay = self ? pointer.worldY - self.y : 0;
        const shoot = this.keys.shoot.isDown || pointer.isDown;

        this.room.send('input', { mx, my, ax, ay, shoot });
      }
    });
  }

  stopNetTick() {
    if (this.netTick) {
      this.netTick.remove(false);
      this.netTick = null;
    }
  }

  syncPlayers(state) {
    if (!state?.players) return;

    const seen = new Set();
    state.players.forEach((p, sid) => {
      if (!p) return;
      const id = String(sid);
      seen.add(id);

      if (!this.players.has(id)) {
        const isSelf = id === this.selfSid;
        const body = this.add.image(Number(p.x || 0), Number(p.y || 0), 'tex_player').setDepth(4);
        body.setDisplaySize(34, 34);
        body.setTint(isSelf ? 0xffffff : 0xff8fb4);
        const shadow = this.add.image(body.x, body.y + 20, 'tex_shadow').setDepth(2).setAlpha(0.45);
        shadow.setDisplaySize(42, 18);

        const hpText = this.add.text(body.x, body.y - 34, '', {
          fontFamily: FONT_KR,
          fontSize: '14px',
          color: '#eaf0ff'
        }).setOrigin(0.5).setDepth(7);

        const nameText = this.add.text(body.x, body.y + 30, isSelf ? '나' : String(p.name || '상대'), {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#aab6d6'
        }).setOrigin(0.5).setDepth(7);

        this.players.set(id, {
          id,
          body,
          shadow,
          hpText,
          nameText,
          x: body.x,
          y: body.y,
          targetX: body.x,
          targetY: body.y,
          hp: Number(p.hp || 0),
          maxHp: Number(p.maxHp || 1),
          level: Number(p.level || 1),
          xp: Number(p.xp || 0),
          xpToNext: Number(p.xpToNext || 1)
        });
      }

      const node = this.players.get(id);
      if (!node) return;
      node.targetX = Number(p.x || 0);
      node.targetY = Number(p.y || 0);
      node.hp = Number(p.hp || 0);
      node.maxHp = Number(p.maxHp || 1);
      node.level = Number(p.level || 1);
      node.xp = Number(p.xp || 0);
      node.xpToNext = Number(p.xpToNext || 1);
      node.hpText.setText(`HP ${Math.max(0, Math.floor(node.hp))}/${Math.max(1, Math.floor(node.maxHp))}  Lv.${node.level}`);
      node.nameText.setText(id === this.selfSid ? '나' : String(p.name || '상대'));
    });

    for (const [sid, node] of this.players.entries()) {
      if (seen.has(sid)) continue;
      node.body.destroy();
      node.shadow.destroy();
      node.hpText.destroy();
      node.nameText.destroy();
      this.players.delete(sid);
    }

    const self = this.players.get(this.selfSid);
    if (self) {
      this.cameras.main.startFollow(self.body, true, 0.12, 0.12);
    }
  }

  syncEnemies(state) {
    if (!state?.enemies) return;

    const seen = new Set();
    state.enemies.forEach((e, enemyId) => {
      if (!e) return;
      const id = String(enemyId);
      seen.add(id);

      if (!this.enemies.has(id)) {
        const tex = enemyTextureByType(String(e.type || 'scout'));
        const body = this.add.image(Number(e.x || 0), Number(e.y || 0), tex).setDepth(3);
        const baseSize = tex === 'tex_enemy_elite' ? 34 : tex === 'tex_enemy_tank' ? 32 : 28;
        body.setDisplaySize(baseSize, baseSize);
        const shadow = this.add.image(body.x, body.y + 16, 'tex_shadow').setDepth(2).setAlpha(0.4);
        shadow.setDisplaySize(baseSize * 1.5, 12);

        const hpText = this.add.text(body.x, body.y - 24, '', {
          fontFamily: FONT_KR,
          fontSize: '12px',
          color: '#d8e4ff'
        }).setOrigin(0.5).setDepth(7);

        this.enemies.set(id, {
          id,
          body,
          shadow,
          hpText,
          x: body.x,
          y: body.y,
          targetX: body.x,
          targetY: body.y,
          hp: Number(e.hp || 0),
          maxHp: Number(e.maxHp || 1)
        });
      }

      const node = this.enemies.get(id);
      if (!node) return;
      node.targetX = Number(e.x || 0);
      node.targetY = Number(e.y || 0);
      node.hp = Number(e.hp || 0);
      node.maxHp = Number(e.maxHp || 1);
      node.hpText.setText(`${Math.max(0, Math.floor(node.hp))}`);
    });

    for (const [enemyId, node] of this.enemies.entries()) {
      if (seen.has(enemyId)) continue;
      node.body.destroy();
      node.shadow.destroy();
      node.hpText.destroy();
      this.enemies.delete(enemyId);
    }
  }

  spawnDamageText(x, y, dmg, color) {
    const pop = this.add.text(x, y, `-${Math.max(0, Math.floor(Number(dmg || 0)))}`, {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color
    }).setOrigin(0.5).setDepth(10);

    this.tweens.add({
      targets: pop,
      y: pop.y - 22,
      alpha: 0,
      duration: 420,
      onComplete: () => pop.destroy()
    });
  }

  pickLevelupByIndex(index) {
    if (!this.levelupOpen || !this.room) return;
    if (!Array.isArray(this.levelupChoices) || this.levelupChoices.length <= index) return;
    const key = String(this.levelupChoices[index] || '');
    if (!key) return;
    this.room.send('levelup.pick', { key });
    this.levelupOpen = false;
    this.levelUpOverlay.hide();
  }

  cleanup() {
    this.stopNetTick();

    if (this.levelUpOverlay) {
      this.levelUpOverlay.destroy();
      this.levelUpOverlay = null;
    }

    for (const node of this.players.values()) {
      node.body.destroy();
      node.shadow.destroy();
      node.hpText.destroy();
      node.nameText.destroy();
    }
    this.players.clear();

    for (const node of this.enemies.values()) {
      node.body.destroy();
      node.shadow.destroy();
      node.hpText.destroy();
    }
    this.enemies.clear();

    this.ui = null;

    this.noticeText?.destroy();
    this.resultText?.destroy();
    this.bgLayer?.destroy();
    this.bgNebula?.destroy();

    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.client = null;
  }

  backToLobby() {
    this.cleanup();
    this.scene.start('Lobby');
  }
}
