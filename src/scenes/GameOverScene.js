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
    this.mode = String(data?.mode ?? 'survival');
    this.pvp = data?.pvp ?? null;
    this.reason = String(data?.reason ?? 'player_down');
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const root = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, w, h, 0x020814, 0.86).setOrigin(0);
    const glowA = this.add.circle(w * 0.28, h * 0.2, Math.max(180, w * 0.18), 0x2a7cff, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    const glowB = this.add.circle(w * 0.75, h * 0.78, Math.max(220, w * 0.2), 0xff4f74, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    root.add([dim, glowA, glowB]);

    const cardW = Math.min(700, Math.max(430, w - 54));
    const cardH = Math.min(620, Math.max(470, h - 48));
    const cardX = w * 0.5;
    const cardY = h * 0.53;
    const card = this.add.rectangle(cardX, cardY, cardW, cardH, 0x0f1930, 0.96);
    card.setStrokeStyle(2, 0x3f5f99, 0.95);
    root.add(card);

    const topGlow = this.add.rectangle(cardX, cardY - cardH * 0.5 + 22, cardW - 28, 30, 0x7ea0ff, 0.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setOrigin(0.5);
    root.add(topGlow);

    const modeLabel = this.mode === 'pvp'
      ? 'PVP 모드'
      : (this.mode === 'defense' ? '디펜스 모드' : '스테이지 모드');
    const modeChip = this.add.rectangle(cardX, cardY - cardH * 0.5 + 44, 146, 30, 0x2a395d, 0.96);
    modeChip.setStrokeStyle(1, 0x7ea0ff, 0.75);
    const modeTx = this.add.text(cardX, modeChip.y, modeLabel, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#c8dcff'
    }).setOrigin(0.5);
    root.add([modeChip, modeTx]);

    const titleY = modeChip.y + 54;
    const title = this.add.text(cardX, titleY, '게임 오버', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: w < 760 ? '48px' : '58px',
      color: '#ff7480'
    }).setOrigin(0.5);
    root.add(title);

    const reasonText = this.reason === 'core_destroyed'
      ? '중앙 코어가 파괴되었습니다'
      : (this.reason === 'stage_clear' ? '스테이지 30을 클리어했습니다' : '플레이어가 쓰러졌습니다');
    const subtitle = this.add.text(cardX, titleY + 42, reasonText, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#9cb3da'
    }).setOrigin(0.5);
    root.add(subtitle);

    const divider = this.add.rectangle(cardX, subtitle.y + 28, Math.min(420, cardW - 130), 2, 0x355180, 0.85).setOrigin(0.5);
    root.add(divider);

    const compact = cardH < 540;
    const mkMetric = (x, y, label, value, valueColor = '#eaf0ff') => {
      const labelTx = this.add.text(x, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: compact ? '13px' : '14px',
        color: '#9cb3da'
      }).setOrigin(0.5, 1);
      const valueTx = this.add.text(x, y + 8, `${value}`, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: compact ? '20px' : '22px',
        color: valueColor
      }).setOrigin(0.5, 0);
      root.add([labelTx, valueTx]);
      return [labelTx, valueTx];
    };

    const metricLabelY = divider.y + (compact ? 18 : 20);
    const metricsLeft = cardX - (cardW * 0.33);
    const metricGap = (cardW * 0.66) / 3;
    const metricNodes = [];
    metricNodes.push(...mkMetric(metricsLeft + metricGap * 0, metricLabelY, '스테이지', this.finalStage));
    metricNodes.push(...mkMetric(metricsLeft + metricGap * 1, metricLabelY, '레벨', this.finalLevel));
    metricNodes.push(...mkMetric(metricsLeft + metricGap * 2, metricLabelY, '처치', this.finalKills));
    metricNodes.push(...mkMetric(metricsLeft + metricGap * 3, metricLabelY, '획득 골드', `+${this.runGold}`, '#ffd86f'));

    const metricsBottom = metricLabelY + (compact ? 38 : 42);
    const timeLineY = metricsBottom + (compact ? 16 : 18);
    const timeLine = this.add.text(cardX, timeLineY, `생존 시간 ${this.finalTimeSec.toFixed(1)}초   총 골드 ${SaveSystem.getTotalGold()}`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: compact ? '15px' : '16px',
      color: '#9cb3da'
    }).setOrigin(0.5);
    root.add(timeLine);

    const scoreBoxH = compact ? 64 : 70;
    const scoreGap = compact ? 24 : 28;
    const scoreBoxTop = timeLineY + scoreGap;
    const scoreBoxY = scoreBoxTop + (scoreBoxH * 0.5);
    const scoreBox = this.add.rectangle(cardX, scoreBoxY, Math.min(460, cardW - 90), scoreBoxH, 0x15284b, 0.98);
    scoreBox.setStrokeStyle(2, 0x6e90db, 0.85);
    const scoreLabel = this.add.text(cardX, scoreBoxY - (compact ? 13 : 14), '총 점수', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: compact ? '14px' : '15px',
      color: '#9cb3da'
    }).setOrigin(0.5);
    const scoreValue = this.add.text(cardX, scoreBoxY + 8, `${this.finalTotalScore}`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: compact ? '34px' : (cardW >= 520 ? '36px' : '32px'),
      color: '#8db1ff'
    }).setOrigin(0.5);
    root.add([scoreBox, scoreLabel, scoreValue]);

    const mkBtn = (x, y, wBtn, hBtn, label, onClick, fill = 0x2a3552, hover = 0x3a4c72) => {
      const bg = this.add.rectangle(x, y, wBtn, hBtn, fill, 0.98).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, 0x7ea0ff, 0.86);
      const tx = this.add.text(x, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: compact ? '17px' : '19px',
        color: '#eaf0ff'
      }).setOrigin(0.5);
      root.add([bg, tx]);
      bg.on('pointerover', () => bg.setFillStyle(hover, 0.98));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.98));
      bg.on('pointerdown', onClick);
      return { bg, tx };
    };

    const cardBottom = cardY + cardH * 0.5;
    const scoreBottom = scoreBox.y + (scoreBox.height * 0.5);
    const actionLabelY = scoreBottom + (compact ? 18 : 20);
    const actionLabel = this.add.text(cardX, actionLabelY, '다음 동작 선택', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: compact ? '14px' : '15px',
      color: '#8fa4cd'
    }).setOrigin(0.5);
    root.add(actionLabel);
    this.tweens.add({ targets: actionLabel, alpha: 0.45, duration: 720, yoyo: true, repeat: -1 });

    const retryY = actionLabelY + (compact ? 30 : 34);
    const rowY = retryY + (compact ? 46 : 52);
    const retryBtn = mkBtn(cardX, retryY, Math.min(360, cardW - 90), compact ? 38 : 40, '재도전', () => {
      bgm.stop();
      this.scene.start('Game', {
        mode: this.mode,
        token: this.pvp?.token,
        serverBaseUrl: this.pvp?.serverBaseUrl,
        user: this.pvp?.user
      });
    }, 0x35538b, 0x4668ad);
    const lobbyBtn = mkBtn(cardX - Math.min(128, cardW * 0.22), rowY, Math.min(214, cardW * 0.36), compact ? 34 : 36, '로비', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });
    const rankingBtn = mkBtn(cardX + Math.min(128, cardW * 0.22), rowY, Math.min(214, cardW * 0.36), compact ? 34 : 36, '랭킹', () => {
      bgm.stop();
      this.scene.start('Ranking');
    });

    const layoutNodes = [...metricNodes, timeLine, scoreBox, scoreLabel, scoreValue, actionLabel, retryBtn.bg, retryBtn.tx, lobbyBtn.bg, lobbyBtn.tx, rankingBtn.bg, rankingBtn.tx];
    const actionBottom = Math.max(retryBtn.bg.y + (retryBtn.bg.height * 0.5), lobbyBtn.bg.y + (lobbyBtn.bg.height * 0.5), rankingBtn.bg.y + (rankingBtn.bg.height * 0.5));
    const maxActionBottom = cardBottom - 16;
    if (actionBottom > maxActionBottom) {
      const dy = actionBottom - maxActionBottom;
      for (const n of layoutNodes) n.y -= dy;
    }

    dim.setAlpha(0);
    glowA.setAlpha(0);
    glowB.setAlpha(0);
    card.setAlpha(0).setScale(0.96);
    topGlow.setAlpha(0);
    modeChip.setAlpha(0);
    modeTx.setAlpha(0);
    title.setAlpha(0).setY(title.y + 8);
    subtitle.setAlpha(0).setY(subtitle.y + 8);
    divider.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 0.86, duration: 220, ease: 'Quad.Out' });
    this.tweens.add({ targets: [glowA, glowB], alpha: { from: 0, to: 1 }, duration: 520, ease: 'Sine.Out' });
    this.tweens.add({ targets: card, alpha: 1, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: [topGlow, modeChip, modeTx], alpha: 1, duration: 220, delay: 90, ease: 'Quad.Out' });
    this.tweens.add({ targets: [title, subtitle, divider], alpha: 1, y: '-=8', duration: 240, delay: 120, ease: 'Quad.Out' });
    this.tweens.add({ targets: [scoreBox, scoreLabel, scoreValue], alpha: { from: 0, to: 1 }, y: '-=6', duration: 220, delay: 170, ease: 'Quad.Out' });
    this.tweens.add({ targets: [actionLabel, retryBtn.bg, retryBtn.tx, lobbyBtn.bg, lobbyBtn.tx, rankingBtn.bg, rankingBtn.tx], alpha: { from: 0, to: 1 }, y: '-=6', duration: 220, delay: 220, ease: 'Quad.Out' });
  }
}
