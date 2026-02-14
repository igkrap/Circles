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

    // Minimal loading bar
    const w = this.scale.width;
    const h = this.scale.height;
    const bar = this.add.rectangle(w / 2, h / 2, 300, 16, 0x2a3344).setOrigin(0.5);
    const fill = this.add.rectangle(w / 2 - 150, h / 2, 0, 16, 0x7ea0ff).setOrigin(0, 0.5);

    this.load.on('progress', (p) => {
      fill.width = 300 * p;
    });

    this.load.on('complete', () => {
      bar.destroy();
      fill.destroy();
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

    this.scene.start('Lobby');
  }
}
