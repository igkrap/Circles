import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import { RELICS, effectToText, getRelicIconKeyById } from '../data/relics.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';
const MAX_EQUIP = 3;

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
    this.activeTab = 'relics';
    this.tabs = [{ id: 'relics', label: '유물' }];
    this.listScrollY = 0;
    this.listMaxScroll = 0;
    this.relicEntries = [];
    this.scrollDrag = null;
    this.listDrag = null;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050a14, 0x060d1b, 0x020612, 0x030714, 1);
    bg.fillRect(0, 0, w, h);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x36527f, 0.14);
    for (let x = 0; x <= w; x += 52) grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 52) grid.lineBetween(0, y, w, y);

    const panelW = Math.min(980, w - 36);
    const panelH = Math.min(660, h - 36);
    const panelX = w * 0.5;
    const panelY = h * 0.5;
    const panelTop = panelY - panelH * 0.5;
    const panelLeft = panelX - panelW * 0.5;
    const panelShadow = this.add.rectangle(panelX, panelY + 8, panelW + 16, panelH + 18, 0x040b16, 0.66);
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1e35, 0.96);
    panel.setStrokeStyle(1.8, 0x6fc8ff, 0.84);
    const headerY = panelTop + 34;
    const header = this.add.rectangle(panelX, headerY, panelW - 30, 44, 0x163153, 0.38);
    header.setStrokeStyle(1, 0x6eaedb, 0.34);
    this.add.text(panelX, headerY, '상점', {
      fontFamily: FONT_KR,
      fontSize: '24px',
      color: '#eaf0ff'
    }).setOrigin(0.5);

    this.goldText = this.add.text(panelLeft + 24, panelTop + 72, '', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#9dd7ff'
    });
    this.equipText = this.add.text(panelLeft + 220, panelTop + 72, '', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#aab6d6'
    });

    const closeBtn = this.add.rectangle(panelX + panelW * 0.5 - 34, headerY, 32, 30, 0x234463, 0.98).setInteractive({ useHandCursor: true });
    closeBtn.setStrokeStyle(1, 0x89d4ff, 0.9);
    this.add.text(closeBtn.x, closeBtn.y - 0.5, 'X', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#edf7ff',
      fontStyle: '700'
    }).setOrigin(0.5);
    closeBtn.on('pointerover', () => {
      closeBtn.setFillStyle(0x2f5882, 0.99);
      closeBtn.setStrokeStyle(1, 0xb5ecff, 0.98);
    });
    closeBtn.on('pointerout', () => {
      closeBtn.setFillStyle(0x234463, 0.98);
      closeBtn.setStrokeStyle(1, 0x89d4ff, 0.9);
    });
    closeBtn.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });

    this.tabRoot = this.add.container(0, 0);
    this.listRoot = this.add.container(0, 0);
    this.viewport = {
      left: panelLeft + 22,
      top: panelTop + 132,
      width: panelW - 44,
      height: panelH - 154
    };
    this.tabLayout = {
      startX: panelLeft + 24,
      y: panelTop + 84
    };

    const listBg = this.add.rectangle(
      this.viewport.left + this.viewport.width * 0.5,
      this.viewport.top + this.viewport.height * 0.5,
      this.viewport.width,
      this.viewport.height,
      0x112744,
      0.65
    );
    listBg.setStrokeStyle(1, 0x4f7eb6, 0.58);

    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    maskGfx.fillRect(this.viewport.left, this.viewport.top, this.viewport.width, this.viewport.height);
    this.listMask = maskGfx.createGeometryMask();
    this.listRoot.setMask(this.listMask);

    const scrollX = this.viewport.left + this.viewport.width + 8;
    this.scrollTrack = this.add.rectangle(scrollX, this.viewport.top, 5, this.viewport.height, 0x0d1a2f, 0.94).setOrigin(0.5, 0);
    this.scrollTrack.setStrokeStyle(1, 0x345885, 0.7);
    this.scrollThumb = this.add.rectangle(scrollX, this.viewport.top, 5, 40, 0x7fcfff, 0.94).setOrigin(0.5, 0);
    this.scrollThumb.setStrokeStyle(1, 0xcdf2ff, 0.7);
    this.scrollTrack.setInteractive({ useHandCursor: true });
    this.scrollThumb.setInteractive({ draggable: true, useHandCursor: true });

    this.scrollTrack.on('pointerdown', (p) => {
      if (this.listMaxScroll <= 0) return;
      const t = Phaser.Math.Clamp((p.y - this.viewport.top) / Math.max(1, this.viewport.height), 0, 1);
      this.setScroll(this.listMaxScroll * t);
    });

    this.input.setDraggable(this.scrollThumb);
    this.scrollThumb.on('dragstart', (p) => {
      this.scrollDrag = { pointerId: p.id };
    });
    this.scrollThumb.on('drag', (p, _dragX, dragY) => {
      if (!this.scrollDrag || this.scrollDrag.pointerId !== p.id || this.listMaxScroll <= 0) return;
      const thumbH = this.scrollThumb.height;
      const maxY = Math.max(1, this.viewport.height - thumbH);
      const yLocal = Phaser.Math.Clamp(dragY - this.viewport.top, 0, maxY);
      const t = yLocal / maxY;
      this.setScroll(this.listMaxScroll * t);
    });
    this.scrollThumb.on('dragend', () => {
      this.scrollDrag = null;
    });

    this.scrollDragZone = this.add.zone(this.viewport.left, this.viewport.top, this.viewport.width, this.viewport.height)
      .setOrigin(0, 0)
      .setInteractive();
    this.scrollDragZone.setDepth(-1);
    this.scrollDragZone.on('pointerdown', (p) => {
      this.listDrag = { pointerId: p.id, lastY: p.y };
    });
    this.scrollDragZone.on('pointermove', (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      const dy = p.y - this.listDrag.lastY;
      if (Math.abs(dy) > 0.5) {
        this.setScroll(this.listScrollY - dy);
        this.listDrag.lastY = p.y;
      }
    });
    const clearDrag = (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      this.listDrag = null;
    };
    this.scrollDragZone.on('pointerup', clearDrag);
    this.scrollDragZone.on('pointerout', clearDrag);
    this.input.on('pointerup', clearDrag);

    this.input.on('wheel', (pointer, _objects, _dx, dy) => {
      const inside = pointer.x >= this.viewport.left
        && pointer.x <= this.viewport.left + this.viewport.width
        && pointer.y >= this.viewport.top
        && pointer.y <= this.viewport.top + this.viewport.height;
      if (!inside) return;
      this.setScroll(this.listScrollY + dy * 0.7);
    });

    void bg;
    void grid;
    void panelShadow;
    void panel;
    void header;
    void listBg;

    this.renderAll();
  }

  renderAll() {
    const state = SaveSystem.getRelicState();
    this.goldText.setText(`보유 골드: ${SaveSystem.getTotalGold()}`);
    this.equipText.setText(`장착: ${state.equipped.length}/${MAX_EQUIP}`);
    this.renderTabs();
    this.renderActiveTab(state);
  }

  renderTabs() {
    this.tabRoot.removeAll(true);
    const startX = this.tabLayout?.startX || 24;
    const y = this.tabLayout?.y || 54;
    const gap = 10;
    const w = 94;
    const h = 30;

    this.tabs.forEach((tab, idx) => {
      const x = startX + idx * (w + gap);
      const active = tab.id === this.activeTab;
      const bg = this.add.rectangle(x, y, w, h, active ? 0x2f5782 : 0x223f62, 0.97)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(active ? 1.3 : 1, active ? 0xa7e8ff : 0x7ecdfd, active ? 0.96 : 0.74);
      const tx = this.add.text(x + w * 0.5, y + h * 0.5, tab.label, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: '#edf6ff'
      }).setOrigin(0.5);
      bg.on('pointerdown', () => {
        this.activeTab = tab.id;
        this.renderAll();
      });
      this.tabRoot.add([bg, tx]);
    });
  }

  renderActiveTab(state) {
    if (this.activeTab === 'relics') {
      this.renderRelicList(state);
      return;
    }
    this.listRoot.removeAll(true);
  }

  renderRelicList(state) {
    this.listRoot.removeAll(true);
    this.relicEntries = [];
    const left = this.viewport.left;
    const top = this.viewport.top;
    const listW = this.viewport.width;
    const cardW = Math.floor((listW - 24) / 2);
    const cardH = 78;
    const gapX = 12;
    const gapY = 12;

    const relics = [...RELICS].sort((a, b) => a.price - b.price);
    relics.forEach((r, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = left + col * (cardW + gapX);
      const y = top + row * (cardH + gapY);
      const owned = !!state.owned[r.id];
      const equipped = state.equipped.includes(r.id);
      const canBuy = SaveSystem.getTotalGold() >= r.price;

      const card = this.add.rectangle(x, y, cardW, cardH, 0x132846, 0.92).setOrigin(0, 0);
      card.setStrokeStyle(1, equipped ? 0x9fe2ff : 0x446b9e, equipped ? 0.92 : 0.54);
      const accent = this.add.rectangle(x + 3, y + cardH * 0.5, 4, cardH - 8, equipped ? 0x9fe2ff : 0x6caedf, equipped ? 0.92 : 0.66);
      this.listRoot.add([card, accent]);

      const icon = this.add.image(x + 24, y + 21, getRelicIconKeyById(r.id)).setDisplaySize(22, 22);
      this.listRoot.add(icon);

      const name = this.add.text(x + 40, y + 8, r.name, {
        fontFamily: FONT_KR,
        fontSize: '16px',
        color: owned ? '#eaf0ff' : '#aab6d6'
      });
      this.listRoot.add(name);

      const desc = this.add.text(x + 10, y + 34, effectToText(r.effects), {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#9eb8d8',
        wordWrap: { width: cardW - 132 }
      });
      this.listRoot.add(desc);

      const price = this.add.text(x + cardW - 126, y + 8, `${r.price}`, {
        fontFamily: FONT_KR,
        fontSize: '16px',
        color: canBuy ? '#9dd7ff' : '#c58e8e'
      });
      this.listRoot.add(price);

      const btn = this.add.rectangle(x + cardW - 63, y + cardH - 18, 112, 26, 0x244466, 0.97).setInteractive({ useHandCursor: true });
      btn.setStrokeStyle(1, 0x7ecdfd, 0.8);
      const btnLabel = !owned ? '구매' : (equipped ? '해제' : '장착');
      const tx = this.add.text(btn.x, btn.y, btnLabel, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: '#edf6ff'
      }).setOrigin(0.5);
      this.listRoot.add([btn, tx]);
      btn.on('pointerover', () => {
        btn.setFillStyle(0x2f5680, 0.98);
        btn.setStrokeStyle(1, 0xa7e8ff, 0.95);
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(0x244466, 0.97);
        btn.setStrokeStyle(1, 0x7ecdfd, 0.8);
      });

      btn.on('pointerdown', () => {
        if (!owned) {
          const rs = SaveSystem.buyRelic(r.id, r.price);
          if (!rs.ok) return;
          const newState = SaveSystem.getRelicState();
          if (newState.equipped.length < MAX_EQUIP) {
            SaveSystem.toggleEquipRelic(r.id, MAX_EQUIP);
          }
          this.renderAll();
          return;
        }
        SaveSystem.toggleEquipRelic(r.id, MAX_EQUIP);
        this.renderAll();
      });

      this.relicEntries.push({
        y,
        h: cardH,
        parts: [card, accent, icon, name, desc, price, btn, tx],
        button: btn
      });
    });

    const rowCount = Math.ceil(relics.length / 2);
    const contentHeight = rowCount * cardH + Math.max(0, rowCount - 1) * gapY;
    this.listMaxScroll = Math.max(0, contentHeight - this.viewport.height);
    this.setScroll(this.listScrollY);
  }

  setScroll(v) {
    this.listScrollY = Phaser.Math.Clamp(v, 0, this.listMaxScroll);
    this.listRoot.y = -this.listScrollY;
    this.updateEntryVisibility();
    this.updateScrollbar();
  }

  updateEntryVisibility() {
    const viewportTop = this.viewport.top;
    const viewportBottom = this.viewport.top + this.viewport.height;
    this.relicEntries.forEach((entry) => {
      const y1 = entry.y - this.listScrollY;
      const y2 = y1 + entry.h;
      const visible = y2 >= viewportTop && y1 <= viewportBottom;
      entry.parts.forEach((p) => p.setVisible(visible));
      if (entry.button?.input) entry.button.input.enabled = visible;
    });
  }

  updateScrollbar() {
    if (this.listMaxScroll <= 0) {
      this.scrollThumb.setVisible(false);
      this.scrollTrack.setVisible(false);
      return;
    }
    this.scrollTrack.setVisible(true);
    this.scrollThumb.setVisible(true);
    const trackH = this.viewport.height;
    const ratio = this.viewport.height / (this.viewport.height + this.listMaxScroll);
    const thumbH = Math.max(36, Math.floor(trackH * ratio));
    const maxY = trackH - thumbH;
    const t = this.listScrollY / this.listMaxScroll;
    this.scrollThumb.height = thumbH;
    this.scrollThumb.y = this.viewport.top + maxY * t;
  }
}
