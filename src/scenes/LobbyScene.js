import Phaser from 'phaser';
import SaveSystem from '../systems/SaveSystem.js';
import SettingsSystem from '../systems/SettingsSystem.js';
import AuthSystem from '../systems/AuthSystem.js';
import FriendSystem from '../systems/FriendSystem.js';
import ProgressSyncSystem from '../systems/ProgressSyncSystem.js';
import { getPvpServerBaseUrl } from '../utils/network.js';
import { isMobileDevice } from '../utils/device.js';

const FONT_KR = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Roboto, Arial';

function getMmrTierLabel(mmr) {
  const v = Number(mmr || 1000);
  if (v >= 1800) return 'Diamond';
  if (v >= 1500) return 'Platinum';
  if (v >= 1300) return 'Gold';
  if (v >= 1150) return 'Silver';
  return 'Bronze';
}

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  createLobbyBackground(w, h) {
    const base = this.add.graphics();
    base.fillGradientStyle(0x050a14, 0x060d1b, 0x020612, 0x030714, 1);
    base.fillRect(0, 0, w, h);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x3f5d92, 0.13);
    for (let x = 0; x <= w; x += 48) grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 48) grid.lineBetween(0, y, w, y);
    this.tweens.add({
      targets: grid,
      alpha: { from: 0.1, to: 0.2 },
      duration: 2200,
      yoyo: true,
      repeat: -1
    });

    const mkGlow = (x, y, radius, color, alpha, driftX, driftY) => {
      const glow = this.add.circle(x, y, radius, color, alpha).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: glow,
        x: x + driftX,
        y: y + driftY,
        alpha: { from: alpha * 0.65, to: alpha },
        duration: 2800 + Phaser.Math.Between(0, 1400),
        yoyo: true,
        ease: 'Sine.InOut',
        repeat: -1
      });
      return glow;
    };

    const glowA = mkGlow(w * 0.22, h * 0.2, Math.min(w, h) * 0.3, 0x2a7de2, 0.09, 40, 28);
    const glowB = mkGlow(w * 0.82, h * 0.78, Math.min(w, h) * 0.38, 0x2ea8d6, 0.07, -48, -36);
    const glowC = mkGlow(w * 0.5, h * 0.45, Math.min(w, h) * 0.23, 0x67a6ff, 0.055, 22, -18);

    const stars = [];
    for (let i = 0; i < 58; i += 1) {
      const dot = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(0, h),
        Phaser.Math.FloatBetween(0.8, 2.2),
        0xd4e6ff,
        Phaser.Math.FloatBetween(0.16, 0.4)
      );
      this.tweens.add({
        targets: dot,
        alpha: { from: dot.alpha * 0.5, to: dot.alpha },
        duration: Phaser.Math.Between(900, 2400),
        yoyo: true,
        repeat: -1
      });
      this.tweens.add({
        targets: dot,
        y: dot.y + Phaser.Math.Between(8, 22),
        duration: Phaser.Math.Between(2600, 5200),
        yoyo: true,
        ease: 'Sine.InOut',
        repeat: -1
      });
      stars.push(dot);
    }

    return [base, glowA, glowB, glowC, grid, ...stars];
  }

  createLobbyBattlePreview(centerX, centerY, radius) {
    const previewHalo = this.add.circle(centerX, centerY, radius + 10, 0x68cfff, 0.06).setBlendMode(Phaser.BlendModes.ADD);
    const previewArea = this.add.circle(centerX, centerY, radius, 0x081c37, 0.2).setBlendMode(Phaser.BlendModes.ADD);
    previewArea.setStrokeStyle(1.6, 0x7cd7ff, 0.34);
    const previewInner = this.add.circle(centerX, centerY, radius * 0.66, 0x000000, 0)
      .setStrokeStyle(1, 0x72a8de, 0.24)
      .setBlendMode(Phaser.BlendModes.ADD);

    const playerHalo = this.add.circle(centerX, centerY, radius * 0.17, 0x7ed0ff, 0.22).setBlendMode(Phaser.BlendModes.ADD);
    const player = this.add.circle(centerX, centerY, Math.max(4.5, radius * 0.082), 0x9ad7ff, 0.95).setBlendMode(Phaser.BlendModes.ADD);
    const playerCore = this.add.circle(centerX, centerY, Math.max(1.8, radius * 0.034), 0xf7fdff, 0.95);

    const enemies = [];
    const enemyCount = 8;
    const spawnEnemy = (enemy) => {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const r = radius * Phaser.Math.FloatBetween(0.77, 0.99);
      enemy.x = centerX + Math.cos(angle) * r;
      enemy.y = centerY + Math.sin(angle) * r;
      enemy.speed = Phaser.Math.FloatBetween(30, 48);
      enemy.sideDrift = Phaser.Math.FloatBetween(-12, 12);
      enemy.visual.setPosition(enemy.x, enemy.y);
    };
    for (let i = 0; i < enemyCount; i += 1) {
      const visual = this.add.circle(centerX, centerY, Phaser.Math.FloatBetween(radius * 0.046, radius * 0.064), 0xff7a7a, 0.86)
        .setBlendMode(Phaser.BlendModes.ADD);
      const enemy = { visual, x: centerX, y: centerY, speed: 32, sideDrift: 0 };
      spawnEnemy(enemy);
      enemies.push(enemy);
    }

    const bullets = [];
    for (let i = 0; i < 12; i += 1) {
      const visual = this.add.rectangle(-999, -999, radius * 0.2, Math.max(2, radius * 0.034), 0x99e0ff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      visual.setVisible(false);
      bullets.push({
        visual,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0
      });
    }
    const fireBullet = (x, y, tx, ty) => {
      const slot = bullets.find((b) => !b.active);
      if (!slot) return;
      const dx = tx - x;
      const dy = ty - y;
      const len = Math.hypot(dx, dy) || 1;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = (dx / len) * Math.max(200, radius * 3.2);
      slot.vy = (dy / len) * Math.max(200, radius * 3.2);
      slot.life = 0.85;
      slot.visual.setVisible(true);
      slot.visual.setPosition(x, y);
      slot.visual.rotation = Math.atan2(slot.vy, slot.vx);
    };

    let lastTime = this.time.now;
    let shotCooldown = 0;
    const runPreview = () => {
      const now = this.time.now;
      const dt = Math.min(0.05, Math.max(0.01, (now - lastTime) / 1000));
      lastTime = now;

      const t = now * 0.001;
      const px = centerX + Math.cos(t * 1.15) * radius * 0.31 + Math.cos(t * 0.53) * radius * 0.09;
      const py = centerY + Math.sin(t * 1.39) * radius * 0.23;
      playerHalo.setPosition(px, py);
      player.setPosition(px, py);
      playerCore.setPosition(px, py);

      let nearestEnemy = null;
      let nearestD2 = Number.POSITIVE_INFINITY;
      for (const enemy of enemies) {
        const dx = px - enemy.x;
        const dy = py - enemy.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        enemy.x += nx * enemy.speed * dt + (-ny) * enemy.sideDrift * dt;
        enemy.y += ny * enemy.speed * dt + (nx) * enemy.sideDrift * dt;
        enemy.visual.setPosition(enemy.x, enemy.y);
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearestEnemy = enemy;
        }
        if (dist < radius * 0.13) {
          spawnEnemy(enemy);
        }
      }

      shotCooldown -= dt;
      if (nearestEnemy && shotCooldown <= 0) {
        shotCooldown = 0.16;
        fireBullet(px, py, nearestEnemy.x, nearestEnemy.y);
      }

      for (const bullet of bullets) {
        if (!bullet.active) continue;
        bullet.life -= dt;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.visual.setPosition(bullet.x, bullet.y);
        bullet.visual.rotation = Math.atan2(bullet.vy, bullet.vx);

        let hitEnemy = null;
        for (const enemy of enemies) {
          const ex = enemy.x - bullet.x;
          const ey = enemy.y - bullet.y;
          if ((ex * ex + ey * ey) < (radius * 0.08) * (radius * 0.08)) {
            hitEnemy = enemy;
            break;
          }
        }
        const outOfRange = Math.hypot(bullet.x - centerX, bullet.y - centerY) > radius * 1.15;
        if (hitEnemy || bullet.life <= 0 || outOfRange) {
          bullet.active = false;
          bullet.visual.setVisible(false);
          if (hitEnemy) spawnEnemy(hitEnemy);
        }
      }
    };
    runPreview();
    this.time.addEvent({ delay: 33, loop: true, callback: runPreview });

    return [
      previewHalo,
      previewArea,
      previewInner,
      playerHalo,
      player,
      playerCore,
      ...enemies.map((e) => e.visual),
      ...bullets.map((b) => b.visual)
    ];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const isMobileUi = isMobileDevice();
    const uiScaleBase = Phaser.Math.Clamp(w / 960, 0.85, 1.28);
    const uiScale = isMobileUi ? Math.min(1.02, uiScaleBase) : uiScaleBase;

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const bgObjs = this.createLobbyBackground(w, h);
    const panelW = Math.min(Math.floor(760 * uiScale), Math.max(Math.floor(420 * uiScale), w - Math.round(220 * uiScale)));
    const panelH = Math.min(Math.floor(400 * uiScale), Math.max(Math.floor(280 * uiScale), h - Math.round(180 * uiScale)));
    const panelX = w * 0.5;
    const panelY = h * 0.5;
    const panelLeft = panelX - panelW * 0.5;
    const panelTop = panelY - panelH * 0.5;
    const neonCyan = 0x67e7ff;
    const neonBlue = 0x6dafff;
    const neonPink = 0xff5ad8;

    const panelShadow = this.add.rectangle(panelX, panelY + 10, panelW + 18, panelH + 22, 0x02060f, 0.52);
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a1530, 0.46);
    const panelToneTop = this.add.rectangle(panelX, panelY - panelH * 0.17, panelW - 6, panelH * 0.5, 0x2f66aa, 0.04);
    const panelToneBottom = this.add.rectangle(panelX, panelY + panelH * 0.16, panelW - 8, panelH * 0.58, 0x050d21, 0.08);
    const panelInner = this.add.rectangle(panelX, panelY, panelW - 22, panelH - 24, 0x101f3f, 0.09);

    const panelGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    panelGlow.lineStyle(16, neonCyan, 0.035);
    panelGlow.strokeRoundedRect(panelLeft - 4, panelTop - 4, panelW + 8, panelH + 8, 14);
    panelGlow.lineStyle(8, neonBlue, 0.07);
    panelGlow.strokeRoundedRect(panelLeft - 2, panelTop - 2, panelW + 4, panelH + 4, 13);
    panelGlow.lineStyle(3, 0x92eeff, 0.44);
    panelGlow.strokeRoundedRect(panelLeft, panelTop, panelW, panelH, 12);
    panelGlow.lineStyle(1.35, 0xe7fbff, 0.84);
    panelGlow.strokeRoundedRect(panelLeft + 1, panelTop + 1, panelW - 2, panelH - 2, 11);

    const panelInnerFrame = this.add.graphics();
    panelInnerFrame.lineStyle(1.25, 0x7ecfff, 0.36);
    panelInnerFrame.strokeRoundedRect(panelLeft + 14, panelTop + 14, panelW - 28, panelH - 28, 10);

    const panelCornerA = this.add.circle(panelLeft + 12, panelTop + 11, 9, neonCyan, 0.24).setBlendMode(Phaser.BlendModes.ADD);
    const panelCornerB = this.add.circle(panelLeft + panelW - 12, panelTop + 11, 9, neonCyan, 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const panelCornerC = this.add.circle(panelLeft + 12, panelTop + panelH - 11, 9, neonPink, 0.15).setBlendMode(Phaser.BlendModes.ADD);
    const panelCornerD = this.add.circle(panelLeft + panelW - 12, panelTop + panelH - 11, 9, neonPink, 0.19).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: [panelCornerA, panelCornerB, panelCornerC, panelCornerD],
      alpha: { from: 0.1, to: 0.28 },
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
    const previewRadius = isMobileUi ? 46 : 74;
    const previewX = panelX + panelW * 0.34;
    const previewY = isMobileUi ? (panelY - panelH * 0.18) : (panelY + panelH * 0.18);
    const previewObjs = this.createLobbyBattlePreview(previewX, previewY, previewRadius);

    const topRightPad = Math.round(24 * uiScale);
    const iconGap = Math.round(8 * uiScale);
    const iconW = Math.round(38 * uiScale);
    const rankX = w - topRightPad - iconW * 0.5;
    const codexX = rankX - iconW - iconGap;
    const friendX = codexX - iconW - iconGap;
    const authX = friendX - iconW - iconGap;

    const coin = this.add.image(Math.round(24 * uiScale), Math.round(24 * uiScale), 'tex_gold').setOrigin(0.5).setScale(0.76 * uiScale);
    const goldText = this.add.text(Math.round(38 * uiScale), Math.round(13 * uiScale), `${SaveSystem.getTotalGold()}`, {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(14, Math.round(18 * uiScale))}px`,
      color: '#ffda72'
    }).setOrigin(0, 0);
    let authSession = AuthSystem.loadSession();
    const authStatus = this.add.text(w - topRightPad, Math.round(46 * uiScale), '', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(11, Math.round(12 * uiScale))}px`,
      color: '#aab6d6'
    }).setOrigin(1, 0);

    const drawFriendTopGlyph = (x, y, color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.7, color, 0.96);
      g.strokeCircle(x - 3.4, y - 2.2, 3.4);
      g.strokeCircle(x + 4.2, y - 1.1, 2.8);
      g.lineBetween(x - 8.2, y + 6.3, x + 0.9, y + 6.3);
      g.lineBetween(x + 1.1, y + 6.2, x + 8.3, y + 6.2);
      g.lineBetween(x - 7.0, y + 6.1, x - 4.6, y + 3.6);
      g.lineBetween(x - 1.6, y + 3.6, x + 0.8, y + 6.1);
      g.lineBetween(x + 2.0, y + 6.0, x + 4.2, y + 3.8);
      g.lineBetween(x + 6.0, y + 3.8, x + 8.1, y + 6.0);
      return g;
    };
    const drawAuthTopGlyph = (x, y, mode = 'login', color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.75, color, 0.96);
      g.strokeRoundedRect(x - 8.7, y - 8.4, 8.5, 16.8, 1.8);
      g.lineBetween(x - 0.3, y, x + 7.1, y);
      if (mode === 'logout') {
        g.lineBetween(x + 7.1, y, x + 4.3, y - 2.7);
        g.lineBetween(x + 7.1, y, x + 4.3, y + 2.7);
      } else {
        g.lineBetween(x - 0.3, y, x + 2.5, y - 2.7);
        g.lineBetween(x - 0.3, y, x + 2.5, y + 2.7);
      }
      return g;
    };

    const authBtnShadow = this.add.rectangle(authX, Math.round(26 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x071223, 0.55);
    const authBtn = this.add.rectangle(authX, Math.round(24 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x243a58, 0.96).setInteractive({ useHandCursor: true });
    authBtn.setStrokeStyle(1, 0x85b8ff, 0.78);
    const friendBtnShadow = this.add.rectangle(friendX, Math.round(26 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x071223, 0.55);
    const friendBtn = this.add.rectangle(friendX, Math.round(24 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x243a58, 0.96).setInteractive({ useHandCursor: true });
    friendBtn.setStrokeStyle(1, 0x85b8ff, 0.78);
    const friendBtnGlyph = drawFriendTopGlyph(friendX, Math.round(24 * uiScale));
    let authBtnGlyph = drawAuthTopGlyph(authX, Math.round(24 * uiScale), authSession?.token ? 'logout' : 'login');
    const setAuthBtnIcon = (mode) => {
      if (authBtnGlyph?.active) authBtnGlyph.destroy();
      authBtnGlyph = drawAuthTopGlyph(authX, Math.round(24 * uiScale), mode);
      authBtnGlyph.setAlpha(authBtn.input?.enabled ? 0.95 : 0.52);
    };
    const friendBadge = this.add.text(friendX + Math.round(13 * uiScale), Math.round(8 * uiScale), '', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(10, Math.round(11 * uiScale))}px`,
      color: '#ffd700'
    }).setOrigin(1, 0);
    let friendInviteTimer = null;
    const isFriendAuthError = (err) => String(err?.message || err).includes('friend_api_failed:401');
    const handleFriendAuthError = (err) => {
      if (!isFriendAuthError(err)) return false;
      AuthSystem.clearSession();
      authSession = null;
      SaveSystem.setSyncHandler(null);
      stopInvitePolling();
      stopFriendPanelPolling();
      friendBadge.setText('');
      if (friendPanel?.root) friendPanel.root.setVisible(false);
      refreshAuthUi();
      authStatus.setText('세션이 만료되었습니다. 다시 로그인해 주세요.');
      return true;
    };
    const refreshFriendBadge = async () => {
      if (!authSession?.token) {
        friendBadge.setText('');
        return;
      }
      try {
        const meOut = await FriendSystem.getMe(authSession);
        const myTag = String(meOut?.user?.tag || '');
        const [inv, req, friendsOut] = await Promise.all([
          FriendSystem.getInvites(authSession),
          FriendSystem.getFriendRequests(authSession),
          FriendSystem.getFriends(authSession)
        ]);
        const incoming = Array.isArray(inv?.incoming) ? inv.incoming : [];
        const incomingReq = Array.isArray(req?.incoming) ? req.incoming : [];
        const friends = Array.isArray(friendsOut?.rows) ? friendsOut.rows : [];
        const unreadChat = friends.reduce((acc, f) => acc + Math.max(0, Math.floor(Number(f?.unread_count || 0))), 0);
        const badgeCount = incoming.length + incomingReq.length + unreadChat;
        friendBadge.setText(badgeCount > 0 ? `+${badgeCount}` : '');
        if (authSession?.user) authSession.user.tag = myTag;
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendBadge.setText('');
      }
    };
    const startInvitePolling = () => {
      if (friendInviteTimer) friendInviteTimer.remove(false);
      friendInviteTimer = this.time.addEvent({
        delay: 12000,
        loop: true,
        callback: () => {
          void refreshFriendBadge();
        }
      });
    };
    const stopInvitePolling = () => {
      if (!friendInviteTimer) return;
      friendInviteTimer.remove(false);
      friendInviteTimer = null;
    };
    let friendPanel = null;
    let friendPanelRows = [];
    let friendData = { me: null, friends: [], incoming: [], friendReqIncoming: [], friendReqOutgoing: [] };
    let tagInputValue = '';
    let chatInputValue = '';
    let activeInputTarget = '';
    let selectedChatFriend = null;
    let chatRows = [];
    let chatCacheRows = [];
    let friendPanelDataSig = '';
    let chatCacheSig = '';
    let friendScrollOffset = 0;
    let inviteScrollOffset = 0;
    let reqScrollOffset = 0;
    let chatScrollOffset = 0;
    let chatOldestLoadedTs = 0;
    let chatNewestLoadedTs = 0;
    let chatNoOlderHistory = false;
    let chatFetchInFlight = false;
    let chatLoadingOlder = false;
    let chatLoadVersion = 0;
    let friendPanelPollTimer = null;
    const clampOffset = (value, max) => Phaser.Math.Clamp(Math.floor(Number(value || 0)), 0, Math.max(0, Math.floor(Number(max || 0))));
    const getChatRowTs = (row) => Math.max(0, Math.floor(Number(row?.created_at || row?.createdAt || row?.timestamp || row?.ts || 0)));
    const toLocalDayKey = (ts) => {
      const n = Math.floor(Number(ts) || 0);
      if (n <= 0) return '';
      const d = new Date(n);
      if (Number.isNaN(d.getTime())) return '';
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    const normalizeChatRows = (rows) => {
      const input = Array.isArray(rows) ? rows : [];
      const byKey = new Map();
      for (const row of input) {
        if (!row) continue;
        const ts = getChatRowTs(row);
        if (!ts) continue;
        const idKey = Number.isFinite(Number(row?.id)) ? `id:${Number(row.id)}` : `ts:${ts}:${String(row?.from_user_id || '')}:${String(row?.message || '')}`;
        byKey.set(idKey, row);
      }
      const out = Array.from(byKey.values());
      out.sort((a, b) => {
        const ta = getChatRowTs(a);
        const tb = getChatRowTs(b);
        if (ta !== tb) return ta - tb;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });
      return out;
    };
    const refreshChatTsBounds = () => {
      if (!chatCacheRows.length) {
        chatOldestLoadedTs = 0;
        chatNewestLoadedTs = 0;
        return;
      }
      chatOldestLoadedTs = getChatRowTs(chatCacheRows[0]);
      chatNewestLoadedTs = getChatRowTs(chatCacheRows[chatCacheRows.length - 1]);
    };
    const resetChatPagingState = () => {
      if (chatRows.length > 0) {
        clearChatRows();
      }
      chatCacheRows = [];
      chatCacheSig = '';
      chatScrollOffset = 0;
      chatOldestLoadedTs = 0;
      chatNewestLoadedTs = 0;
      chatNoOlderHistory = false;
      chatFetchInFlight = false;
      chatLoadingOlder = false;
      chatLoadVersion += 1;
    };
    const mergeChatRows = (baseRows, incomingRows) => normalizeChatRows([...(Array.isArray(baseRows) ? baseRows : []), ...(Array.isArray(incomingRows) ? incomingRows : [])]);
    const formatChatTimestamp = (raw) => {
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };
    const formatChatDateLabel = (raw) => {
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}년 ${mm}월 ${dd}일`;
    };
    const buildFriendPanelDataSig = (data, selected) => {
      const friends = Array.isArray(data?.friends) ? data.friends : [];
      const incoming = Array.isArray(data?.incoming) ? data.incoming : [];
      const reqIncoming = Array.isArray(data?.friendReqIncoming) ? data.friendReqIncoming : [];
      const meTag = String(data?.me?.tag || '');
      const sId = String(selected?.user_id || '');
      const sTag = String(selected?.tag || '');
      const f = friends.map((x) => `${String(x?.user_id || '')}:${String(x?.name || '')}:${String(x?.tag || '')}:${Math.floor(Number(x?.unread_count || 0))}`).join('|');
      const i = incoming.map((x) => `${String(x?.id || '')}:${String(x?.from_name || '')}:${String(x?.from_tag || '')}`).join('|');
      const r = reqIncoming.map((x) => `${String(x?.id || '')}:${String(x?.from_name || '')}:${String(x?.from_tag || '')}`).join('|');
      return `${meTag}__${sId}__${sTag}__F:${f}__I:${i}__R:${r}`;
    };
    const buildChatSig = (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) return 'empty';
      const first = list[0] || {};
      const last = list[list.length - 1] || {};
      const firstKey = `${String(first?.id || '')}:${String(first?.created_at || first?.timestamp || '')}`;
      const lastKey = `${String(last?.id || '')}:${String(last?.created_at || last?.timestamp || '')}:${String(last?.message || '').slice(0, 64)}`;
      return `${list.length}:${firstKey}:${lastKey}`;
    };
    const stopFriendPanelPolling = () => {
      if (!friendPanelPollTimer) return;
      friendPanelPollTimer.remove(false);
      friendPanelPollTimer = null;
    };
    const clearFriendPanelRows = () => {
      friendPanelRows.forEach((obj) => obj?.destroy?.());
      friendPanelRows = [];
    };
    const clearChatRows = () => {
      chatRows.forEach((obj) => obj?.destroy?.());
      chatRows = [];
    };
    const setChatUiVisible = (visible) => {
      if (!friendPanel) return;
      friendPanel.chatBox?.setVisible(visible);
      friendPanel.chatInputBox?.setVisible(visible);
      friendPanel.chatInputText?.setVisible(visible);
      friendPanel.sendBtnBg?.setVisible(visible);
      friendPanel.sendBtnText?.setVisible(visible);
      friendPanel.chatHintText?.setVisible(visible);
      chatRows.forEach((obj) => obj?.setVisible?.(visible));
    };
    const renderChatRowsFromCache = () => {
      if (!friendPanel) return;
      const rows = Array.isArray(chatCacheRows) ? chatCacheRows : [];
      const visibleRows = Math.max(10, Math.floor((Number(friendPanel.chatBox?.height || 160) - 12) / 18));
      const scrollMax = Math.max(0, rows.length - visibleRows);
      chatScrollOffset = clampOffset(chatScrollOffset, scrollMax);
      friendPanel.chatScrollMax = scrollMax;
      const end = Math.max(0, rows.length - chatScrollOffset);
      const renderWindow = Math.max(120, visibleRows * 4);
      const chatRowsSource = rows.slice(Math.max(0, end - renderWindow), end);
      clearChatRows();
      if (!selectedChatFriend?.user_id) {
        friendPanel.chatHintText?.setText('채팅할 친구를 선택하세요.');
        setChatUiVisible(false);
        return;
      }
      setChatUiVisible(true);
      const sx = friendPanel.chatBox.x - friendPanel.chatBox.width * 0.5 + 10;
      const minTop = friendPanel.chatBox.y - friendPanel.chatBox.height * 0.5 + 8;
      let bottomY = friendPanel.chatBox.y + friendPanel.chatBox.height * 0.5 - 8;
      let drewDateDivider = false;
      for (let i = chatRowsSource.length - 1; i >= 0; i -= 1) {
        const r = chatRowsSource[i];
        const rawTs = r?.created_at || r?.createdAt || r?.timestamp || r?.ts;
        const dateLabel = formatChatDateLabel(rawTs);
        const mine = String(r?.from_user_id || '') === String(authSession?.user?.id || '');
        const who = mine ? '나' : String(r?.from_name || '친구');
        const ts = formatChatTimestamp(rawTs);
        const prefix = ts ? `[${ts}] ` : '';
        const line = this.add.text(sx, bottomY, `${prefix}${who}: ${String(r?.message || '').slice(0, 120)}`, {
          fontFamily: FONT_KR,
          fontSize: '12px',
          color: mine ? '#d8e6ff' : '#9fc1ff',
          wordWrap: { width: friendPanel.chatBox.width - 18 }
        }).setOrigin(0, 1);
        const lineH = Math.max(16, line.height + 2);
        if (bottomY - lineH < minTop) {
          line.destroy();
          break;
        }
        friendPanel.root.add(line);
        chatRows.push(line);
        bottomY -= lineH;
        const prevRawTs = i > 0 ? (chatRowsSource[i - 1]?.created_at || chatRowsSource[i - 1]?.createdAt || chatRowsSource[i - 1]?.timestamp || chatRowsSource[i - 1]?.ts) : '';
        const prevDateLabel = formatChatDateLabel(prevRawTs);
        if (dateLabel && dateLabel !== prevDateLabel) {
          const divider = this.add.text(friendPanel.chatBox.x, bottomY, `──── ${dateLabel} ────`, {
            fontFamily: FONT_KR,
            fontSize: '11px',
            color: '#8fa4cd'
          }).setOrigin(0.5, 1);
          const dividerH = divider.height + 4;
          if (bottomY - dividerH < minTop) {
            divider.destroy();
            break;
          }
          friendPanel.root.add(divider);
          chatRows.push(divider);
          bottomY -= dividerH;
          drewDateDivider = true;
        }
      }
      if (!drewDateDivider && chatRowsSource.length > 0) {
        const topDateRaw = chatRowsSource[0]?.created_at || chatRowsSource[0]?.createdAt || chatRowsSource[0]?.timestamp || chatRowsSource[0]?.ts;
        const topDateLabel = formatChatDateLabel(topDateRaw);
        if (topDateLabel) {
          const topDate = this.add.text(friendPanel.chatBox.x, minTop + 2, topDateLabel, {
            fontFamily: FONT_KR,
            fontSize: '11px',
            color: '#8fa4cd'
          }).setOrigin(0.5, 0);
          friendPanel.root.add(topDate);
          chatRows.push(topDate);
        }
      }
      const safeMax = Math.max(0, Number(friendPanel.chatScrollMax || 0));
      if (friendPanel.scrollAreas?.chat) {
        friendPanel.scrollAreas.chat.maxOffset = safeMax;
      }
      if (safeMax > 0) {
        const areaX = friendPanel.chatBox.x - friendPanel.chatBox.width * 0.5;
        const areaY = friendPanel.chatBox.y - friendPanel.chatBox.height * 0.5;
        const areaW = friendPanel.chatBox.width;
        const areaH = friendPanel.chatBox.height;
        const barX = areaX + areaW + 6;
        const track = this.add.rectangle(barX, areaY + areaH * 0.5, 5, areaH, 0x0d1a2f, 0.94);
        track.setStrokeStyle(1, 0x345885, 0.7);
        const thumbH = Math.max(24, Math.floor(areaH * 0.28));
        const movable = areaH - thumbH;
        const ratio = 1 - Phaser.Math.Clamp(Number(chatScrollOffset || 0) / safeMax, 0, 1);
        const thumbY = areaY + thumbH * 0.5 + movable * ratio;
        const thumb = this.add.rectangle(barX, thumbY, 5, thumbH, 0x7fcfff, 0.94);
        thumb.setStrokeStyle(1, 0xcdf2ff, 0.7);
        friendPanel.root.add([track, thumb]);
        chatRows.push(track, thumb);
      }
      if (rows.length > 0) {
        friendPanel.chatHintText?.setText('');
      } else if (chatLoadingOlder) {
        friendPanel.chatHintText?.setText('이전 대화 불러오는 중...');
      } else {
        friendPanel.chatHintText?.setText('메시지가 없습니다.');
      }
    };
    const loadFriendChat = async ({ mode = 'poll' } = {}) => {
      const friendUserId = String(selectedChatFriend?.user_id || '');
      const loadVersion = chatLoadVersion;
      const isStale = () => loadVersion !== chatLoadVersion || String(selectedChatFriend?.user_id || '') !== friendUserId;
      if (!authSession?.token || !friendUserId) {
        friendPanel.chatScrollMax = 0;
        resetChatPagingState();
        friendPanel.chatHintText?.setText('채팅할 친구를 선택하세요.');
        clearChatRows();
        setChatUiVisible(false);
        return;
      }
      if (mode === 'older') {
        if (chatLoadingOlder || chatFetchInFlight) return;
        if (chatNoOlderHistory || !chatOldestLoadedTs) return;
        chatLoadingOlder = true;
        try {
          const beforeCursor = Math.max(1, Math.floor(Number(chatOldestLoadedTs || 0)) + 1);
          const out = await FriendSystem.getChat(authSession, friendUserId, { limit: 180, before: beforeCursor });
          if (isStale()) return;
          const incomingRows = normalizeChatRows(out?.rows);
          if (!incomingRows.length) {
            chatNoOlderHistory = true;
            return;
          }
          const prevLen = chatCacheRows.length;
          chatCacheRows = mergeChatRows(chatCacheRows, incomingRows);
          const added = Math.max(0, chatCacheRows.length - prevLen);
          if (added <= 0) {
            chatNoOlderHistory = true;
            return;
          }
          chatNoOlderHistory = false;
          refreshChatTsBounds();
          const nextSig = buildChatSig(chatCacheRows);
          if (nextSig !== chatCacheSig || chatRows.length === 0) {
            renderChatRowsFromCache();
          }
          chatCacheSig = nextSig;
        } catch (err) {
          if (handleFriendAuthError(err)) return;
          friendPanel?.statusText?.setText(`채팅 이력 로드 실패: ${String(err?.message || err).slice(0, 60)}`);
        } finally {
          chatLoadingOlder = false;
        }
        return;
      }
      if (chatFetchInFlight || chatLoadingOlder) return;
      chatFetchInFlight = true;
      try {
        if (mode === 'initial') {
          await FriendSystem.markChatRead(authSession, friendUserId);
          const todayDayKey = toLocalDayKey(Date.now());
          let rows = [];
          if (todayDayKey) {
            const outToday = await FriendSystem.getChat(authSession, friendUserId, { limit: 300, day: todayDayKey });
            if (isStale()) return;
            rows = normalizeChatRows(outToday?.rows);
          }
          if (rows.length === 0) {
            const outLatest = await FriendSystem.getChat(authSession, friendUserId, { limit: 180 });
            if (isStale()) return;
            rows = normalizeChatRows(outLatest?.rows);
          }
          chatCacheRows = rows;
          chatScrollOffset = 0;
          refreshChatTsBounds();
          chatNoOlderHistory = false;
          chatCacheSig = buildChatSig(chatCacheRows);
          renderChatRowsFromCache();
          void refreshFriendBadge();
          return;
        }
        if (!chatNewestLoadedTs) {
          const todayDayKey = toLocalDayKey(Date.now());
          if (!todayDayKey) return;
          const outToday = await FriendSystem.getChat(authSession, friendUserId, { limit: 300, day: todayDayKey });
          if (isStale()) return;
          const todayRows = normalizeChatRows(outToday?.rows);
          if (!todayRows.length) return;
          chatCacheRows = todayRows;
          chatScrollOffset = 0;
          refreshChatTsBounds();
          chatNoOlderHistory = false;
          chatCacheSig = buildChatSig(chatCacheRows);
          renderChatRowsFromCache();
          await FriendSystem.markChatRead(authSession, friendUserId);
          void refreshFriendBadge();
          return;
        }
        const afterCursor = Math.max(0, Math.floor(Number(chatNewestLoadedTs || 0)) - 1);
        const out = await FriendSystem.getChat(authSession, friendUserId, { limit: 120, after: afterCursor });
        if (isStale()) return;
        const incomingRows = normalizeChatRows(out?.rows);
        if (incomingRows.length > 0) {
          const wasAtBottom = chatScrollOffset === 0;
          const prevLen = chatCacheRows.length;
          chatCacheRows = mergeChatRows(chatCacheRows, incomingRows);
          const added = Math.max(0, chatCacheRows.length - prevLen);
          refreshChatTsBounds();
          if (!wasAtBottom && added > 0) {
            chatScrollOffset += added;
          }
          await FriendSystem.markChatRead(authSession, friendUserId);
        }
        const nextSig = buildChatSig(chatCacheRows);
        if (nextSig !== chatCacheSig || chatRows.length === 0) {
          renderChatRowsFromCache();
        }
        chatCacheSig = nextSig;
        void refreshFriendBadge();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`채팅 로드 실패: ${String(err?.message || err).slice(0, 60)}`);
      } finally {
        chatFetchInFlight = false;
      }
    };
    const sendFriendChat = async () => {
      const message = String(chatInputValue || '').trim();
      if (!authSession?.token) return;
      if (!selectedChatFriend?.user_id) {
        friendPanel?.statusText?.setText('먼저 친구 목록에서 채팅 대상을 선택해 주세요.');
        return;
      }
      if (!message) return;
      try {
        const friendUserId = String(selectedChatFriend.user_id);
        const out = await FriendSystem.sendChat(authSession, friendUserId, message);
        if (String(selectedChatFriend?.user_id || '') !== friendUserId) return;
        chatInputValue = '';
        chatScrollOffset = 0;
        friendPanel.chatInputText?.setText('메시지 입력');
        const sentRow = out?.row ? [out.row] : [];
        if (sentRow.length > 0) {
          chatCacheRows = mergeChatRows(chatCacheRows, sentRow);
          refreshChatTsBounds();
          chatCacheSig = buildChatSig(chatCacheRows);
          renderChatRowsFromCache();
        } else {
          await loadFriendChat({ mode: 'poll' });
        }
        await FriendSystem.markChatRead(authSession, friendUserId);
        void refreshFriendBadge();
        void loadFriendPanelData();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`채팅 전송 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const submitAddFriendByTag = async () => {
      if (!authSession?.token) return;
      const tag = String(tagInputValue || '').trim().toUpperCase();
      if (!tag) {
        friendPanel?.statusText?.setText('태그를 입력해 주세요.');
        return;
      }
      try {
        const out = await FriendSystem.requestByTag(authSession, tag);
        if (out?.autoAccepted) {
          friendPanel?.statusText?.setText(`요청 상호 승인: ${tag} 님과 친구가 되었습니다.`);
        } else {
          friendPanel?.statusText?.setText(`친구 요청 전송: ${tag}`);
        }
        tagInputValue = '';
        if (friendPanel?.inputText) friendPanel.inputText.setText('태그 입력');
        await loadFriendPanelData();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`친구 추가 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const inviteFriendFromRow = async (row) => {
      if (!authSession?.token || !row?.user_id) return;
      try {
        const out = await FriendSystem.inviteFriend(authSession, row.user_id);
        const partyKey = String(out?.invite?.party_key || '');
        if (!partyKey) {
          friendPanel?.statusText?.setText('초대 생성 실패');
          return;
        }
        friendPanel?.statusText?.setText(`${row.name}님에게 협동 초대를 보냈습니다.`);
        this.sound.stopAll();
        this.scene.start('Game', {
          mode: 'coop',
          token: authSession.token,
          user: authSession.user,
          serverBaseUrl: authSession.serverBaseUrl,
          partyKey
        });
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`초대 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const removeFriendFromRow = async (row) => {
      if (!authSession?.token || !row?.user_id) return;
      if (!window.confirm(`${String(row?.name || '친구')}님을 친구 목록에서 삭제할까요?`)) return;
      try {
        await FriendSystem.removeFriend(authSession, row.user_id);
        if (selectedChatFriend?.user_id && String(selectedChatFriend.user_id) === String(row.user_id)) {
          selectedChatFriend = null;
          resetChatPagingState();
          clearChatRows();
          friendPanel?.chatHintText?.setText('채팅할 친구를 선택하세요.');
          setChatUiVisible(false);
        }
        friendPanel?.statusText?.setText('친구를 삭제했습니다.');
        await loadFriendPanelData();
        void refreshFriendBadge();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`친구 삭제 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const respondInviteFromRow = async (row, accept) => {
      if (!authSession?.token || !row?.id) return;
      try {
        const out = await FriendSystem.respondInvite(authSession, row.id, accept);
        if (accept) {
          const partyKey = String(out?.partyKey || '');
          friendPanel?.statusText?.setText(`${row.from_name}님의 초대를 수락했습니다.`);
          this.sound.stopAll();
          this.scene.start('Game', {
            mode: 'coop',
            token: authSession.token,
            user: authSession.user,
            serverBaseUrl: authSession.serverBaseUrl,
            partyKey
          });
          return;
        }
        friendPanel?.statusText?.setText('초대를 거절했습니다.');
        await loadFriendPanelData();
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('invite_expired_host_not_waiting') || msg.includes('friend_api_failed:410')) {
          friendPanel?.statusText?.setText('만료된 요청입니다. 초대한 사용자가 대기 상태가 아닙니다.');
          await loadFriendPanelData();
          return;
        }
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`응답 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const renderFriendPanelRows = () => {
      if (!friendPanel) return;
      clearFriendPanelRows();
      const { root } = friendPanel;
      const panelX = w * 0.5;
      const panelY = h * 0.5;
      const panelW = Math.min(980, w - 40);
      const panelH = Math.min(560, h - 60);
      const inset = 24;
      const colGap = 22;
      const leftW = Math.min(430, Math.floor((panelW - inset * 2 - colGap) * 0.54));
      const rightW = panelW - inset * 2 - colGap - leftW;
      const leftX = panelX - panelW * 0.5 + inset;
      const rightX = leftX + leftW + colGap;
      const contentTop = panelY - panelH * 0.5 + 132;
      const contentBottom = panelY + panelH * 0.5 - 52;
      const sectionGap = 16;
      const topSectionH = 166;
      const bottomSectionH = Math.max(140, contentBottom - (contentTop + topSectionH + sectionGap));
      const leftColumnTop = contentTop;
      const leftColumnBottom = contentTop + topSectionH + sectionGap + bottomSectionH;
      const rightColumnH = leftColumnBottom - leftColumnTop;
      const halfGap = 12;
      const halfW = Math.max(130, Math.floor((leftW - halfGap) * 0.5));
      const cards = {
        friends: { x: leftX, y: contentTop, w: leftW, h: topSectionH },
        requests: { x: leftX, y: contentTop + topSectionH + sectionGap, w: halfW, h: bottomSectionH },
        invites: { x: leftX + halfW + halfGap, y: contentTop + topSectionH + sectionGap, w: halfW, h: bottomSectionH },
        chat: { x: rightX, y: leftColumnTop, w: rightW, h: rightColumnH }
      };
      const friends = Array.isArray(friendData.friends) ? friendData.friends : [];
      const incoming = Array.isArray(friendData.incoming) ? friendData.incoming : [];
      const reqIncoming = Array.isArray(friendData.friendReqIncoming) ? friendData.friendReqIncoming : [];
      friendPanel.myTagText.setText(`내 태그: ${String(friendData?.me?.tag || '-')}`);

      const mkBtn = (x, by, bw, bh, label, onClick) => {
        const b = this.add.rectangle(x, by, bw, bh, 0x223f62, 0.97).setInteractive({ useHandCursor: true });
        b.setStrokeStyle(1, 0x7ecdfd, 0.74);
        const t = this.add.text(x, by, label, {
          fontFamily: FONT_KR,
          fontSize: bw <= 46 ? '11px' : '12px',
          color: '#edf6ff'
        }).setOrigin(0.5);
        b.on('pointerover', () => {
          b.setFillStyle(0x2f5680, 0.98);
          b.setStrokeStyle(1, 0xa6e5ff, 0.96);
        });
        b.on('pointerout', () => {
          b.setFillStyle(0x223f62, 0.97);
          b.setStrokeStyle(1, 0x7ecdfd, 0.74);
        });
        b.on('pointerdown', onClick);
        root.add([b, t]);
        friendPanelRows.push(b, t);
      };
      const drawCard = (rect, title) => {
        const bg = this.add.rectangle(rect.x + rect.w * 0.5, rect.y + rect.h * 0.5, rect.w, rect.h, 0x122540, 0.74);
        bg.setStrokeStyle(1.2, 0x4f7eb6, 0.62);
        const hd = this.add.rectangle(rect.x + rect.w * 0.5, rect.y + 14, rect.w - 2, 24, 0x173154, 0.32);
        hd.setStrokeStyle(1, 0x6092c7, 0.38);
        const tx = this.add.text(rect.x + 12, rect.y + 14, title, {
          fontFamily: FONT_KR,
          fontSize: '14px',
          color: '#d9eaff'
        }).setOrigin(0, 0.5);
        root.add([bg, hd, tx]);
        friendPanelRows.push(bg, hd, tx);
      };
      const drawScrollbar = (area, offset, maxOffset) => {
        const safeMax = Math.max(0, Number(maxOffset || 0));
        if (!area || safeMax <= 0 || area.h < 28) return;
        const barX = area.x + area.w + 6;
        const track = this.add.rectangle(barX, area.y + area.h * 0.5, 5, area.h, 0x0d1a2f, 0.94);
        track.setStrokeStyle(1, 0x345885, 0.7);
        const thumbH = Math.max(24, Math.floor(area.h * 0.28));
        const movable = area.h - thumbH;
        const ratio = Phaser.Math.Clamp(Number(offset || 0) / safeMax, 0, 1);
        const thumbY = area.y + thumbH * 0.5 + movable * ratio;
        const thumb = this.add.rectangle(barX, thumbY, 5, thumbH, 0x7fcfff, 0.94);
        thumb.setStrokeStyle(1, 0xcdf2ff, 0.7);
        root.add([track, thumb]);
        friendPanelRows.push(track, thumb);
      };
      const ellipsis = (text, maxChars) => {
        const s = String(text || '');
        if (s.length <= maxChars) return s;
        return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
      };

      drawCard(cards.friends, `친구 목록 (${friends.length})`);
      drawCard(cards.requests, `받은 친구 요청 (${reqIncoming.length})`);
      drawCard(cards.invites, `받은 초대 (${incoming.length})`);
      drawCard(cards.chat, '친구 채팅');
      const chatPeerLabel = selectedChatFriend?.name
        ? ellipsis(`${String(selectedChatFriend?.name || '친구')}#${String(selectedChatFriend?.tag || '')}`, 22)
        : '';
      const chatPeerText = this.add.text(cards.chat.x + cards.chat.w - 10, cards.chat.y + 14, chatPeerLabel, {
        fontFamily: FONT_KR,
        fontSize: '12px',
        color: '#9ed9ff'
      }).setOrigin(1, 0.5);
      root.add(chatPeerText);
      friendPanelRows.push(chatPeerText);

      const friendRowsArea = { x: cards.friends.x + 8, y: cards.friends.y + 32, w: cards.friends.w - 22, h: cards.friends.h - 40 };
      const friendRowH = 28;
      const friendVisibleCount = Math.max(1, Math.floor(friendRowsArea.h / friendRowH));
      const maxFriendOffset = Math.max(0, friends.length - friendVisibleCount);
      friendScrollOffset = clampOffset(friendScrollOffset, maxFriendOffset);
      const visibleFriends = friends.slice(friendScrollOffset, friendScrollOffset + friendVisibleCount);
      let fy = friendRowsArea.y;
      visibleFriends.forEach((f) => {
        const isSelected = selectedChatFriend?.user_id && String(selectedChatFriend.user_id) === String(f?.user_id || '');
        const rowBg = this.add.rectangle(friendRowsArea.x + friendRowsArea.w * 0.5, fy + 12, friendRowsArea.w, 24, isSelected ? 0x244c76 : 0x18314f, isSelected ? 0.95 : 0.84);
        rowBg.setStrokeStyle(1, isSelected ? 0x9adfff : 0x4f79ad, isSelected ? 0.82 : 0.46);
        const name = `${String(f?.name || 'Player')}#${String(f?.tag || '')}`;
        const tx = this.add.text(friendRowsArea.x + 8, fy + 12, ellipsis(name, 20), {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        const unread = Math.max(0, Math.floor(Number(f?.unread_count || 0)));
        if (unread > 0) {
          const badgeX = friendRowsArea.x + friendRowsArea.w - 158;
          const badge = this.add.circle(badgeX, fy + 12, 8, 0x65c1ff, 0.98);
          const label = this.add.text(badgeX, fy + 12, `${Math.min(99, unread)}`, {
            fontFamily: FONT_KR,
            fontSize: '10px',
            color: '#0f2239'
          }).setOrigin(0.5);
          root.add([badge, label]);
          friendPanelRows.push(badge, label);
        }
        const btnBaseX = friendRowsArea.x + friendRowsArea.w - 150;
        mkBtn(btnBaseX + 24, fy + 12, 48, 20, '채팅', () => {
          selectedChatFriend = f;
          resetChatPagingState();
          activeInputTarget = '';
          chatInputValue = '';
          friendPanel.chatInputText?.setText('메시지 입력');
          renderFriendPanelRows();
          void loadFriendChat({ mode: 'initial' });
        });
        mkBtn(btnBaseX + 76, fy + 12, 44, 20, '초대', () => void inviteFriendFromRow(f));
        mkBtn(btnBaseX + 124, fy + 12, 44, 20, '삭제', () => void removeFriendFromRow(f));
        fy += friendRowH;
      });
      if (friends.length === 0) {
        const empty = this.add.text(friendRowsArea.x + 2, friendRowsArea.y + 20, '친구가 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }
      drawScrollbar(friendRowsArea, friendScrollOffset, maxFriendOffset);

      const inviteRowsArea = { x: cards.invites.x + 8, y: cards.invites.y + 32, w: cards.invites.w - 22, h: cards.invites.h - 40 };
      const inviteRowH = 28;
      const inviteVisibleCount = Math.max(1, Math.floor(inviteRowsArea.h / inviteRowH));
      const maxInviteOffset = Math.max(0, incoming.length - inviteVisibleCount);
      inviteScrollOffset = clampOffset(inviteScrollOffset, maxInviteOffset);
      const visibleInvites = incoming.slice(inviteScrollOffset, inviteScrollOffset + inviteVisibleCount);
      let iy = inviteRowsArea.y;
      visibleInvites.forEach((inv) => {
        const rowBg = this.add.rectangle(inviteRowsArea.x + inviteRowsArea.w * 0.5, iy + 12, inviteRowsArea.w, 24, 0x18314f, 0.84);
        rowBg.setStrokeStyle(1, 0x4f79ad, 0.46);
        const tx = this.add.text(inviteRowsArea.x + 8, iy + 12, ellipsis(`${String(inv?.from_name || 'Player')}#${String(inv?.from_tag || '')}`, 22), {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        const btnBaseX = inviteRowsArea.x + inviteRowsArea.w - 100;
        mkBtn(btnBaseX + 22, iy + 12, 44, 20, '수락', () => void respondInviteFromRow(inv, true));
        mkBtn(btnBaseX + 72, iy + 12, 44, 20, '거절', () => void respondInviteFromRow(inv, false));
        iy += inviteRowH;
      });
      if (incoming.length === 0) {
        const empty = this.add.text(inviteRowsArea.x + 2, inviteRowsArea.y + 20, '받은 초대가 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }
      drawScrollbar(inviteRowsArea, inviteScrollOffset, maxInviteOffset);

      const reqRowsArea = { x: cards.requests.x + 8, y: cards.requests.y + 32, w: cards.requests.w - 22, h: cards.requests.h - 40 };
      const reqRowH = 28;
      const reqVisibleCount = Math.max(1, Math.floor(reqRowsArea.h / reqRowH));
      const maxReqOffset = Math.max(0, reqIncoming.length - reqVisibleCount);
      reqScrollOffset = clampOffset(reqScrollOffset, maxReqOffset);
      const visibleReqs = reqIncoming.slice(reqScrollOffset, reqScrollOffset + reqVisibleCount);
      let ry = reqRowsArea.y;
      visibleReqs.forEach((req) => {
        const rowBg = this.add.rectangle(reqRowsArea.x + reqRowsArea.w * 0.5, ry + 12, reqRowsArea.w, 24, 0x18314f, 0.84);
        rowBg.setStrokeStyle(1, 0x4f79ad, 0.46);
        const tx = this.add.text(reqRowsArea.x + 8, ry + 12, ellipsis(`${String(req?.from_name || 'Player')}#${String(req?.from_tag || '')}`, 22), {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        const btnBaseX = reqRowsArea.x + reqRowsArea.w - 100;
        mkBtn(btnBaseX + 22, ry + 12, 44, 20, '수락', async () => {
          try {
            await FriendSystem.respondFriendRequest(authSession, req.id, true);
            friendPanel?.statusText?.setText('친구 요청을 수락했습니다.');
            await loadFriendPanelData();
          } catch (err) {
            if (handleFriendAuthError(err)) return;
            friendPanel?.statusText?.setText(`요청 응답 실패: ${String(err?.message || err).slice(0, 60)}`);
          }
        });
        mkBtn(btnBaseX + 72, ry + 12, 44, 20, '거절', async () => {
          try {
            await FriendSystem.respondFriendRequest(authSession, req.id, false);
            friendPanel?.statusText?.setText('친구 요청을 거절했습니다.');
            await loadFriendPanelData();
          } catch (err) {
            if (handleFriendAuthError(err)) return;
            friendPanel?.statusText?.setText(`요청 응답 실패: ${String(err?.message || err).slice(0, 60)}`);
          }
        });
        ry += reqRowH;
      });
      if (reqIncoming.length === 0) {
        const empty = this.add.text(reqRowsArea.x + 2, reqRowsArea.y + 20, '받은 친구 요청이 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }
      drawScrollbar(reqRowsArea, reqScrollOffset, maxReqOffset);

      const chatHeaderH = 28;
      const chatInputY = cards.chat.y + cards.chat.h - 18;
      const chatMsgTop = cards.chat.y + chatHeaderH;
      const chatMsgBottom = chatInputY - 18;
      const chatMsgH = Math.max(72, chatMsgBottom - chatMsgTop);
      const chatMsgW = cards.chat.w - 16;
      friendPanel.chatBox.x = cards.chat.x + cards.chat.w * 0.5;
      friendPanel.chatBox.y = chatMsgTop + chatMsgH * 0.5;
      if (typeof friendPanel.chatBox.setSize === 'function') friendPanel.chatBox.setSize(chatMsgW, chatMsgH);
      friendPanel.chatBox.width = chatMsgW;
      friendPanel.chatBox.height = chatMsgH;
      friendPanel.chatHintText.setPosition(friendPanel.chatBox.x - chatMsgW * 0.5 + 8, friendPanel.chatBox.y - chatMsgH * 0.5 + 8);
      const sendBtnW = isMobileUi ? 82 : 68;
      const sendBtnRightInset = 8;
      const chatInputGap = 8;
      const chatInputMinW = 100;
      const chatInputW = Math.max(chatInputMinW, cards.chat.w - (sendBtnW + sendBtnRightInset + chatInputGap + 8));
      friendPanel.chatInputBox.setPosition(cards.chat.x + 8 + chatInputW * 0.5, chatInputY);
      if (typeof friendPanel.chatInputBox.setSize === 'function') friendPanel.chatInputBox.setSize(chatInputW, 28);
      friendPanel.chatInputBox.width = chatInputW;
      friendPanel.chatInputText.setPosition(friendPanel.chatInputBox.x - chatInputW * 0.5 + 8, chatInputY);
      friendPanel.sendBtnBg?.setPosition(cards.chat.x + cards.chat.w - sendBtnRightInset - sendBtnW * 0.5, chatInputY);
      friendPanel.sendBtnText?.setPosition(cards.chat.x + cards.chat.w - sendBtnRightInset - sendBtnW * 0.5, chatInputY);
      if (typeof friendPanel.sendBtnBg?.setSize === 'function') {
        friendPanel.sendBtnBg.setSize(sendBtnW, isMobileUi ? 28 : 26);
      }
      if (friendPanel.chatInputBox) root.bringToTop(friendPanel.chatInputBox);
      if (friendPanel.chatInputText) root.bringToTop(friendPanel.chatInputText);
      if (friendPanel.sendBtnBg) root.bringToTop(friendPanel.sendBtnBg);
      if (friendPanel.sendBtnText) root.bringToTop(friendPanel.sendBtnText);
      if (friendPanel.closeBtnBg) root.bringToTop(friendPanel.closeBtnBg);
      if (friendPanel.closeBtnText) root.bringToTop(friendPanel.closeBtnText);

      const chatArea = { x: friendPanel.chatBox.x - chatMsgW * 0.5, y: friendPanel.chatBox.y - chatMsgH * 0.5, w: chatMsgW, h: chatMsgH };

      friendPanel.scrollAreas = {
        friends: { ...friendRowsArea, maxOffset: maxFriendOffset },
        invites: { ...inviteRowsArea, maxOffset: maxInviteOffset },
        requests: { ...reqRowsArea, maxOffset: maxReqOffset },
        chat: { ...chatArea, maxOffset: Math.max(0, Math.floor(Number(friendPanel.chatScrollMax || 0))) }
      };
    };
    const loadFriendPanelData = async () => {
      if (!authSession?.token) return;
      try {
        const [meOut, friendsOut, invitesOut, requestsOut] = await Promise.all([
          FriendSystem.getMe(authSession),
          FriendSystem.getFriends(authSession),
          FriendSystem.getInvites(authSession),
          FriendSystem.getFriendRequests(authSession)
        ]);
        friendData = {
          me: meOut?.user || null,
          friends: Array.isArray(friendsOut?.rows) ? friendsOut.rows : [],
          incoming: Array.isArray(invitesOut?.incoming) ? invitesOut.incoming : [],
          friendReqIncoming: Array.isArray(requestsOut?.incoming) ? requestsOut.incoming : [],
          friendReqOutgoing: Array.isArray(requestsOut?.outgoing) ? requestsOut.outgoing : []
        };
        if (selectedChatFriend?.user_id) {
          const stillExists = friendData.friends.find((f) => String(f?.user_id || '') === String(selectedChatFriend.user_id));
          if (!stillExists) {
            selectedChatFriend = null;
            resetChatPagingState();
            clearChatRows();
            friendPanel?.chatHintText?.setText('채팅할 친구를 선택하세요.');
            setChatUiVisible(false);
          }
        }
        if (authSession?.user && friendData?.me?.tag) authSession.user.tag = String(friendData.me.tag);
        const nextSig = buildFriendPanelDataSig(friendData, selectedChatFriend);
        if (nextSig !== friendPanelDataSig) {
          renderFriendPanelRows();
          if (selectedChatFriend?.user_id) renderChatRowsFromCache();
          friendPanelDataSig = nextSig;
        }
        if (friendPanel?.statusText) friendPanel.statusText.setText('');
        void refreshFriendBadge();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`친구 로드 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const ensureFriendPanel = () => {
      if (friendPanel) return;
      const root = this.add.container(0, 0).setDepth(2600).setVisible(false);
      const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.62).setOrigin(0).setInteractive();
      const panelW = Math.min(980, w - 40);
      const panelH = Math.min(560, h - 60);
      const panelX = w * 0.5;
      const panelY = h * 0.5;
      const panelLeft = panelX - panelW * 0.5;
      const panelTop = panelY - panelH * 0.5;
      const inset = 24;
      const colGap = 22;
      const leftW = Math.min(430, Math.floor((panelW - inset * 2 - colGap) * 0.54));
      const rightW = panelW - inset * 2 - colGap - leftW;
      const rightX = panelX - panelW * 0.5 + inset + leftW + colGap;
      const panelShadow = this.add.rectangle(panelX, panelY + 8, panelW + 16, panelH + 18, 0x040b16, 0.66);
      const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1e35, 0.96);
      panelBg.setStrokeStyle(1.8, 0x6fc8ff, 0.84);
      const headerY = panelTop + 34;
      const panelHeader = this.add.rectangle(panelX, headerY, panelW - 30, 44, 0x163153, 0.38);
      panelHeader.setStrokeStyle(1, 0x6eaedb, 0.34);
      const fieldBorderColor = 0x6fb9e8;
      const fieldFocusColor = 0xa7e8ff;
      const title = this.add.text(panelX, headerY, '친구', {
        fontFamily: FONT_KR,
        fontSize: '24px',
        color: '#eaf0ff'
      }).setOrigin(0.5, 0.5);
      const myTagText = this.add.text(panelX - panelW * 0.5 + inset, panelY - panelH * 0.5 + 72, '내 태그: -', {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#9dd7ff'
      }).setOrigin(0, 0.5);
      const tagInputY = panelY - panelH * 0.5 + 104;
      const inputBox = this.add.rectangle(panelX - panelW * 0.5 + inset + 106, tagInputY, 210, 30, 0x132946, 0.98)
        .setStrokeStyle(1, fieldBorderColor, 0.8)
        .setInteractive({ useHandCursor: true });
      const inputText = this.add.text(inputBox.x - 95, inputBox.y, '태그 입력', {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#9eb8d8'
      }).setOrigin(0, 0.5);
      const statusText = this.add.text(panelX - panelW * 0.5 + inset, panelY + panelH * 0.5 - 16, '', {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#9fb8d6'
      }).setOrigin(0, 0.5);
      const mkPanelBtn = (x, y, bw, bh, label, onClick) => {
        const b = this.add.rectangle(x, y, bw, bh, 0x244466, 0.97).setInteractive({ useHandCursor: true });
        b.setStrokeStyle(1, 0x7ecdfd, 0.8);
        const t = this.add.text(x, y, label, {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#edf6ff'
        }).setOrigin(0.5);
        b.on('pointerover', () => {
          b.setFillStyle(0x2f5680, 0.98);
          b.setStrokeStyle(1, 0xa7e8ff, 0.95);
        });
        b.on('pointerout', () => {
          b.setFillStyle(0x244466, 0.97);
          b.setStrokeStyle(1, 0x7ecdfd, 0.8);
        });
        b.on('pointerdown', onClick);
        root.add([b, t]);
        return { b, t };
      };
      const addBtn = mkPanelBtn(inputBox.x + 130, inputBox.y, 90, 28, '요청 전송', () => {
        void submitAddFriendByTag();
      });
      const reloadBtn = mkPanelBtn(panelX + panelW * 0.5 - 154, headerY, 70, 24, '새로고침', () => {
        void loadFriendPanelData();
      });
      const closePanel = () => {
        activeInputTarget = '';
        chatLoadVersion += 1;
        chatFetchInFlight = false;
        chatLoadingOlder = false;
        stopFriendPanelPolling();
        root.setVisible(false);
      };
      const closeBtnBg = this.add.rectangle(panelX + panelW * 0.5 - 34, headerY, 32, 30, 0x234463, 0.98)
        .setInteractive({ useHandCursor: true });
      closeBtnBg.setStrokeStyle(1, 0x89d4ff, 0.9);
      const closeBtnText = this.add.text(closeBtnBg.x, closeBtnBg.y - 0.5, 'X', {
        fontFamily: FONT_KR,
        fontSize: '16px',
        color: '#edf7ff',
        fontStyle: '700'
      }).setOrigin(0.5, 0.5);
      closeBtnBg.on('pointerover', () => {
        closeBtnBg.setFillStyle(0x2f5882, 0.99);
        closeBtnBg.setStrokeStyle(1, 0xb5ecff, 0.98);
      });
      closeBtnBg.on('pointerout', () => {
        closeBtnBg.setFillStyle(0x234463, 0.98);
        closeBtnBg.setStrokeStyle(1, 0x89d4ff, 0.9);
      });
      closeBtnBg.on('pointerdown', closePanel);
      const panelBottom = panelY + panelH * 0.5;
      const chatBox = this.add.rectangle(rightX + rightW * 0.5, panelBottom - 122, rightW, 146, 0x112744, 0.9)
        .setStrokeStyle(1, 0x537fb6, 0.68);
      const chatHintText = this.add.text(chatBox.x - chatBox.width * 0.5 + 10, chatBox.y - chatBox.height * 0.5 + 12, '채팅할 친구를 선택하세요.', {
        fontFamily: FONT_KR,
        fontSize: '12px',
        color: '#9eb8d8'
      }).setOrigin(0, 0);
      const sendBtnW = isMobileUi ? 82 : 68;
      const sendBtnH = isMobileUi ? 28 : 26;
      const sendBtnRightInset = 8;
      const chatInputGap = 8;
      const chatInputMinW = 100;
      const chatInputW = Math.max(chatInputMinW, rightW - (sendBtnW + sendBtnRightInset + chatInputGap + 8));
      const chatInputBox = this.add.rectangle(rightX + chatInputW * 0.5, panelBottom - 36, chatInputW, 28, 0x132946, 0.98)
        .setStrokeStyle(1, fieldBorderColor, 0.8)
        .setInteractive({ useHandCursor: true });
      const chatInputText = this.add.text(chatInputBox.x - chatInputW * 0.5 + 8, chatInputBox.y, '메시지 입력', {
        fontFamily: FONT_KR,
        fontSize: '12px',
        color: '#9eb8d8'
      }).setOrigin(0, 0.5);
      const promptMobileChatInput = () => {
        if (!selectedChatFriend?.user_id) {
          friendPanel?.statusText?.setText('먼저 친구 목록에서 채팅 대상을 선택해 주세요.');
          return;
        }
        const raw = window.prompt('메시지 입력', chatInputValue || '');
        if (raw == null) return;
        chatInputValue = String(raw).slice(0, 240);
        chatInputText.setText(chatInputValue || '메시지 입력');
      };
      const sendBtn = mkPanelBtn(
        rightX + rightW - sendBtnRightInset - sendBtnW * 0.5,
        chatInputBox.y,
        sendBtnW,
        sendBtnH,
        '보내기',
        () => {
          void sendFriendChat();
        }
      );
      sendBtn.b.setFillStyle(0x2b527c, 0.98);
      sendBtn.b.setStrokeStyle(1, 0x9fddff, 0.92);
      sendBtn.t.setColor('#edf7ff');
      inputBox.on('pointerdown', () => {
        if (isMobileUi) {
          const raw = window.prompt('친구 태그 입력', tagInputValue || '');
          if (raw == null) return;
          tagInputValue = String(raw).trim().toUpperCase().slice(0, 16);
          inputText.setText(tagInputValue || '태그 입력');
          activeInputTarget = '';
          inputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
          return;
        }
        activeInputTarget = 'tag';
        inputBox.setStrokeStyle(1, fieldFocusColor, 0.96);
        chatInputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
      });
      chatInputBox.on('pointerdown', () => {
        if (isMobileUi) {
          promptMobileChatInput();
          activeInputTarget = '';
          chatInputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
          return;
        }
        activeInputTarget = 'chat';
        chatInputBox.setStrokeStyle(1, fieldFocusColor, 0.96);
        inputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
      });
      dim.on('pointerdown', () => {
        activeInputTarget = '';
        inputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
        chatInputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
      });
      root.add([dim, panelShadow, panelBg, panelHeader, title, myTagText, inputBox, inputText, statusText, chatBox, chatHintText, chatInputBox, chatInputText, closeBtnBg, closeBtnText]);
      friendPanel = {
        root,
        myTagText,
        inputBox,
        inputText,
        statusText,
        chatBox,
        chatHintText,
        chatInputBox,
        chatInputText,
        closeBtnBg,
        closeBtnText,
        sendBtnBg: sendBtn.b,
        sendBtnText: sendBtn.t
      };
      const friendInputKeyHandler = (event) => {
        if (!friendPanel?.root?.visible) return;
        if (!activeInputTarget) return;
        const key = String(event?.key || '');
        if (key === 'Escape') {
          activeInputTarget = '';
          friendPanel.inputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
          friendPanel.chatInputBox.setStrokeStyle(1, fieldBorderColor, 0.8);
          return;
        }
        if (key === 'Enter') {
          if (activeInputTarget === 'tag') {
            void submitAddFriendByTag();
          } else if (activeInputTarget === 'chat') {
            void sendFriendChat();
          }
          return;
        }
        if (activeInputTarget === 'tag') {
          if (key === 'Backspace') {
            tagInputValue = tagInputValue.slice(0, -1);
          } else if (/^[a-zA-Z0-9]$/.test(key) && tagInputValue.length < 16) {
            tagInputValue += key.toUpperCase();
          } else {
            return;
          }
          friendPanel.inputText.setText(tagInputValue || '태그 입력');
          return;
        }
        if (activeInputTarget === 'chat') {
          if (key === 'Backspace') {
            chatInputValue = chatInputValue.slice(0, -1);
          } else if (key.length === 1 && chatInputValue.length < 240) {
            chatInputValue += key;
          } else {
            return;
          }
          friendPanel.chatInputText.setText(chatInputValue || '메시지 입력');
        }
      };
      const inArea = (x, y, area) => !!area && x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
      const friendWheelHandler = (pointer, _gameObjects, _dx, dy) => {
        if (!friendPanel?.root?.visible) return;
        const px = Number(pointer?.worldX ?? pointer?.x ?? 0);
        const py = Number(pointer?.worldY ?? pointer?.y ?? 0);
        const step = dy > 0 ? 1 : -1;
        const areas = friendPanel.scrollAreas || {};
        if (inArea(px, py, areas.friends)) {
          const next = clampOffset(friendScrollOffset + step, areas.friends.maxOffset);
          if (next === friendScrollOffset) return;
          friendScrollOffset = next;
          renderFriendPanelRows();
          return;
        }
        if (inArea(px, py, areas.invites)) {
          const next = clampOffset(inviteScrollOffset + step, areas.invites.maxOffset);
          if (next === inviteScrollOffset) return;
          inviteScrollOffset = next;
          renderFriendPanelRows();
          return;
        }
        if (inArea(px, py, areas.requests)) {
          const next = clampOffset(reqScrollOffset + step, areas.requests.maxOffset);
          if (next === reqScrollOffset) return;
          reqScrollOffset = next;
          renderFriendPanelRows();
          return;
        }
        if (inArea(px, py, areas.chat) && selectedChatFriend?.user_id) {
          const maxOffset = Math.max(0, Math.floor(Number(areas.chat?.maxOffset || 0)));
          const chatStep = dy > 0 ? -1 : 1;
          const next = clampOffset(chatScrollOffset + chatStep, maxOffset);
          if (next !== chatScrollOffset) {
            chatScrollOffset = next;
            renderChatRowsFromCache();
          }
          if (chatStep > 0 && next >= maxOffset) {
            void loadFriendChat({ mode: 'older' });
          }
        }
      };
      let chatTouchScrollActive = false;
      let chatTouchLastY = 0;
      let chatTouchAccumY = 0;
      const endChatTouchScroll = () => {
        chatTouchScrollActive = false;
        chatTouchLastY = 0;
        chatTouchAccumY = 0;
      };
      const friendPointerDownHandler = (pointer) => {
        if (!isMobileUi) return;
        if (!friendPanel?.root?.visible) return;
        if (!selectedChatFriend?.user_id) return;
        const px = Number(pointer?.worldX ?? pointer?.x ?? 0);
        const py = Number(pointer?.worldY ?? pointer?.y ?? 0);
        const chatArea = friendPanel.scrollAreas?.chat;
        if (!inArea(px, py, chatArea)) return;
        chatTouchScrollActive = true;
        chatTouchLastY = py;
        chatTouchAccumY = 0;
      };
      const friendPointerMoveHandler = (pointer) => {
        if (!isMobileUi) return;
        if (!chatTouchScrollActive) return;
        if (!friendPanel?.root?.visible || !selectedChatFriend?.user_id) {
          endChatTouchScroll();
          return;
        }
        const py = Number(pointer?.worldY ?? pointer?.y ?? 0);
        const dy = py - chatTouchLastY;
        chatTouchLastY = py;
        if (!Number.isFinite(dy) || dy === 0) return;
        chatTouchAccumY += dy;
        const thresholdPx = 12;
        const absAccum = Math.abs(chatTouchAccumY);
        if (absAccum < thresholdPx) return;
        const stepCount = Math.max(1, Math.floor(absAccum / thresholdPx));
        chatTouchAccumY = chatTouchAccumY > 0 ? (absAccum - stepCount * thresholdPx) : -(absAccum - stepCount * thresholdPx);
        const chatStep = dy > 0 ? -stepCount : stepCount;
        const maxOffset = Math.max(0, Math.floor(Number(friendPanel.scrollAreas?.chat?.maxOffset || 0)));
        const next = clampOffset(chatScrollOffset + chatStep, maxOffset);
        if (next !== chatScrollOffset) {
          chatScrollOffset = next;
          renderChatRowsFromCache();
        }
        if (chatStep > 0 && next >= maxOffset) {
          void loadFriendChat({ mode: 'older' });
        }
      };
      const friendPointerUpHandler = () => {
        if (!isMobileUi) return;
        endChatTouchScroll();
      };
      this.input.keyboard.on('keydown', friendInputKeyHandler);
      this.input.on('wheel', friendWheelHandler);
      this.input.on('pointerdown', friendPointerDownHandler);
      this.input.on('pointermove', friendPointerMoveHandler);
      this.input.on('pointerup', friendPointerUpHandler);
      this.input.on('pointerupoutside', friendPointerUpHandler);
      this.events.once('shutdown', () => {
        this.input.keyboard.off('keydown', friendInputKeyHandler);
        this.input.off('wheel', friendWheelHandler);
        this.input.off('pointerdown', friendPointerDownHandler);
        this.input.off('pointermove', friendPointerMoveHandler);
        this.input.off('pointerup', friendPointerUpHandler);
        this.input.off('pointerupoutside', friendPointerUpHandler);
      });
    };
    const openFriendMenu = async () => {
      if (!authSession?.token) {
        authStatus.setText('친구 기능은 로그인 후 사용할 수 있습니다.');
        return;
      }
      ensureFriendPanel();
      activeInputTarget = '';
      tagInputValue = '';
      chatInputValue = '';
      friendScrollOffset = 0;
      inviteScrollOffset = 0;
      reqScrollOffset = 0;
      resetChatPagingState();
      friendPanelDataSig = '';
      selectedChatFriend = null;
      friendPanel.inputText.setText('태그 입력');
      friendPanel.chatInputText.setText('메시지 입력');
      friendPanel.chatHintText.setText('채팅할 친구를 선택하세요.');
      friendPanel.statusText.setText('불러오는 중...');
      friendPanel.root.setVisible(true);
      clearChatRows();
      setChatUiVisible(false);
      stopFriendPanelPolling();
      friendPanelPollTimer = this.time.addEvent({
        delay: 3000,
        loop: true,
        callback: () => {
          if (!friendPanel?.root?.visible) return;
          void loadFriendPanelData();
          if (selectedChatFriend?.user_id && activeInputTarget !== 'chat') {
            void loadFriendChat();
          }
        }
      });
      await loadFriendPanelData();
    };
    const refreshAuthUi = (pvpStats = null) => {
      if (authSession?.user?.name) {
        const tagPart = authSession?.user?.tag ? `#${authSession.user.tag}` : '';
        if (pvpStats) {
          const mmr = Number(pvpStats?.mmr || 1000);
          const wins = Number(pvpStats?.wins || 0);
          const losses = Number(pvpStats?.losses || 0);
          const tier = getMmrTierLabel(mmr);
          authStatus.setText(`로그인: ${authSession.user.name}${tagPart} | MMR ${mmr} (${tier}) ${wins}승 ${losses}패`);
        } else {
          authStatus.setText(`로그인: ${authSession.user.name}${tagPart}`);
        }
        setAuthBtnIcon('logout');
      } else {
        authStatus.setText('로그인 필요: PVP 모드');
        setAuthBtnIcon('login');
      }
    };
    const loadPvpStats = async () => {
      if (!authSession?.user?.id) return null;
      const baseUrl = String(authSession?.serverBaseUrl || getPvpServerBaseUrl());
      try {
        const resp = await fetch(`${baseUrl}/pvp/stats/${encodeURIComponent(authSession.user.id)}`);
        if (!resp.ok) return null;
        return await resp.json();
      } catch {
        return null;
      }
    };
    const attachProgressSync = (session) => {
      if (!session?.token) {
        SaveSystem.setSyncHandler(null);
        return;
      }
      SaveSystem.setSyncHandler((snapshot) => {
        ProgressSyncSystem.schedulePush(session, snapshot);
      });
    };
    const syncProgressFromServer = async () => {
      if (!authSession?.token) return;
      try {
        const remote = await ProgressSyncSystem.pull(authSession);
        if (remote) SaveSystem.importProgress(remote);
      } catch {
        // keep local data when server pull fails
      }
    };
    attachProgressSync(authSession);
    void AuthSystem.loadGoogleSdk().catch(() => {});
    void AuthSystem.resumeRedirectLogin().then(async (session) => {
      if (!session) return;
      authSession = session;
      attachProgressSync(authSession);
      await syncProgressFromServer();
      goldText.setText(`${SaveSystem.getTotalGold()}`);
      const stats = await loadPvpStats();
      refreshAuthUi(stats);
      void refreshFriendBadge();
      startInvitePolling();
    }).catch((err) => {
      authStatus.setText(`로그인 실패: ${String(err?.message || err).slice(0, 70)}`);
    });
    void syncProgressFromServer().then(() => {
      goldText.setText(`${SaveSystem.getTotalGold()}`);
    });
    void loadPvpStats().then((stats) => refreshAuthUi(stats));
    void refreshFriendBadge();
    startInvitePolling();
    authBtn.on('pointerover', () => {
      authBtn.setFillStyle(0x305179, 0.98);
      authBtnShadow.setAlpha(0.68);
      authBtnGlyph?.setAlpha(1);
    });
    authBtn.on('pointerout', () => {
      authBtn.setFillStyle(0x243a58, 0.96);
      authBtnShadow.setAlpha(0.55);
      authBtnGlyph?.setAlpha(authBtn.input?.enabled ? 0.95 : 0.52);
    });
    friendBtn.on('pointerover', () => {
      friendBtn.setFillStyle(0x305179, 0.98);
      friendBtnShadow.setAlpha(0.68);
      friendBtnGlyph.setAlpha(1);
    });
    friendBtn.on('pointerout', () => {
      friendBtn.setFillStyle(0x243a58, 0.96);
      friendBtnShadow.setAlpha(0.55);
      friendBtnGlyph.setAlpha(0.95);
    });
    friendBtn.on('pointerdown', () => {
      void openFriendMenu();
    });
    authBtn.on('pointerdown', async () => {
      authBtn.disableInteractive();
      authBtnGlyph?.setAlpha(0.52);
      try {
        if (authSession?.token) {
          AuthSystem.clearSession();
          authSession = null;
          SaveSystem.setSyncHandler(null);
          stopInvitePolling();
          stopFriendPanelPolling();
          friendBadge.setText('');
          if (friendPanel?.root) friendPanel.root.setVisible(false);
          refreshAuthUi();
        } else {
          authStatus.setText('구글 로그인 진행 중...');
          authSession = await AuthSystem.loginWithGoogle();
          attachProgressSync(authSession);
          await syncProgressFromServer();
          goldText.setText(`${SaveSystem.getTotalGold()}`);
          const stats = await loadPvpStats();
          refreshAuthUi(stats);
          void refreshFriendBadge();
          startInvitePolling();
        }
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg === 'oauth_redirect_started') return;
        authStatus.setText(`로그인 실패: ${msg.slice(0, 70)}`);
      } finally {
        authBtn.setInteractive({ useHandCursor: true });
        authBtnGlyph?.setAlpha(0.95);
      }
    });

    const drawBookGlyph = (x, y, color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.9, color, 0.96);
      // left/right pages
      g.strokeRoundedRect(x - 10, y - 8, 8, 16, 2.2);
      g.strokeRoundedRect(x + 2, y - 8, 8, 16, 2.2);
      // center seam
      g.lineBetween(x, y - 8, x, y + 8);
      // page fold hints
      g.lineStyle(1.2, color, 0.86);
      g.lineBetween(x - 6.7, y - 3.8, x - 3.3, y - 3.8);
      g.lineBetween(x + 3.3, y - 3.8, x + 6.7, y - 3.8);
      // tiny top clasp (similar to HUD icon feel)
      g.lineStyle(1.5, color, 0.9);
      g.strokeRoundedRect(x - 1.8, y - 10.5, 3.6, 2.4, 0.8);
      return g;
    };

    const drawTrophyGlyph = (x, y, color = 0xeaf0ff) => {
      const g = this.add.graphics();
      g.lineStyle(1.9, color, 0.96);
      // cup
      g.strokeRoundedRect(x - 6.4, y - 8.2, 12.8, 8.7, 2.3);
      // handles
      g.beginPath();
      g.moveTo(x - 6.4, y - 6.1);
      g.lineTo(x - 9.8, y - 4.4);
      g.lineTo(x - 9.8, y - 1.8);
      g.lineTo(x - 6.4, y - 0.2);
      g.strokePath();
      g.beginPath();
      g.moveTo(x + 6.4, y - 6.1);
      g.lineTo(x + 9.8, y - 4.4);
      g.lineTo(x + 9.8, y - 1.8);
      g.lineTo(x + 6.4, y - 0.2);
      g.strokePath();
      // stem + base
      g.lineBetween(x, y + 0.6, x, y + 6.3);
      g.strokeRoundedRect(x - 5.4, y + 6.3, 10.8, 2.8, 1);
      return g;
    };

    const mkTopIcon = (x, kind, onClick) => {
      const boxShadow = this.add.rectangle(x, Math.round(26 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x071223, 0.55);
      const box = this.add.rectangle(x, Math.round(24 * uiScale), Math.round(40 * uiScale), Math.round(32 * uiScale), 0x243a58, 0.96).setInteractive({ useHandCursor: true });
      box.setStrokeStyle(1, 0x86b8ff, 0.86);
      let glyph = null;
      if (kind === 'book') glyph = drawBookGlyph(x, Math.round(24 * uiScale));
      else if (kind === 'trophy') glyph = drawTrophyGlyph(x, Math.round(24 * uiScale));

      box.on('pointerover', () => {
        box.setFillStyle(0x305179, 0.98);
        boxShadow.setAlpha(0.68);
        glyph?.setAlpha(1);
      });
      box.on('pointerout', () => {
        box.setFillStyle(0x243a58, 0.96);
        boxShadow.setAlpha(0.55);
        glyph?.setAlpha(0.95);
      });
      box.on('pointerdown', onClick);
      return [box, glyph];
    };

    const [codexIcon, codexGlyph] = mkTopIcon(codexX, 'book', () => {
      bgm.stop();
      this.scene.start('Codex');
    });
    const [rankIcon, rankGlyph] = mkTopIcon(rankX, 'trophy', () => {
      bgm.stop();
      this.scene.start('Ranking');
    });

    const heroY = h * 0.33;
    const preTitle = this.add.text(w / 2, heroY - Math.round(38 * uiScale), 'TACTICAL SURVIVAL', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(10, Math.round(11 * uiScale))}px`,
      color: '#8fd6ff'
    }).setOrigin(0.5).setAlpha(0.84);
    const titleGlow = this.add.text(w / 2, heroY, 'CIRCLES', {
      fontFamily: 'Orbitron, "Rajdhani", "Pretendard", system-ui, sans-serif',
      fontSize: `${Math.max(42, Math.round((w < 760 ? 47 : 59) * uiScale))}px`,
      color: '#8fcfff',
      stroke: '#8fcfff',
      strokeThickness: 1.2
    }).setOrigin(0.5).setAlpha(0.1).setBlendMode(Phaser.BlendModes.ADD);
    const title = this.add.text(w / 2, heroY, 'CIRCLES', {
      fontFamily: 'Orbitron, "Rajdhani", "Pretendard", system-ui, sans-serif',
      fontSize: `${Math.max(40, Math.round((w < 760 ? 45 : 57) * uiScale))}px`,
      color: '#f2f9ff',
      stroke: '#89bdf3',
      strokeThickness: 0.45
    }).setOrigin(0.5);
    this.tweens.add({
      targets: titleGlow,
      alpha: { from: 0.07, to: 0.13 },
      duration: 1800,
      yoyo: true,
      ease: 'Sine.InOut',
      repeat: -1
    });

    const sub = this.add.text(w / 2, h * 0.43, '\uC0DD\uC874\uD558\uACE0 \uAC15\uD654\uD558\uACE0 \uB7AD\uD0B9\uC744 \uC62C\uB9AC\uC138\uC694', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(14, Math.round(17 * uiScale))}px`,
      color: '#9ab4d8'
    }).setOrigin(0.5);

    const hint = this.add.text(w / 2, h * 0.55, '\uBAA8\uB4DC\uB97C \uC120\uD0DD\uD574 \uC2DC\uC791\uD558\uC138\uC694', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(12, Math.round(14 * uiScale))}px`,
      color: '#89a4c8'
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.46, duration: 1000, yoyo: true, repeat: -1 });

    const startY = h * 0.64;
    const startBtn = this.add.rectangle(w / 2, startY, Math.round(314 * uiScale), Math.round(52 * uiScale), 0x173459, 0.97).setInteractive({ useHandCursor: true });
    startBtn.setStrokeStyle(2, 0xff89e5, 0.88);
    const startText = this.add.text(w / 2, startY, '\uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(18, Math.round(22 * uiScale))}px`,
      color: '#edf7ff',
      fontStyle: '700'
    }).setOrigin(0.5);
    startBtn.on('pointerover', () => {
      startBtn.setFillStyle(0x204572, 1);
      startBtn.setStrokeStyle(2.1, 0xffadef, 0.98);
    });
    startBtn.on('pointerout', () => {
      startBtn.setFillStyle(0x173459, 0.97);
      startBtn.setStrokeStyle(2, 0xff89e5, 0.88);
    });

    const modeRoot = this.add.container(0, 0).setDepth(2500).setVisible(false);
    const modeDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.58).setOrigin(0).setInteractive();
    const modeCardW = Math.min(Math.round(520 * uiScale), w - Math.round(52 * uiScale));
    const modeHeaderH = Math.round(44 * uiScale);
    const modeRowH = Math.round(52 * uiScale);
    const modeRowGap = Math.round(10 * uiScale);
    const modeRows = 4;
    const modeTopPad = Math.round(26 * uiScale);
    const modeBottomPad = Math.round(26 * uiScale);
    const modeActionsH = Math.round(44 * uiScale);
    const modeCardH = modeTopPad + modeHeaderH + Math.round(18 * uiScale) + (modeRows * modeRowH) + ((modeRows - 1) * modeRowGap) + modeBottomPad + modeActionsH;
    const modeCardX = w * 0.5;
    const modeCardY = h * 0.53;
    const modeCardShadow = this.add.rectangle(modeCardX, modeCardY + Math.round(5 * uiScale), modeCardW + Math.round(8 * uiScale), modeCardH + Math.round(10 * uiScale), 0x050b16, 0.56);
    const modeCard = this.add.rectangle(modeCardX, modeCardY, modeCardW, modeCardH, 0x0f1d33, 0.985);
    modeCard.setStrokeStyle(1.6, 0x73cbff, 0.74);
    const modeHeaderY = modeCardY - modeCardH * 0.5 + modeTopPad + modeHeaderH * 0.5;
    const modeHeader = this.add.rectangle(modeCardX, modeHeaderY, modeCardW - Math.round(26 * uiScale), modeHeaderH, 0x142943, 0.28);
    modeHeader.setStrokeStyle(1, 0x74c7ff, 0.26);
    const modeTitle = this.add.text(modeCardX, modeHeaderY, '모드 선택', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(19, Math.round(23 * uiScale))}px`,
      color: '#f0f7ff'
    }).setOrigin(0.5);
    modeRoot.add([modeDim, modeCardShadow, modeCard, modeHeader, modeTitle]);

    const modeAccent = 0x76cbff;
    const mkModeBtn = (y, label, desc, onClick, enabled = true) => {
      const bw = modeCardW - Math.round(50 * uiScale);
      const bh = modeRowH;
      const rowX = modeCardX;
      const rowLeft = rowX - bw * 0.5;
      const shadow = this.add.rectangle(rowX, y + Math.round(1 * uiScale), bw + Math.round(2 * uiScale), bh + Math.round(3 * uiScale), enabled ? modeAccent : 0x24364f, enabled ? 0.05 : 0.03)
        .setBlendMode(Phaser.BlendModes.ADD);
      const bg = this.add.rectangle(rowX, y, bw, bh, enabled ? 0x1b3453 : 0x1d2b43, 0.94)
        .setInteractive(enabled ? { useHandCursor: true } : undefined);
      bg.setStrokeStyle(1.2, enabled ? 0x67b7ed : 0x466084, enabled ? 0.7 : 0.45);
      const accent = this.add.rectangle(rowLeft + Math.round(8 * uiScale), y, 2, bh - Math.round(14 * uiScale), enabled ? modeAccent : 0x4b6484, enabled ? 0.74 : 0.45);
      const tx = this.add.text(rowLeft + Math.round(18 * uiScale), y - Math.round(8 * uiScale), label, {
        fontFamily: FONT_KR,
        fontSize: `${Math.max(14, Math.round(17 * uiScale))}px`,
        color: enabled ? '#eaf0ff' : '#9ab0d3'
      }).setOrigin(0, 0.5);
      const sx = this.add.text(rowLeft + Math.round(18 * uiScale), y + Math.round(10 * uiScale), desc, {
        fontFamily: FONT_KR,
        fontSize: `${Math.max(11, Math.round(12 * uiScale))}px`,
        color: enabled ? '#9ab3d2' : '#778ba8'
      }).setOrigin(0, 0.5);
      if (enabled) {
        bg.on('pointerover', () => {
          bg.setFillStyle(0x24476e, 0.97);
          bg.setStrokeStyle(1.35, 0x90dcff, 0.88);
          accent.setFillStyle(0x98deff, 0.86);
          shadow.setAlpha(0.1);
        });
        bg.on('pointerout', () => {
          bg.setFillStyle(0x1b3453, 0.94);
          bg.setStrokeStyle(1.2, 0x67b7ed, 0.7);
          accent.setFillStyle(modeAccent, 0.74);
          shadow.setAlpha(0.05);
        });
        bg.on('pointerdown', onClick);
      }
      modeRoot.add([shadow, bg, accent, tx, sx]);
      return { bg, tx, sx, accent };
    };

    const topRowY = modeHeaderY + modeHeaderH * 0.5 + Math.round(18 * uiScale) + modeRowH * 0.5;
    const rowGap = modeRowH + modeRowGap;
    const y1 = topRowY;
    const y2 = y1 + rowGap;
    const y3 = y2 + rowGap;
    const y4 = y3 + rowGap;
    const closeY = modeCardY + modeCardH * 0.5 - Math.round(28 * uiScale);
    mkModeBtn(y1, '스테이지 모드', '스테이지 20 클리어 목표', () => {
      bgm.stop();
      this.scene.start('Game', {
        mode: 'survival',
        token: authSession?.token,
        user: authSession?.user,
        serverBaseUrl: authSession?.serverBaseUrl
      });
    }, true);
    mkModeBtn(y2, '디펜스 모드', '중앙 코어를 적에게서 방어', () => {
      bgm.stop();
      this.scene.start('Game', {
        mode: 'defense',
        token: authSession?.token,
        user: authSession?.user,
        serverBaseUrl: authSession?.serverBaseUrl
      });
    }, true);
    mkModeBtn(y3, '협동 모드', '2인 서버 기반 협동 플레이', () => {
      if (!authSession?.token) {
        authStatus.setText('협동 입장 전 구글 로그인이 필요합니다.');
        return;
      }
      bgm.stop();
      this.scene.start('Game', {
        mode: 'coop',
        token: authSession.token,
        user: authSession.user,
        serverBaseUrl: authSession.serverBaseUrl
      });
    }, true);
    mkModeBtn(y4, 'PVP 모드', '1:1 실시간 대전', () => {
      if (!authSession?.token) {
        authStatus.setText('PVP 입장 전 구글 로그인이 필요합니다.');
        return;
      }
      bgm.stop();
      this.scene.start('Game', {
        mode: 'pvp',
        token: authSession.token,
        user: authSession.user,
        serverBaseUrl: authSession.serverBaseUrl
      });
    }, true);

    const closeBtn = this.add.rectangle(modeCardX, closeY, Math.round(140 * uiScale), Math.round(34 * uiScale), 0x263f5f, 0.95)
      .setInteractive({ useHandCursor: true });
    closeBtn.setStrokeStyle(1.35, 0x79ccff, 0.8);
    const closeTx = this.add.text(closeBtn.x, closeBtn.y, '닫기', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(13, Math.round(16 * uiScale))}px`,
      color: '#e6f0ff'
    }).setOrigin(0.5);
    const closeModeRoot = () => {
      this.tweens.killTweensOf(modeRoot);
      this.tweens.killTweensOf(modeCard);
      this.tweens.killTweensOf(modeCardShadow);
      this.tweens.add({
        targets: modeRoot,
        alpha: 0,
        duration: 120,
        onComplete: () => modeRoot.setVisible(false)
      });
    };
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x30547f, 0.98));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x263f5f, 0.95));
    closeBtn.on('pointerdown', closeModeRoot);
    modeDim.on('pointerdown', closeModeRoot);
    modeRoot.add([closeBtn, closeTx]);

    const openModeRoot = () => {
      modeRoot.setVisible(true).setAlpha(0);
      modeCard.setScale(0.96);
      modeCardShadow.setScale(0.96);
      this.tweens.killTweensOf(modeRoot);
      this.tweens.killTweensOf(modeCard);
      this.tweens.killTweensOf(modeCardShadow);
      this.tweens.add({ targets: modeRoot, alpha: 1, duration: 140, ease: 'Sine.Out' });
      this.tweens.add({ targets: [modeCard, modeCardShadow], scaleX: 1, scaleY: 1, duration: 180, ease: 'Cubic.Out' });
    };
    startBtn.on('pointerdown', () => {
      openModeRoot();
    });

    const shopY = startY + Math.round(62 * uiScale);
    const shopBtnAura = this.add.rectangle(w / 2, shopY, Math.round(332 * uiScale), Math.round(58 * uiScale), neonCyan, 0.055).setBlendMode(Phaser.BlendModes.ADD);
    const shopBtn = this.add.rectangle(w / 2, shopY, Math.round(314 * uiScale), Math.round(46 * uiScale), 0x1c3556, 0.97).setInteractive({ useHandCursor: true });
    shopBtn.setStrokeStyle(1.5, 0x8ee1ff, 0.82);
    const shopText = this.add.text(w / 2, shopY, '\uC0C1\uC810', {
      fontFamily: FONT_KR,
      fontSize: `${Math.max(16, Math.round(20 * uiScale))}px`,
      color: '#eaf2ff'
    }).setOrigin(0.5);
    this.tweens.add({
      targets: shopBtnAura,
      alpha: { from: 0.036, to: 0.082 },
      duration: 1500,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1
    });
    shopBtn.on('pointerover', () => {
      shopBtn.setFillStyle(0x28507a, 0.99);
      shopBtn.setStrokeStyle(1.7, 0xa7ebff, 0.94);
      shopBtnAura.setAlpha(0.11);
    });
    shopBtn.on('pointerout', () => {
      shopBtn.setFillStyle(0x1c3556, 0.97);
      shopBtn.setStrokeStyle(1.5, 0x8ee1ff, 0.82);
      shopBtnAura.setAlpha(0.055);
    });
    shopBtn.on('pointerdown', () => {
      bgm.stop();
      this.scene.start('Shop');
    });

    this.events.on('wake', () => {
      goldText.setText(`${SaveSystem.getTotalGold()}`);
    });
    this.events.once('shutdown', () => {
      stopInvitePolling();
      stopFriendPanelPolling();
    });

    void title;
    void preTitle;
    void titleGlow;
    void sub;
    void panel;
    void panelToneTop;
    void panelToneBottom;
    void panelInner;
    void panelGlow;
    void panelInnerFrame;
    void panelCornerA;
    void panelCornerB;
    void panelCornerC;
    void panelCornerD;
    void coin;
    void codexIcon;
    void codexGlyph;
    void rankIcon;
    void rankGlyph;
    void authStatus;
    void authBtn;
    void authBtnShadow;
    void authBtnGlyph;
    void friendBtn;
    void friendBtnShadow;
    void friendBtnGlyph;
    void friendBadge;
    void bgObjs;
    void previewObjs;
    void startText;
    void shopBtnAura;
    void shopText;
  }
}
