import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';

const FONT_DISPLAY = 'Rajdhani, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const FONT_BODY = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function getModeLabel(mode) {
  if (mode === 'coop') return '\uD611\uB3D9 \uBAA8\uB4DC';
  if (mode === 'defense') return '\uB514\uD39C\uC2A4 \uBAA8\uB4DC';
  if (mode === 'pvp') return 'PVP \uBAA8\uB4DC';
  return '\uC2A4\uD14C\uC774\uC9C0 \uBAA8\uB4DC';
}

function formatTime(sec) {
  const safe = Math.max(0, Math.floor(Number(sec || 0)));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getResultTitle(reason) {
  if (reason === 'stage_clear') return 'MISSION CLEAR';
  return 'GAME OVER';
}

function getResultSubtitle(reason, stage) {
  if (reason === 'core_destroyed') return '\uC911\uC559 \uCF54\uC5B4\uAC00 \uD30C\uAD34\uB418\uC5C8\uC2B5\uB2C8\uB2E4';
  if (reason === 'stage_clear') return `\uC2A4\uD14C\uC774\uC9C0 ${stage}\uB97C \uD074\uB9AC\uC5B4\uD588\uC2B5\uB2C8\uB2E4`;
  return '\uD50C\uB808\uC774\uC5B4\uAC00 \uC4F0\uB7EC\uC84C\uC2B5\uB2C8\uB2E4';
}

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
    this.biome = String(data?.biome || 'default').toLowerCase();
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
    this.events.once('shutdown', () => bgm.stop());

    this.add.rectangle(0, 0, w, h, 0x050d1a, 1).setOrigin(0);

    const grid = this.add.graphics();
    const step = 46;
    for (let x = 0; x <= w; x += step) {
      const major = x % (step * 4) === 0;
      grid.lineStyle(1, major ? 0x2a527f : 0x193654, major ? 0.26 : 0.15);
      grid.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += step) {
      const major = y % (step * 4) === 0;
      grid.lineStyle(1, major ? 0x2a527f : 0x193654, major ? 0.26 : 0.15);
      grid.lineBetween(0, y, w, y);
    }

    const dim = this.add.rectangle(0, 0, w, h, 0x020712, 0.7).setOrigin(0);

    const cx = w * 0.5;
    const cy = h * 0.52;
    const cardW = Phaser.Math.Clamp(w - 56, 430, 760);
    const cardH = Phaser.Math.Clamp(h - 56, 390, 500);
    const top = cy - cardH * 0.5;
    const bottom = cy + cardH * 0.5;
    const contentW = cardW - 56;

    const cardShadow = this.add.rectangle(cx, cy + 5, cardW + 8, cardH + 8, 0x030812, 0.64);
    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x0f1b2f, 0.97);
    card.setStrokeStyle(2, 0x4676a7, 0.96);
    const inner = this.add.rectangle(cx, cy, cardW - 20, cardH - 20, 0x10233f, 0.22);
    inner.setStrokeStyle(1, 0x4d80b2, 0.42);

    const modeChip = this.add.rectangle(cx - contentW * 0.5 + 72, top + 34, 132, 26, 0x23496f, 0.94);
    modeChip.setStrokeStyle(1, 0x7dbde8, 0.9);
    const modeText = this.add.text(modeChip.x, modeChip.y, getModeLabel(this.mode), {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      color: '#e8f4ff'
    }).setOrigin(0.5);

    const title = getResultTitle(this.reason);
    const titleColor = this.reason === 'stage_clear' ? '#a1f2c5' : '#ff9fae';
    const titleNode = this.add.text(cx, top + 92, title, {
      fontFamily: FONT_DISPLAY,
      fontSize: w < 760 ? '46px' : '54px',
      color: titleColor
    }).setOrigin(0.5);

    const subtitleNode = this.add.text(
      cx,
      top + 126,
      getResultSubtitle(this.reason, Math.max(1, Math.floor(Number(this.finalStage || 1)))),
      {
        fontFamily: FONT_BODY,
        fontSize: '16px',
        color: '#a7bfdc'
      }
    ).setOrigin(0.5);

    const statLabels = [
      '\uC2A4\uD14C\uC774\uC9C0',
      '\uB808\uBCA8',
      '\uCC98\uCE58',
      '\uD68D\uB4DD \uACE8\uB4DC'
    ];
    const statValues = [
      `${Math.max(1, Math.floor(Number(this.finalStage || 1)))}`,
      `${Math.max(1, Math.floor(Number(this.finalLevel || 1)))}`,
      `${Math.max(0, Math.floor(Number(this.finalKills || 0)))}`,
      `+${Math.max(0, Math.floor(Number(this.runGold || 0)))}`
    ];
    const statColors = ['#edf5ff', '#edf5ff', '#edf5ff', '#ffd987'];
    const statY = top + Math.round(cardH * 0.43);
    const statW = contentW;
    const statH = 74;
    const statBox = this.add.rectangle(cx, statY, statW, statH, 0x12253b, 0.9);
    statBox.setStrokeStyle(1, 0x3d6288, 0.78);

    const statNodes = [];
    const colW = statW / 4;
    for (let i = 0; i < 4; i += 1) {
      const x = cx - statW * 0.5 + colW * (i + 0.5);
      const lbl = this.add.text(x, statY - 19, statLabels[i], {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        color: '#8ea9c9'
      }).setOrigin(0.5);
      const val = this.add.text(x, statY + 16, statValues[i], {
        fontFamily: FONT_DISPLAY,
        fontSize: '38px',
        color: statColors[i]
      }).setOrigin(0.5);
      statNodes.push(lbl, val);
      if (i < 3) {
        statNodes.push(this.add.rectangle(x + colW * 0.5, statY, 1, 46, 0x335777, 0.56));
      }
    }

    const infoY = statY + statH * 0.5 + 16;
    const infoNode = this.add.text(
      cx,
      infoY,
      `TIME ${formatTime(this.finalTimeSec)}  \u00b7  GOLD ${SaveSystem.getTotalGold()}`,
      {
        fontFamily: FONT_DISPLAY,
        fontSize: '14px',
        color: '#9eb9d9'
      }
    ).setOrigin(0.5);

    const secondaryY = bottom - 28;
    const retryY = secondaryY - 40;
    const scoreYRaw = infoY + Math.round((retryY - infoY) * 0.5);
    const scoreY = Math.min(scoreYRaw, retryY - 28);

    const scoreLabel = this.add.text(cx, scoreY - 14, 'TOTAL SCORE', {
      fontFamily: FONT_DISPLAY,
      fontSize: '13px',
      color: '#8fb2d7'
    }).setOrigin(0.5);
    const scoreNode = this.add.text(cx, scoreY + 10, `${Math.max(0, Math.floor(Number(this.finalTotalScore || 0)))}`, {
      fontFamily: FONT_DISPLAY,
      fontSize: '42px',
      color: '#f2f7ff'
    }).setOrigin(0.5);

    const makeButton = (x, y, bw, bh, label, onClick, style = 'normal') => {
      const palettes = {
        primary: { fill: 0x25557d, hover: 0x326c9e, stroke: 0x82d1ff, text: '#eff8ff' },
        normal: { fill: 0x22364f, hover: 0x2f4a6b, stroke: 0x658cb4, text: '#e8f1ff' }
      };
      const color = palettes[style] || palettes.normal;
      const btn = this.add.rectangle(x, y, bw, bh, color.fill, 0.96).setInteractive({ useHandCursor: true });
      btn.setStrokeStyle(1, color.stroke, 0.9);
      const tx = this.add.text(x, y, label, {
        fontFamily: FONT_BODY,
        fontSize: style === 'primary' ? '17px' : '16px',
        color: color.text,
        fontStyle: '700'
      }).setOrigin(0.5);

      btn.on('pointerover', () => {
        btn.setFillStyle(color.hover, 0.98);
        btn.setStrokeStyle(1, 0xaedfff, 1);
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(color.fill, 0.96);
        btn.setStrokeStyle(1, color.stroke, 0.9);
      });
      btn.on('pointerdown', onClick);
      return [btn, tx];
    };

    const mainBtnW = Math.min(360, contentW);
    const sideGap = 12;
    const sideBtnW = Math.floor((mainBtnW - sideGap) * 0.5);
    const retryNodes = makeButton(
      cx,
      retryY,
      mainBtnW,
      36,
      '\uC7AC\uB3C4\uC804',
      () => {
        bgm.stop();
        this.scene.start('Game', {
          mode: this.mode,
          biome: this.biome,
          token: this.pvp?.token,
          serverBaseUrl: this.pvp?.serverBaseUrl,
          user: this.pvp?.user,
          partyKey: this.pvp?.partyKey
        });
      },
      'primary'
    );
    const lobbyNodes = makeButton(
      cx - (sideBtnW + sideGap) * 0.5,
      secondaryY,
      sideBtnW,
      32,
      '\uB85C\uBE44',
      () => {
        bgm.stop();
        this.scene.start('Lobby');
      },
      'normal'
    );
    const rankingNodes = makeButton(
      cx + (sideBtnW + sideGap) * 0.5,
      secondaryY,
      sideBtnW,
      32,
      '\uB7AD\uD0B9',
      () => {
        bgm.stop();
        const rankingMode = this.mode === 'defense' ? 'survival' : this.mode;
        this.scene.start('Ranking', { mode: rankingMode });
      },
      'normal'
    );

    const introPrimary = [dim, cardShadow, card, inner];
    const introSecondary = [
      modeChip, modeText, titleNode, subtitleNode, statBox, ...statNodes,
      infoNode, scoreLabel, scoreNode, ...retryNodes, ...lobbyNodes, ...rankingNodes
    ];
    introPrimary.forEach((node) => node.setAlpha(0));
    introSecondary.forEach((node) => node.setAlpha(0));
    this.tweens.add({ targets: introPrimary, alpha: { from: 0, to: 1 }, duration: 180, ease: 'Sine.Out' });
    this.tweens.add({ targets: introSecondary, alpha: { from: 0, to: 1 }, duration: 220, delay: 80, ease: 'Sine.Out' });
  }
}
