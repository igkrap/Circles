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

    const rings = [];
    for (let i = 0; i < 4; i += 1) {
      const ring = this.add.circle(
        w * (0.26 + i * 0.17),
        h * (0.2 + (i % 2) * 0.55),
        44 + i * 16
      ).setStrokeStyle(2, 0x86a9df, 0.18);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      ring.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.tweens.add({
        targets: ring,
        rotation: ring.rotation + (i % 2 ? -1 : 1) * Math.PI * 2,
        duration: 11000 + i * 2300,
        repeat: -1
      });
      rings.push(ring);
    }

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

    const streaks = this.add.graphics();
    const drawStreaks = () => {
      streaks.clear();
      for (let i = 0; i < 7; i += 1) {
        const sy = ((this.time.now * 0.02 + i * 130) % (h + 140)) - 70;
        const sx = (i * 170 + this.time.now * 0.008) % (w + 220) - 110;
        streaks.lineStyle(1 + (i % 2), 0x9ec4ff, 0.11);
        streaks.lineBetween(sx, sy, sx + 60, sy + 14);
      }
    };
    drawStreaks();
    this.time.addEvent({ delay: 33, loop: true, callback: drawStreaks });

    return [base, glowA, glowB, glowC, grid, ...rings, ...stars, streaks];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const isMobileUi = isMobileDevice();

    this.sound.stopAll();
    const settings = SettingsSystem.load();
    const bgm = this.sound.add('bgm_lobby', { loop: true, volume: settings.bgmVolume });
    if (settings.bgmEnabled) bgm.play();

    const bgObjs = this.createLobbyBackground(w, h);
    const panelW = Math.min(640, Math.max(420, w - 56));
    const panelH = Math.min(370, Math.max(280, h - 110));
    const panel = this.add.rectangle(w / 2, h * 0.54, panelW, panelH, 0x101a2c, 0.8);
    panel.setStrokeStyle(2, 0x3b4d75, 0.95);
    const panelShine = this.add.rectangle(w / 2, h * 0.44, panelW - 28, 52, 0x8ab7ff, 0.05).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: panelShine,
      x: w / 2 + 18,
      alpha: { from: 0.02, to: 0.075 },
      duration: 1700,
      yoyo: true,
      repeat: -1
    });

    const coin = this.add.image(20, 24, 'tex_gold').setOrigin(0.5).setScale(0.78);
    const goldText = this.add.text(36, 12, `${SaveSystem.getTotalGold()}`, {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#ffd700'
    }).setOrigin(0, 0);
    let authSession = AuthSystem.loadSession();
    const authStatus = this.add.text(18, 40, '', {
      fontFamily: FONT_KR,
      fontSize: '12px',
      color: '#aab6d6'
    }).setOrigin(0, 0);
    const authBtn = this.add.rectangle(210, 23, 120, 28, 0x2a3552, 0.95).setInteractive({ useHandCursor: true });
    authBtn.setStrokeStyle(1, 0x7ea0ff, 0.75);
    const authBtnTx = this.add.text(210, 23, '', {
      fontFamily: FONT_KR,
      fontSize: '14px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    const friendBtn = this.add.rectangle(340, 23, 112, 28, 0x2a3552, 0.95).setInteractive({ useHandCursor: true });
    friendBtn.setStrokeStyle(1, 0x7ea0ff, 0.75);
    const friendBtnTx = this.add.text(340, 23, '친구', {
      fontFamily: FONT_KR,
      fontSize: '14px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    const friendBadge = this.add.text(390, 10, '', {
      fontFamily: FONT_KR,
      fontSize: '11px',
      color: '#ffd700'
    }).setOrigin(0.5, 0);
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
    let friendPanelPollTimer = null;
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
    const loadFriendChat = async () => {
      if (!authSession?.token || !selectedChatFriend?.user_id) {
        friendPanel.chatHintText?.setText('채팅할 친구를 선택하세요.');
        clearChatRows();
        return;
      }
      try {
        await FriendSystem.markChatRead(authSession, selectedChatFriend.user_id);
        const out = await FriendSystem.getChat(authSession, selectedChatFriend.user_id, 24);
        const rows = Array.isArray(out?.rows) ? out.rows : [];
        clearChatRows();
        const sx = friendPanel.chatBox.x - friendPanel.chatBox.width * 0.5 + 10;
        let sy = friendPanel.chatBox.y - friendPanel.chatBox.height * 0.5 + 12;
        rows.slice(-8).forEach((r) => {
          const mine = String(r?.from_user_id || '') === String(authSession?.user?.id || '');
          const who = mine ? '나' : String(r?.from_name || '친구');
          const line = this.add.text(sx, sy, `${who}: ${String(r?.message || '').slice(0, 120)}`, {
            fontFamily: FONT_KR,
            fontSize: '12px',
            color: mine ? '#d8e6ff' : '#9fc1ff',
            wordWrap: { width: friendPanel.chatBox.width - 18 }
          }).setOrigin(0, 0);
          friendPanel.root.add(line);
          chatRows.push(line);
          sy += Math.max(16, line.height + 2);
        });
        friendPanel.chatHintText?.setText(`${selectedChatFriend.name}#${selectedChatFriend.tag}`);
        void loadFriendPanelData();
      } catch (err) {
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`채팅 로드 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const sendFriendChat = async () => {
      const message = String(chatInputValue || '').trim();
      if (!authSession?.token || !selectedChatFriend?.user_id || !message) return;
      try {
        await FriendSystem.sendChat(authSession, selectedChatFriend.user_id, message);
        chatInputValue = '';
        friendPanel.chatInputText?.setText('메시지 입력');
        await loadFriendChat();
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
        if (handleFriendAuthError(err)) return;
        friendPanel?.statusText?.setText(`응답 실패: ${String(err?.message || err).slice(0, 60)}`);
      }
    };
    const renderFriendPanelRows = () => {
      if (!friendPanel) return;
      clearFriendPanelRows();
      const { root } = friendPanel;
      const panelX = w * 0.5;
      const panelY = h * 0.53;
      const panelW = Math.min(760, w - 46);
      const leftX = panelX - panelW * 0.5 + 24;
      const rightX = panelX + 20;
      const friends = Array.isArray(friendData.friends) ? friendData.friends : [];
      const incoming = Array.isArray(friendData.incoming) ? friendData.incoming : [];
      const reqIncoming = Array.isArray(friendData.friendReqIncoming) ? friendData.friendReqIncoming : [];
      const reqOutgoing = Array.isArray(friendData.friendReqOutgoing) ? friendData.friendReqOutgoing : [];
      const meTag = String(friendData?.me?.tag || '-');
      friendPanel.myTagText.setText(`내 태그: ${meTag}`);
      let y = panelY - 84;
      const mkBtn = (x, by, bw, bh, label, onClick) => {
        const b = this.add.rectangle(x, by, bw, bh, 0x2a3552, 0.97).setInteractive({ useHandCursor: true });
        b.setStrokeStyle(1, 0x7ea0ff, 0.75);
        const t = this.add.text(x, by, label, {
          fontFamily: FONT_KR,
          fontSize: '12px',
          color: '#eaf0ff'
        }).setOrigin(0.5);
        b.on('pointerover', () => b.setFillStyle(0x35507a, 0.97));
        b.on('pointerout', () => b.setFillStyle(0x2a3552, 0.97));
        b.on('pointerdown', onClick);
        root.add([b, t]);
        friendPanelRows.push(b, t);
      };
      const friendTitle = this.add.text(leftX, y, `친구 목록 (${friends.length})`, {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#9fc1ff'
      }).setOrigin(0, 0.5);
      root.add(friendTitle);
      friendPanelRows.push(friendTitle);
      y += 24;
      friends.slice(0, 8).forEach((f) => {
        const rowBg = this.add.rectangle(leftX + 150, y + 12, 300, 24, 0x16253f, 0.82);
        rowBg.setStrokeStyle(1, 0x3f5d92, 0.45);
        const unread = Math.max(0, Math.floor(Number(f?.unread_count || 0)));
        const tx = this.add.text(leftX + 10, y + 12, `${String(f?.name || 'Player')}#${String(f?.tag || '')}`, {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        if (unread > 0) {
          const badgeX = leftX + 176;
          const badgeY = y + 12;
          const badge = this.add.circle(badgeX, badgeY, 9, 0xff6b6b, 0.98);
          badge.setStrokeStyle(1, 0xffc6c6, 0.9);
          const label = this.add.text(badgeX, badgeY, `${Math.min(99, unread)}`, {
            fontFamily: FONT_KR,
            fontSize: '10px',
            color: '#ffffff'
          }).setOrigin(0.5);
          root.add([badge, label]);
          friendPanelRows.push(badge, label);
        }
        mkBtn(leftX + 196, y + 12, 54, 20, '채팅', () => {
          selectedChatFriend = f;
          void loadFriendChat();
        });
        mkBtn(leftX + 268, y + 12, 70, 20, '협동 초대', () => {
          void inviteFriendFromRow(f);
        });
        y += 28;
      });
      if (friends.length === 0) {
        const empty = this.add.text(leftX, y + 8, '친구가 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }

      let iy = panelY - 84;
      const inviteTitle = this.add.text(rightX, iy, `받은 초대 (${incoming.length})`, {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#9fc1ff'
      }).setOrigin(0, 0.5);
      root.add(inviteTitle);
      friendPanelRows.push(inviteTitle);
      iy += 24;
      incoming.slice(0, 8).forEach((inv) => {
        const rowBg = this.add.rectangle(rightX + 150, iy + 12, 300, 24, 0x16253f, 0.82);
        rowBg.setStrokeStyle(1, 0x3f5d92, 0.45);
        const tx = this.add.text(rightX + 10, iy + 12, `${String(inv?.from_name || 'Player')}#${String(inv?.from_tag || '')}`, {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        mkBtn(rightX + 228, iy + 12, 46, 20, '수락', () => {
          void respondInviteFromRow(inv, true);
        });
        mkBtn(rightX + 280, iy + 12, 46, 20, '거절', () => {
          void respondInviteFromRow(inv, false);
        });
        iy += 28;
      });
      if (incoming.length === 0) {
        const empty = this.add.text(rightX, iy + 8, '받은 초대가 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }
      const reqTitleY = panelY + 72;
      const reqTitle = this.add.text(leftX, reqTitleY, `받은 친구 요청 (${reqIncoming.length})`, {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#9fc1ff'
      }).setOrigin(0, 0.5);
      root.add(reqTitle);
      friendPanelRows.push(reqTitle);
      let ry = reqTitleY + 18;
      reqIncoming.slice(0, 4).forEach((req) => {
        const rowBg = this.add.rectangle(leftX + 150, ry + 12, 300, 24, 0x16253f, 0.82);
        rowBg.setStrokeStyle(1, 0x3f5d92, 0.45);
        const tx = this.add.text(leftX + 10, ry + 12, `${String(req?.from_name || 'Player')}#${String(req?.from_tag || '')}`, {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0, 0.5);
        root.add([rowBg, tx]);
        friendPanelRows.push(rowBg, tx);
        mkBtn(leftX + 228, ry + 12, 46, 20, '수락', async () => {
          try {
            await FriendSystem.respondFriendRequest(authSession, req.id, true);
            friendPanel?.statusText?.setText('친구 요청을 수락했습니다.');
            await loadFriendPanelData();
          } catch (err) {
            if (handleFriendAuthError(err)) return;
            friendPanel?.statusText?.setText(`요청 응답 실패: ${String(err?.message || err).slice(0, 60)}`);
          }
        });
        mkBtn(leftX + 280, ry + 12, 46, 20, '거절', async () => {
          try {
            await FriendSystem.respondFriendRequest(authSession, req.id, false);
            friendPanel?.statusText?.setText('친구 요청을 거절했습니다.');
            await loadFriendPanelData();
          } catch (err) {
            if (handleFriendAuthError(err)) return;
            friendPanel?.statusText?.setText(`요청 응답 실패: ${String(err?.message || err).slice(0, 60)}`);
          }
        });
        ry += 28;
      });
      if (reqIncoming.length === 0) {
        const empty = this.add.text(leftX, ry + 8, '받은 친구 요청이 없습니다.', {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#8fa4cd'
        }).setOrigin(0, 0.5);
        root.add(empty);
        friendPanelRows.push(empty);
      }
      const outReq = this.add.text(rightX, panelY + 154, `보낸 친구 요청 ${reqOutgoing.length}건`, {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      }).setOrigin(0, 0.5);
      root.add(outReq);
      friendPanelRows.push(outReq);

      const chatLabel = this.add.text(rightX, panelY + 176, '친구 채팅', {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#9fc1ff'
      }).setOrigin(0, 0.5);
      root.add(chatLabel);
      friendPanelRows.push(chatLabel);
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
            clearChatRows();
            friendPanel?.chatHintText?.setText('채팅할 친구를 선택하세요.');
          }
        }
        if (authSession?.user && friendData?.me?.tag) authSession.user.tag = String(friendData.me.tag);
        renderFriendPanelRows();
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
      const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.58).setOrigin(0).setInteractive();
      const panelW = Math.min(760, w - 46);
      const panelH = Math.min(470, h - 60);
      const panelX = w * 0.5;
      const panelY = h * 0.53;
      const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x172033, 0.98);
      panelBg.setStrokeStyle(2, 0x3b4d75, 0.95);
      const title = this.add.text(panelX, panelY - panelH * 0.5 + 26, '친구', {
        fontFamily: FONT_KR,
        fontSize: '24px',
        color: '#eaf0ff'
      }).setOrigin(0.5);
      const myTagText = this.add.text(panelX - panelW * 0.5 + 24, panelY - panelH * 0.5 + 56, '내 태그: -', {
        fontFamily: FONT_KR,
        fontSize: '14px',
        color: '#ffd700'
      }).setOrigin(0, 0.5);
      const inputBox = this.add.rectangle(panelX - panelW * 0.5 + 130, panelY + panelH * 0.5 - 56, 210, 30, 0x10213c, 0.98)
        .setStrokeStyle(1, 0x7ea0ff, 0.8)
        .setInteractive({ useHandCursor: true });
      const inputText = this.add.text(inputBox.x - 95, inputBox.y, '태그 입력', {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#aab6d6'
      }).setOrigin(0, 0.5);
      const statusText = this.add.text(panelX, panelY + panelH * 0.5 - 20, '', {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      }).setOrigin(0.5);
      const mkPanelBtn = (x, y, bw, bh, label, onClick) => {
        const b = this.add.rectangle(x, y, bw, bh, 0x2a3552, 0.97).setInteractive({ useHandCursor: true });
        b.setStrokeStyle(1, 0x7ea0ff, 0.78);
        const t = this.add.text(x, y, label, {
          fontFamily: FONT_KR,
          fontSize: '13px',
          color: '#eaf0ff'
        }).setOrigin(0.5);
        b.on('pointerover', () => b.setFillStyle(0x35507a, 0.97));
        b.on('pointerout', () => b.setFillStyle(0x2a3552, 0.97));
        b.on('pointerdown', onClick);
        root.add([b, t]);
        return { b, t };
      };
      const addBtn = mkPanelBtn(inputBox.x + 130, inputBox.y, 90, 28, '요청 전송', () => {
        void submitAddFriendByTag();
      });
      const reloadBtn = mkPanelBtn(panelX + panelW * 0.5 - 158, panelY - panelH * 0.5 + 28, 70, 24, '새로고침', () => {
        void loadFriendPanelData();
      });
      const closeBtn = mkPanelBtn(panelX + panelW * 0.5 - 76, panelY - panelH * 0.5 + 28, 56, 24, '닫기', () => {
        activeInputTarget = '';
        stopFriendPanelPolling();
        root.setVisible(false);
      });
      const chatBox = this.add.rectangle(panelX + panelW * 0.5 - 168, panelY + 252, 320, 130, 0x10213c, 0.92)
        .setStrokeStyle(1, 0x3f5d92, 0.72);
      const chatHintText = this.add.text(chatBox.x - chatBox.width * 0.5 + 10, chatBox.y - chatBox.height * 0.5 - 16, '채팅할 친구를 선택하세요.', {
        fontFamily: FONT_KR,
        fontSize: '12px',
        color: '#8fa4cd'
      }).setOrigin(0, 0.5);
      const chatInputBox = this.add.rectangle(chatBox.x - 35, chatBox.y + chatBox.height * 0.5 + 24, 216, 28, 0x10213c, 0.98)
        .setStrokeStyle(1, 0x7ea0ff, 0.8)
        .setInteractive({ useHandCursor: true });
      const chatInputText = this.add.text(chatInputBox.x - 98, chatInputBox.y, '메시지 입력', {
        fontFamily: FONT_KR,
        fontSize: '12px',
        color: '#aab6d6'
      }).setOrigin(0, 0.5);
      const sendBtn = mkPanelBtn(chatInputBox.x + 130, chatInputBox.y, 74, 26, '전송', () => {
        void sendFriendChat();
      });
      inputBox.on('pointerdown', () => {
        if (isMobileUi) {
          const raw = window.prompt('친구 태그 입력', tagInputValue || '');
          if (raw == null) return;
          tagInputValue = String(raw).trim().toUpperCase().slice(0, 16);
          inputText.setText(tagInputValue || '태그 입력');
          activeInputTarget = '';
          inputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
          return;
        }
        activeInputTarget = 'tag';
        inputBox.setStrokeStyle(1, 0xffd77b, 0.95);
        chatInputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
      });
      chatInputBox.on('pointerdown', () => {
        if (isMobileUi) {
          const raw = window.prompt('메시지 입력', chatInputValue || '');
          if (raw == null) return;
          chatInputValue = String(raw).slice(0, 240);
          chatInputText.setText(chatInputValue || '메시지 입력');
          activeInputTarget = '';
          chatInputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
          return;
        }
        activeInputTarget = 'chat';
        chatInputBox.setStrokeStyle(1, 0xffd77b, 0.95);
        inputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
      });
      dim.on('pointerdown', () => {
        activeInputTarget = '';
        inputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
        chatInputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
        stopFriendPanelPolling();
        root.setVisible(false);
      });
      root.add([dim, panelBg, title, myTagText, inputBox, inputText, statusText, chatBox, chatHintText, chatInputBox, chatInputText, addBtn.b, addBtn.t, reloadBtn.b, reloadBtn.t, closeBtn.b, closeBtn.t, sendBtn.b, sendBtn.t]);
      friendPanel = {
        root,
        myTagText,
        inputBox,
        inputText,
        statusText,
        chatBox,
        chatHintText,
        chatInputBox,
        chatInputText
      };
      const friendInputKeyHandler = (event) => {
        if (!friendPanel?.root?.visible) return;
        if (!activeInputTarget) return;
        const key = String(event?.key || '');
        if (key === 'Escape') {
          activeInputTarget = '';
          friendPanel.inputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
          friendPanel.chatInputBox.setStrokeStyle(1, 0x7ea0ff, 0.8);
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
      this.input.keyboard.on('keydown', friendInputKeyHandler);
      this.events.once('shutdown', () => {
        this.input.keyboard.off('keydown', friendInputKeyHandler);
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
      friendPanel.inputText.setText('태그 입력');
      friendPanel.chatInputText.setText('메시지 입력');
      friendPanel.chatHintText.setText('채팅할 친구를 선택하세요.');
      friendPanel.statusText.setText('불러오는 중...');
      friendPanel.root.setVisible(true);
      stopFriendPanelPolling();
      friendPanelPollTimer = this.time.addEvent({
        delay: 3000,
        loop: true,
        callback: () => {
          if (!friendPanel?.root?.visible) return;
          void loadFriendPanelData();
          void loadFriendChat();
        }
      });
      await loadFriendPanelData();
      const firstFriend = Array.isArray(friendData?.friends) ? friendData.friends[0] : null;
      if (firstFriend?.user_id) {
        selectedChatFriend = firstFriend;
        await loadFriendChat();
      }
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
        authBtnTx.setText('로그아웃');
      } else {
        authStatus.setText('로그인 필요: PVP 모드');
        authBtnTx.setText('구글 로그인');
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
    authBtn.on('pointerover', () => authBtn.setFillStyle(0x35507a, 0.95));
    authBtn.on('pointerout', () => authBtn.setFillStyle(0x2a3552, 0.95));
    friendBtn.on('pointerover', () => friendBtn.setFillStyle(0x35507a, 0.95));
    friendBtn.on('pointerout', () => friendBtn.setFillStyle(0x2a3552, 0.95));
    friendBtn.on('pointerdown', () => {
      void openFriendMenu();
    });
    authBtn.on('pointerdown', async () => {
      authBtn.disableInteractive();
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
      const box = this.add.rectangle(x, 24, 38, 30, 0x1f2b43, 0.95).setInteractive({ useHandCursor: true });
      box.setStrokeStyle(1, 0x7ea0ff, 0.8);
      let glyph = null;
      if (kind === 'book') glyph = drawBookGlyph(x, 24);
      else if (kind === 'trophy') glyph = drawTrophyGlyph(x, 24);

      box.on('pointerover', () => {
        box.setFillStyle(0x35507a, 0.95);
        glyph?.setAlpha(1);
      });
      box.on('pointerout', () => {
        box.setFillStyle(0x1f2b43, 0.95);
        glyph?.setAlpha(0.95);
      });
      box.on('pointerdown', onClick);
      return [box, glyph];
    };

    const topRightPad = 24;
    const iconGap = 8;
    const iconW = 38;
    const rankX = w - topRightPad - iconW * 0.5;
    const codexX = rankX - iconW - iconGap;
    const [codexIcon, codexGlyph] = mkTopIcon(codexX, 'book', () => {
      bgm.stop();
      this.scene.start('Codex');
    });
    const [rankIcon, rankGlyph] = mkTopIcon(rankX, 'trophy', () => {
      bgm.stop();
      this.scene.start('Ranking');
    });

    const titleGlow = this.add.text(w / 2, h * 0.33, 'CIRCLES', {
      fontFamily: 'Trebuchet MS, Verdana, system-ui, sans-serif',
      fontSize: w < 760 ? '52px' : '62px',
      color: '#78b8ff',
      stroke: '#6aa9ff',
      strokeThickness: 10
    }).setOrigin(0.5).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
    const title = this.add.text(w / 2, h * 0.33, 'CIRCLES', {
      fontFamily: FONT_KR,
      fontSize: w < 760 ? '44px' : '54px',
      color: '#eef4ff',
      stroke: '#8ab0ea',
      strokeThickness: 1
    }).setOrigin(0.5);
    this.tweens.add({
      targets: [title, titleGlow],
      y: '-=4',
      duration: 2000,
      yoyo: true,
      ease: 'Sine.InOut',
      repeat: -1
    });

    const sub = this.add.text(w / 2, h * 0.44, '\uC0DD\uC874\uD558\uACE0 \uAC15\uD654\uD558\uACE0 \uB7AD\uD0B9\uC744 \uC62C\uB9AC\uC138\uC694', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#8fa4cd'
    }).setOrigin(0.5);

    const hint = this.add.text(w / 2, h * 0.57, '\uD074\uB9AD \uB610\uB294 \uD130\uCE58\uB85C \uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#aab6d6'
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });

    const startBtn = this.add.rectangle(w / 2, h * 0.64, 300, 44, 0x2a3552, 0.98).setInteractive({ useHandCursor: true });
    startBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const startText = this.add.text(w / 2, h * 0.64, '\uC2DC\uC791', {
      fontFamily: FONT_KR,
      fontSize: '20px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x35507a, 0.98));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x2a3552, 0.98));

    const modeRoot = this.add.container(0, 0).setDepth(2500).setVisible(false);
    const modeDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.56).setOrigin(0).setInteractive();
    const modeCardW = Math.min(420, w - 50);
    const modeCardH = 392;
    const modeCard = this.add.rectangle(w * 0.5, h * 0.53, modeCardW, modeCardH, 0x172033, 0.97);
    modeCard.setStrokeStyle(2, 0x3b4d75, 0.95);
    const modeTitle = this.add.text(w * 0.5, modeCard.y - modeCardH * 0.5 + 28, '모드 선택', {
      fontFamily: FONT_KR,
      fontSize: '24px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    modeRoot.add([modeDim, modeCard, modeTitle]);

    const mkModeBtn = (y, label, desc, onClick, enabled = true) => {
      const bw = modeCardW - 56;
      const bh = 52;
      const bg = this.add.rectangle(w * 0.5, y, bw, bh, enabled ? 0x2a3552 : 0x243248, 0.98)
        .setInteractive(enabled ? { useHandCursor: true } : undefined);
      bg.setStrokeStyle(1, enabled ? 0x7ea0ff : 0x466084, 0.9);
      const tx = this.add.text(w * 0.5, y - 10, label, {
        fontFamily: FONT_KR,
        fontSize: '18px',
        color: enabled ? '#eaf0ff' : '#9ab0d3'
      }).setOrigin(0.5);
      const sx = this.add.text(w * 0.5, y + 12, desc, {
        fontFamily: FONT_KR,
        fontSize: '13px',
        color: '#8fa4cd'
      }).setOrigin(0.5);
      if (enabled) {
        bg.on('pointerover', () => bg.setFillStyle(0x35507a, 0.98));
        bg.on('pointerout', () => bg.setFillStyle(0x2a3552, 0.98));
        bg.on('pointerdown', onClick);
      }
      modeRoot.add([bg, tx, sx]);
      return { bg, tx, sx };
    };

    const closeY = modeCard.y + modeCardH * 0.5 - 28;
    const topRowY = modeCard.y - modeCardH * 0.5 + 94;
    const bottomRowY = closeY - 64;
    const rowGap = (bottomRowY - topRowY) / 3;
    const y1 = topRowY;
    const y2 = y1 + rowGap;
    const y3 = y2 + rowGap;
    const y4 = y3 + rowGap;
    mkModeBtn(y1, '스테이지 모드', '스테이지 30 클리어 목표', () => {
      bgm.stop();
      this.scene.start('Game', {
        mode: 'survival',
        token: authSession?.token,
        user: authSession?.user,
        serverBaseUrl: authSession?.serverBaseUrl
      });
    });
    mkModeBtn(y2, '디펜스 모드', '중앙 코어를 적에게서 방어', () => {
      bgm.stop();
      this.scene.start('Game', {
        mode: 'defense',
        token: authSession?.token,
        user: authSession?.user,
        serverBaseUrl: authSession?.serverBaseUrl
      });
    });
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

    const closeBtn = this.add.rectangle(w * 0.5, closeY, 150, 34, 0x2a3552, 0.95)
      .setInteractive({ useHandCursor: true });
    closeBtn.setStrokeStyle(1, 0x7ea0ff, 0.8);
    const closeTx = this.add.text(closeBtn.x, closeBtn.y, '닫기', {
      fontFamily: FONT_KR,
      fontSize: '16px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    closeBtn.on('pointerdown', () => modeRoot.setVisible(false));
    modeDim.on('pointerdown', () => modeRoot.setVisible(false));
    modeRoot.add([closeBtn, closeTx]);

    startBtn.on('pointerdown', () => {
      modeRoot.setVisible(true);
    });

    const shopBtn = this.add.rectangle(w / 2, h * 0.74, 300, 42, 0x2a3552, 0.95).setInteractive({ useHandCursor: true });
    shopBtn.setStrokeStyle(1, 0x7ea0ff, 0.7);
    const shopText = this.add.text(w / 2, h * 0.74, '\uC0C1\uC810', {
      fontFamily: FONT_KR,
      fontSize: '18px',
      color: '#eaf0ff'
    }).setOrigin(0.5);
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(0x33486d, 0.95));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(0x2a3552, 0.95));
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
    void titleGlow;
    void sub;
    void panel;
    void panelShine;
    void coin;
    void codexIcon;
    void codexGlyph;
    void rankIcon;
    void rankGlyph;
    void authStatus;
    void authBtn;
    void authBtnTx;
    void friendBtn;
    void friendBtnTx;
    void friendBadge;
    void bgObjs;
    void startText;
    void shopText;
  }
}
