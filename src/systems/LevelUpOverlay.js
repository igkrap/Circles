import Phaser from 'phaser';

export default class LevelUpOverlay {
  constructor(scene, onPick) {
    this.scene = scene;
    this.onPick = onPick;
    this.active = false;
    this.focus = 0;
    this.choiceKeys = [];
    this.cards = [];
    this.cardW = 420;
    this.cardH = 106;
    this.cardGap = 14;

    this.root = scene.add.container(0, 0).setDepth(3000).setVisible(false).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.68).setOrigin(0).setScrollFactor(0);
    this.root.add(this.dim);
    this.panel = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2, 720, 520, 0x111a2c, 0.90).setScrollFactor(0);
    this.panel.setStrokeStyle(2, 0x3b4d75, 1);
    this.root.add(this.panel);

    this.title = scene.add.text(scene.scale.width / 2, 64, '레벨 업', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '36px',
      color: '#eaf0ff'
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.root.add(this.title);

    this.subtitle = scene.add.text(scene.scale.width / 2, 108, '특성 1개 선택  (방향키 + Enter 또는 클릭)', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#d7e3ff'
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.root.add(this.subtitle);

    this.resize(scene.scale.width, scene.scale.height);
    scene.scale.on('resize', (size) => this.resize(size.width, size.height));
  }

  destroy() {
    this.root.destroy(true);
  }

  resize(w, h) {
    this.dim.setSize(w, h);
    const panelW = Math.min(760, Math.max(560, w - 60));
    const panelH = Math.min(560, Math.max(420, h - 60));
    this.panel.setSize(panelW, panelH);
    this.panel.setPosition(w / 2, h / 2);

    this.cardW = Math.min(640, Math.max(360, panelW - 120));
    this.cardH = Math.max(98, Math.min(112, panelH * 0.18));

    this.title.setPosition(w / 2, this.panel.y - panelH * 0.5 + 28);
    this.subtitle.setPosition(w / 2, this.title.y + 44);
    if (this.cards.length > 0) {
      this.layoutCards();
    }
  }

  layoutCards() {
    const w = this.scene.scale.width;
    const panelH = this.panel.height;
    const cardW = this.cardW;
    const cardH = this.cardH;
    const gap = this.cardGap;
    const totalH = this.cards.length * cardH + Math.max(0, this.cards.length - 1) * gap;
    const startY = Math.max(this.subtitle.y + 78, this.panel.y - panelH * 0.5 + 150);

    this.cards.forEach((card, i) => {
      const y = startY + i * (cardH + gap);
      card.bg.setPosition(w / 2, y);
      card.icon.setPosition(w / 2 - cardW / 2 + 34, y);
      card.title.setPosition(w / 2 - cardW / 2 + 64, y - cardH * 0.18);
      card.desc.setPosition(w / 2 - cardW / 2 + 64, y + cardH * 0.16);
      card.hit.setPosition(w / 2 - cardW / 2, y - cardH / 2).setSize(cardW, cardH);
      card.bg.setSize(cardW, cardH);
    });
  }

  show(choiceKeys, getLabel, getDesc) {
    this.choiceKeys = [...choiceKeys];
    this.focus = 0;
    this.active = true;
    this.root.setVisible(true);
    this.clearCards();

    this.choiceKeys.forEach((key, i) => {
      const iconKey = this.scene.textures.exists(`ico_${key}`) ? `ico_${key}` : 'tex_gold';
      const bg = this.scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x1a2133, 0.96).setStrokeStyle(2, 0x374158, 1).setScrollFactor(0);
      const icon = this.scene.add.image(0, 0, iconKey).setDisplaySize(34, 34).setScrollFactor(0);
      const title = this.scene.add.text(0, 0, getLabel(key), {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '22px',
        color: '#eaf0ff'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const desc = this.scene.add.text(0, 0, getDesc(key), {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#aab6d6'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const hit = this.scene.add.zone(0, 0, this.cardW, this.cardH).setOrigin(0, 0).setInteractive().setScrollFactor(0);

      hit.on('pointerover', () => {
        this.focus = i;
        this.refreshFocus();
      });
      hit.on('pointerdown', () => this.pick(i));

      this.root.add([bg, icon, title, desc, hit]);
      this.cards.push({ bg, icon, title, desc, hit });
    });

    this.layoutCards();
    this.refreshFocus();
  }

  hide() {
    this.active = false;
    this.root.setVisible(false);
    this.clearCards();
  }

  clearCards() {
    this.cards.forEach((card) => {
      card.bg.destroy();
      card.icon.destroy();
      card.title.destroy();
      card.desc.destroy();
      card.hit.destroy();
    });
    this.cards = [];
  }

  refreshFocus() {
    this.cards.forEach((card, i) => {
      const selected = i === this.focus;
      card.bg.setFillStyle(selected ? 0x2a3552 : 0x1a2133, 0.96);
      card.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0x7ea0ff : 0x374158, 1);
    });
  }

  moveFocus(delta) {
    if (!this.active || this.cards.length === 0) return;
    const n = this.cards.length;
    this.focus = (this.focus + delta + n) % n;
    this.refreshFocus();
  }

  pick(i = this.focus) {
    if (!this.active || this.choiceKeys.length === 0) return;
    const idx = Phaser.Math.Clamp(i, 0, this.choiceKeys.length - 1);
    const key = this.choiceKeys[idx];
    this.onPick?.(key);
  }
}
