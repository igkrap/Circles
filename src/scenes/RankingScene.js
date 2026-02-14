import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';

export default class RankingScene extends Phaser.Scene {
  constructor() {
    super('Ranking');
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    this.add.text(w / 2, 38, '랭킹', {
      fontFamily: font,
      fontSize: '44px',
      color: '#eaf0ff'
    }).setOrigin(0.5, 0);

    const records = SaveSystem.getTopRecords(30);
    const headerY = 102;
    this.add.text(48, headerY, '#', { fontFamily: font, fontSize: '18px', color: '#aab6d6' });
    this.add.text(88, headerY, '이름', { fontFamily: font, fontSize: '18px', color: '#aab6d6' });
    this.add.text(w - 250, headerY, '점수', { fontFamily: font, fontSize: '18px', color: '#aab6d6' });
    this.add.text(w - 140, headerY, '시간', { fontFamily: font, fontSize: '18px', color: '#aab6d6' });
    this.add.text(w - 70, headerY, '처치', { fontFamily: font, fontSize: '18px', color: '#aab6d6' }).setOrigin(0.5, 0);

    if (records.length === 0) {
      this.add.text(w / 2, h * 0.45, '기록이 없습니다', {
        fontFamily: font,
        fontSize: '24px',
        color: '#aab6d6'
      }).setOrigin(0.5);
    } else {
      let y = 138;
      const rowH = 24;
      records.forEach((r, i) => {
        if (y > h - 84) return;
        const col = i < 3 ? '#ffd700' : '#eaf0ff';
        this.add.text(48, y, `${i + 1}`, { fontFamily: font, fontSize: '17px', color: col });
        this.add.text(88, y, `${r.name}`, { fontFamily: font, fontSize: '17px', color: '#eaf0ff' });
        this.add.text(w - 250, y, `${r.totalScore}`, { fontFamily: font, fontSize: '17px', color: '#7ea0ff' });
        this.add.text(w - 140, y, `${r.timeSec.toFixed(1)}s`, { fontFamily: font, fontSize: '17px', color: '#aab6d6' });
        this.add.text(w - 70, y, `${r.kills}`, { fontFamily: font, fontSize: '17px', color: '#aab6d6' }).setOrigin(0.5, 0);
        y += rowH;
      });
    }

    const back = this.add.rectangle(w / 2, h - 42, 260, 42, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    back.setStrokeStyle(1, 0x7ea0ff, 0.8);
    this.add.text(w / 2, h - 42, '로비로 돌아가기', {
      fontFamily: font,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    back.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });
  }
}
