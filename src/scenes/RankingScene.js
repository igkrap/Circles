import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import LeaderboardSystem from '../systems/LeaderboardSystem.js';
import { getPvpServerBaseUrl } from '../utils/network.js';

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

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    this.activeMode = 'survival';
    this.rankRows = [];

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    this.add.rectangle(0, 0, w, h, 0x071020, 1).setOrigin(0);
    this.add.text(w / 2, 26, '랭킹', {
      fontFamily: font,
      fontSize: '40px',
      color: '#eaf0ff'
    }).setOrigin(0.5, 0);

    this.statusText = this.add.text(w / 2, 74, '불러오는 중...', {
      fontFamily: font,
      fontSize: '14px',
      color: '#9cb3da'
    }).setOrigin(0.5, 0);

    const modes = [
      { id: 'survival', label: '스테이지' },
      { id: 'coop', label: '협동' },
      { id: 'pvp', label: 'PVP' }
    ];
    const tabY = 108;
    const tabW = Math.min(140, Math.floor((w - 70) / 3));
    const tabGap = 12;
    const startX = w * 0.5 - (tabW * 1.5) - tabGap;
    this.modeTabs = new Map();
    modes.forEach((m, i) => {
      const x = startX + i * (tabW + tabGap) + tabW * 0.5;
      const box = this.add.rectangle(x, tabY, tabW, 34, 0x223553, 0.95).setInteractive({ useHandCursor: true });
      box.setStrokeStyle(1, 0x6f8fc7, 0.85);
      const tx = this.add.text(x, tabY, m.label, {
        fontFamily: font,
        fontSize: '15px',
        color: '#d8e6ff'
      }).setOrigin(0.5);
      box.on('pointerdown', () => this.setMode(m.id));
      this.modeTabs.set(m.id, { box, tx });
    });

    this.headerGroup = this.add.container(0, 0);
    this.rowsGroup = this.add.container(0, 0);

    const back = this.add.rectangle(w / 2, h - 36, 260, 40, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    back.setStrokeStyle(1, 0x7ea0ff, 0.8);
    this.add.text(w / 2, h - 36, '로비로 돌아가기', {
      fontFamily: font,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    back.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Lobby');
    });

    this.setMode(this.initialMode || 'survival');
  }

  setMode(mode) {
    this.activeMode = String(mode || 'survival');
    for (const [id, tab] of this.modeTabs.entries()) {
      const active = id === this.activeMode;
      tab.box.setFillStyle(active ? 0x35507a : 0x223553, 0.96);
      tab.tx.setColor(active ? '#ffffff' : '#d8e6ff');
    }
    this.renderHeaders();
    this.loadModeRows().catch((err) => {
      this.statusText.setText(`랭킹 로드 실패: ${String(err?.message || err).slice(0, 70)}`);
      this.renderRows([]);
    });
  }

  renderHeaders() {
    this.headerGroup.removeAll(true);
    const w = this.scale.width;
    const y = 142;
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    const addHead = (x, text, align = 0) => {
      const t = this.add.text(x, y, text, { fontFamily: font, fontSize: '17px', color: '#aab6d6' });
      if (align === 1) t.setOrigin(1, 0);
      this.headerGroup.add(t);
    };

    if (this.activeMode === 'pvp') {
      addHead(44, '순위');
      addHead(106, '플레이어명');
      addHead(w - 300, '승', 1);
      addHead(w - 250, '패', 1);
      addHead(w - 170, 'MMR', 1);
      addHead(w - 54, '등급', 1);
    } else {
      addHead(44, '순위');
      addHead(106, '플레이어명');
      addHead(w - 190, '스테이지', 1);
      addHead(w - 56, '점수', 1);
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
    const w = this.scale.width;
    const h = this.scale.height;
    const font = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    const list = Array.isArray(rows) ? rows : [];

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

    let y = 176;
    const rowH = 24;
    viewRows.forEach((r, i) => {
      if (y > h - 88) return;
      const col = i < 3 ? '#ffd700' : '#eaf0ff';
      const rank = this.add.text(44, y, String(i + 1), { fontFamily: font, fontSize: '16px', color: col });
      const name = this.add.text(106, y, String(r?.name || 'Player').slice(0, 24), { fontFamily: font, fontSize: '16px', color: '#eaf0ff' });
      this.rowsGroup.add(rank);
      this.rowsGroup.add(name);

      if (this.activeMode === 'pvp') {
        const wins = Math.max(0, Math.floor(Number(r?.wins || 0)));
        const losses = Math.max(0, Math.floor(Number(r?.losses || 0)));
        const mmr = Math.max(0, Math.floor(Number(r?.mmr || 1000)));
        const tier = getMmrTierLabel(mmr);
        const winsTx = this.add.text(w - 300, y, String(wins), { fontFamily: font, fontSize: '16px', color: '#aab6d6' }).setOrigin(1, 0);
        const lossesTx = this.add.text(w - 250, y, String(losses), { fontFamily: font, fontSize: '16px', color: '#aab6d6' }).setOrigin(1, 0);
        const mmrTx = this.add.text(w - 170, y, String(mmr), { fontFamily: font, fontSize: '16px', color: '#7ea0ff' }).setOrigin(1, 0);
        const tierTx = this.add.text(w - 54, y, tier, { fontFamily: font, fontSize: '16px', color: '#d8e6ff' }).setOrigin(1, 0);
        this.rowsGroup.add(winsTx);
        this.rowsGroup.add(lossesTx);
        this.rowsGroup.add(mmrTx);
        this.rowsGroup.add(tierTx);
      } else {
        const stage = Math.max(1, Math.floor(Number(r?.best_stage || 1)));
        const score = Math.max(0, Math.floor(Number(r?.best_score || 0)));
        const stageTx = this.add.text(w - 190, y, String(stage), { fontFamily: font, fontSize: '16px', color: '#7ea0ff' }).setOrigin(1, 0);
        const scoreTx = this.add.text(w - 56, y, String(score), { fontFamily: font, fontSize: '16px', color: '#d8e6ff' }).setOrigin(1, 0);
        this.rowsGroup.add(stageTx);
        this.rowsGroup.add(scoreTx);
      }
      y += rowH;
    });
  }
}
