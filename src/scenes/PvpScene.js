import Phaser from 'phaser';
import { Client as ColyseusClient } from '@colyseus/sdk';
import { getPvpServerBaseUrl, toWsBaseUrl } from '../utils/network.js';
import LevelUpOverlay from '../systems/LevelUpOverlay.js';
import SaveSystem from '../systems/SaveSystem.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';
const WORLD_W = 4800;
const WORLD_H = 3000;

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
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';

    this.ui.gold = this.add.text(0, 0, '', { fontFamily: font, fontSize: '18px', color: '#ffd700' }).setScrollFactor(0);
    this.ui.coin = this.add.image(0, 0, 'tex_gold').setScale(0.9).setScrollFactor(0);
    this.ui.minimapBg = this.add.rectangle(0, 0, 140, 96, 0x101a2c, 0.62).setOrigin(0, 0).setScrollFactor(0);
    this.ui.minimapBg.setStrokeStyle(1, 0x3b4d75, 0.9);
    this.ui.minimap = this.add.graphics().setScrollFactor(0);

    this.ui.stage = this.add.text(this.scale.width / 2, 14, '', { fontFamily: font, fontSize: '18px', color: '#eaf0ff' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.stageSub = this.add.text(this.scale.width / 2, 36, '', { fontFamily: font, fontSize: '14px', color: '#aab6d6' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.ui.modeObjective = this.add.text(this.scale.width / 2, 56, '', { fontFamily: font, fontSize: '14px', color: '#8bc6ff' }).setOrigin(0.5, 0).setScrollFactor(0);
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
      const icon = this.add.text(0, 0, '-', {
        fontFamily: font,
        fontSize: '12px',
        color: '#eaf0ff',
        align: 'center'
      }).setOrigin(0.5).setScrollFactor(0);
      this.ui.skillSlots.push({ bg, border, num, icon, rect: { x: 0, y: 0, w: 56, h: 56 } });
    }

    const hudDepth = 1000;
    [
      this.ui.gold,
      this.ui.coin,
      this.ui.minimapBg,
      this.ui.stage,
      this.ui.stageSub,
      this.ui.modeObjective,
      this.ui.time,
      this.ui.xpBarBg,
      this.ui.xpBarFill,
      this.ui.statusBg,
      this.ui.statusLine,
      this.ui.hp,
      this.ui.shield,
      this.ui.synergy
    ].forEach((obj) => obj.setDepth(hudDepth));
    this.ui.minimap.setDepth(hudDepth + 1);
    this.ui.skillSlots.forEach((slot) => {
      slot.bg.setDepth(hudDepth);
      slot.border.setDepth(hudDepth);
      slot.num.setDepth(hudDepth + 3);
      slot.icon.setDepth(hudDepth);
    });

    this.layoutHud(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize) => {
      this.layoutHud(gameSize.width, gameSize.height);
      this.noticeText?.setPosition(gameSize.width * 0.5, 86);
      this.resultText?.setPosition(gameSize.width * 0.5, gameSize.height * 0.5);
    });
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
    this.ui.modeObjective.setPosition(w / 2, 56);
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
      slot.icon.setPosition(x + box * 0.5, y + box * 0.5 + 3).setFontSize(Math.max(10, Math.floor(box * 0.22)));
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

    this.ui.gold.setText(`${SaveSystem.getTotalGold()} (+0)`);
    this.ui.stage.setText(`스테이지 ${stage}`);
    this.ui.stageSub.setText('');
    this.ui.modeObjective.setText('PVP 모드');
    this.ui.modeObjective.setColor('#8bc6ff');
    this.ui.time.setText(`${elapsedInt}s`);

    const hpNow = me ? Math.max(0, Math.floor(me.hp)) : 0;
    const hpMax = me ? Math.max(1, Math.floor(me.maxHp)) : 1;
    const hpRatio = hpMax > 0 ? Phaser.Math.Clamp(hpNow / hpMax, 0, 1) : 0;

    this.ui.hp.setColor(hpRatio < 0.35 ? '#ffd0d0' : '#eaf0ff');
    this.ui.hp.setText(`레벨 ${me ? me.level : 1}  체력 ${hpNow}/${hpMax}`);
    this.ui.shield.setVisible(false);
    this.ui.shield.setText('');
    this.ui.synergy.setText('시너지: 없음');

    const ratio = me && me.xpToNext > 0 ? Phaser.Math.Clamp(me.xp / me.xpToNext, 0, 1) : 0;
    this.ui.xpBarFill.width = this.scale.width * ratio;
    this.ui.statusLine.width = (this.ui.statusLayout.w - 28) * hpRatio;

    this.ui.skillSlots.forEach((slot) => {
      slot.border.setStrokeStyle(2, 0x3b4d75, 1);
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

    g.fillStyle(0x0c1322, 0.8);
    g.fillRect(innerX, innerY, innerW, innerH);

    const toMini = (wx, wy) => ({
      x: innerX + Phaser.Math.Clamp(wx / WORLD_W, 0, 1) * innerW,
      y: innerY + Phaser.Math.Clamp(wy / WORLD_H, 0, 1) * innerH
    });

    for (const enemy of this.enemies.values()) {
      const p = toMini(enemy.x, enemy.y);
      g.fillStyle(0xff8f8f, 0.8);
      g.fillCircle(p.x, p.y, 1.4);
    }

    for (const [sid, player] of this.players.entries()) {
      const p = toMini(player.x, player.y);
      g.fillStyle(sid === this.selfSid ? 0x7ea0ff : 0xff7e9f, 1);
      g.fillCircle(p.x, p.y, 2.6);
    }

    g.lineStyle(1, 0x3b4d75, 0.9);
    g.strokeRect(innerX, innerY, innerW, innerH);
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
