import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import { RELICS, effectToText } from '../data/relics.js';

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

    this.add.rectangle(0, 0, w, h, 0x070d18, 1).setOrigin(0);
    this.add.text(24, 18, '상점', { fontFamily: FONT_KR, fontSize: '34px', color: '#eaf0ff' });

    this.goldText = this.add.text(24, 86, '', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#ffd700'
    });
    this.equipText = this.add.text(250, 86, '', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#aab6d6'
    });

    const back = this.add.rectangle(w - 110, 42, 170, 40, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    back.setStrokeStyle(1, 0x7ea0ff, 0.8);
    this.add.text(w - 110, 42, '로비로', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    back.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });

    this.tabRoot = this.add.container(0, 0);
    this.listRoot = this.add.container(0, 0);
    this.viewport = {
      left: 22,
      top: 132,
      width: w - 44,
      height: h - 148
    };
    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    maskGfx.fillRect(this.viewport.left, this.viewport.top, this.viewport.width, this.viewport.height);
    this.listMask = maskGfx.createGeometryMask();
    this.listRoot.setMask(this.listMask);

    this.scrollTrack = this.add.rectangle(w - 14, this.viewport.top, 6, this.viewport.height, 0x1a253b, 0.9).setOrigin(0.5, 0);
    this.scrollThumb = this.add.rectangle(w - 14, this.viewport.top, 6, 40, 0x496896, 0.95).setOrigin(0.5, 0);
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
      this.listDrag = { pointerId: p.id, lastY: p.y, moved: false };
    });
    this.scrollDragZone.on('pointermove', (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      const dy = p.y - this.listDrag.lastY;
      if (Math.abs(dy) > 0.5) {
        this.listDrag.moved = true;
        this.setScroll(this.listScrollY - dy);
        this.listDrag.lastY = p.y;
      }
    });
    this.scrollDragZone.on('pointerup', (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      this.listDrag = null;
    });
    this.scrollDragZone.on('pointerout', (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      this.listDrag = null;
    });
    this.input.on('pointerup', (p) => {
      if (!this.listDrag || this.listDrag.pointerId !== p.id) return;
      this.listDrag = null;
    });

    this.input.on('wheel', (pointer, _objects, _dx, dy) => {
      const inside = pointer.x >= this.viewport.left
        && pointer.x <= this.viewport.left + this.viewport.width
        && pointer.y >= this.viewport.top
        && pointer.y <= this.viewport.top + this.viewport.height;
      if (!inside) return;
      this.setScroll(this.listScrollY + dy * 0.7);
    });

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
    const startX = 24;
    const y = 54;
    const gap = 10;
    const w = 94;
    const h = 30;

    this.tabs.forEach((tab, idx) => {
      const x = startX + idx * (w + gap);
      const active = tab.id === this.activeTab;
      const bg = this.add.rectangle(x, y, w, h, active ? 0x35507a : 0x1f2b43, 0.95)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(active ? 2 : 1, active ? 0x8ab7ff : 0x3b4d75, 0.95);
      const tx = this.add.text(x + w * 0.5, y + h * 0.5, tab.label, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: '#eaf0ff'
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
    const w = this.scale.width;
    const left = this.viewport.left;
    const top = this.viewport.top;
    const listW = this.viewport.width;
    const cardW = Math.floor((listW - 24) / 2);
    const cardH = 70;
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

      const card = this.add.rectangle(x, y, cardW, cardH, 0x121b2d, 0.95).setOrigin(0, 0);
      card.setStrokeStyle(1, equipped ? 0x8bc6ff : 0x314261, 0.95);
      this.listRoot.add(card);

      const name = this.add.text(x + 10, y + 8, r.name, {
        fontFamily: FONT_KR,
        fontSize: '16px',
        color: owned ? '#eaf0ff' : '#aab6d6'
      });
      this.listRoot.add(name);

      const desc = this.add.text(x + 10, y + 31, effectToText(r.effects), {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      });
      this.listRoot.add(desc);

      const priceColor = canBuy ? '#ffd700' : '#cf7f7f';
      const price = this.add.text(x + cardW - 126, y + 8, `${r.price}`, {
        fontFamily: FONT_KR,
        fontSize: '16px',
        color: priceColor
      });
      this.listRoot.add(price);

      const btn = this.add.rectangle(x + cardW - 63, y + cardH - 18, 112, 26, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
      btn.setStrokeStyle(1, 0x7ea0ff, 0.8);
      const btnLabel = !owned ? '구매' : (equipped ? '해제' : '장착');
      const tx = this.add.text(btn.x, btn.y, btnLabel, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: '#eaf0ff'
      }).setOrigin(0.5);
      this.listRoot.add([btn, tx]);

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
        parts: [card, name, desc, price, btn, tx],
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
