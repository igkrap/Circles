import Phaser from 'phaser';

function getMmrTier(mmr) {
  const v = Number(mmr || 1000);
  if (v >= 1800) return 'Diamond';
  if (v >= 1500) return 'Platinum';
  if (v >= 1300) return 'Gold';
  if (v >= 1150) return 'Silver';
  return 'Bronze';
}

export default class PvpGameOverScene extends Phaser.Scene {
  constructor() {
    super('PvpGameOver');
  }

  init(data) {
    this.result = String(data?.result || 'lose'); // win | lose
    this.reason = String(data?.reason || 'hp_zero');
    this.profile = data?.profile || null;
    this.pvp = data?.pvp || null;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    const win = this.result === 'win';
    this.add.rectangle(0, 0, w, h, 0x020814, 0.9).setOrigin(0);
    this.add.circle(w * 0.32, h * 0.25, 180, win ? 0x41d48a : 0xff4f74, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    this.add.circle(w * 0.75, h * 0.8, 220, 0x2a7cff, 0.08).setBlendMode(Phaser.BlendModes.ADD);

    const cardW = Math.min(620, w - 48);
    const cardH = Math.min(470, h - 44);
    const cx = w * 0.5;
    const cy = h * 0.53;
    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x0f1930, 0.96);
    card.setStrokeStyle(2, 0x3f5f99, 0.95);

    this.add.text(cx, cy - cardH * 0.35, win ? '승리' : '패배', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '62px',
      color: win ? '#8ef0a7' : '#ff8f8f'
    }).setOrigin(0.5);

    const reasonLabel = this.reason === 'disconnect' ? '상대 연결 종료' : '전투 종료';
    this.add.text(cx, cy - cardH * 0.23, reasonLabel, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#9cb3da'
    }).setOrigin(0.5);

    const mmr = Number(this.profile?.mmr || 1000);
    const wins = Number(this.profile?.wins || 0);
    const losses = Number(this.profile?.losses || 0);
    const tier = getMmrTier(mmr);

    this.add.text(cx, cy - 30, `MMR ${mmr}  (${tier})`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '30px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    this.add.text(cx, cy + 10, `전적 ${wins}승 ${losses}패`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '20px',
      color: '#9cb3da'
    }).setOrigin(0.5);

    const mkBtn = (x, y, bw, bh, label, onClick, fill = 0x2a3552, hover = 0x3a4c72) => {
      const bg = this.add.rectangle(x, y, bw, bh, fill, 0.98).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, 0x7ea0ff, 0.86);
      const tx = this.add.text(x, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '19px',
        color: '#eaf0ff'
      }).setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(hover, 0.98));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.98));
      bg.on('pointerdown', onClick);
    };

    mkBtn(cx, cy + cardH * 0.28, Math.min(360, cardW - 80), 42, '재도전', () => {
      this.scene.start('Game', {
        mode: 'pvp',
        token: this.pvp?.token,
        serverBaseUrl: this.pvp?.serverBaseUrl,
        user: this.pvp?.user,
        partyKey: this.pvp?.partyKey
      });
    }, 0x35538b, 0x4668ad);

    mkBtn(cx, cy + cardH * 0.38, Math.min(260, cardW - 120), 38, '로비', () => {
      this.scene.start('Lobby');
    });
  }
}
