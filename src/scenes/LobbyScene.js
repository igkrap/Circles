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

    const startBtn = this.add.rectangle(w / 2, h * 0.66, 300, 46, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    startBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const startText = this.add.text(w / 2, h * 0.66, '\uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: '20px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x35507a, 0.98));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x2a3552, 0.98));
    startBtn.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Game');
    });

    const rankBtn = this.add.rectangle(w / 2, h * 0.75, 300, 42, 0x2a3552, 0.95).setInteractive({ useHandCursor: true });
    rankBtn.setStrokeStyle(1, 0x7ea0ff, 0.7);
    const rankText = this.add.text(w / 2, h * 0.75, '\uB7AD\uD0B9', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    rankBtn.on('pointerover', () => rankBtn.setFillStyle(0x33486d, 0.95));
    rankBtn.on('pointerout', () => rankBtn.setFillStyle(0x2a3552, 0.95));
    rankBtn.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Ranking');
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
    void bgObjs;
    void startText;
    void rankText;
  }
}
