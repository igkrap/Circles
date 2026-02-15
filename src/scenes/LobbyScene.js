import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  createLobbyBackground(w, h) {
    const base = this.add.graphics();
    base.fillGradientStyle(0x050a14, 0x060d1b, 0x020612, 0x030714, 1);
    base.fillRect(0, 0, w, h);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x3f5d92, 0.13);
    for (let x = 0; x <= w; x += 48) grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 48) grid.lineBetween(0, y, w, y);
    this.tweens.add({
      targets: grid,
      alpha: { from: 0.1, to: 0.2 },
      duration: 2200,
      yoyo: true,
      repeat: -1
    });

    const mkGlow = (x, y, radius, color, alpha, driftX, driftY) => {
      const glow = this.add.circle(x, y, radius, color, alpha).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: glow,
        x: x + driftX,
        y: y + driftY,
        alpha: { from: alpha * 0.65, to: alpha },
        duration: 2800 + Phaser.Math.Between(0, 1400),
        yoyo: true,
        ease: 'Sine.InOut',
        repeat: -1
      });
      return glow;
    };

    const glowA = mkGlow(w * 0.22, h * 0.2, Math.min(w, h) * 0.3, 0x2a7de2, 0.09, 40, 28);
    const glowB = mkGlow(w * 0.82, h * 0.78, Math.min(w, h) * 0.38, 0x2ea8d6, 0.07, -48, -36);
    const glowC = mkGlow(w * 0.5, h * 0.45, Math.min(w, h) * 0.23, 0x67a6ff, 0.055, 22, -18);

    const rings = [];
    for (let i = 0; i < 4; i += 1) {
      const ring = this.add.circle(
        w * (0.26 + i * 0.17),
        h * (0.2 + (i % 2) * 0.55),
        44 + i * 16
      ).setStrokeStyle(2, 0x86a9df, 0.18);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      ring.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.tweens.add({
        targets: ring,
        rotation: ring.rotation + (i % 2 ? -1 : 1) * Math.PI * 2,
        duration: 11000 + i * 2300,
        repeat: -1
      });
      rings.push(ring);
    }

    const stars = [];
    for (let i = 0; i < 58; i += 1) {
      const dot = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(0, h),
        Phaser.Math.FloatBetween(0.8, 2.2),
        0xd4e6ff,
        Phaser.Math.FloatBetween(0.16, 0.4)
      );
      this.tweens.add({
        targets: dot,
        alpha: { from: dot.alpha * 0.5, to: dot.alpha },
        duration: Phaser.Math.Between(900, 2400),
        yoyo: true,
        repeat: -1
      });
      this.tweens.add({
        targets: dot,
        y: dot.y + Phaser.Math.Between(8, 22),
        duration: Phaser.Math.Between(2600, 5200),
        yoyo: true,
        ease: 'Sine.InOut',
        repeat: -1
      });
      stars.push(dot);
    }

    const streaks = this.add.graphics();
    const drawStreaks = () => {
      streaks.clear();
      for (let i = 0; i < 7; i += 1) {
        const sy = ((this.time.now * 0.02 + i * 130) % (h + 140)) - 70;
        const sx = (i * 170 + this.time.now * 0.008) % (w + 220) - 110;
        streaks.lineStyle(1 + (i % 2), 0x9ec4ff, 0.11);
        streaks.lineBetween(sx, sy, sx + 60, sy + 14);
      }
    };
    drawStreaks();
    this.time.addEvent({ delay: 33, loop: true, callback: drawStreaks });

    return [base, glowA, glowB, glowC, grid, ...rings, ...stars, streaks];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const bgObjs = this.createLobbyBackground(w, h);
    const panelW = Math.min(640, Math.max(420, w - 56));
    const panelH = Math.min(370, Math.max(280, h - 110));
    const panel = this.add.rectangle(w / 2, h * 0.54, panelW, panelH, 0x101a2c, 0.8);
    panel.setStrokeStyle(2, 0x3b4d75, 0.95);
    const panelShine = this.add.rectangle(w / 2, h * 0.44, panelW - 28, 52, 0x8ab7ff, 0.05).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: panelShine,
      x: w / 2 + 18,
      alpha: { from: 0.02, to: 0.075 },
      duration: 1700,
      yoyo: true,
      repeat: -1
    });

    const coin = this.add.image(20, 24, 'tex_gold').setOrigin(0.5).setScale(0.78);
    const goldText = this.add.text(36, 12, `${SaveSystem.getTotalGold()}`, {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#ffd700'
    }).setOrigin(0, 0);

    const drawBookGlyph = (x, y, color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.9, color, 0.96);
      // left/right pages
      g.strokeRoundedRect(x - 10, y - 8, 8, 16, 2.2);
      g.strokeRoundedRect(x + 2, y - 8, 8, 16, 2.2);
      // center seam
      g.lineBetween(x, y - 8, x, y + 8);
      // page fold hints
      g.lineStyle(1.2, color, 0.86);
      g.lineBetween(x - 6.7, y - 3.8, x - 3.3, y - 3.8);
      g.lineBetween(x + 3.3, y - 3.8, x + 6.7, y - 3.8);
      // tiny top clasp (similar to HUD icon feel)
      g.lineStyle(1.5, color, 0.9);
      g.strokeRoundedRect(x - 1.8, y - 10.5, 3.6, 2.4, 0.8);
      return g;
    };

    const drawTrophyGlyph = (x, y, color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.9, color, 0.96);
      // cup
      g.strokeRoundedRect(x - 6.4, y - 8.2, 12.8, 8.7, 2.3);
      // handles
      g.beginPath();
      g.moveTo(x - 6.4, y - 6.1);
      g.lineTo(x - 9.8, y - 4.4);
      g.lineTo(x - 9.8, y - 1.8);
      g.lineTo(x - 6.4, y - 0.2);
      g.strokePath();
      g.beginPath();
      g.moveTo(x + 6.4, y - 6.1);
      g.lineTo(x + 9.8, y - 4.4);
      g.lineTo(x + 9.8, y - 1.8);
      g.lineTo(x + 6.4, y - 0.2);
      g.strokePath();
      // stem + base
      g.lineBetween(x, y + 0.6, x, y + 6.3);
      g.strokeRoundedRect(x - 5.4, y + 6.3, 10.8, 2.8, 1);
      return g;
    };

    const mkTopIcon = (x, kind, onClick) => {
      const box = this.add.rectangle(x, 24, 38, 30, 0x1f2b43, 0.95).setInteractive({ useHandCursor: true });
      box.setStrokeStyle(1, 0x7ea0ff, 0.8);
      let glyph = null;
      if (kind === 'book') glyph = drawBookGlyph(x, 24);
      else if (kind === 'trophy') glyph = drawTrophyGlyph(x, 24);

      box.on('pointerover', () => {
        box.setFillStyle(0x35507a, 0.95);
        glyph?.setAlpha(1);
      });
      box.on('pointerout', () => {
        box.setFillStyle(0x1f2b43, 0.95);
        glyph?.setAlpha(0.95);
      });
      box.on('pointerdown', onClick);
      return [box, glyph];
    };

    const topRightPad = 24;
    const iconGap = 8;
    const iconW = 38;
    const rankX = w - topRightPad - iconW * 0.5;
    const codexX = rankX - iconW - iconGap;
    const [codexIcon, codexGlyph] = mkTopIcon(codexX, 'book', () => {
      bgm.stop();
      this.scene.start('Codex');
    });
    const [rankIcon, rankGlyph] = mkTopIcon(rankX, 'trophy', () => {
      bgm.stop();
      this.scene.start('Ranking');
    });

    const titleGlow = this.add.text(w / 2, h * 0.33, 'CIRCLES', {
      fontFamily: 'Trebuchet MS, Verdana, system-ui, sans-serif',
      fontSize: w < 760 ? '52px' : '62px',
      color: '#78b8ff',
      stroke: '#6aa9ff',
      strokeThickness: 10
    }).setOrigin(0.5).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
    const title = this.add.text(w / 2, h * 0.33, 'CIRCLES', {
      fontFamily: FONT_KR,
      fontSize: w < 760 ? '44px' : '54px',
      color: '#eef4ff',
      stroke: '#8ab0ea',
      strokeThickness: 1
    }).setOrigin(0.5);
    this.tweens.add({
      targets: [title, titleGlow],
      y: '-=4',
      duration: 2000,
      yoyo: true,
      ease: 'Sine.InOut',
      repeat: -1
    });

    const sub = this.add.text(w / 2, h * 0.44, '\uC0DD\uC874\uD558\uACE0 \uAC15\uD654\uD558\uACE0 \uB7AD\uD0B9\uC744 \uC62C\uB9AC\uC138\uC694', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#8fa4cd'
    }).setOrigin(0.5);

    const hint = this.add.text(w / 2, h * 0.57, '\uD074\uB9AD \uB610\uB294 \uD130\uCE58\uB85C \uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#aab6d6'
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });

    const startBtn = this.add.rectangle(w / 2, h * 0.64, 300, 44, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    startBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const startText = this.add.text(w / 2, h * 0.64, '\uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: '20px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x35507a, 0.98));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x2a3552, 0.98));

    const modeRoot = this.add.container(0, 0).setDepth(2500).setVisible(false);
    const modeDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.56).setOrigin(0).setInteractive();
    const modeCardW = Math.min(420, w - 50);
    const modeCardH = 328;
    const modeCard = this.add.rectangle(w * 0.5, h * 0.53, modeCardW, modeCardH, 0x172033, 0.97);
    modeCard.setStrokeStyle(2, 0x3b4d75, 0.95);
    const modeTitle = this.add.text(w * 0.5, modeCard.y - modeCardH * 0.5 + 28, '모드 선택', {
      fontFamily: FONT_KR,
      fontSize: '24px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    modeRoot.add([modeDim, modeCard, modeTitle]);

    const mkModeBtn = (y, label, desc, onClick, enabled = true) => {
      const bw = modeCardW - 56;
      const bh = 52;
      const bg = this.add.rectangle(w * 0.5, y, bw, bh, enabled ? 0x2a3552 : 0x243248, 0.98)
        .setInteractive(enabled ? { useHandCursor: true } : undefined);
      bg.setStrokeStyle(1, enabled ? 0x7ea0ff : 0x466084, 0.9);
      const tx = this.add.text(w * 0.5, y - 10, label, {
        fontFamily: FONT_KR,
        fontSize: '18px',
        color: enabled ? '#eaf0ff' : '#9ab0d3'
      }).setOrigin(0.5);
      const sx = this.add.text(w * 0.5, y + 12, desc, {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      }).setOrigin(0.5);
      if (enabled) {
        bg.on('pointerover', () => bg.setFillStyle(0x35507a, 0.98));
        bg.on('pointerout', () => bg.setFillStyle(0x2a3552, 0.98));
        bg.on('pointerdown', onClick);
      }
      modeRoot.add([bg, tx, sx]);
      return { bg, tx, sx };
    };

    const closeY = modeCard.y + modeCardH * 0.5 - 28;
    const topRowY = modeCard.y - modeCardH * 0.5 + 94;
    const bottomRowY = closeY - 64;
    const rowGap = (bottomRowY - topRowY) / 2;
    const y1 = topRowY;
    const y2 = y1 + rowGap;
    const y3 = y2 + rowGap;
    mkModeBtn(y1, '생존 모드', '기존 규칙으로 끝까지 생존', () => {
      bgm.stop();
      this.scene.start('Game', { mode: 'survival' });
    });
    mkModeBtn(y2, '디펜스 모드', '중앙 코어를 적에게서 방어', () => {
      bgm.stop();
      this.scene.start('Game', { mode: 'defense' });
    });
    mkModeBtn(y3, 'PVP 모드 🔒', '미구현', () => {}, false);

    const closeBtn = this.add.rectangle(w * 0.5, closeY, 150, 34, 0x2a3552, 0.95)
      .setInteractive({ useHandCursor: true });
    closeBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const closeTx = this.add.text(closeBtn.x, closeBtn.y, '닫기', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    closeBtn.on('pointerdown', () => modeRoot.setVisible(false));
    modeDim.on('pointerdown', () => modeRoot.setVisible(false));
    modeRoot.add([closeBtn, closeTx]);

    startBtn.on('pointerdown', () => {
      modeRoot.setVisible(true);
    });

    const shopBtn = this.add.rectangle(w / 2, h * 0.74, 300, 42, 0x2a3552, 0.95).setInteractive({ useHandCursor: true });
    shopBtn.setStrokeStyle(1, 0x7ea0ff, 0.7);
    const shopText = this.add.text(w / 2, h * 0.74, '\uC0C1\uC810', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(0x33486d, 0.95));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(0x2a3552, 0.95));
    shopBtn.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Shop');
    });

    this.events.on('wake', () => {
      goldText.setText(`${SaveSystem.getTotalGold()}`);
    });

    void title;
    void titleGlow;
    void sub;
    void panel;
    void panelShine;
    void coin;
    void codexIcon;
    void codexGlyph;
    void rankIcon;
    void rankGlyph;
    void bgObjs;
    void startText;
    void shopText;
  }
}
