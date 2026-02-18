import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import LeaderboardSystem from '../systems/LeaderboardSystem.js';
import { getPvpServerBaseUrl } from '../utils/network.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';

function getMmrTierLabel(mmr) {
  const v = Number(mmr || 1000);
  if (v >= 1800) return 'Diamond';
  if (v >= 1500) return 'Platinum';
  if (v >= 1300) return 'Gold';
  if (v >= 1150) return 'Silver';
  return 'Bronze';
}

export default class RankingScene extends Phaser.Scene {
  constructor() {
    super('Ranking');
  }

  init(data) {
    this.initialMode = String(data?.mode || 'survival').toLowerCase();
  }

  createBackdrop(w, h) {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050a14, 0x060d1b, 0x020612, 0x030714, 1);
    bg.fillRect(0, 0, w, h);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x36527f, 0.14);
    for (let x = 0; x <= w; x += 52) grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 52) grid.lineBetween(0, y, w, y);

    return [bg, grid];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const uiScale = Phaser.Math.Clamp(w / 960, 0.85, 1.25);
    this.activeMode = 'survival';
    this.rankRows = [];

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    this.createBackdrop(w, h);

    const panelW = Math.min(Math.floor(1160 * uiScale), w - Math.round(36 * uiScale));
    const panelH = Math.min(Math.floor(700 * uiScale), h - Math.round(36 * uiScale));
    const panelX = w * 0.5;
    const panelY = h * 0.5;
    const panelTop = panelY - panelH * 0.5;
    const panelLeft = panelX - panelW * 0.5;
    const panelRight = panelX + panelW * 0.5;

    const panelShadow = this.add.rectangle(panelX, panelY + Math.round(8 * uiScale), panelW + Math.round(16 * uiScale), panelH + Math.round(18 * uiScale), 0x040b16, 0.66);
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1e35, 0.96);
    panel.setStrokeStyle(1.8, 0x6fc8ff, 0.84);
    const headerY = panelTop + Math.round(34 * uiScale);
    const header = this.add.rectangle(panelX, headerY, panelW - Math.round(30 * uiScale), Math.round(44 * uiScale), 0x163153, 0.38);
    header.setStrokeStyle(1, 0x6eaedb, 0.34);
    const title = this.add.text(panelX, headerY, '랭킹', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(20, Math.round(24 * uiScale))}px`,
      color: '#eaf0ff'
    }).setOrigin(0.5);

    const modeMeta = [
      { id: 'survival', label: '스테이지' },
      { id: 'coop', label: '협동' },
      { id: 'pvp', label: 'PVP' }
    ];
    const tabY = panelTop + Math.round(84 * uiScale);
    const tabW = Math.min(Math.round(170 * uiScale), Math.floor((panelW - Math.round(120 * uiScale)) / 3));
    const tabGap = Math.round(12 * uiScale);
    const tabStartX = panelX - ((tabW * 3 + tabGap * 2) * 0.5) + tabW * 0.5;
    this.modeTabs = new Map();
    modeMeta.forEach((m, i) => {
      const x = tabStartX + i * (tabW + tabGap);
      const box = this.add.rectangle(x, tabY, tabW, Math.round(34 * uiScale), 0x223f62, 0.97).setInteractive({ useHandCursor: true });
      box.setStrokeStyle(1, 0x7ecdfd, 0.74);
      const tx = this.add.text(x, tabY, m.label, {
        fontFamily: FONT_KR,
        fontSize: `${Math.max(13, Math.round(15 * uiScale))}px`,
        color: '#eaf6ff'
      }).setOrigin(0.5);
      box.on('pointerdown', () => this.setMode(m.id));
      this.modeTabs.set(m.id, { box, tx });
    });

    this.statusText = this.add.text(panelX, tabY + 30, '불러오는 중...', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(12, Math.round(13 * uiScale))}px`,
      color: '#9bb5d6'
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.rectangle(panelX + panelW * 0.5 - Math.round(34 * uiScale), headerY, Math.round(32 * uiScale), Math.round(30 * uiScale), 0x234463, 0.98)
      .setInteractive({ useHandCursor: true });
    closeBtn.setStrokeStyle(1, 0x89d4ff, 0.9);
    const closeTx = this.add.text(closeBtn.x, closeBtn.y - 0.5, 'X', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(14, Math.round(16 * uiScale))}px`,
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

    this.board = {
      panelX,
      panelW,
      panelLeft,
      panelRight,
      uiScale,
      tableTop: tabY + 58,
      tableBottom: panelY + panelH * 0.5 - 56
    };

    this.headerGroup = this.add.container(0, 0);
    this.rowsGroup = this.add.container(0, 0);
    this.setMode(this.initialMode || 'survival');

    void panelShadow;
    void panel;
    void header;
    void title;
    void closeBtn;
    void closeTx;
  }

  setMode(mode) {
    this.activeMode = String(mode || 'survival');
    for (const [id, tab] of this.modeTabs.entries()) {
      const active = id === this.activeMode;
      tab.box.setFillStyle(active ? 0x2f5782 : 0x223f62, 0.97);
      tab.box.setStrokeStyle(1, active ? 0xa7e8ff : 0x7ecdfd, active ? 0.95 : 0.74);
      tab.tx.setColor(active ? '#ffffff' : '#eaf6ff');
    }
    this.renderHeaders();
    this.loadModeRows().catch((err) => {
      this.statusText.setText(`랭킹 로드 실패: ${String(err?.message || err).slice(0, 70)}`);
      this.renderRows([]);
    });
  }

  renderHeaders() {
    this.headerGroup.removeAll(true);
    const y = this.board.tableTop;
    const uiScale = Number(this.board.uiScale || 1);
    const fontHeader = Math.max(13, Math.round(14 * uiScale));
    const left = Number(this.board.panelLeft || 0);
    const rightEdge = Number(this.board.panelRight || this.scale.width);
    const colRank = left + Math.round(38 * uiScale);
    const colName = left + Math.round(122 * uiScale);
    const colWins = rightEdge - Math.round(306 * uiScale);
    const colLosses = rightEdge - Math.round(230 * uiScale);
    const colMmr = rightEdge - Math.round(142 * uiScale);
    const colTier = rightEdge - Math.round(40 * uiScale);
    const colStage = rightEdge - Math.round(154 * uiScale);
    const colScore = rightEdge - Math.round(40 * uiScale);
    const addHead = (x, text, right = false) => {
      const t = this.add.text(x, y, text, { fontFamily: FONT_KR, fontSize: `${fontHeader}px`, color: '#9bb5d6' });
      if (right) t.setOrigin(1, 0);
      this.headerGroup.add(t);
    };

    if (this.activeMode === 'pvp') {
      addHead(colRank, '순위');
      addHead(colName, '플레이어');
      addHead(colWins, '승', true);
      addHead(colLosses, '패', true);
      addHead(colMmr, 'MMR', true);
      addHead(colTier, '티어', true);
    } else {
      addHead(colRank, '순위');
      addHead(colName, '플레이어');
      addHead(colStage, '스테이지', true);
      addHead(colScore, '점수', true);
    }
  }

  async loadModeRows() {
    const baseUrl = getPvpServerBaseUrl();
    const out = await LeaderboardSystem.fetchLeaderboard(this.activeMode, 30, baseUrl);
    const rows = Array.isArray(out?.rows) ? out.rows : [];
    this.statusText.setText(rows.length > 0 ? '' : '등록된 기록이 없습니다.');
    this.renderRows(rows);
  }

  renderRows(rows) {
    this.rowsGroup.removeAll(true);
    const list = Array.isArray(rows) ? rows : [];
    const uiScale = Number(this.board.uiScale || 1);
    const rowFont = Math.max(13, Math.round(15 * uiScale));
    const left = Number(this.board.panelLeft || 0);
    const rightEdge = Number(this.board.panelRight || this.scale.width);
    const colRank = left + Math.round(38 * uiScale);
    const colName = left + Math.round(122 * uiScale);
    const colWins = rightEdge - Math.round(306 * uiScale);
    const colLosses = rightEdge - Math.round(230 * uiScale);
    const colMmr = rightEdge - Math.round(142 * uiScale);
    const colTier = rightEdge - Math.round(40 * uiScale);
    const colStage = rightEdge - Math.round(154 * uiScale);
    const colScore = rightEdge - Math.round(40 * uiScale);

    let viewRows = list;
    if (viewRows.length === 0 && this.activeMode === 'survival') {
      viewRows = SaveSystem.getTopRecords(30).map((r) => ({
        name: r.name,
        best_stage: r.stage,
        best_score: r.totalScore
      }));
      this.statusText.setText(viewRows.length > 0 ? '서버 기록이 없어 로컬 기록을 표시합니다.' : '등록된 기록이 없습니다.');
    }
    if (viewRows.length === 0) return;

    const startY = this.board.tableTop + Math.round(26 * uiScale);
    const rowH = Math.max(28, Math.round(30 * uiScale));
    const maxRows = Math.max(1, Math.floor((this.board.tableBottom - startY) / rowH));
    viewRows.slice(0, maxRows).forEach((r, i) => {
      const y = startY + i * rowH;
      const rowBg = this.add.rectangle(this.board.panelX, y + Math.round(11 * uiScale), this.board.panelW - Math.round(46 * uiScale), Math.max(24, Math.round(24 * uiScale)), i % 2 ? 0x163153 : 0x122b48, 0.82);
      rowBg.setStrokeStyle(1, 0x456fa3, 0.36);
      this.rowsGroup.add(rowBg);

      const rankColor = i < 3 ? '#ffd77b' : '#eaf0ff';
      const rank = this.add.text(colRank, y, String(i + 1), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: rankColor });
      const name = this.add.text(colName, y, String(r?.name || 'Player').slice(0, 22), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#eaf0ff' });
      this.rowsGroup.add(rank);
      this.rowsGroup.add(name);

      if (this.activeMode === 'pvp') {
        const wins = Math.max(0, Math.floor(Number(r?.wins || 0)));
        const losses = Math.max(0, Math.floor(Number(r?.losses || 0)));
        const mmr = Math.max(0, Math.floor(Number(r?.mmr || 1000)));
        const tier = getMmrTierLabel(mmr);
        const winsTx = this.add.text(colWins, y, String(wins), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#adc1dc' }).setOrigin(1, 0);
        const lossesTx = this.add.text(colLosses, y, String(losses), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#adc1dc' }).setOrigin(1, 0);
        const mmrTx = this.add.text(colMmr, y, String(mmr), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#8fd2ff' }).setOrigin(1, 0);
        const tierTx = this.add.text(colTier, y, tier, { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#d8e6ff' }).setOrigin(1, 0);
        this.rowsGroup.add(winsTx);
        this.rowsGroup.add(lossesTx);
        this.rowsGroup.add(mmrTx);
        this.rowsGroup.add(tierTx);
      } else {
        const stage = Math.max(1, Math.floor(Number(r?.best_stage || 1)));
        const score = Math.max(0, Math.floor(Number(r?.best_score || 0)));
        const stageTx = this.add.text(colStage, y, String(stage), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#8fd2ff' }).setOrigin(1, 0);
        const scoreTx = this.add.text(colScore, y, String(score), { fontFamily: FONT_KR, fontSize: `${rowFont}px`, color: '#d8e6ff' }).setOrigin(1, 0);
        this.rowsGroup.add(stageTx);
        this.rowsGroup.add(scoreTx);
      }
    });
  }
}
