import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.finalStage = data?.stage ?? 1;
    this.runGold = data?.runGold ?? 0;
    this.finalLevel = data?.level ?? 1;
    this.finalKills = data?.kills ?? 0;
    this.finalTimeSec = data?.timeSec ?? 0;
    this.finalTotalScore = data?.totalScore ?? 0;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Lobby music on game over (matches previous pygame request)
    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const root = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.42).setOrigin(0);
    root.add(dim);

    const cardW = Math.min(640, Math.max(420, w - 52));
    const cardH = Math.min(560, Math.max(430, h - 56));
    const cardX = w * 0.5;
    const cardY = h * 0.54;
    const card = this.add.rectangle(cardX, cardY, cardW, cardH, 0x121b2d, 0.95);
    card.setStrokeStyle(2, 0x3b4d75, 1);
    root.add(card);

    const titleY = cardY - cardH * 0.5 + 42;
    const title = this.add.text(cardX, titleY, '게임 오버', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: w < 760 ? '46px' : '56px',
      color: '#ff6b6b'
    }).setOrigin(0.5);
    root.add(title);

    const divider = this.add.rectangle(cardX, titleY + 42, Math.min(320, cardW - 120), 2, 0x314261, 0.85).setOrigin(0.5);
    root.add(divider);

    const blockTop = divider.y + 26;
    const mkStat = (yy, label, value, color = '#eaf0ff', size = 20) => {
      const t = this.add.text(cardX, yy, `${label}: ${value}`, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: `${size}px`,
        color
      }).setOrigin(0.5);
      root.add(t);
      return t;
    };

    mkStat(blockTop, '스테이지', this.finalStage, '#eaf0ff', 22);
    mkStat(blockTop + 44, '획득 골드', `+${this.runGold}`, '#ffd700', 20);
    mkStat(blockTop + 82, '총 골드', SaveSystem.getTotalGold(), '#aab6d6', 18);

    const mini = this.add.text(cardX, blockTop + 124, `레벨 ${this.finalLevel}   처치 ${this.finalKills}   시간 ${this.finalTimeSec.toFixed(1)}초`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#aab6d6'
    }).setOrigin(0.5);
    root.add(mini);

    mkStat(blockTop + 166, '총 점수', this.finalTotalScore, '#7ea0ff', cardW >= 520 ? 38 : 34);

    const hint = this.add.text(cardX, blockTop + 216, '다음 동작 선택', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#aab6d6'
    }).setOrigin(0.5);
    root.add(hint);

    this.tweens.add({ targets: hint, alpha: 0.4, duration: 650, yoyo: true, repeat: -1 });

    const mkBtn = (x, y, wBtn, hBtn, label, onClick, fill = 0x2a3552) => {
      const bg = this.add.rectangle(x, y, wBtn, hBtn, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
      bg.setFillStyle(fill, 0.98);
      bg.setStrokeStyle(1, 0x7ea0ff, 0.8);
      const tx = this.add.text(x, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#eaf0ff'
      }).setOrigin(0.5);
      root.add([bg, tx]);
      bg.on('pointerover', () => bg.setFillStyle(0x334467, 0.98));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.98));
      bg.on('pointerdown', onClick);
    };

    const retryY = cardY + cardH * 0.5 - 98;
    const rowY = retryY + 58;
    mkBtn(cardX, retryY, Math.min(340, cardW - 90), 44, '재도전', () => {
      bgm.stop();
      this.scene.start('Game');
    }, 0x324064);
    mkBtn(cardX - Math.min(122, cardW * 0.22), rowY, Math.min(210, cardW * 0.37), 40, '로비', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });
    mkBtn(cardX + Math.min(122, cardW * 0.22), rowY, Math.min(210, cardW * 0.37), 40, '랭킹', () => {
      bgm.stop();
      this.scene.start('Ranking');
    });
  }
}
