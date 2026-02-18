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
    this.uiScale = 1;

    this.root = scene.add.container(0, 0).setDepth(3000).setVisible(false).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.68).setOrigin(0).setScrollFactor(0);
    this.root.add(this.dim);
    this.panel = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2, 680, 460, 0x101a2b, 0.94).setScrollFactor(0);
    this.panel.setStrokeStyle(2, 0x4a6f9b, 0.92);
    this.root.add(this.panel);
    this.headerBand = scene.add.rectangle(scene.scale.width / 2, 0, 520, 34, 0x173352, 0.12).setScrollFactor(0);
    this.headerBand.setStrokeStyle(1, 0x5aa9e4, 0.16);
    this.root.add(this.headerBand);

    this.title = scene.add.text(scene.scale.width / 2, 64, '레벨 업', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '32px',
      color: '#eaf0ff'
    }).setOrigin(0.5, 0).setScrollFactor(0);
    this.root.add(this.title);

    this.subtitle = scene.add.text(scene.scale.width / 2, 108, '특성 1개 선택  (방향키 + Enter 또는 클릭)', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#c3d3ee'
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
    this.uiScale = Phaser.Math.Clamp(w / 960, 0.9, 1.08);

    const panelW = Math.min(Math.floor(700 * this.uiScale), Math.max(Math.floor(520 * this.uiScale), w - Math.round(130 * this.uiScale)));
    this.cardW = Math.min(Math.floor(610 * this.uiScale), Math.max(Math.floor(340 * this.uiScale), panelW - Math.round(88 * this.uiScale)));
    this.cardH = Phaser.Math.Clamp(Math.round(96 * this.uiScale), Math.round(84 * this.uiScale), Math.round(104 * this.uiScale));
    this.cardGap = Math.max(8, Math.round(10 * this.uiScale));

    const rowCount = Math.max(1, this.cards.length || this.choiceKeys.length || 3);
    const topPad = Math.round(12 * this.uiScale);
    const headerBandH = Math.round(30 * this.uiScale);
    const titleH = Math.round(40 * this.uiScale);
    const subtitleH = Math.round(28 * this.uiScale);
    const cardsH = rowCount * this.cardH + Math.max(0, rowCount - 1) * this.cardGap;
    const contentH = topPad + headerBandH + titleH + subtitleH + Math.round(10 * this.uiScale) + cardsH + Math.round(24 * this.uiScale);
    const panelH = Phaser.Math.Clamp(contentH, Math.round(340 * this.uiScale), h - Math.round(120 * this.uiScale));

    this.panel.setSize(panelW, panelH);
    this.panel.setPosition(w / 2, h / 2);
    this.headerBand.setPosition(w / 2, this.panel.y - panelH * 0.5 + topPad + headerBandH * 0.5).setSize(panelW - Math.round(88 * this.uiScale), headerBandH);

    this.title.setPosition(w / 2, this.panel.y - panelH * 0.5 + Math.round(12 * this.uiScale)).setFontSize(Math.max(24, Math.round(30 * this.uiScale)));
    this.subtitle.setPosition(w / 2, this.title.y + Math.round(36 * this.uiScale)).setFontSize(Math.max(13, Math.round(15 * this.uiScale)));
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
    const panelTop = this.panel.y - panelH * 0.5;
    const panelBottom = this.panel.y + panelH * 0.5;
    const bottomPad = Math.round(18 * this.uiScale);
    const desiredTop = Math.max(this.subtitle.y + Math.round(20 * this.uiScale), panelTop + Math.round(96 * this.uiScale));
    const startTop = Math.min(desiredTop, panelBottom - bottomPad - totalH);
    const startY = startTop + cardH * 0.5;

    this.cards.forEach((card, i) => {
      const y = startY + i * (cardH + gap);
      card.bg.setPosition(w / 2, y);
      card.icon.setPosition(w / 2 - cardW / 2 + Math.round(30 * this.uiScale), y);
      card.title.setPosition(w / 2 - cardW / 2 + Math.round(56 * this.uiScale), y - cardH * 0.16);
      card.desc.setPosition(w / 2 - cardW / 2 + Math.round(56 * this.uiScale), y + cardH * 0.18);
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
      const bg = this.scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x1a2d48, 0.94).setStrokeStyle(1.5, 0x4f7eac, 0.8).setScrollFactor(0);
      const icon = this.scene.add.image(0, 0, iconKey).setDisplaySize(Math.round(30 * this.uiScale), Math.round(30 * this.uiScale)).setScrollFactor(0);
      const title = this.scene.add.text(0, 0, getLabel(key), {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: `${Math.max(18, Math.round(20 * this.uiScale))}px`,
        color: '#eaf0ff'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      const desc = this.scene.add.text(0, 0, getDesc(key), {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: `${Math.max(13, Math.round(14 * this.uiScale))}px`,
        color: '#a9bcda'
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
      card.bg.setFillStyle(selected ? 0x274267 : 0x1a2d48, 0.94);
      card.bg.setStrokeStyle(selected ? 2 : 1.5, selected ? 0x8fcfff : 0x4f7eac, selected ? 0.95 : 0.8);
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
