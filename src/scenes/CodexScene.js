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
    this.add.text(panelX, headerY, '도감', {
      fontFamily: FONT_KR,
      fontSize: '24px',
      color: '#eaf0ff'
    }).setOrigin(0.5);

    this.summaryText = this.add.text(panelLeft + panelW - 24, panelTop + 72, '', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#9dd7ff'
    }).setOrigin(1, 0.5);

    const back = this.add.rectangle(panelX + panelW * 0.5 - 34, headerY, 32, 30, 0x234463, 0.98).setInteractive({ useHandCursor: true });
    back.setStrokeStyle(1, 0x89d4ff, 0.9);
    this.add.text(back.x, back.y - 0.5, 'X', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#edf7ff',
      fontStyle: '700'
    }).setOrigin(0.5);
    back.on('pointerover', () => {
      back.setFillStyle(0x2f5882, 0.99);
      back.setStrokeStyle(1, 0xb5ecff, 0.98);
    });
    back.on('pointerout', () => {
      back.setFillStyle(0x234463, 0.98);
      back.setStrokeStyle(1, 0x89d4ff, 0.9);
    });
    back.on('pointerdown', () => {
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
    this.summaryText.setPosition(panelLeft + panelW - 24, this.tabLayout.y + 15);

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

    void panelShadow;
    void panel;
    void header;
    void listBg;
    void grid;
    void bg;

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
    const rowH = 92;
    const gapY = 10;

    CODEX_SETS.forEach((set, i) => {
      const y = top + i * (rowH + gapY);
      const progress = set.relicIds.filter((id) => owned.has(id)).length;
      const done = progress === set.relicIds.length;

      const row = this.add.rectangle(left, y, rowW, rowH, 0x132846, 0.92).setOrigin(0, 0);
      row.setStrokeStyle(1, done ? 0x9fe2ff : 0x446b9e, done ? 0.92 : 0.54);
      const accent = this.add.rectangle(left + 3, y + rowH * 0.5, 4, rowH - 10, done ? 0x9fe2ff : 0x6caedf, done ? 0.92 : 0.66);
      const setIcon = this.add.image(left + 20, y + 18, getRelicIconKeyById(set.id)).setDisplaySize(20, 20);

      const title = this.add.text(left + 38, y + 8, `${done ? '[완성]' : `[${progress}/3]`} ${set.name}`, {
        fontFamily: FONT_KR,
        fontSize: '15px',
        color: done ? '#a6e6ff' : '#eaf0ff'
      });

      const bonus = this.add.text(left + Math.floor(rowW * 0.48), y + 8, effectToText(set.effects), {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#a8bedb',
        wordWrap: { width: Math.floor(rowW * 0.48) - 16 }
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

      this.listRoot.add([row, accent, setIcon, title, bonus, ...relicIcons, need]);
      this.rowEntries.push({ y, h: rowH, parts: [row, accent, setIcon, title, bonus, ...relicIcons, need] });
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
