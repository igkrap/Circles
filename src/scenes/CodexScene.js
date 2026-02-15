import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import { CODEX_SETS, RELIC_BY_ID, effectToText, getRelicIconKeyById } from '../data/relics.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';

export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
    this.activeTab = 'relics';
    this.tabs = [{ id: 'relics', label: '유물' }];
    this.listScrollY = 0;
    this.listMaxScroll = 0;
    this.rowEntries = [];
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
    this.add.text(24, 18, '도감', {
      fontFamily: FONT_KR,
      fontSize: '34px',
      color: '#eaf0ff'
    });

    this.summaryText = this.add.text(24, 86, '', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#8bc6ff'
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
      height: h - 166
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
    const owned = new Set(SaveSystem.getOwnedRelicIds());
    const complete = CODEX_SETS.filter((set) => set.relicIds.every((id) => owned.has(id))).length;
    this.summaryText.setText(`완성: ${complete}/${CODEX_SETS.length}`);
    this.renderTabs();
    this.renderActiveTab(owned);
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

  renderActiveTab(owned) {
    if (this.activeTab === 'relics') {
      this.renderRelicCodex(owned);
      return;
    }
    this.listRoot.removeAll(true);
  }

  renderRelicCodex(owned) {
    this.listRoot.removeAll(true);
    this.rowEntries = [];
    const left = this.viewport.left;
    const top = this.viewport.top;
    const rowW = this.viewport.width;
    const rowH = 88;
    const gapY = 10;

    CODEX_SETS.forEach((set, i) => {
      const y = top + i * (rowH + gapY);
      const progress = set.relicIds.filter((id) => owned.has(id)).length;
      const done = progress === set.relicIds.length;

      const row = this.add.rectangle(left, y, rowW, rowH, 0x121b2d, 0.95).setOrigin(0, 0);
      row.setStrokeStyle(1, done ? 0x8bc6ff : 0x314261, 0.95);
      const setIcon = this.add.image(left + 18, y + 18, getRelicIconKeyById(set.id)).setDisplaySize(20, 20);

      const title = this.add.text(left + 34, y + 8, `${done ? '[완성]' : `[${progress}/3]`} ${set.name}`, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: done ? '#8bc6ff' : '#eaf0ff'
      });

      const bonus = this.add.text(left + 300, y + 8, effectToText(set.effects), {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#aab6d6'
      });

      const relicNames = set.relicIds.map((id) => {
        if (!owned.has(id)) return '???';
        return RELIC_BY_ID[id]?.name ?? '???';
      });
      const relicIcons = set.relicIds.map((id, iconIdx) => {
        const icon = this.add.image(left + 22 + iconIdx * 26, y + 47, getRelicIconKeyById(id)).setDisplaySize(16, 16);
        icon.setAlpha(owned.has(id) ? 1 : 0.2);
        return icon;
      });
      const need = this.add.text(left + 12, y + 38, `구성 유물: ${relicNames.join(' / ')}`, {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      });

      this.listRoot.add([row, setIcon, title, bonus, ...relicIcons, need]);
      this.rowEntries.push({ y, h: rowH, parts: [row, setIcon, title, bonus, ...relicIcons, need] });
    });

    const contentHeight = CODEX_SETS.length * rowH + Math.max(0, CODEX_SETS.length - 1) * gapY;
    this.listMaxScroll = Math.max(0, contentHeight - this.viewport.height);
    this.setScroll(this.listScrollY);
  }

  setScroll(v) {
    this.listScrollY = Phaser.Math.Clamp(v, 0, this.listMaxScroll);
    this.listRoot.y = -this.listScrollY;
    this.updateRowVisibility();
    this.updateScrollbar();
  }

  updateRowVisibility() {
    const viewportTop = this.viewport.top;
    const viewportBottom = this.viewport.top + this.viewport.height;
    this.rowEntries.forEach((entry) => {
      const y1 = entry.y - this.listScrollY;
      const y2 = y1 + entry.h;
      const visible = y2 >= viewportTop && y1 <= viewportBottom;
      entry.parts.forEach((p) => p.setVisible(visible));
    });
  }

  updateScrollbar() {
    if (this.listMaxScroll <= 0) {
      this.scrollTrack.setVisible(false);
      this.scrollThumb.setVisible(false);
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
