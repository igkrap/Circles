import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // Audio
    this.load.audio('bgm_lobby', 'assets/BGM_LOBBY.mp3');
    this.load.audio('bgm_main', 'assets/BGM_MAIN.mp3');
    this.load.audio('bgm_main1', 'assets/BGM_MAIN1.mp3');
    this.load.audio('bgm_main2', 'assets/BGM_MAIN2.mp3');
    this.load.audio('sfx_enemy_hit', 'assets/SFX_ENEMYHIT.mp3');
    this.load.audio('sfx_enemy_death', 'assets/SFX_ENEMYDEATH.wav');
    this.load.audio('sfx_fire', 'assets/SFX_FIRE.wav');
    this.load.audio('sfx_shockwave', 'assets/SFX_SHOCKWAVE.mp3');
    this.load.audio('sfx_laser', 'assets/SFX_LASER.wav');
    this.load.audio('sfx_grenade', 'assets/SFX_GRENADE.wav');
    this.load.audio('sfx_sword', 'assets/SFX_SWORD.wav');
    this.load.audio('sfx_clash', 'assets/SFX_CLASH.wav');
    this.load.audio('sfx_battle', 'assets/SFX_BATTLE.mp3');
    this.load.audio('sfx_thunder', 'assets/SFX_THUNDER.wav');
    this.load.image('img_player', 'assets/img_player.png');

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w * 0.5;
    const cy = h * 0.56;
    const fontStack = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';

    this.cameras.main.setBackgroundColor(0x040a15);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050b16, 0x071126, 0x030912, 0x061224, 1);
    bg.fillRect(0, 0, w, h);

    const nebulaA = this.add.circle(w * 0.22, h * 0.24, Math.min(w, h) * 0.34, 0x3b7dff, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    const nebulaB = this.add.circle(w * 0.78, h * 0.76, Math.min(w, h) * 0.4, 0x28b8d8, 0.07).setBlendMode(Phaser.BlendModes.ADD);
    const nebulaC = this.add.circle(w * 0.5, h * 0.5, Math.min(w, h) * 0.24, 0x77a7ff, 0.05).setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [nebulaA, nebulaB, nebulaC],
      alpha: { from: 0.05, to: 0.11 },
      duration: 1800,
      yoyo: true,
      repeat: -1
    });

    const stars = this.add.graphics();
    for (let i = 0; i < 64; i += 1) {
      const x = Phaser.Math.Between(0, w);
      const y = Phaser.Math.Between(0, h);
      const r = Phaser.Math.FloatBetween(0.7, 2.0);
      stars.fillStyle(0xd6e8ff, Phaser.Math.FloatBetween(0.12, 0.38));
      stars.fillCircle(x, y, r);
    }
    this.tweens.add({
      targets: stars,
      alpha: { from: 0.62, to: 0.95 },
      duration: 1500,
      yoyo: true,
      repeat: -1
    });

    const grid = this.add.graphics();
    const gridStep = 36;
    for (let x = 0; x <= w; x += gridStep) {
      const major = x % (gridStep * 4) === 0;
      grid.lineStyle(1, major ? 0x38659e : 0x1f3f66, major ? 0.22 : 0.14);
      grid.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += gridStep) {
      const major = y % (gridStep * 4) === 0;
      grid.lineStyle(1, major ? 0x38659e : 0x1f3f66, major ? 0.22 : 0.14);
      grid.lineBetween(0, y, w, y);
    }

    const scan = this.add.rectangle(cx, -8, w * 1.2, 2, 0x8fd8ff, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: scan,
      y: h + 10,
      duration: 2200,
      ease: 'Linear',
      repeat: -1
    });

    const panelW = Math.min(520, Math.max(320, Math.floor(w * 0.6)));
    const panelH = 132;
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x0e1a2d, 0.83);
    const panelTop = cy - panelH * 0.5;
    panel.setStrokeStyle(2, 0x4570a5, 0.9);
    const panelShine = this.add.rectangle(cx, cy - 46, panelW - 26, 34, 0x79bfff, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: panelShine,
      alpha: { from: 0.03, to: 0.12 },
      duration: 1200,
      yoyo: true,
      repeat: -1
    });

    const ringA = this.add.circle(cx - panelW * 0.5 + 36, panelTop + 32, 12).setStrokeStyle(2, 0x8ad8ff, 0.65);
    const ringB = this.add.circle(cx - panelW * 0.5 + 36, panelTop + 32, 18).setStrokeStyle(1.5, 0x5aa3ff, 0.44);
    const core = this.add.circle(cx - panelW * 0.5 + 36, panelTop + 32, 4, 0xb7e8ff, 0.92).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: [ringA, ringB],
      scaleX: { from: 0.92, to: 1.1 },
      scaleY: { from: 0.92, to: 1.1 },
      alpha: { from: 0.7, to: 0.35 },
      duration: 1000,
      yoyo: true,
      repeat: -1
    });
    this.tweens.add({
      targets: core,
      alpha: { from: 0.7, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    const title = this.add.text(cx, panelTop + 12, 'SYSTEM BOOT', {
      fontFamily: fontStack,
      fontSize: '12px',
      color: '#7cc6ff'
    }).setOrigin(0.5);
    const subtitle = this.add.text(cx, panelTop + 36, '인터페이스 로딩 중', {
      fontFamily: fontStack,
      fontSize: '20px',
      color: '#ebf5ff',
      fontStyle: '700'
    }).setOrigin(0.5).setWordWrapWidth(Math.max(180, panelW - 140), true);

    const statusText = this.add.text(cx, panelTop + 58, '오디오 자산 불러오는 중', {
      fontFamily: fontStack,
      fontSize: '12px',
      color: '#9fb8d8'
    }).setOrigin(0.5);
    const fileText = this.add.text(cx, panelTop + 76, '', {
      fontFamily: fontStack,
      fontSize: '11px',
      color: '#6f88a7'
    }).setOrigin(0.5).setWordWrapWidth(Math.max(150, panelW - 150), true);

    const barW = panelW - 54;
    const barH = 14;
    const barY = panelTop + 98;
    const barLeft = cx - barW * 0.5;

    const barBg = this.add.rectangle(cx, barY, barW, barH, 0x112544, 0.96);
    barBg.setStrokeStyle(1, 0x3a6190, 0.95);
    const barFill = this.add.rectangle(barLeft + 1, barY, 0, barH - 4, 0x67d2ff, 0.95).setOrigin(0, 0.5);
    const barShine = this.add.rectangle(barLeft, barY, 22, barH + 4, 0xb5edff, 0.14).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    const percentText = this.add.text(cx + barW * 0.5, barY - 17, '0%', {
      fontFamily: fontStack,
      fontSize: '14px',
      color: '#dff1ff',
      fontStyle: '700'
    }).setOrigin(1, 0.5);

    const dotCount = 6;
    const dotSize = 8;
    const dotGap = 7;
    const dotsW = dotCount * dotSize + (dotCount - 1) * dotGap;
    const dotsX = cx - dotsW * 0.5;
    const dotsY = cy + 58;
    const dots = Array.from({ length: dotCount }, (_, i) => {
      const x = dotsX + i * (dotSize + dotGap) + dotSize * 0.5;
      const d = this.add.rectangle(x, dotsY, dotSize, dotSize, 0x22344f, 0.9);
      d.setStrokeStyle(1, 0x3b5d84, 0.7);
      return d;
    });

    const tips = [
      'TIP  이동: WASD / 스킬: 1~4',
      'TIP  쉴드는 피격 시 먼저 소모됩니다',
      'TIP  특성 조합으로 생존력을 크게 올릴 수 있습니다'
    ];
    let tipIndex = 0;
    const tipText = this.add.text(cx, cy + 80, tips[0], {
      fontFamily: fontStack,
      fontSize: '11px',
      color: '#7d95b4'
    }).setOrigin(0.5);
    this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % tips.length;
        tipText.setText(tips[tipIndex]);
      }
    });

    const updateProgress = (p) => {
      const clamped = Phaser.Math.Clamp(Number(p || 0), 0, 1);
      barFill.width = Math.max(0, (barW - 2) * clamped);
      barShine.x = barLeft + (barW - 22) * clamped;
      percentText.setText(`${Math.round(clamped * 100)}%`);
      const activeDots = Math.ceil(clamped * dotCount);
      dots.forEach((d, i) => {
        if (i < activeDots) {
          d.setFillStyle(0x7ed5ff, 1);
          d.setStrokeStyle(1, 0xc4eeff, 0.9);
        } else {
          d.setFillStyle(0x22344f, 0.9);
          d.setStrokeStyle(1, 0x3b5d84, 0.7);
        }
      });

      if (clamped < 0.35) statusText.setText('오디오 자산 불러오는 중');
      else if (clamped < 0.75) statusText.setText('시스템 모듈 연결 중');
      else if (clamped < 1) statusText.setText('최종 구성 적용 중');
      else statusText.setText('준비 완료');
    };

    this.load.on('fileprogress', (file) => {
      const key = String(file?.key || '');
      if (!key) return;
      const shown = key.length > 34 ? `${key.slice(0, 31)}...` : key;
      fileText.setText(shown);
    });

    this.load.on('progress', (p) => {
      updateProgress(p);
    });

    this.load.on('complete', () => {
      updateProgress(1);
      fileText.setText('');
      this.tweens.add({
        targets: [panel, panelShine],
        alpha: { from: 0.9, to: 1 },
        duration: 140,
        yoyo: true
      });
    });
  }

  create() {
    // Generate simple textures with Graphics (no external images needed).
    const makeCircle = (key, radius, fillColor, strokeColor = null) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      if (strokeColor !== null) {
        g.lineStyle(3, strokeColor, 1);
        g.strokeCircle(radius, radius, radius - 1);
      }
      g.fillStyle(fillColor, 1);
      g.fillCircle(radius, radius, radius - 2);
      g.generateTexture(key, radius * 2, radius * 2);
      g.destroy();
    };

    const makeRect = (key, w, h, fillColor, strokeColor = null) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      if (strokeColor !== null) {
        g.lineStyle(2, strokeColor, 1);
        g.strokeRect(1, 1, w - 2, h - 2);
      }
      g.fillStyle(fillColor, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    const makeOrb = (key, radius, bodyColor, rimColor, glowColor = null) => {
      const s = radius * 2;
      const c = radius;
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      if (glowColor !== null) {
        g.fillStyle(glowColor, 0.22);
        g.fillCircle(c, c, radius - 0.5);
      }

      g.fillStyle(bodyColor, 0.95);
      g.fillCircle(c, c, radius - 2);

      g.lineStyle(2.2, rimColor, 0.95);
      g.strokeCircle(c, c, radius - 2.4);

      g.fillStyle(0xffffff, 0.28);
      g.fillCircle(c - radius * 0.28, c - radius * 0.3, Math.max(2, radius * 0.19));

      g.fillStyle(0x000000, 0.18);
      g.fillCircle(c + radius * 0.16, c + radius * 0.16, Math.max(2, radius * 0.16));

      g.generateTexture(key, s, s);
      g.destroy();
    };

    const makeBullet = (key) => {
      const w = 30;
      const h = 10;
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      g.fillStyle(0x9bd9ff, 0.24);
      g.fillEllipse(w * 0.46, h * 0.5, w, h);
      g.fillStyle(0xeaf8ff, 0.95);
      g.fillEllipse(w * 0.52, h * 0.5, w * 0.52, h * 0.52);
      g.lineStyle(1.6, 0xffffff, 0.8);
      g.strokeEllipse(w * 0.52, h * 0.5, w * 0.52, h * 0.52);
      g.fillStyle(0xffffff, 0.6);
      g.fillEllipse(w * 0.62, h * 0.5, w * 0.16, h * 0.16);

      g.generateTexture(key, w, h);
      g.destroy();
    };

    const makeArenaTile = (key, size = 256) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x050c1d, 1);
      g.fillRect(0, 0, size, size);

      g.lineStyle(1, 0x163051, 0.55);
      const major = 64;
      const minor = 16;
      for (let i = 0; i <= size; i += minor) {
        const majorLine = i % major === 0;
        g.lineStyle(majorLine ? 1.2 : 1, majorLine ? 0x2a4f82 : 0x163051, majorLine ? 0.75 : 0.28);
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, size);
        g.moveTo(0, i);
        g.lineTo(size, i);
        g.strokePath();
      }

      for (let i = 0; i < 36; i += 1) {
        const x = Phaser.Math.Between(4, size - 4);
        const y = Phaser.Math.Between(4, size - 4);
        const r = Phaser.Math.FloatBetween(0.8, 2.1);
        g.fillStyle(0xcde1ff, Phaser.Math.FloatBetween(0.07, 0.2));
        g.fillCircle(x, y, r);
      }

      g.generateTexture(key, size, size);
      g.destroy();
    };

    const makeSoftShadow = (key, w = 48, h = 20) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.34);
      g.fillEllipse(w * 0.5, h * 0.5, w, h);
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(w * 0.5, h * 0.5, w * 0.7, h * 0.66);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    const makeAuraRing = (key, size = 72) => {
      const c = size * 0.5;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(3, 0x8bc6ff, 0.45);
      g.strokeCircle(c, c, c - 7);
      g.lineStyle(1.6, 0xeaf4ff, 0.35);
      g.strokeCircle(c, c, c - 11);
      g.fillStyle(0x8bc6ff, 0.08);
      g.fillCircle(c, c, c - 13);
      g.generateTexture(key, size, size);
      g.destroy();
    };

    const makeFlameParticle = (key, size = 18) => {
      const c = size * 0.5;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xff6a2d, 0.95);
      g.fillEllipse(c, c + 1, size * 0.56, size * 0.7);
      g.fillStyle(0xffb05c, 0.95);
      g.fillEllipse(c, c, size * 0.44, size * 0.56);
      g.fillStyle(0xfff1b3, 0.95);
      g.fillEllipse(c, c - 1, size * 0.22, size * 0.3);
      g.generateTexture(key, size, size);
      g.destroy();
    };

    const makeSmokeParticle = (key, size = 20) => {
      const c = size * 0.5;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xc5cfdf, 0.9);
      g.fillCircle(c - 2, c, size * 0.22);
      g.fillCircle(c + 2, c + 1, size * 0.24);
      g.fillCircle(c, c - 2, size * 0.2);
      g.generateTexture(key, size, size);
      g.destroy();
    };

    const makeGoldCoin = (key, size = 22) => {
      const c = size * 0.5;
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      // soft shadow
      g.fillStyle(0x000000, 0.22);
      g.fillCircle(c + 0.8, c + 1.2, c - 2);

      // outer rim
      g.fillStyle(0xc68d00, 1);
      g.fillCircle(c, c, c - 1);

      // mid body
      g.fillStyle(0xf4c22f, 1);
      g.fillCircle(c, c, c - 3);

      // inner disc
      g.fillStyle(0xffdf62, 1);
      g.fillCircle(c, c, c - 5.2);

      // center stamp
      g.lineStyle(1.8, 0xd89b00, 0.95);
      g.strokeCircle(c, c, c - 7.2);
      g.lineStyle(1.6, 0xd89b00, 0.9);
      g.beginPath();
      g.moveTo(c - 2.6, c);
      g.lineTo(c + 2.6, c);
      g.strokePath();

      // highlight
      g.fillStyle(0xffffff, 0.45);
      g.fillCircle(c - 3.2, c - 4.1, 2.1);

      g.generateTexture(key, size, size);
      g.destroy();
    };

    const makeSkillIcon = (key, bgColor, drawSymbol) => {
      const size = 44;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(bgColor, 0.95);
      g.fillRoundedRect(0, 0, size, size, 10);
      g.lineStyle(2, 0xffffff, 0.24);
      g.strokeRoundedRect(1, 1, size - 2, size - 2, 10);
      g.lineStyle(3, 0xf4f8ff, 0.92);
      drawSymbol(g, size);
      g.generateTexture(`ico_${key}`, size, size);
      g.destroy();
    };

    makeArenaTile('tex_bg_tile', 256);
    makeSoftShadow('tex_shadow', 52, 22);
    makeAuraRing('tex_aura_ring', 72);
    makeFlameParticle('tex_flame', 18);
    makeSmokeParticle('tex_smoke', 20);
    makeOrb('tex_player', 16, 0x7ea0ff, 0xf3f7ff, 0x7ea0ff);
    makeBullet('tex_bullet');
    makeCircle('tex_particle_soft', 5, 0xffffff, null);

    makeOrb('tex_enemy_scout', 12, 0xff6b6b, 0x4d0f16, 0xff6b6b);
    makeOrb('tex_enemy_normal', 14, 0xffb86b, 0x523011, 0xffb86b);
    makeOrb('tex_enemy_tank', 18, 0x6bff8a, 0x104a22, 0x6bff8a);
    makeOrb('tex_enemy_elite', 15, 0xb96bff, 0x34124d, 0xb96bff);

    makeOrb('tex_boss', 30, 0xff3bd7, 0xffffff, 0xff3bd7);
    makeGoldCoin('tex_gold', 22);

    // Passive trait icons
    makeSkillIcon('XPGain', 0x3f5bb3, (g, s) => {
      g.lineStyle(3, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.22, s * 0.72);
      g.lineTo(s * 0.22, s * 0.28);
      g.lineTo(s * 0.78, s * 0.28);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.60, s * 0.18);
      g.lineTo(s * 0.78, s * 0.28);
      g.lineTo(s * 0.60, s * 0.38);
      g.strokePath();
    });
    makeSkillIcon('ATK', 0x8b4a2a, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.2, s * 0.72);
      g.lineTo(s * 0.72, s * 0.2);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.68, s * 0.2);
      g.lineTo(s * 0.8, s * 0.16);
      g.lineTo(s * 0.76, s * 0.28);
      g.strokePath();
    });
    makeSkillIcon('FIRERATE', 0x2a7a86, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.24, s * 0.36);
      g.lineTo(s * 0.76, s * 0.36);
      g.moveTo(s * 0.24, s * 0.5);
      g.lineTo(s * 0.76, s * 0.5);
      g.moveTo(s * 0.24, s * 0.64);
      g.lineTo(s * 0.76, s * 0.64);
      g.strokePath();
    });
    makeSkillIcon('MOVESPD', 0x2d7b82, (g, s) => {
      g.beginPath();
      g.moveTo(10, s * 0.35);
      g.lineTo(22, s * 0.5);
      g.lineTo(10, s * 0.65);
      g.moveTo(22, s * 0.35);
      g.lineTo(34, s * 0.5);
      g.lineTo(22, s * 0.65);
      g.strokePath();
    });
    makeSkillIcon('SHIELD', 0x3766a8, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.14);
      g.lineTo(s * 0.74, s * 0.24);
      g.lineTo(s * 0.7, s * 0.58);
      g.lineTo(s * 0.5, s * 0.8);
      g.lineTo(s * 0.3, s * 0.58);
      g.lineTo(s * 0.26, s * 0.24);
      g.closePath();
      g.strokePath();
    });
    makeSkillIcon('HP_REGEN', 0x3b8a53, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.2);
      g.lineTo(s * 0.5, s * 0.8);
      g.moveTo(s * 0.2, s * 0.5);
      g.lineTo(s * 0.8, s * 0.5);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.8);
      g.strokeCircle(s * 0.5, s * 0.5, s * 0.24);
    });
    makeSkillIcon('MAX_HP', 0x9b3d4f, (g, s) => {
      g.beginPath();
      g.arc(s * 0.38, s * 0.35, s * 0.13, Phaser.Math.DegToRad(150), Phaser.Math.DegToRad(20), false);
      g.arc(s * 0.62, s * 0.35, s * 0.13, Phaser.Math.DegToRad(160), Phaser.Math.DegToRad(30), false);
      g.lineTo(s * 0.5, s * 0.78);
      g.lineTo(s * 0.35, s * 0.56);
      g.moveTo(s * 0.5, s * 0.78);
      g.lineTo(s * 0.65, s * 0.56);
      g.strokePath();
    });
    makeSkillIcon('CRIT_CHANCE', 0x8a5f2c, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.14);
      g.lineTo(s * 0.58, s * 0.38);
      g.lineTo(s * 0.84, s * 0.38);
      g.lineTo(s * 0.62, s * 0.52);
      g.lineTo(s * 0.7, s * 0.78);
      g.lineTo(s * 0.5, s * 0.62);
      g.lineTo(s * 0.3, s * 0.78);
      g.lineTo(s * 0.38, s * 0.52);
      g.lineTo(s * 0.16, s * 0.38);
      g.lineTo(s * 0.42, s * 0.38);
      g.closePath();
      g.strokePath();
    });
    makeSkillIcon('GOLD_GAIN', 0x9c761e, (g, s) => {
      g.strokeCircle(s * 0.5, s * 0.52, s * 0.22);
      g.lineStyle(2, 0xf4f8ff, 0.9);
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.32);
      g.lineTo(s * 0.5, s * 0.72);
      g.moveTo(s * 0.42, s * 0.42);
      g.lineTo(s * 0.58, s * 0.42);
      g.moveTo(s * 0.42, s * 0.62);
      g.lineTo(s * 0.58, s * 0.62);
      g.strokePath();
    });

    makeSkillIcon('SHOCKWAVE', 0x325aa8, (g, s) => {
      g.strokeCircle(s * 0.5, s * 0.5, 8);
      g.strokeCircle(s * 0.5, s * 0.5, 14);
    });
    makeSkillIcon('LASER', 0x1f6ca2, (g, s) => {
      g.beginPath();
      g.moveTo(10, s - 12);
      g.lineTo(s - 10, 12);
      g.strokePath();
    });
    makeSkillIcon('GRENADE', 0xa16a24, (g, s) => {
      g.fillStyle(0xf4f8ff, 0.92);
      g.fillCircle(s * 0.5, s * 0.58, 10);
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.28);
      g.lineTo(s * 0.66, s * 0.38);
      g.strokePath();
    });
    makeSkillIcon('FWD_SLASH', 0x8d5f2e, (g, s) => {
      g.beginPath();
      g.arc(s * 0.46, s * 0.62, 14, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(335), false);
      g.strokePath();
    });
    makeSkillIcon('DASH', 0x2d7b82, (g, s) => {
      g.beginPath();
      g.moveTo(10, s * 0.35);
      g.lineTo(22, s * 0.5);
      g.lineTo(10, s * 0.65);
      g.moveTo(22, s * 0.35);
      g.lineTo(34, s * 0.5);
      g.lineTo(22, s * 0.65);
      g.strokePath();
    });
    makeSkillIcon('SPIN_SLASH', 0x87623e, (g, s) => {
      g.beginPath();
      g.arc(s * 0.5, s * 0.5, 12, Phaser.Math.DegToRad(45), Phaser.Math.DegToRad(325), false);
      g.strokePath();
      g.beginPath();
      g.moveTo(s * 0.66, s * 0.28);
      g.lineTo(s * 0.76, s * 0.22);
      g.strokePath();
    });
    makeSkillIcon('CHAIN_LIGHTNING', 0x4a62c4, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.38, 9);
      g.lineTo(s * 0.56, s * 0.42);
      g.lineTo(s * 0.45, s * 0.42);
      g.lineTo(s * 0.62, s - 9);
      g.strokePath();
    });
    makeSkillIcon('BLIZZARD', 0x2c6f91, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, 9);
      g.lineTo(s * 0.5, s - 9);
      g.moveTo(9, s * 0.5);
      g.lineTo(s - 9, s * 0.5);
      g.moveTo(13, 13);
      g.lineTo(s - 13, s - 13);
      g.moveTo(s - 13, 13);
      g.lineTo(13, s - 13);
      g.strokePath();
    });
    makeSkillIcon('FIRE_BOLT', 0x9b452d, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, 9);
      g.lineTo(s * 0.35, s * 0.54);
      g.lineTo(s * 0.48, s * 0.54);
      g.lineTo(s * 0.42, s - 10);
      g.lineTo(s * 0.67, s * 0.42);
      g.lineTo(s * 0.54, s * 0.42);
      g.closePath();
      g.strokePath();
    });

    // Relic family icons
    makeSkillIcon('relic_assault', 0x7f2f2f, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.2, s * 0.72);
      g.lineTo(s * 0.8, s * 0.2);
      g.strokePath();
      g.beginPath();
      g.moveTo(s * 0.63, s * 0.2);
      g.lineTo(s * 0.8, s * 0.2);
      g.lineTo(s * 0.8, s * 0.37);
      g.strokePath();
    });
    makeSkillIcon('relic_precision', 0x6a4a22, (g, s) => {
      g.strokeCircle(s * 0.5, s * 0.5, s * 0.24);
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.strokeCircle(s * 0.5, s * 0.5, s * 0.1);
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.12); g.lineTo(s * 0.5, s * 0.3);
      g.moveTo(s * 0.5, s * 0.7); g.lineTo(s * 0.5, s * 0.88);
      g.moveTo(s * 0.12, s * 0.5); g.lineTo(s * 0.3, s * 0.5);
      g.moveTo(s * 0.7, s * 0.5); g.lineTo(s * 0.88, s * 0.5);
      g.strokePath();
    });
    makeSkillIcon('relic_rapid', 0x1f6f6f, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.2, s * 0.36); g.lineTo(s * 0.8, s * 0.36);
      g.moveTo(s * 0.2, s * 0.5); g.lineTo(s * 0.8, s * 0.5);
      g.moveTo(s * 0.2, s * 0.64); g.lineTo(s * 0.8, s * 0.64);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.72, s * 0.3); g.lineTo(s * 0.8, s * 0.36); g.lineTo(s * 0.72, s * 0.42);
      g.strokePath();
    });
    makeSkillIcon('relic_ballistic', 0x325f97, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.16, s * 0.72);
      g.lineTo(s * 0.58, s * 0.72);
      g.lineTo(s * 0.84, s * 0.46);
      g.lineTo(s * 0.58, s * 0.2);
      g.lineTo(s * 0.16, s * 0.2);
      g.strokePath();
    });
    makeSkillIcon('relic_coolant', 0x23639a, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.12); g.lineTo(s * 0.5, s * 0.88);
      g.moveTo(s * 0.12, s * 0.5); g.lineTo(s * 0.88, s * 0.5);
      g.moveTo(s * 0.22, s * 0.22); g.lineTo(s * 0.78, s * 0.78);
      g.moveTo(s * 0.78, s * 0.22); g.lineTo(s * 0.22, s * 0.78);
      g.strokePath();
    });
    makeSkillIcon('relic_survival', 0x304d7a, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.14);
      g.lineTo(s * 0.76, s * 0.24);
      g.lineTo(s * 0.7, s * 0.62);
      g.lineTo(s * 0.5, s * 0.82);
      g.lineTo(s * 0.3, s * 0.62);
      g.lineTo(s * 0.24, s * 0.24);
      g.closePath();
      g.strokePath();
    });
    makeSkillIcon('relic_regen', 0x2f7c4b, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.2); g.lineTo(s * 0.5, s * 0.8);
      g.moveTo(s * 0.2, s * 0.5); g.lineTo(s * 0.8, s * 0.5);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.85);
      g.strokeCircle(s * 0.5, s * 0.5, s * 0.24);
    });
    makeSkillIcon('relic_shield', 0x3a5f9c, (g, s) => {
      g.strokeRoundedRect(s * 0.24, s * 0.24, s * 0.52, s * 0.52, 7);
      g.lineStyle(2, 0xf4f8ff, 0.85);
      g.beginPath();
      g.moveTo(s * 0.34, s * 0.54);
      g.lineTo(s * 0.46, s * 0.66);
      g.lineTo(s * 0.68, s * 0.38);
      g.strokePath();
    });
    makeSkillIcon('relic_mobility', 0x236b7b, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.16, s * 0.56);
      g.lineTo(s * 0.46, s * 0.56);
      g.lineTo(s * 0.34, s * 0.72);
      g.moveTo(s * 0.38, s * 0.44);
      g.lineTo(s * 0.82, s * 0.44);
      g.lineTo(s * 0.7, s * 0.6);
      g.strokePath();
    });
    makeSkillIcon('relic_scavenger', 0x8c6a24, (g, s) => {
      g.strokeCircle(s * 0.44, s * 0.44, s * 0.22);
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.6, s * 0.6);
      g.lineTo(s * 0.8, s * 0.8);
      g.strokePath();
    });
    makeSkillIcon('relic_execution', 0x2f5f8e, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.22, s * 0.72);
      g.lineTo(s * 0.22, s * 0.3);
      g.lineTo(s * 0.78, s * 0.3);
      g.strokePath();
      g.lineStyle(2, 0xf4f8ff, 0.92);
      g.beginPath();
      g.moveTo(s * 0.58, s * 0.18);
      g.lineTo(s * 0.78, s * 0.3);
      g.lineTo(s * 0.58, s * 0.42);
      g.strokePath();
    });
    makeSkillIcon('relic_overclock', 0x8a3e2b, (g, s) => {
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.12);
      g.lineTo(s * 0.64, s * 0.36);
      g.lineTo(s * 0.54, s * 0.36);
      g.lineTo(s * 0.68, s * 0.7);
      g.lineTo(s * 0.42, s * 0.44);
      g.lineTo(s * 0.52, s * 0.44);
      g.lineTo(s * 0.38, s * 0.12);
      g.closePath();
      g.strokePath();
    });

    this.scene.start('Lobby');
  }
}
