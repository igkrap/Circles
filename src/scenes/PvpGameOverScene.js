import Phaser from 'phaser';

const FONT_TITLE = 'Rajdhani, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const FONT_BODY = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function getMmrTier(mmr) {
  const v = Number(mmr || 1000);
  if (v >= 1800) return 'Diamond';
  if (v >= 1500) return 'Platinum';
  if (v >= 1300) return 'Gold';
  if (v >= 1150) return 'Silver';
  return 'Bronze';
}

function drawPanelAccent(scene, cx, cy, w, h, color = 0x6ccfff) {
  const g = scene.add.graphics();
  const left = cx - w * 0.5;
  const right = cx + w * 0.5;
  const top = cy - h * 0.5;
  const bottom = cy + h * 0.5;
  const len = 24;
  g.lineStyle(2, color, 0.9);
  g.beginPath();
  g.moveTo(left + 12, top + 12); g.lineTo(left + 12 + len, top + 12);
  g.moveTo(left + 12, top + 12); g.lineTo(left + 12, top + 12 + len);
  g.moveTo(right - 12, top + 12); g.lineTo(right - 12 - len, top + 12);
  g.moveTo(right - 12, top + 12); g.lineTo(right - 12, top + 12 + len);
  g.moveTo(left + 12, bottom - 12); g.lineTo(left + 12 + len, bottom - 12);
  g.moveTo(left + 12, bottom - 12); g.lineTo(left + 12, bottom - 12 - len);
  g.moveTo(right - 12, bottom - 12); g.lineTo(right - 12 - len, bottom - 12);
  g.moveTo(right - 12, bottom - 12); g.lineTo(right - 12, bottom - 12 - len);
  g.strokePath();
  return g;
}

export default class PvpGameOverScene extends Phaser.Scene {
  constructor() {
    super('PvpGameOver');
  }

  init(data) {
    this.result = String(data?.result || 'lose');
    this.reason = String(data?.reason || 'hp_zero');
    this.profile = data?.profile || null;
    this.pvp = data?.pvp || null;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const isWin = this.result === 'win';
    const accent = isWin ? 0x65e5a1 : 0xff90a0;
    const accentText = isWin ? '#a1f2c5' : '#ffacb9';

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x040a16, 0x071025, 0x030712, 0x051024, 1);
    bg.fillRect(0, 0, w, h);

    const grid = this.add.graphics();
    for (let x = 0; x <= w; x += 46) {
      const major = x % 184 === 0;
      grid.lineStyle(1, major ? 0x315a89 : 0x1a3454, major ? 0.24 : 0.13);
      grid.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += 46) {
      const major = y % 184 === 0;
      grid.lineStyle(1, major ? 0x315a89 : 0x1a3454, major ? 0.24 : 0.13);
      grid.lineBetween(0, y, w, y);
    }

    const dim = this.add.rectangle(0, 0, w, h, 0x020814, 0.68).setOrigin(0);
    const glowA = this.add.circle(w * 0.24, h * 0.22, Math.max(180, w * 0.2), accent, 0.12).setBlendMode(Phaser.BlendModes.ADD);
    const glowB = this.add.circle(w * 0.8, h * 0.78, Math.max(220, w * 0.22), 0x3b8cff, 0.08).setBlendMode(Phaser.BlendModes.ADD);

    const cardW = Math.min(700, Math.max(500, w - 56));
    const cardH = Math.min(560, Math.max(450, h - 56));
    const cx = w * 0.5;
    const cy = h * 0.53;
    const top = cy - cardH * 0.5;
    const bottom = cy + cardH * 0.5;

    const cardShadow = this.add.rectangle(cx, cy + 8, cardW + 18, cardH + 18, 0x030a17, 0.62);
    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x0f1d34, 0.96);
    card.setStrokeStyle(2, 0x74d2ff, 0.86);
    const inner = this.add.rectangle(cx, cy, cardW - 20, cardH - 20, 0x10233f, 0.42);
    inner.setStrokeStyle(1, 0x4f83b5, 0.45);
    const corners = drawPanelAccent(this, cx, cy, cardW, cardH, 0x79d6ff);

    const chipY = top + 44;
    const resultChip = this.add.rectangle(cx, chipY, 156, 32, isWin ? 0x1f5a46 : 0x5a2a35, 0.96);
    resultChip.setStrokeStyle(1, isWin ? 0x95f2c1 : 0xffb4c0, 0.92);
    const resultTx = this.add.text(cx, chipY, isWin ? 'VICTORY' : 'DEFEAT', {
      fontFamily: FONT_TITLE,
      fontSize: '18px',
      color: isWin ? '#dcffee' : '#ffe3e8'
    }).setOrigin(0.5);

    const title = this.add.text(cx, chipY + 72, isWin ? 'WIN' : 'LOSE', {
      fontFamily: FONT_TITLE,
      fontSize: w < 760 ? '62px' : '72px',
      color: accentText
    }).setOrigin(0.5);
    const reason = this.add.text(cx, chipY + 112, this.reason === 'disconnect' ? '상대 연결 종료' : '전투 종료', {
      fontFamily: FONT_BODY,
      fontSize: '17px',
      color: '#9fb8d8'
    }).setOrigin(0.5);

    const mmr = Math.max(100, Math.floor(Number(this.profile?.mmr || 1000)));
    const wins = Math.max(0, Math.floor(Number(this.profile?.wins || 0)));
    const losses = Math.max(0, Math.floor(Number(this.profile?.losses || 0)));
    const tier = getMmrTier(mmr);

    const statY = chipY + 202;
    const statBox = this.add.rectangle(cx, statY, Math.min(520, cardW - 92), 90, 0x16345a, 0.95);
    statBox.setStrokeStyle(2, 0x89d8ff, 0.82);
    const mmrLabel = this.add.text(cx, statY - 22, 'MMR', {
      fontFamily: FONT_TITLE,
      fontSize: '15px',
      color: '#9cc3e7'
    }).setOrigin(0.5);
    const mmrValue = this.add.text(cx, statY + 8, `${mmr}`, {
      fontFamily: FONT_TITLE,
      fontSize: '48px',
      color: '#edf6ff'
    }).setOrigin(0.5);
    const tierChip = this.add.rectangle(cx + Math.min(180, cardW * 0.24), statY + 6, 124, 28, 0x284468, 0.95);
    tierChip.setStrokeStyle(1, 0x9bdcff, 0.88);
    const tierTx = this.add.text(tierChip.x, tierChip.y, tier, {
      fontFamily: FONT_TITLE,
      fontSize: '17px',
      color: '#dbf1ff'
    }).setOrigin(0.5);

    const record = this.add.text(cx, statY + 72, `${wins}승 ${losses}패`, {
      fontFamily: FONT_BODY,
      fontSize: '18px',
      color: '#a9c2df'
    }).setOrigin(0.5);

    const mkButton = (x, y, bw, bh, label, onClick, opt = {}) => {
      const fill = opt.fill ?? 0x2a436a;
      const hover = opt.hover ?? 0x355889;
      const stroke = opt.stroke ?? 0x8ed7ff;
      const bgBtn = this.add.rectangle(x, y, bw, bh, fill, 0.98).setInteractive({ useHandCursor: true });
      bgBtn.setStrokeStyle(1, stroke, 0.94);
      const tx = this.add.text(x, y, label, {
        fontFamily: FONT_BODY,
        fontSize: bh >= 40 ? '20px' : '18px',
        color: '#ecf6ff',
        fontStyle: '700'
      }).setOrigin(0.5);
      bgBtn.on('pointerover', () => {
        bgBtn.setFillStyle(hover, 0.99);
        bgBtn.setStrokeStyle(1, 0xc8efff, 0.98);
      });
      bgBtn.on('pointerout', () => {
        bgBtn.setFillStyle(fill, 0.98);
        bgBtn.setStrokeStyle(1, stroke, 0.94);
      });
      bgBtn.on('pointerdown', onClick);
      return [bgBtn, tx];
    };

    const retryY = bottom - 96;
    const rowY = retryY + 52;
    const retryNodes = mkButton(
      cx,
      retryY,
      Math.min(380, cardW - 94),
      42,
      '재대전',
      () => {
        this.scene.start('Game', {
          mode: 'pvp',
          token: this.pvp?.token,
          serverBaseUrl: this.pvp?.serverBaseUrl,
          user: this.pvp?.user,
          partyKey: this.pvp?.partyKey
        });
      },
      { fill: 0x2f649a, hover: 0x3f7abb, stroke: 0xbeecff }
    );
    const lobbyNodes = mkButton(
      cx,
      rowY,
      Math.min(240, cardW - 180),
      38,
      '로비',
      () => this.scene.start('Lobby'),
      { fill: 0x243a5a, hover: 0x325178, stroke: 0x82b4eb }
    );

    const introTargets = [
      dim, glowA, glowB, cardShadow, card, inner, corners,
      resultChip, resultTx, title, reason, statBox, mmrLabel, mmrValue, tierChip, tierTx, record,
      ...retryNodes, ...lobbyNodes
    ];
    introTargets.forEach((n) => n.setAlpha(0));
    this.tweens.add({ targets: [dim, glowA, glowB], alpha: { from: 0, to: 1 }, duration: 260, ease: 'Sine.Out' });
    this.tweens.add({ targets: [cardShadow, card, inner, corners], alpha: { from: 0, to: 1 }, scaleX: { from: 0.985, to: 1 }, scaleY: { from: 0.985, to: 1 }, duration: 300, ease: 'Cubic.Out', delay: 50 });
    this.tweens.add({ targets: [resultChip, resultTx, title, reason, statBox, mmrLabel, mmrValue, tierChip, tierTx, record, ...retryNodes, ...lobbyNodes], alpha: { from: 0, to: 1 }, y: '-=4', duration: 220, ease: 'Quad.Out', delay: 130 });
  }
}
