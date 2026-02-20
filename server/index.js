import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { OAuth2Client } from 'google-auth-library';
import { Server } from 'colyseus';
import { Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const PORT = Number(process.env.PORT || 8788);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_IDS = String(process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const GOOGLE_AUDIENCES = Array.from(new Set([
  ...GOOGLE_CLIENT_IDS,
  ...(GOOGLE_CLIENT_ID ? [GOOGLE_CLIENT_ID] : [])
]));
const CLIENT_ORIGIN_RAW = String(process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || '*').trim();
const CLIENT_ORIGIN_LIST = CLIENT_ORIGIN_RAW === '*'
  ? ['*']
  : CLIENT_ORIGIN_RAW.split(',').map((v) => v.trim()).filter(Boolean);
const AUTH_RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000));
const AUTH_RATE_LIMIT_MAX = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 40));
const PVP_DB_PATH = process.env.PVP_DB_PATH || path.join(process.cwd(), 'server', 'pvp.sqlite');
const APP_DB_PATH = process.env.APP_DB_PATH
  || process.env.PROGRESS_DB_PATH
  || path.join(process.cwd(), 'server', 'app.sqlite');
const RUN_LEADERBOARD_MODES = new Set(['survival', 'coop']);

const WORLD_W = 4800;
const WORLD_H = 3000;
const ARENA_MIN_X = 24;
const ARENA_MAX_X = WORLD_W - 24;
const ARENA_MIN_Y = 24;
const ARENA_MAX_Y = WORLD_H - 24;
const PLAYER_CONTACT_RADIUS = 24;

const SHOT_DAMAGE_BASE = 10;
const SHOT_COOLDOWN_MS_BASE = 370;
const SHOT_RANGE_BASE = 860;
const SHOT_ARC_DOT = 0.84;
const MAX_HP_BASE = 50;
const MOVE_SPEED_BASE = 270;
const MAX_NET_MOVE_SPEED = 620;
const COOP_FINAL_STAGE = 20;
const COOP_REVIVE_RADIUS = 84;
const COOP_REVIVE_HOLD_MS = 4000;
const COOP_REVIVE_HP_RATIO = 0.2;

const ENEMY_CONTACT_DAMAGE = {
  scout: 7,
  tank: 12,
  brute: 12,
  elite: 18,
  miniboss: 22,
  boss: 34
};

const CARD_POOL = ['ATK_UP', 'FIRE_RATE_UP', 'MAX_HP_UP', 'MOVE_SPEED_UP', 'SHOT_RANGE_UP', 'HEAL_UP'];
const PVP_ABILITY_KEYS = new Set([
  'XPGAIN',
  'ATK',
  'FIRERATE',
  'MOVESPD',
  'SHIELD',
  'HP_REGEN',
  'MAX_HP',
  'CRIT_CHANCE',
  'GOLD_GAIN',
  'SHOCKWAVE',
  'LASER',
  'GRENADE',
  'FWD_SLASH',
  'DASH',
  'SPIN_SLASH',
  'CHAIN_LIGHTNING',
  'BLIZZARD',
  'FIRE_BOLT'
]);
const SERVER_SKILL_BASE_DAMAGE = {
  SHOCKWAVE: 12,
  LASER: 11,
  FWD_SLASH: 10,
  DASH: 9,
  CHAIN_LIGHTNING: 10,
  GRENADE: 13,
  BLIZZARD: 7,
  SPIN_SLASH: 9,
  FIRE_BOLT: 12,
  SKILL: 10
};
const SERVER_SKILL_MIN_COOLDOWN_MS = {
  SHOCKWAVE: 120,
  LASER: 90,
  FWD_SLASH: 110,
  DASH: 120,
  CHAIN_LIGHTNING: 140,
  GRENADE: 130,
  BLIZZARD: 90,
  SPIN_SLASH: 90,
  FIRE_BOLT: 120,
  SKILL: 110
};
const SERVER_SKILL_RANGE = {
  BASIC: 900,
  SHOCKWAVE: 180,
  LASER: 860,
  GRENADE: 320,
  FWD_SLASH: 220,
  DASH: 230,
  SPIN_SLASH: 200,
  CHAIN_LIGHTNING: 560,
  BLIZZARD: 320,
  FIRE_BOLT: 320,
  SKILL: 600
};
const SERVER_SKILL_ARC_DOT = {
  BASIC: 0.72,
  SHOCKWAVE: -1,
  LASER: 0.62,
  GRENADE: 0.1,
  FWD_SLASH: 0.62,
  DASH: 0.48,
  SPIN_SLASH: -1,
  CHAIN_LIGHTNING: -1,
  BLIZZARD: -1,
  FIRE_BOLT: 0.18,
  SKILL: 0.2
};

const googleClient = new OAuth2Client();
const pvpDb = new Database(PVP_DB_PATH);
pvpDb.pragma('journal_mode = WAL');
const appDb = new Database(APP_DB_PATH);
appDb.pragma('journal_mode = WAL');
const authRateMap = new Map();
const coopPartyStateMap = new Map();

function isOriginAllowed(origin) {
  if (CLIENT_ORIGIN_LIST.includes('*')) return true;
  if (!origin) return true;
  return CLIENT_ORIGIN_LIST.includes(String(origin).trim());
}

function isCoopInviterWaiting(partyKey, inviterUserId) {
  const key = String(partyKey || '').trim();
  const inviter = String(inviterUserId || '').trim();
  if (!key || !inviter) return false;
  const state = coopPartyStateMap.get(key);
  if (!state) return false;
  if (String(state.phase || '') !== 'waiting') return false;
  return !!state.userIds?.has(inviter);
}
function migrateLegacyProgressDbIfNeeded() {
  const legacyPath = path.join(process.cwd(), 'server', 'progress.sqlite');
  if (APP_DB_PATH === legacyPath) return;
  if (!fs.existsSync(legacyPath)) return;
  try {
    appDb.exec(`
      ATTACH DATABASE '${legacyPath.replace(/'/g, "''")}' AS legacy_progress;
      INSERT OR IGNORE INTO user_progress (user_id, gold, relic_state, records, updated_at)
      SELECT user_id, gold, relic_state, records, updated_at
      FROM legacy_progress.user_progress;
      DETACH DATABASE legacy_progress;
    `);
  } catch (err) {
    console.warn('[app-db] legacy progress migration skipped:', String(err?.message || err));
  }
}
pvpDb.exec(`
CREATE TABLE IF NOT EXISTS pvp_players (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mmr INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pvp_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  winner_user_id TEXT NOT NULL,
  loser_user_id TEXT NOT NULL,
  winner_mmr_before INTEGER NOT NULL,
  winner_mmr_after INTEGER NOT NULL,
  loser_mmr_before INTEGER NOT NULL,
  loser_mmr_after INTEGER NOT NULL,
  reason TEXT NOT NULL
);
`);
appDb.exec(`
CREATE TABLE IF NOT EXISTS user_progress (
  user_id TEXT PRIMARY KEY,
  gold INTEGER NOT NULL DEFAULT 0,
  relic_state TEXT NOT NULL DEFAULT '{}',
  records TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS run_leaderboard (
  mode TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  best_stage INTEGER NOT NULL DEFAULT 1,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_time_sec REAL NOT NULL DEFAULT 0,
  best_kills INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (mode, user_id)
);
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_links (
  user_id TEXT NOT NULL,
  friend_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_user_id)
);
CREATE TABLE IF NOT EXISTS friend_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  party_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_chat_reads (
  user_id TEXT NOT NULL,
  friend_user_id TEXT NOT NULL,
  last_read_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, friend_user_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_messages_from_to_created
  ON friend_messages (from_user_id, to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_friend_messages_to_from_created
  ON friend_messages (to_user_id, from_user_id, created_at);
`);
migrateLegacyProgressDbIfNeeded();

const stInsertPlayer = pvpDb.prepare(`
  INSERT INTO pvp_players (user_id, name, mmr, wins, losses, matches, updated_at)
  VALUES (@user_id, @name, 1000, 0, 0, 0, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    name=excluded.name,
    updated_at=excluded.updated_at
`);
const stGetPlayer = pvpDb.prepare(`
  SELECT user_id, name, mmr, wins, losses, matches, updated_at
  FROM pvp_players
  WHERE user_id = ?
`);
const stUpdateWinner = pvpDb.prepare(`
  UPDATE pvp_players
  SET mmr = ?, wins = wins + 1, matches = matches + 1, updated_at = ?
  WHERE user_id = ?
`);
const stUpdateLoser = pvpDb.prepare(`
  UPDATE pvp_players
  SET mmr = ?, losses = losses + 1, matches = matches + 1, updated_at = ?
  WHERE user_id = ?
`);
const stInsertMatch = pvpDb.prepare(`
  INSERT INTO pvp_matches (
    ts, winner_user_id, loser_user_id,
    winner_mmr_before, winner_mmr_after,
    loser_mmr_before, loser_mmr_after, reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stUpsertProgress = appDb.prepare(`
  INSERT INTO user_progress (user_id, gold, relic_state, records, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    gold=excluded.gold,
    relic_state=excluded.relic_state,
    records=excluded.records,
    updated_at=excluded.updated_at
`);
const stGetProgress = appDb.prepare(`
  SELECT user_id, gold, relic_state, records, updated_at
  FROM user_progress
  WHERE user_id = ?
`);
const stGetRunLeaderboardEntry = appDb.prepare(`
  SELECT mode, user_id, name, best_stage, best_score, best_time_sec, best_kills, updated_at
  FROM run_leaderboard
  WHERE mode = ? AND user_id = ?
`);
const stUpsertRunLeaderboardEntry = appDb.prepare(`
  INSERT INTO run_leaderboard (
    mode, user_id, name, best_stage, best_score, best_time_sec, best_kills, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(mode, user_id) DO UPDATE SET
    name=excluded.name,
    best_stage=excluded.best_stage,
    best_score=excluded.best_score,
    best_time_sec=excluded.best_time_sec,
    best_kills=excluded.best_kills,
    updated_at=excluded.updated_at
`);
const stGetUserProfile = appDb.prepare(`
  SELECT user_id, name, tag, updated_at
  FROM user_profile
  WHERE user_id = ?
`);
const stGetUserProfileByTag = appDb.prepare(`
  SELECT user_id, name, tag, updated_at
  FROM user_profile
  WHERE tag = ?
`);
const stInsertUserProfile = appDb.prepare(`
  INSERT INTO user_profile (user_id, name, tag, updated_at)
  VALUES (?, ?, ?, ?)
`);
const stUpdateUserProfileName = appDb.prepare(`
  UPDATE user_profile
  SET name = ?, updated_at = ?
  WHERE user_id = ?
`);
const stInsertFriendLink = appDb.prepare(`
  INSERT OR IGNORE INTO friend_links (user_id, friend_user_id, created_at)
  VALUES (?, ?, ?)
`);
const stDeleteFriendLink = appDb.prepare(`
  DELETE FROM friend_links
  WHERE user_id = ? AND friend_user_id = ?
`);
const stGetFriendLink = appDb.prepare(`
  SELECT user_id, friend_user_id, created_at
  FROM friend_links
  WHERE user_id = ? AND friend_user_id = ?
`);
const stListFriends = appDb.prepare(`
  SELECT f.friend_user_id AS user_id, p.name, p.tag, f.created_at,
         (
           SELECT COUNT(1)
           FROM friend_messages m
           LEFT JOIN friend_chat_reads r
             ON r.user_id = f.user_id
            AND r.friend_user_id = f.friend_user_id
           WHERE m.from_user_id = f.friend_user_id
             AND m.to_user_id = f.user_id
             AND m.created_at > COALESCE(r.last_read_at, 0)
         ) AS unread_count
  FROM friend_links f
  JOIN user_profile p ON p.user_id = f.friend_user_id
  WHERE f.user_id = ?
  ORDER BY p.name COLLATE NOCASE ASC, p.tag ASC
`);
const stInsertFriendInvite = appDb.prepare(`
  INSERT INTO friend_invites (from_user_id, to_user_id, party_key, status, created_at, updated_at)
  VALUES (?, ?, ?, 'pending', ?, ?)
`);
const stGetIncomingInvites = appDb.prepare(`
  SELECT i.id, i.from_user_id, i.to_user_id, i.party_key, i.status, i.created_at, i.updated_at,
         p.name AS from_name, p.tag AS from_tag
  FROM friend_invites i
  JOIN user_profile p ON p.user_id = i.from_user_id
  WHERE i.to_user_id = ? AND i.status = 'pending'
  ORDER BY i.created_at DESC
`);
const stGetOutgoingInvites = appDb.prepare(`
  SELECT i.id, i.from_user_id, i.to_user_id, i.party_key, i.status, i.created_at, i.updated_at,
         p.name AS to_name, p.tag AS to_tag
  FROM friend_invites i
  JOIN user_profile p ON p.user_id = i.to_user_id
  WHERE i.from_user_id = ? AND i.status = 'pending'
  ORDER BY i.created_at DESC
`);
const stFindPendingInviteByPair = appDb.prepare(`
  SELECT id, from_user_id, to_user_id, party_key, status, created_at, updated_at
  FROM friend_invites
  WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
`);
const stGetInviteById = appDb.prepare(`
  SELECT id, from_user_id, to_user_id, party_key, status, created_at, updated_at
  FROM friend_invites
  WHERE id = ?
`);
const stUpdateInviteStatus = appDb.prepare(`
  UPDATE friend_invites
  SET status = ?, updated_at = ?
  WHERE id = ?
`);
const stInsertFriendRequest = appDb.prepare(`
  INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at)
  VALUES (?, ?, 'pending', ?, ?)
`);
const stFindPendingFriendRequestByPair = appDb.prepare(`
  SELECT id, from_user_id, to_user_id, status, created_at, updated_at
  FROM friend_requests
  WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
`);
const stGetFriendRequestById = appDb.prepare(`
  SELECT id, from_user_id, to_user_id, status, created_at, updated_at
  FROM friend_requests
  WHERE id = ?
`);
const stUpdateFriendRequestStatus = appDb.prepare(`
  UPDATE friend_requests
  SET status = ?, updated_at = ?
  WHERE id = ?
`);
const stGetIncomingFriendRequests = appDb.prepare(`
  SELECT r.id, r.from_user_id, r.to_user_id, r.status, r.created_at, r.updated_at,
         p.name AS from_name, p.tag AS from_tag
  FROM friend_requests r
  JOIN user_profile p ON p.user_id = r.from_user_id
  WHERE r.to_user_id = ? AND r.status = 'pending'
  ORDER BY r.created_at DESC
`);
const stGetOutgoingFriendRequests = appDb.prepare(`
  SELECT r.id, r.from_user_id, r.to_user_id, r.status, r.created_at, r.updated_at,
         p.name AS to_name, p.tag AS to_tag
  FROM friend_requests r
  JOIN user_profile p ON p.user_id = r.to_user_id
  WHERE r.from_user_id = ? AND r.status = 'pending'
  ORDER BY r.created_at DESC
`);
const stInsertFriendMessage = appDb.prepare(`
  INSERT INTO friend_messages (from_user_id, to_user_id, message, created_at)
  VALUES (?, ?, ?, ?)
`);
const stGetFriendConversationLatest = appDb.prepare(`
  SELECT m.id, m.from_user_id, m.to_user_id, m.message, m.created_at,
         fp.name AS from_name, fp.tag AS from_tag,
         tp.name AS to_name, tp.tag AS to_tag
  FROM friend_messages m
  JOIN user_profile fp ON fp.user_id = m.from_user_id
  JOIN user_profile tp ON tp.user_id = m.to_user_id
  WHERE (m.from_user_id = ? AND m.to_user_id = ?)
     OR (m.from_user_id = ? AND m.to_user_id = ?)
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT ?
`);
const stGetFriendConversationBefore = appDb.prepare(`
  SELECT m.id, m.from_user_id, m.to_user_id, m.message, m.created_at,
         fp.name AS from_name, fp.tag AS from_tag,
         tp.name AS to_name, tp.tag AS to_tag
  FROM friend_messages m
  JOIN user_profile fp ON fp.user_id = m.from_user_id
  JOIN user_profile tp ON tp.user_id = m.to_user_id
  WHERE (
    (m.from_user_id = ? AND m.to_user_id = ?)
    OR (m.from_user_id = ? AND m.to_user_id = ?)
  )
    AND m.created_at < ?
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT ?
`);
const stGetFriendConversationAfter = appDb.prepare(`
  SELECT m.id, m.from_user_id, m.to_user_id, m.message, m.created_at,
         fp.name AS from_name, fp.tag AS from_tag,
         tp.name AS to_name, tp.tag AS to_tag
  FROM friend_messages m
  JOIN user_profile fp ON fp.user_id = m.from_user_id
  JOIN user_profile tp ON tp.user_id = m.to_user_id
  WHERE (
    (m.from_user_id = ? AND m.to_user_id = ?)
    OR (m.from_user_id = ? AND m.to_user_id = ?)
  )
    AND m.created_at > ?
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT ?
`);
const stGetFriendConversationByRange = appDb.prepare(`
  SELECT m.id, m.from_user_id, m.to_user_id, m.message, m.created_at,
         fp.name AS from_name, fp.tag AS from_tag,
         tp.name AS to_name, tp.tag AS to_tag
  FROM friend_messages m
  JOIN user_profile fp ON fp.user_id = m.from_user_id
  JOIN user_profile tp ON tp.user_id = m.to_user_id
  WHERE (
    (m.from_user_id = ? AND m.to_user_id = ?)
    OR (m.from_user_id = ? AND m.to_user_id = ?)
  )
    AND m.created_at >= ?
    AND m.created_at < ?
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT ?
`);
const stUpsertFriendChatRead = appDb.prepare(`
  INSERT INTO friend_chat_reads (user_id, friend_user_id, last_read_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id, friend_user_id) DO UPDATE SET
    last_read_at=excluded.last_read_at
`);
const stDeleteFriendChatReadPair = appDb.prepare(`
  DELETE FROM friend_chat_reads
  WHERE (user_id = ? AND friend_user_id = ?)
     OR (user_id = ? AND friend_user_id = ?)
`);
const stDeleteFriendInvitesPair = appDb.prepare(`
  DELETE FROM friend_invites
  WHERE (from_user_id = ? AND to_user_id = ?)
     OR (from_user_id = ? AND to_user_id = ?)
`);
const stDeleteFriendRequestsPair = appDb.prepare(`
  DELETE FROM friend_requests
  WHERE (from_user_id = ? AND to_user_id = ?)
     OR (from_user_id = ? AND to_user_id = ?)
`);

function normalizeRunMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (RUN_LEADERBOARD_MODES.has(v)) return v;
  return '';
}

function sanitizeRunPayload(payload) {
  return {
    stage: Math.max(1, Math.floor(Number(payload?.stage || 1))),
    score: Math.max(0, Math.floor(Number(payload?.score || 0))),
    timeSec: Math.max(0, Number(payload?.timeSec || 0)),
    kills: Math.max(0, Math.floor(Number(payload?.kills || 0)))
  };
}

function shouldReplaceRunEntry(prev, next) {
  if (!prev) return true;
  if (next.stage !== prev.best_stage) return next.stage > prev.best_stage;
  if (next.score !== prev.best_score) return next.score > prev.best_score;
  if (next.kills !== prev.best_kills) return next.kills > prev.best_kills;
  return next.timeSec > prev.best_time_sec;
}

function upsertRunLeaderboard(mode, userId, name, payload) {
  const safeMode = normalizeRunMode(mode);
  if (!safeMode || !userId) return null;
  const safe = sanitizeRunPayload(payload);
  const prev = stGetRunLeaderboardEntry.get(safeMode, userId);
  const out = shouldReplaceRunEntry(prev, safe)
    ? {
      mode: safeMode,
      user_id: userId,
      name: String(name || 'Player'),
      best_stage: safe.stage,
      best_score: safe.score,
      best_time_sec: safe.timeSec,
      best_kills: safe.kills,
      updated_at: Date.now()
    }
    : {
      mode: safeMode,
      user_id: userId,
      name: String(name || prev?.name || 'Player'),
      best_stage: Math.max(1, Math.floor(Number(prev?.best_stage || 1))),
      best_score: Math.max(0, Math.floor(Number(prev?.best_score || 0))),
      best_time_sec: Math.max(0, Number(prev?.best_time_sec || 0)),
      best_kills: Math.max(0, Math.floor(Number(prev?.best_kills || 0))),
      updated_at: Date.now()
    };
  stUpsertRunLeaderboardEntry.run(
    out.mode,
    out.user_id,
    out.name,
    out.best_stage,
    out.best_score,
    out.best_time_sec,
    out.best_kills,
    out.updated_at
  );
  return stGetRunLeaderboardEntry.get(safeMode, userId);
}

function randomToken(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function createUniqueUserTag() {
  for (let i = 0; i < 30; i += 1) {
    const tag = randomToken(8);
    const exists = stGetUserProfileByTag.get(tag);
    if (!exists) return tag;
  }
  return `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
}

function ensureUserProfile(userId, name) {
  if (!userId) return null;
  const now = Date.now();
  const safeName = String(name || 'Player').slice(0, 24) || 'Player';
  const prev = stGetUserProfile.get(userId);
  if (!prev) {
    const tag = createUniqueUserTag();
    stInsertUserProfile.run(userId, safeName, tag, now);
    return stGetUserProfile.get(userId);
  }
  if (String(prev.name || '') !== safeName) {
    stUpdateUserProfileName.run(safeName, now, userId);
  }
  return stGetUserProfile.get(userId);
}

function areFriends(userId, otherUserId) {
  if (!userId || !otherUserId || userId === otherUserId) return false;
  return !!stGetFriendLink.get(userId, otherUserId);
}

const txCreateFriendPair = appDb.transaction((userId, otherUserId) => {
  const now = Date.now();
  stInsertFriendLink.run(userId, otherUserId, now);
  stInsertFriendLink.run(otherUserId, userId, now);
});
const txRemoveFriendPair = appDb.transaction((userId, otherUserId) => {
  stDeleteFriendLink.run(userId, otherUserId);
  stDeleteFriendLink.run(otherUserId, userId);
  stDeleteFriendChatReadPair.run(userId, otherUserId, otherUserId, userId);
  stDeleteFriendInvitesPair.run(userId, otherUserId, otherUserId, userId);
  stDeleteFriendRequestsPair.run(userId, otherUserId, otherUserId, userId);
});

function createFriendInvite(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return null;
  const existing = stFindPendingInviteByPair.get(fromUserId, toUserId);
  if (existing) return existing;
  const now = Date.now();
  const partyKey = randomToken(24);
  stInsertFriendInvite.run(fromUserId, toUserId, partyKey, now, now);
  return stFindPendingInviteByPair.get(fromUserId, toUserId);
}

function createFriendRequest(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return null;
  if (areFriends(fromUserId, toUserId)) return { alreadyFriends: true };
  const direct = stFindPendingFriendRequestByPair.get(fromUserId, toUserId);
  if (direct) return direct;
  const reverse = stFindPendingFriendRequestByPair.get(toUserId, fromUserId);
  if (reverse) return { reversePending: true, request: reverse };
  const now = Date.now();
  stInsertFriendRequest.run(fromUserId, toUserId, now, now);
  return stFindPendingFriendRequestByPair.get(fromUserId, toUserId);
}

function sanitizeChatMessage(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.slice(0, 240);
}

function parseChatDayRange(dayText) {
  const src = String(dayText || '').trim();
  const m = src.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(startDate.getTime())) return null;
  if (startDate.getFullYear() !== year || startDate.getMonth() !== month - 1 || startDate.getDate() !== day) return null;
  const endDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    startMs: startDate.getTime(),
    endMs: endDate.getTime()
  };
}

function ensurePvpPlayer(userId, name) {
  if (!userId) return null;
  const now = Date.now();
  const safeName = String(name || 'Player');
  stInsertPlayer.run({ user_id: userId, name: safeName, updated_at: now });
  ensureUserProfile(userId, safeName);
  return stGetPlayer.get(userId);
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getEloKFactor(rating, matches) {
  const safeRating = Math.max(0, Number(rating) || 0);
  const safeMatches = Math.max(0, Math.floor(Number(matches) || 0));
  if (safeMatches < 30) return 40; // provisional
  if (safeRating >= 2400) return 16; // high rating stabilization
  return 24; // default
}

function recordPvpResult(winnerUserId, loserUserId, reason = 'hp_zero') {
  if (!winnerUserId || !loserUserId || winnerUserId === loserUserId) return null;
  const now = Date.now();
  const winner = stGetPlayer.get(winnerUserId);
  const loser = stGetPlayer.get(loserUserId);
  if (!winner || !loser) return null;

  const expW = expectedScore(winner.mmr, loser.mmr);
  const kW = getEloKFactor(winner.mmr, winner.matches);
  const kL = getEloKFactor(loser.mmr, loser.matches);
  const k = Math.round((kW + kL) / 2);
  const delta = Math.max(1, Math.round(k * (1 - expW)));
  const winnerNext = Math.max(100, Math.round(winner.mmr + delta));
  const loserNext = Math.max(100, Math.round(loser.mmr - delta));

  const tx = pvpDb.transaction(() => {
    stUpdateWinner.run(winnerNext, now, winnerUserId);
    stUpdateLoser.run(loserNext, now, loserUserId);
    stInsertMatch.run(
      now,
      winnerUserId,
      loserUserId,
      winner.mmr,
      winnerNext,
      loser.mmr,
      loserNext,
      String(reason || 'hp_zero')
    );
  });
  tx();

  return {
    winner: stGetPlayer.get(winnerUserId),
    loser: stGetPlayer.get(loserUserId)
  };
}

function sanitizeProgressPayload(payload) {
  const goldRaw = Number(payload?.gold ?? 0);
  const gold = Number.isFinite(goldRaw) ? Math.max(0, Math.floor(goldRaw)) : 0;

  const ownedRaw = payload?.relicState?.owned && typeof payload.relicState.owned === 'object'
    ? payload.relicState.owned
    : {};
  const owned = {};
  Object.entries(ownedRaw).forEach(([id, v]) => {
    if (v) owned[String(id)] = true;
  });
  const equippedRaw = Array.isArray(payload?.relicState?.equipped) ? payload.relicState.equipped : [];
  const equipped = equippedRaw
    .map((id) => String(id))
    .filter((id, idx, arr) => !!owned[id] && arr.indexOf(id) === idx)
    .slice(0, 3);
  const relicState = { owned, equipped };

  const recordsRaw = Array.isArray(payload?.records) ? payload.records : [];
  const records = recordsRaw
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      name: String(r?.name ?? 'PLAYER').slice(0, 24),
      mode: normalizeRunMode(r?.mode) || (String(r?.mode || '').toLowerCase() === 'defense' ? 'defense' : 'survival'),
      totalScore: Math.max(0, Math.floor(Number(r?.totalScore) || 0)),
      timeSec: Math.max(0, Number(r?.timeSec) || 0),
      kills: Math.max(0, Math.floor(Number(r?.kills) || 0)),
      stage: Math.max(1, Math.floor(Number(r?.stage) || 1)),
      level: Math.max(1, Math.floor(Number(r?.level) || 1)),
      createdAt: Math.max(0, Math.floor(Number(r?.createdAt) || Date.now()))
    }))
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.timeSec - a.timeSec;
    })
    .slice(0, 200);

  return { gold, relicState, records };
}

function readProgress(userId) {
  const row = stGetProgress.get(userId);
  if (!row) {
    return {
      userId,
      gold: 0,
      relicState: { owned: {}, equipped: [] },
      records: [],
      updatedAt: 0
    };
  }
  let relicState = { owned: {}, equipped: [] };
  let records = [];
  try {
    const parsed = JSON.parse(String(row.relic_state || '{}'));
    const safe = sanitizeProgressPayload({ relicState: parsed, records: [], gold: row.gold });
    relicState = safe.relicState;
  } catch {
    relicState = { owned: {}, equipped: [] };
  }
  try {
    const parsed = JSON.parse(String(row.records || '[]'));
    const safe = sanitizeProgressPayload({ relicState: { owned: {}, equipped: [] }, records: parsed, gold: row.gold });
    records = safe.records;
  } catch {
    records = [];
  }
  return {
    userId,
    gold: Math.max(0, Math.floor(Number(row.gold) || 0)),
    relicState,
    records,
    updatedAt: Math.max(0, Math.floor(Number(row.updated_at) || 0))
  };
}

class PlayerState extends Schema {
  constructor() {
    super();
    this.userId = '';
    this.name = '';
    this.x = 0;
    this.y = 0;
    this.hp = MAX_HP_BASE;
    this.maxHp = MAX_HP_BASE;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 30;
    this.facingX = 1;
    this.facingY = 0;
  }
}
defineTypes(PlayerState, {
  userId: 'string',
  name: 'string',
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  level: 'number',
  xp: 'number',
  xpToNext: 'number',
  facingX: 'number',
  facingY: 'number'
});

class EnemyState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.type = 'scout';
    this.x = 0;
    this.y = 0;
    this.hp = 10;
    this.maxHp = 10;
    this.speed = 100;
  }
}
defineTypes(EnemyState, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  speed: 'number'
});

class BattleState extends Schema {
  constructor() {
    super();
    this.phase = 'waiting';
    this.winnerSid = '';
    this.elapsedSec = 0;
    this.players = new MapSchema();
    this.enemies = new MapSchema();
  }
}
defineTypes(BattleState, {
  phase: 'string',
  winnerSid: 'string',
  elapsedSec: 'number',
  players: { map: PlayerState },
  enemies: { map: EnemyState }
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function parseBoolParam(rawValue, fallback = false) {
  if (rawValue == null) return fallback;
  const v = String(rawValue).trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcXpToNext(level) {
  const lv = Math.max(1, Math.floor(level));
  return Math.max(1, Math.floor(30 * Math.pow(lv, 1.35)));
}

function normalizeSkillKey(key) {
  return String(key || 'SKILL').trim().toUpperCase() || 'SKILL';
}

function getSkillRank(profile, key) {
  const skillKey = normalizeSkillKey(key);
  return Math.max(0, Math.floor(Number(profile?.ranks?.[skillKey] || 0)));
}

function getServerAttackCooldownMs(kind, key) {
  if (kind === 'skill') {
    const skillKey = normalizeSkillKey(key);
    return SERVER_SKILL_MIN_COOLDOWN_MS[skillKey] ?? SERVER_SKILL_MIN_COOLDOWN_MS.SKILL;
  }
  return SHOT_COOLDOWN_MS_BASE;
}

function getServerAuthorizedDamage(kind, key, attackerLevel, targetType = 'pvp', profile = null) {
  const lv = clamp(Math.floor(Number(attackerLevel) || 1), 1, 120);
  const atkMul = Math.max(0.2, Number(profile?.atkMul || 1));
  const critChance = clamp(Number(profile?.critChance || 0), 0, 0.75);
  const critMul = 1 + (Math.random() < critChance ? 0.6 : 0);
  if (kind === 'skill') {
    const skillKey = normalizeSkillKey(key);
    const skillRank = getSkillRank(profile, skillKey);
    if (skillRank <= 0) return 0;
    const base = SERVER_SKILL_BASE_DAMAGE[skillKey] ?? SERVER_SKILL_BASE_DAMAGE.SKILL;
    const skillMul = 1 + (skillRank * 0.08);
    const lvMul = 1 + (lv - 1) * 0.08;
    const targetMul = targetType === 'pve' ? 1.08 : 1;
    const out = Math.round(base * lvMul * targetMul * atkMul * skillMul * critMul);
    return clamp(out, 1, targetType === 'pve' ? 180 : 120);
  }
  const basic = Math.round((5.8 + lv * 0.65) * (targetType === 'pve' ? 1.06 : 1) * atkMul * critMul);
  return clamp(basic, 1, targetType === 'pve' ? 32 : 26);
}

function getServerLifeStealRatio(profile = null) {
  const slash = getSkillRank(profile, 'FWD_SLASH') > 0;
  const dash = getSkillRank(profile, 'DASH') > 0;
  const spin = getSkillRank(profile, 'SPIN_SLASH') > 0;
  return slash && dash && spin ? 0.12 : 0;
}

function getServerRangeAndArc(kind, key, profile = null) {
  const skillKey = kind === 'skill' ? normalizeSkillKey(key) : 'BASIC';
  const rangeMul = Math.max(0.25, Number(profile?.rangeMul || 1));
  const rank = getSkillRank(profile, skillKey);
  let baseRange = SERVER_SKILL_RANGE[skillKey] ?? SERVER_SKILL_RANGE.SKILL;
  let baseArcDot = SERVER_SKILL_ARC_DOT[skillKey] ?? SERVER_SKILL_ARC_DOT.SKILL;
  if (skillKey === 'BASIC') {
    // Client bullets may travel long distances before contact callback.
    baseRange = 1800;
    baseArcDot = -1;
  } else if (skillKey === 'SHOCKWAVE') {
    baseRange = (70 + 5 * Math.max(1, rank)) * 1.5 + 24;
    baseArcDot = -1;
  } else if (skillKey === 'LASER') {
    baseRange = 720 + 40 * Math.max(1, rank);
    baseArcDot = 0.45;
  } else if (skillKey === 'GRENADE') {
    const throwRange = 210 + 14 * Math.max(1, rank);
    const explodeRadius = 110 + 10 * Math.max(1, rank);
    baseRange = throwRange + explodeRadius + 24;
    baseArcDot = -1;
  } else if (skillKey === 'FWD_SLASH') {
    baseRange = 120 + 10 * Math.max(1, rank) + 34;
    baseArcDot = 0.62;
  } else if (skillKey === 'DASH') {
    baseRange = 210 + 16 * Math.max(1, rank) + 38;
    baseArcDot = 0.35;
  } else if (skillKey === 'SPIN_SLASH') {
    baseRange = 85 + 8 * Math.max(1, rank) + 28;
    baseArcDot = -1;
  } else if (skillKey === 'CHAIN_LIGHTNING') {
    baseRange = 520 + 25 * Math.max(1, rank) + 18;
    baseArcDot = -1;
  } else if (skillKey === 'BLIZZARD') {
    const castRange = 180 + 8 * Math.max(1, rank);
    const radius = 95 + 10 * Math.max(1, rank);
    baseRange = castRange + radius + 18;
    baseArcDot = -1;
  } else if (skillKey === 'FIRE_BOLT') {
    const maxRange = 560 + 30 * Math.max(1, rank);
    const explodeRadius = 85 + 10 * Math.max(1, rank);
    baseRange = maxRange + explodeRadius + 20;
    baseArcDot = -1;
  }
  return {
    range: baseRange * rangeMul,
    arcDot: baseArcDot
  };
}

function normalizeAim(ax, ay, fallbackX = 1, fallbackY = 0) {
  const x = Number.isFinite(ax) ? Number(ax) : Number(fallbackX || 1);
  const y = Number.isFinite(ay) ? Number(ay) : Number(fallbackY || 0);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function consumeUniqueHit(map, key, now, ttlMs = 4000) {
  const prevUntil = Number(map.get(key) || 0);
  if (prevUntil > now) return false;
  map.set(key, now + Math.max(100, Math.floor(ttlMs)));
  return true;
}

function gcExpiryMap(map, now, maxSize = 10000) {
  if (!(map instanceof Map)) return;
  if (map.size <= maxSize) return;
  for (const [k, until] of map.entries()) {
    if (Number(until) <= now) map.delete(k);
  }
  if (map.size <= maxSize) return;
  const drop = map.size - maxSize;
  let n = 0;
  for (const k of map.keys()) {
    map.delete(k);
    n += 1;
    if (n >= drop) break;
  }
}

function pickCards(n = 3) {
  const pool = [...CARD_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

class BattleRoom extends Room {
  onCreate() {
    this.maxClients = 2;
    this.setState(new BattleState());
    this.inputs = new Map();
    this.playerMeta = new Map();
    this.lastContactAt = new Map();
    this.enemySeq = 1;
    this.spawnAccMs = 0;
    this.startedAt = Date.now();

    this.setSimulationInterval((dt) => this.update(dt));

    this.onMessage('input', (client, msg) => {
      if (!this.state.players.has(client.sessionId)) return;
      const cur = this.inputs.get(client.sessionId) || { mx: 0, my: 0, ax: 1, ay: 0, shoot: false };
      cur.mx = Number(msg?.mx || 0);
      cur.my = Number(msg?.my || 0);
      cur.ax = Number(msg?.ax || 1);
      cur.ay = Number(msg?.ay || 0);
      cur.shoot = !!msg?.shoot;
      this.inputs.set(client.sessionId, cur);
    });

    this.onMessage('levelup.pick', (client, msg) => {
      const key = String(msg?.key || '');
      this.applyLevelChoice(client.sessionId, key);
    });
  }

  onAuth(_client, options, authContext) {
    const token = String(options?.token || authContext?.token || '');
    if (!token) throw new Error('missing_token');
    const payload = jwt.verify(token, JWT_SECRET);
    const decoded = (payload && typeof payload === 'object') ? payload : {};
    const userId = String(decoded.sub || decoded.userId || '');
    if (!userId) throw new Error('invalid_token');
    return {
      userId,
      name: String(decoded.name || decoded.email || 'Player')
    };
  }

  onJoin(client, _options, auth) {
    const safeAuth = (auth && typeof auth === 'object') ? auth : {};
    if (!safeAuth.userId) {
      client.leave(4001, 'auth_required');
      return;
    }

    const spawnX = this.clients.length === 1 ? WORLD_W * 0.5 - 160 : WORLD_W * 0.5 + 160;
    const p = new PlayerState();
    p.userId = String(safeAuth.userId);
    p.name = String(safeAuth.name || 'Player');
    p.x = spawnX;
    p.y = WORLD_H * 0.5;
    p.hp = MAX_HP_BASE;
    p.maxHp = MAX_HP_BASE;
    p.level = 1;
    p.xp = 0;
    p.xpToNext = calcXpToNext(1);
    p.facingX = this.clients.length === 1 ? 1 : -1;
    p.facingY = 0;

    this.state.players.set(client.sessionId, p);
    this.inputs.set(client.sessionId, { mx: 0, my: 0, ax: p.facingX, ay: 0, shoot: false });
    this.playerMeta.set(client.sessionId, {
      damage: SHOT_DAMAGE_BASE,
      shotCooldownMs: SHOT_COOLDOWN_MS_BASE,
      shotRange: SHOT_RANGE_BASE,
      moveSpeed: MOVE_SPEED_BASE,
      lastShotAt: 0,
      pendingLevels: 0,
      pendingChoices: null,
      choiceDeadlineAt: 0
    });

    if (this.clients.length < 2) {
      client.send('match.waiting', { players: this.clients.length });
      return;
    }

    this.state.phase = 'running';
    this.state.elapsedSec = 0;
    this.startedAt = Date.now();
    this.spawnAccMs = 0;

    this.broadcast('match.start', {
      players: Array.from(this.state.players.entries()).map(([sid, st]) => ({
        sid,
        userId: st.userId,
        name: st.name,
        hp: st.hp,
        level: st.level
      }))
    });
  }

  onLeave(client) {
    const leavingSid = client.sessionId;
    if (this.state.phase !== 'ended') {
      const otherSid = Array.from(this.state.players.keys()).find((sid) => sid !== leavingSid) || '';
      this.endMatch(otherSid, 'disconnect');
    }
    this.state.players.delete(leavingSid);
    this.inputs.delete(leavingSid);
    this.playerMeta.delete(leavingSid);
  }

  endMatch(winnerSid, reason) {
    if (this.state.phase === 'ended') return;
    this.state.phase = 'ended';
    this.state.winnerSid = winnerSid || '';
    this.broadcast('match.end', {
      winnerSid: winnerSid || null,
      reason
    });
    this.clock.setTimeout(() => this.disconnect(), 2200);
  }

  update(dt) {
    if (this.state.phase !== 'running') return;
    const dtSec = dt / 1000;
    this.state.elapsedSec = (Date.now() - this.startedAt) / 1000;

    this.updatePlayers(dtSec);
    this.updateEnemySpawning(dt);
    this.updateEnemies(dtSec);

    const now = Date.now();
    this.updateShooting(now);
    this.updateLevelChoiceTimeouts(now);

    for (const [sid, p] of this.state.players.entries()) {
      if (p.hp <= 0) {
        const winnerSid = Array.from(this.state.players.keys()).find((otherSid) => otherSid !== sid) || '';
        this.endMatch(winnerSid, 'hp_zero');
        return;
      }
    }
  }

  updatePlayers(dtSec) {
    for (const [sid, p] of this.state.players.entries()) {
      const input = this.inputs.get(sid) || { mx: 0, my: 0, ax: 1, ay: 0, shoot: false };
      const meta = this.playerMeta.get(sid);
      if (!meta) continue;

      const len = Math.hypot(input.mx, input.my);
      const nx = len > 0 ? input.mx / len : 0;
      const ny = len > 0 ? input.my / len : 0;
      p.x = clamp(p.x + nx * meta.moveSpeed * dtSec, ARENA_MIN_X, ARENA_MAX_X);
      p.y = clamp(p.y + ny * meta.moveSpeed * dtSec, ARENA_MIN_Y, ARENA_MAX_Y);

      const al = Math.hypot(input.ax, input.ay);
      if (al > 0.001) {
        p.facingX = input.ax / al;
        p.facingY = input.ay / al;
      }
    }
  }

  updateEnemySpawning(dtMs) {
    if (this.state.players.size < 2) return;
    this.spawnAccMs += dtMs;

    const elapsed = this.state.elapsedSec;
    const spawnEveryMs = Math.max(360, 1300 - elapsed * 12);
    const alive = this.state.enemies.size;
    const aliveCap = Math.min(96, 18 + Math.floor(elapsed / 7));
    if (alive >= aliveCap) return;

    while (this.spawnAccMs >= spawnEveryMs) {
      this.spawnAccMs -= spawnEveryMs;
      this.spawnEnemy();
      if (this.state.enemies.size >= aliveCap) break;
    }
  }

  spawnEnemy() {
    const elapsed = this.state.elapsedSec;
    const r = Math.random();
    let type = 'scout';
    if (elapsed > 45 && r > 0.75) type = 'brute';
    if (elapsed > 90 && r > 0.9) type = 'elite';

    const e = new EnemyState();
    e.id = `e_${this.enemySeq++}`;
    e.type = type;

    const players = Array.from(this.state.players.values());
    const anchorX = players.length > 0
      ? players.reduce((acc, p) => acc + p.x, 0) / players.length
      : WORLD_W * 0.5;
    const anchorY = players.length > 0
      ? players.reduce((acc, p) => acc + p.y, 0) / players.length
      : WORLD_H * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const radius = randInt(460, 760);
    e.x = clamp(anchorX + Math.cos(angle) * radius, ARENA_MIN_X, ARENA_MAX_X);
    e.y = clamp(anchorY + Math.sin(angle) * radius, ARENA_MIN_Y, ARENA_MAX_Y);

    if (type === 'brute') {
      e.maxHp = Math.floor(36 + elapsed * 0.45);
      e.speed = 95 + Math.min(55, elapsed * 0.35);
    } else if (type === 'elite') {
      e.maxHp = Math.floor(62 + elapsed * 0.6);
      e.speed = 120 + Math.min(70, elapsed * 0.4);
    } else {
      e.maxHp = Math.floor(18 + elapsed * 0.32);
      e.speed = 110 + Math.min(65, elapsed * 0.35);
    }
    e.hp = e.maxHp;

    this.state.enemies.set(e.id, e);
  }

  updateEnemies(dtSec) {
    for (const [enemyId, e] of this.state.enemies.entries()) {
      const target = this.getNearestPlayer(e.x, e.y);
      if (!target) continue;

      const dx = target.player.x - e.x;
      const dy = target.player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      e.x = clamp(e.x + nx * e.speed * dtSec, ARENA_MIN_X, ARENA_MAX_X);
      e.y = clamp(e.y + ny * e.speed * dtSec, ARENA_MIN_Y, ARENA_MAX_Y);

      if (dist <= PLAYER_CONTACT_RADIUS) {
        const key = `${target.sid}|${enemyId}`;
        const now = Date.now();
        const last = this.lastContactAt.get(key) || 0;
        if (now - last >= 440) {
          this.lastContactAt.set(key, now);
          const dmg = ENEMY_CONTACT_DAMAGE[e.type] || 7;
          target.player.hp = Math.max(0, target.player.hp - dmg);
          this.broadcast('combat.hit', {
            bySid: enemyId,
            toSid: target.sid,
            targetType: 'player',
            damage: dmg,
            hp: target.player.hp
          });
        }
      }
    }
  }

  getNearestPlayer(x, y) {
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [sid, p] of this.state.players.entries()) {
      if (p.hp <= 0) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = { sid, player: p };
      }
    }
    return best;
  }

  updateShooting(now) {
    for (const [sid, p] of this.state.players.entries()) {
      const input = this.inputs.get(sid);
      const meta = this.playerMeta.get(sid);
      if (!input || !meta) continue;
      if (!input.shoot) continue;
      if (now - meta.lastShotAt < meta.shotCooldownMs) continue;
      meta.lastShotAt = now;
      this.performShot(sid, p, input, meta);
    }
  }

  performShot(shooterSid, shooter, input, meta) {
    const aimLen = Math.hypot(input.ax, input.ay);
    if (aimLen <= 0.0001) return;
    const ax = input.ax / aimLen;
    const ay = input.ay / aimLen;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const [sid, target] of this.state.players.entries()) {
      if (sid === shooterSid || target.hp <= 0) continue;
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > meta.shotRange) continue;
      const nx = dx / Math.max(1, dist);
      const ny = dy / Math.max(1, dist);
      if (ax * nx + ay * ny < SHOT_ARC_DOT) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: 'player', sid };
      }
    }

    for (const [enemyId, enemy] of this.state.enemies.entries()) {
      const dx = enemy.x - shooter.x;
      const dy = enemy.y - shooter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > meta.shotRange) continue;
      const nx = dx / Math.max(1, dist);
      const ny = dy / Math.max(1, dist);
      if (ax * nx + ay * ny < SHOT_ARC_DOT) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: 'enemy', enemyId };
      }
    }

    if (!best) return;

    if (best.kind === 'player') {
      const target = this.state.players.get(best.sid);
      if (!target) return;
      target.hp = Math.max(0, target.hp - meta.damage);
      this.broadcast('combat.hit', {
        bySid: shooterSid,
        toSid: best.sid,
        targetType: 'player',
        damage: meta.damage,
        hp: target.hp
      });
      if (target.hp <= 0) {
        this.endMatch(shooterSid, 'hp_zero');
      }
      return;
    }

    const enemy = this.state.enemies.get(best.enemyId);
    if (!enemy) return;
    enemy.hp = Math.max(0, enemy.hp - meta.damage);
    this.broadcast('combat.hit', {
      bySid: shooterSid,
      toSid: best.enemyId,
      targetType: 'enemy',
      damage: meta.damage,
      hp: enemy.hp
    });

    if (enemy.hp <= 0) {
      const xpGain = enemy.type === 'elite' ? 28 : enemy.type === 'brute' ? 16 : 10;
      this.state.enemies.delete(best.enemyId);
      this.grantXp(shooterSid, xpGain);
    }
  }

  grantXp(sid, amount) {
    const p = this.state.players.get(sid);
    const meta = this.playerMeta.get(sid);
    if (!p || !meta || amount <= 0) return;

    p.xp += amount;
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.maxHp += 2;
      p.hp = Math.min(p.maxHp, p.hp + 4);
      p.xpToNext = calcXpToNext(p.level);
      meta.pendingLevels += 1;
    }

    if (!meta.pendingChoices && meta.pendingLevels > 0) {
      this.issueLevelChoices(sid);
    }
  }

  issueLevelChoices(sid) {
    const p = this.state.players.get(sid);
    const meta = this.playerMeta.get(sid);
    const client = this.clients.find((c) => c.sessionId === sid);
    if (!p || !meta || !client) return;
    if (meta.pendingLevels <= 0 || meta.pendingChoices) return;

    const choices = pickCards(3);
    meta.pendingLevels -= 1;
    meta.pendingChoices = choices;
    meta.choiceDeadlineAt = Date.now() + 10000;

    client.send('levelup.offer', {
      level: p.level,
      choices
    });
  }

  updateLevelChoiceTimeouts(now) {
    for (const [sid, meta] of this.playerMeta.entries()) {
      if (!meta.pendingChoices) continue;
      if (now < meta.choiceDeadlineAt) continue;
      const fallback = Array.isArray(meta.pendingChoices) ? String(meta.pendingChoices[0] || '') : '';
      this.applyLevelChoice(sid, fallback);
    }
  }

  applyLevelChoice(sid, selectedKey) {
    const p = this.state.players.get(sid);
    const meta = this.playerMeta.get(sid);
    const client = this.clients.find((c) => c.sessionId === sid);
    if (!p || !meta || !client || !meta.pendingChoices) return;

    const choices = Array.isArray(meta.pendingChoices) ? meta.pendingChoices : [];
    const key = choices.includes(selectedKey) ? selectedKey : String(choices[0] || '');
    if (!key) {
      meta.pendingChoices = null;
      meta.choiceDeadlineAt = 0;
      return;
    }

    if (key === 'ATK_UP') {
      meta.damage += 2;
    } else if (key === 'FIRE_RATE_UP') {
      meta.shotCooldownMs = Math.max(115, Math.floor(meta.shotCooldownMs * 0.88));
    } else if (key === 'MAX_HP_UP') {
      p.maxHp += 12;
      p.hp = Math.min(p.maxHp, p.hp + 12);
    } else if (key === 'MOVE_SPEED_UP') {
      meta.moveSpeed = Math.min(420, meta.moveSpeed + 22);
    } else if (key === 'SHOT_RANGE_UP') {
      meta.shotRange = Math.min(980, meta.shotRange + 70);
    } else if (key === 'HEAL_UP') {
      p.hp = Math.min(p.maxHp, p.hp + 18);
    }

    meta.pendingChoices = null;
    meta.choiceDeadlineAt = 0;
    client.send('levelup.applied', {
      key,
      level: p.level
    });

    if (meta.pendingLevels > 0) {
      this.issueLevelChoices(sid);
    }
  }
}

class BattleSurvivalRoom extends Room {
  onCreate(options = {}) {
    this.mode = String(options?.mode || 'pvp').toLowerCase() === 'coop' ? 'coop' : 'pvp';
    this.isCoopMode = this.mode === 'coop';
    this.partyKey = this.isCoopMode ? String(options?.partyKey || '').trim() : '';
    const debugEnabled = parseBoolParam(options?.debug, false);
    const debugStageRaw = Math.floor(Number(options?.debugStage || 0));
    this.debugCoopStage = (this.isCoopMode && debugEnabled && Number.isFinite(debugStageRaw))
      ? clamp(debugStageRaw, 0, COOP_FINAL_STAGE)
      : 0;
    this.debugCoopForceDash = this.isCoopMode && debugEnabled && parseBoolParam(options?.debugDash, false);
    this.maxClients = 2;
    this.setState(new BattleState());
    this.sessionAuth = new Map();
    this.resultCommitted = false;
    this.pveEnemies = new Map();
    this.lastDamageAt = new Map();
    this.lastAttackAt = new Map();
    this.seenHitIds = new Map();
    this.playerCombat = new Map();
    this.playerMotion = new Map();
    this.playerInputs = new Map();
    this.pveContactAt = new Map();
    this.pveSpawnAccMs = 0;
    this.pveSyncAccMs = 0;
    this.pveSeq = 1;
    this.pveBossAttacks = [];
    this.coopStage = 1;
    this.coopStageKills = 0;
    this.coopStageKillGoal = this.getCoopStageKillGoal(1);
    this.coopReviveHolds = new Map();
    this.coopReviveStatusSig = new Map();
    this.startedAt = Date.now();
    this.roundStartAt = 0;
    this.setSimulationInterval((dt) => this.updatePve(dt));

    this.refreshCoopPartyState();

    this.onMessage('state', (c, msg) => {
      const st = this.state.players.get(c.sessionId);
      if (!st) return;
      const imx = Number(msg?.mx);
      const imy = Number(msg?.my);
      const prevInput = this.playerInputs.get(c.sessionId) || { mx: 0, my: 0 };
      if (Number.isFinite(imx) && Number.isFinite(imy)) {
        prevInput.mx = imx;
        prevInput.my = imy;
      }
      this.playerInputs.set(c.sessionId, prevInput);
      const auth = this.sessionAuth.get(c.sessionId);
      const fixedName = String(auth?.name || st.name || 'Player');
      if (this.state.phase !== 'running') {
        st.name = fixedName;
        const fax = Number(msg?.ax);
        const fay = Number(msg?.ay);
        if (Number.isFinite(fax) && Number.isFinite(fay)) {
          const al = Math.hypot(fax, fay) || 1;
          st.facingX = fax / al;
          st.facingY = fay / al;
        }
        return;
      }
      st.name = fixedName;
      const fax = Number(msg?.ax);
      const fay = Number(msg?.ay);
      if (Number.isFinite(fax) && Number.isFinite(fay)) {
        const al = Math.hypot(fax, fay) || 1;
        st.facingX = fax / al;
        st.facingY = fay / al;
      }
    });

    this.onMessage('pvp.damage', (c, msg) => {
      if (this.isCoopMode) return;
      if (this.state.phase !== 'running') return;
      const attacker = this.state.players.get(c.sessionId);
      if (!attacker) return;
      const toSid = String(msg?.toSid || '');
      const kind = String(msg?.kind || 'basic').toLowerCase();
      const skillKey = String(msg?.key || (kind === 'skill' ? 'SKILL' : 'BASIC')).toUpperCase();
      const hitId = String(msg?.hitId || '');
      const rawDmg = Math.floor(Number(msg?.damage || 0));
      const aimMsg = normalizeAim(msg?.ax, msg?.ay, attacker?.facingX ?? 1, attacker?.facingY ?? 0);
      const fromSid = c.sessionId;
      if (!rawDmg) return;
      const damageKey = `${fromSid}|${toSid || 'auto'}`;
      const now = Date.now();
      const prev = this.lastDamageAt.get(damageKey) || 0;
      if (now - prev < 45) return; // basic anti-spam guard
      this.lastDamageAt.set(damageKey, now);
      let targetSid = toSid;
      if (!targetSid || targetSid === fromSid || !this.state.players.has(targetSid)) {
        targetSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== fromSid && this.state.players.has(sid)) || '';
      }
      if (!targetSid) return;
      if (hitId) {
        const hitKey = `pvp|${fromSid}|${targetSid}|${hitId}`;
        if (!consumeUniqueHit(this.seenHitIds, hitKey, now, 5000)) return;
      }
      const target = this.state.players.get(targetSid);
      if (!attacker || !target) return;
      if (attacker.hp <= 0 || target.hp <= 0) return;
      const combat = this.getCombatProfile(fromSid);

      const hitDx = target.x - attacker.x;
      const hitDy = target.y - attacker.y;
      const hitDist = Math.hypot(hitDx, hitDy);
      const p = getServerRangeAndArc(kind, skillKey, combat);
      if (hitDist > p.range) return;
      if (p.arcDot > -0.9) {
        const inv = 1 / Math.max(1e-6, hitDist);
        const nx = hitDx * inv;
        const ny = hitDy * inv;
        const dot = aimMsg.x * nx + aimMsg.y * ny;
        if (dot < p.arcDot) return;
      }

      const keyCooldownMs = Math.max(40, Math.round(getServerAttackCooldownMs(kind, skillKey) * Math.max(0.2, Number(combat.fireRateMul || 1))));
      const atkKey = `${fromSid}|${skillKey}|pvp`;
      const atkPrev = this.lastAttackAt.get(atkKey) || 0;
      if (now - atkPrev < keyCooldownMs) return;
      this.lastAttackAt.set(atkKey, now);

      const dmg = getServerAuthorizedDamage(kind, skillKey, attacker.level, 'pvp', combat);
      if (dmg <= 0) return;
      target.hp = Math.max(0, target.hp - dmg);
      this.broadcast('pvp.damage', { fromSid, toSid: targetSid, damage: dmg, hp: target.hp });
      if (target.hp <= 0 && this.state.phase !== 'ended') {
        this.finalizeMatch(fromSid, 'hp_zero');
      }
    });

    this.onMessage('pvp.fx', (c, msg) => {
      if (this.state.phase !== 'running') return;
      const fromSid = c.sessionId;
      if (!this.state.players.has(fromSid)) return;
      const fxType = String(msg?.type || '');
      if (!fxType) return;
      this.broadcast('pvp.fx', {
        fromSid,
        type: fxType,
        key: String(msg?.key || ''),
        x: Number(msg?.x || 0),
        y: Number(msg?.y || 0),
        ax: Number(msg?.ax || 0),
        ay: Number(msg?.ay || 0)
      });
    });

    this.onMessage('pve.damage', (c, msg) => {
      if (this.state.phase !== 'running') return;
      const fromSid = c.sessionId;
      if (!this.state.players.has(fromSid)) return;
      const id = String(msg?.id || '');
      const kind = String(msg?.kind || 'basic').toLowerCase();
      const skillKey = String(msg?.key || (kind === 'skill' ? 'SKILL' : 'BASIC')).toUpperCase();
      const hitId = String(msg?.hitId || '');
      const rawDmg = Math.floor(Number(msg?.damage || 0));
      if (!id || !rawDmg) return;
      const e = this.pveEnemies.get(id);
      if (!e) return;
      const now = Date.now();
      if (hitId) {
        const hitKey = `pve|${fromSid}|${id}|${hitId}`;
        if (!consumeUniqueHit(this.seenHitIds, hitKey, now, 5000)) return;
      }
      const attacker = this.state.players.get(fromSid);
      if (!attacker || attacker.hp <= 0) return;
      const aimMsg = normalizeAim(msg?.ax, msg?.ay, attacker.facingX, attacker.facingY);
      const combat = this.getCombatProfile(fromSid);
      const dx = Number(e.x) - Number(attacker.x);
      const dy = Number(e.y) - Number(attacker.y);
      const distSq = dx * dx + dy * dy;
      const dist = Math.hypot(dx, dy);
      const p = getServerRangeAndArc(kind, skillKey, combat);
      if (dist > p.range) return;
      if (p.arcDot > -0.9) {
        const nx = dx / Math.max(1e-6, dist);
        const ny = dy / Math.max(1e-6, dist);
        const dot = aimMsg.x * nx + aimMsg.y * ny;
        if (dot < p.arcDot) return;
      }
      const skillCdMs = Math.max(40, Math.round(getServerAttackCooldownMs(kind, skillKey) * Math.max(0.2, Number(combat.fireRateMul || 1))));
      const castKey = `${fromSid}|${skillKey}|pve_cast`;
      const burstKey = `${fromSid}|${skillKey}|pve_burst`;
      const castPrev = this.lastAttackAt.get(castKey) || 0;
      const burstUntil = this.lastAttackAt.get(burstKey) || 0;
      const inBurstWindow = now <= burstUntil;
      if (!inBurstWindow) {
        if (now - castPrev < skillCdMs) return;
        this.lastAttackAt.set(castKey, now);
        // Allow a short multi-hit window for one cast/shot so AoE or piercing hits are preserved.
        const burstMs = kind === 'skill' ? 140 : 90;
        this.lastAttackAt.set(burstKey, now + burstMs);
      }
      const hitKey = `${fromSid}|${id}`;
      const last = this.lastDamageAt.get(hitKey) || 0;
      if (now - last < 28) return;
      this.lastDamageAt.set(hitKey, now);
      const dmg = getServerAuthorizedDamage(kind, skillKey, attacker.level, 'pve', combat);
      if (dmg <= 0) return;
      e.hp = Math.max(0, e.hp - dmg);
      if (this.isCoopMode) {
        const lifeStealRatio = getServerLifeStealRatio(combat);
        if (lifeStealRatio > 0 && attacker.hp < attacker.maxHp) {
          combat.lifeStealAcc = Math.max(0, Number(combat.lifeStealAcc || 0)) + (dmg * lifeStealRatio);
          const heal = Math.floor(combat.lifeStealAcc * 10) / 10;
          if (heal > 0) {
            combat.lifeStealAcc = Math.max(0, combat.lifeStealAcc - heal);
            const healedHp = Math.min(attacker.maxHp, attacker.hp + heal);
            attacker.hp = Math.round(healedHp * 10) / 10;
            if (attacker.hp >= attacker.maxHp) combat.lifeStealAcc = 0;
          }
        } else if (lifeStealRatio <= 0) {
          combat.lifeStealAcc = 0;
        }
      }
      this.broadcast('pve.damage', { id, hp: e.hp, damage: dmg, fromSid, attackerHp: attacker.hp });
      if (e.hp <= 0) {
        const xpGain = e.type === 'boss'
          ? 220
          : e.type === 'miniboss'
            ? 82
            : e.type === 'elite'
              ? 28
              : e.type === 'tank'
                ? 16
                : 10;
        this.grantPvpXp(fromSid, xpGain);
        if (String(e.type || '') === 'boss') {
          this.removeBossAttacksBySource(id);
        }
        if (this.isCoopMode) this.onCoopEnemyKilled(String(e.type || ''));
        this.pveEnemies.delete(id);
        this.state.enemies.delete(id);
      } else {
        const stEnemy = this.state.enemies.get(id);
        if (stEnemy) stEnemy.hp = e.hp;
      }
    });

    this.onMessage('pvp.levelup.pick', (c, msg) => {
      const sid = c.sessionId;
      const key = normalizeSkillKey(msg?.key || '');
      if (!key || !PVP_ABILITY_KEYS.has(key)) {
        c.send('pvp.levelup.result', { ok: false, key, reason: 'invalid_key' });
        return;
      }
      const out = this.applyServerLevelupPick(sid, key);
      c.send('pvp.levelup.result', out);
    });

    this.onMessage('pvp.move', (c, msg) => {
      if (this.state.phase !== 'running') return;
      const sid = c.sessionId;
      const st = this.state.players.get(sid);
      if (!st || st.hp <= 0) return;
      const kind = String(msg?.kind || '').toLowerCase();
      if (kind !== 'dash') return;

      const combat = this.getCombatProfile(sid);
      const dashRank = Math.max(0, Math.floor(Number(combat?.ranks?.DASH || 0)));
      if (dashRank <= 0) return;

      const now = Date.now();
      const moveKey = `${sid}|DASH|move`;
      const prev = this.lastAttackAt.get(moveKey) || 0;
      const cdMs = Math.max(550, Math.round((760 - Math.min(260, dashRank * 45)) * Math.max(0.65, Number(combat.fireRateMul || 1))));
      if (now - prev < cdMs) return;
      this.lastAttackAt.set(moveKey, now);

      const fax = Number(msg?.ax);
      const fay = Number(msg?.ay);
      let dirX = 0;
      let dirY = 0;
      if (Number.isFinite(fax) && Number.isFinite(fay)) {
        const fl = Math.hypot(fax, fay);
        if (fl > 1e-6) {
          dirX = fax / fl;
          dirY = fay / fl;
        }
      }
      const txRaw = Number(msg?.x);
      const tyRaw = Number(msg?.y);
      let aimedDist = null;
      if (Number.isFinite(txRaw) && Number.isFinite(tyRaw)) {
        const tx = clamp(txRaw, ARENA_MIN_X, ARENA_MAX_X);
        const ty = clamp(tyRaw, ARENA_MIN_Y, ARENA_MAX_Y);
        const dx = tx - st.x;
        const dy = ty - st.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
          aimedDist = dist;
          if (Math.abs(dirX) < 1e-6 && Math.abs(dirY) < 1e-6) {
            dirX = dx / dist;
            dirY = dy / dist;
          }
        }
      }
      if (Math.abs(dirX) < 1e-6 && Math.abs(dirY) < 1e-6) return;

      const rangeMul = Math.max(0.25, Number(combat.rangeMul || 1));
      const maxDashDist = (210 + 16 * dashRank) * rangeMul + 30;
      const moveDist = Math.min(
        Number.isFinite(aimedDist) ? aimedDist : maxDashDist,
        maxDashDist
      );
      st.x = clamp(st.x + dirX * moveDist, ARENA_MIN_X, ARENA_MAX_X);
      st.y = clamp(st.y + dirY * moveDist, ARENA_MIN_Y, ARENA_MAX_Y);
      st.facingX = dirX;
      st.facingY = dirY;

      const m = this.playerMotion.get(sid);
      if (m) {
        m.x = st.x;
        m.y = st.y;
        m.ts = now;
      }
    });

    this.onMessage('pvp.ping', (c, msg) => {
      c.send('pvp.pong', {
        clientTs: Number(msg?.clientTs || 0),
        serverTs: Date.now()
      });
    });

    this.onMessage('coop.revive.hold', (c, msg) => {
      if (!this.isCoopMode) return;
      const sid = c.sessionId;
      const active = !!msg?.active;
      if (!active || this.state.phase !== 'running') {
        if (this.coopReviveHolds.delete(sid)) {
          this.pushCoopReviveStatus(true);
        }
        return;
      }
      const targetSid = this.findCoopReviveTargetSid(sid);
      if (!targetSid) {
        if (this.coopReviveHolds.delete(sid)) {
          this.pushCoopReviveStatus(true);
        }
        return;
      }
      const prev = this.coopReviveHolds.get(sid);
      if (prev?.targetSid === targetSid) return;
      this.coopReviveHolds.set(sid, {
        targetSid,
        startedAt: Date.now()
      });
      this.pushCoopReviveStatus(true);
    });
  }

  refreshCoopPartyState() {
    if (!this.isCoopMode || !this.partyKey) return;
    if (this.state.phase === 'ended' || this.clients.length <= 0) {
      coopPartyStateMap.delete(this.partyKey);
      return;
    }
    const userIds = new Set();
    for (const client of this.clients) {
      const auth = this.sessionAuth.get(client.sessionId);
      const userId = String(auth?.userId || '').trim();
      if (userId) userIds.add(userId);
    }
    coopPartyStateMap.set(this.partyKey, {
      phase: String(this.state.phase || 'waiting'),
      userIds,
      roomId: String(this.roomId || ''),
      updatedAt: Date.now()
    });
  }

  getCombatProfile(sid) {
    const base = this.playerCombat.get(sid);
    if (!base) {
      return {
        atkMul: 1,
        fireRateMul: 1,
        rangeMul: 1,
        critChance: 0,
        xpGainMul: 1,
        hpRegenPerSec: 0,
        lifeStealAcc: 0,
        maxHpMul: 1,
        moveMul: 1,
        ranks: Object.create(null),
        unspentLevelups: 0
      };
    }
    return base;
  }

  findCoopReviveTargetSid(reviverSid) {
    if (!this.isCoopMode) return '';
    const reviver = this.state.players.get(reviverSid);
    if (!reviver || reviver.hp <= 0) return '';
    const maxDistSq = COOP_REVIVE_RADIUS * COOP_REVIVE_RADIUS;
    let bestSid = '';
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const [sid, st] of this.state.players.entries()) {
      if (sid === reviverSid || !st || st.hp > 0) continue;
      const dx = Number(st.x) - Number(reviver.x);
      const dy = Number(st.y) - Number(reviver.y);
      const distSq = dx * dx + dy * dy;
      if (distSq > maxDistSq) continue;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestSid = sid;
      }
    }
    return bestSid;
  }

  isCoopReviveHoldValid(reviverSid, hold) {
    if (!this.isCoopMode || !hold) return false;
    const reviver = this.state.players.get(reviverSid);
    if (!reviver || reviver.hp <= 0) return false;
    const target = this.state.players.get(String(hold.targetSid || ''));
    if (!target || target.hp > 0) return false;
    const dx = Number(target.x) - Number(reviver.x);
    const dy = Number(target.y) - Number(reviver.y);
    const distSq = dx * dx + dy * dy;
    return distSq <= COOP_REVIVE_RADIUS * COOP_REVIVE_RADIUS;
  }

  buildCoopReviveStatusFor(clientSid, now) {
    const status = {
      canHold: false,
      holdActive: false,
      holdTargetSid: '',
      holdStartedAt: 0,
      holdDurationMs: COOP_REVIVE_HOLD_MS,
      beingRevived: false,
      revivedBySid: '',
      beingRevivedStartedAt: 0
    };
    if (!this.isCoopMode || this.state.phase !== 'running') return status;
    const me = this.state.players.get(clientSid);
    if (!me) return status;

    if (me.hp > 0) {
      const inRangeTargetSid = this.findCoopReviveTargetSid(clientSid);
      if (inRangeTargetSid) {
        status.canHold = true;
        status.holdTargetSid = inRangeTargetSid;
      }
      const hold = this.coopReviveHolds.get(clientSid);
      if (this.isCoopReviveHoldValid(clientSid, hold)) {
        status.holdActive = true;
        status.holdTargetSid = String(hold.targetSid || '');
        status.holdStartedAt = Math.max(0, Math.floor(Number(hold.startedAt || now)));
      }
      return status;
    }

    for (const [reviverSid, hold] of this.coopReviveHolds.entries()) {
      if (String(hold?.targetSid || '') !== clientSid) continue;
      if (!this.isCoopReviveHoldValid(reviverSid, hold)) continue;
      status.beingRevived = true;
      status.revivedBySid = reviverSid;
      status.beingRevivedStartedAt = Math.max(0, Math.floor(Number(hold.startedAt || now)));
      break;
    }
    return status;
  }

  pushCoopReviveStatus(force = false) {
    if (!this.isCoopMode) return;
    const now = Date.now();
    for (const client of this.clients) {
      const sid = client.sessionId;
      const status = this.buildCoopReviveStatusFor(sid, now);
      const sig = [
        status.canHold ? 1 : 0,
        status.holdActive ? 1 : 0,
        status.holdTargetSid,
        status.holdStartedAt,
        status.holdDurationMs,
        status.beingRevived ? 1 : 0,
        status.revivedBySid,
        status.beingRevivedStartedAt
      ].join('|');
      if (!force && this.coopReviveStatusSig.get(sid) === sig) continue;
      this.coopReviveStatusSig.set(sid, sig);
      client.send('coop.revive.status', status);
    }
  }

  updateCoopRevives(now) {
    if (!this.isCoopMode) return;
    if (this.state.phase !== 'running') {
      if (this.coopReviveHolds.size > 0) {
        this.coopReviveHolds.clear();
        this.pushCoopReviveStatus(true);
      }
      return;
    }

    let changed = false;
    for (const [reviverSid, hold] of Array.from(this.coopReviveHolds.entries())) {
      if (!this.isCoopReviveHoldValid(reviverSid, hold)) {
        this.coopReviveHolds.delete(reviverSid);
        changed = true;
        continue;
      }
      const elapsed = now - Math.max(0, Math.floor(Number(hold.startedAt || 0)));
      if (elapsed < COOP_REVIVE_HOLD_MS) continue;
      const targetSid = String(hold.targetSid || '');
      const target = this.state.players.get(targetSid);
      if (!target || target.hp > 0) {
        this.coopReviveHolds.delete(reviverSid);
        changed = true;
        continue;
      }
      target.hp = Math.max(1, Math.floor(Number(target.maxHp || MAX_HP_BASE) * COOP_REVIVE_HP_RATIO));
      this.coopReviveHolds.delete(reviverSid);
      changed = true;
      this.broadcast('coop.revive.done', {
        bySid: reviverSid,
        targetSid,
        hp: target.hp,
        maxHp: target.maxHp,
        ratio: COOP_REVIVE_HP_RATIO
      });
    }
    if (changed) this.pushCoopReviveStatus(true);
  }

  applyServerLevelupPick(sid, key) {
    const st = this.state.players.get(sid);
    const combat = this.playerCombat.get(sid);
    if (!st || !combat) return { ok: false, key, reason: 'no_profile' };
    if ((combat.unspentLevelups || 0) <= 0) return { ok: false, key, reason: 'no_unspent' };
    const ranks = combat.ranks || (combat.ranks = Object.create(null));
    const prevRank = Math.max(0, Math.floor(Number(ranks[key] || 0)));
    if (prevRank >= 5) return { ok: false, key, reason: 'max_rank' };
    const nextRank = prevRank + 1;
    ranks[key] = nextRank;
    combat.unspentLevelups -= 1;

    if (key === 'ATK') {
      combat.atkMul = 1 + Math.min(0.5, nextRank * 0.1);
    } else if (key === 'FIRERATE') {
      combat.fireRateMul = Math.pow(0.92, nextRank);
    } else if (key === 'CRIT_CHANCE') {
      combat.critChance = Math.min(0.5, nextRank * 0.05);
    } else if (key === 'XPGAIN') {
      combat.xpGainMul = 1 + nextRank * 0.2;
    } else if (key === 'HP_REGEN') {
      combat.hpRegenPerSec = 0.8 * nextRank;
    } else if (key === 'MAX_HP') {
      combat.maxHpMul = 1 + Math.min(0.5, nextRank * 0.1);
      const targetBase = MAX_HP_BASE + 2 * (Math.max(1, combat.level || 1) - 1);
      const targetMax = Math.max(1, Math.floor(targetBase * combat.maxHpMul));
      const delta = Math.max(0, targetMax - st.maxHp);
      st.maxHp = targetMax;
      st.hp = Math.min(st.maxHp, st.hp + delta);
    } else if (key === 'MOVESPD') {
      combat.moveMul = 1 + nextRank * 0.08;
    } else if (key === 'GOLD_GAIN' || key === 'SHIELD') {
      // Reserved for future PvP tuning.
    }

    if (key === 'LASER' || key === 'GRENADE' || key === 'SHOCKWAVE') {
      const me = ranks.LASER > 0 && ranks.GRENADE > 0 && ranks.SHOCKWAVE > 0;
      combat.rangeMul = me ? 1.25 : 1;
    }
    this.broadcastPvpProgress(sid, 0);
    return { ok: true, key, rank: nextRank, remaining: Math.max(0, Math.floor(combat.unspentLevelups || 0)) };
  }

  broadcastPvpProgress(sid, levelsGained = 0) {
    const st = this.state.players.get(sid);
    const combat = this.playerCombat.get(sid);
    if (!st || !combat) return;
    this.broadcast('pvp.progress', {
      sid,
      level: st.level,
      hp: st.hp,
      maxHp: st.maxHp,
      xp: combat.xp,
      xpToNext: combat.xpToNext,
      levelsGained: Math.max(0, Math.floor(levelsGained || 0))
    });
  }

  grantPvpXp(sid, amount) {
    const st = this.state.players.get(sid);
    const combat = this.playerCombat.get(sid);
    if (!st || !combat || amount <= 0) return;
    const scaled = Math.max(0, Math.floor(amount * Math.max(0.1, Number(combat.xpGainMul || 1))));
    const prevLevel = combat.level;
    combat.xp += scaled;
    while (combat.xp >= combat.xpToNext) {
      combat.xp -= combat.xpToNext;
      combat.level += 1;
      combat.unspentLevelups = (combat.unspentLevelups || 0) + 1;
      const targetBase = MAX_HP_BASE + 2 * (combat.level - 1);
      const maxHpMul = Math.max(0.1, Number(combat.maxHpMul || 1));
      combat.maxHp = Math.max(1, Math.floor(targetBase * maxHpMul));
      combat.xpToNext = calcXpToNext(combat.level);
      st.level = combat.level;
      st.maxHp = combat.maxHp;
      st.hp = Math.min(st.maxHp, st.hp + 4);
      this.broadcast('pvp.level', { sid, level: st.level, maxHp: st.maxHp, hp: st.hp });
    }
    this.broadcastPvpProgress(sid, combat.level - prevLevel);
  }

  getPvpDifficultyScalar(elapsedSec) {
    return Math.min(1.9, 0.72 + elapsedSec * 0.0075);
  }

  isCoopBossStage(stage = this.coopStage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    return s % 5 === 0;
  }

  getCoopStageDifficultyScalar(stage = this.coopStage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    return Math.min(3.25, 0.85 + 0.11 * (s - 1));
  }

  getCoopSpawnIntervalMs(stage = this.coopStage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    if (this.isCoopBossStage(s)) return 999_999;
    return Math.max(320, 1200 - 42 * (s - 1));
  }

  getCoopAliveCap(stage = this.coopStage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    if (this.isCoopBossStage(s)) return 1;
    return Math.min(88, 20 + Math.floor(s * 3.3));
  }

  getCoopStageKillGoal(stage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    if (this.isCoopBossStage(s)) return 1;
    return 24 + 7 * (s - 1);
  }

  pickCoopEnemyType(stage = this.coopStage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    const r = Math.random();
    if (s <= 2) {
      if (r < 0.84) return 'scout';
      return 'tank';
    }
    if (s <= 5) {
      if (r < 0.58) return 'scout';
      if (r < 0.86) return 'tank';
      return 'elite';
    }
    if (s <= 10) {
      if (r < 0.4) return 'scout';
      if (r < 0.73) return 'tank';
      if (r < 0.95) return 'elite';
      return 'miniboss';
    }
    if (r < 0.28) return 'scout';
    if (r < 0.6) return 'tank';
    if (r < 0.9) return 'elite';
    return 'miniboss';
  }

  calcPveEnemyStats(type, difficultyScalar, elapsedSec, stage = this.coopStage) {
    let hp = 18;
    let speed = 110;
    if (type === 'boss') {
      hp = Math.floor(820 * difficultyScalar * (1 + Math.max(0, stage - 1) * 0.05));
      speed = 108 + stage * 2.6;
    } else if (type === 'miniboss') {
      hp = Math.floor(220 * difficultyScalar * (1 + Math.max(0, stage - 1) * 0.03));
      speed = 116 + stage * 2.2;
    } else if (type === 'tank') {
      hp = Math.floor(38 * difficultyScalar);
      speed = 94 * difficultyScalar;
    } else if (type === 'elite') {
      hp = Math.floor(28 * difficultyScalar);
      speed = 138 * difficultyScalar;
    } else {
      hp = Math.floor(11 * difficultyScalar);
      speed = 145 * difficultyScalar;
    }
    let paceMul;
    if (this.isCoopMode) {
      paceMul = 0.68 + Math.min(0.28, Math.max(0, stage - 1) * 0.012);
    } else {
      paceMul = elapsedSec < 45 ? 0.42 : (elapsedSec < 90 ? 0.56 : 0.74);
    }
    speed *= paceMul;
    return {
      hp: clamp(Math.floor(hp), 1, 999999),
      speed: clamp(speed, 1, 99999)
    };
  }

  pointSegDistSq(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-6) {
      const dx = px - x1;
      const dy = py - y1;
      return dx * dx + dy * dy;
    }
    let t = (wx * vx + wy * vy) / vv;
    t = clamp(t, 0, 1);
    const cx = x1 + vx * t;
    const cy = y1 + vy * t;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
  }

  pickPveSpawnPoint(minRadius = 460, maxRadius = 760) {
    const players = Array.from(this.state.players.values()).filter((p) => p.hp > 0);
    const centerX = players.length > 0
      ? players.reduce((acc, p) => acc + p.x, 0) / players.length
      : WORLD_W * 0.5;
    const centerY = players.length > 0
      ? players.reduce((acc, p) => acc + p.y, 0) / players.length
      : WORLD_H * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const safeMin = clamp(Math.floor(Math.min(minRadius, maxRadius)), 80, 4200);
    const safeMax = clamp(Math.floor(Math.max(minRadius, maxRadius)), safeMin, 4200);
    const radius = randInt(safeMin, safeMax);
    return {
      x: clamp(centerX + Math.cos(angle) * radius, ARENA_MIN_X, ARENA_MAX_X),
      y: clamp(centerY + Math.sin(angle) * radius, ARENA_MIN_Y, ARENA_MAX_Y)
    };
  }

  spawnPveEnemyAt(x, y, type, elapsedSec, stage = this.coopStage) {
    const safeStage = Math.max(1, Math.floor(Number(stage || this.coopStage || 1)));
    const sx = clamp(Number(x || 0), ARENA_MIN_X, ARENA_MAX_X);
    const sy = clamp(Number(y || 0), ARENA_MIN_Y, ARENA_MAX_Y);
    const difficulty = this.isCoopMode
      ? this.getCoopStageDifficultyScalar(safeStage)
      : this.getPvpDifficultyScalar(elapsedSec);
    const stats = this.calcPveEnemyStats(type, difficulty, elapsedSec, safeStage);
    const id = `sp_${this.pveSeq++}_${Math.floor(elapsedSec * 1000)}`;
    this.pveEnemies.set(id, {
      id,
      type,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      ai: null
    });
    const stEnemy = new EnemyState();
    stEnemy.id = id;
    stEnemy.type = type;
    stEnemy.x = sx;
    stEnemy.y = sy;
    stEnemy.hp = stats.hp;
    stEnemy.maxHp = stats.hp;
    stEnemy.speed = stats.speed;
    this.state.enemies.set(id, stEnemy);
    this.broadcast('pve.spawn', {
      id,
      type,
      x: sx,
      y: sy,
      hp: stats.hp,
      speed: stats.speed,
      vx: 0,
      vy: 0
    });
    return this.pveEnemies.get(id) || null;
  }

  spawnPveEnemy(elapsedSec, forcedType = '', forcedStage = 0) {
    const stage = Math.max(1, Math.floor(Number(forcedStage || this.coopStage || 1)));
    const type = forcedType || (this.isCoopMode ? this.pickCoopEnemyType(stage) : (() => {
      const r = Math.random();
      if (elapsedSec > 90 && r > 0.9) return 'elite';
      if (elapsedSec > 45 && r > 0.76) return 'tank';
      return 'scout';
    })());
    const minRadius = this.isCoopMode ? 420 : 460;
    const maxRadius = this.isCoopMode ? 820 : 760;
    const { x, y } = this.pickPveSpawnPoint(minRadius, maxRadius);
    return this.spawnPveEnemyAt(x, y, type, elapsedSec, stage);
  }

  spawnCoopBoss(stage, elapsedSec) {
    const enemy = this.spawnPveEnemy(elapsedSec, 'boss', stage);
    if (!enemy) return null;
    enemy.ai = {
      phase: 'idle',
      phaseUntil: 0,
      cdUntil: Date.now() + 900,
      dirX: 1,
      dirY: 0,
      dashUntil: 0,
      comboLeft: 0,
      summonCount: 0,
      debugForceDashOnce: !!this.debugCoopForceDash
    };
    this.broadcastBossAttack({
      kind: 'spawn',
      x: enemy.x,
      y: enemy.y,
      stage
    });
    return enemy;
  }

  broadcastBossAttack(payload) {
    if (!this.isCoopMode || !payload) return;
    this.broadcast('pve.boss.attack', payload);
  }

  addBossLineAttacks(fromEnemy, lines, durationMs, width, damage, tickMs = 120) {
    if (!Array.isArray(lines) || lines.length === 0 || !fromEnemy) return;
    const now = Date.now();
    const dur = Math.max(120, Math.floor(Number(durationMs) || 520));
    const safeWidth = Math.max(4, Math.floor(Number(width) || 14));
    const safeDamage = Math.max(1, Math.floor(Number(damage) || 18));
    const safeTick = Math.max(50, Math.floor(Number(tickMs) || 120));
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] || {};
      const id = `atk_${this.pveSeq++}_${i}_${now}`;
      this.pveBossAttacks.push({
        id,
        sourceId: String(fromEnemy.id || ''),
        x1: Number(line.x1 || fromEnemy.x),
        y1: Number(line.y1 || fromEnemy.y),
        x2: Number(line.x2 || fromEnemy.x),
        y2: Number(line.y2 || fromEnemy.y),
        width: safeWidth,
        damage: safeDamage,
        until: now + dur,
        nextTickAt: now + safeTick,
        tickMs: safeTick
      });
    }
    this.broadcastBossAttack({
      kind: 'laser',
      sourceId: String(fromEnemy.id || ''),
      durationMs: dur,
      width: safeWidth,
      lines: lines.map((line) => ({
        x1: Number(line?.x1 || fromEnemy.x),
        y1: Number(line?.y1 || fromEnemy.y),
        x2: Number(line?.x2 || fromEnemy.x),
        y2: Number(line?.y2 || fromEnemy.y)
      }))
    });
  }

  removeBossAttacksBySource(sourceId) {
    const sid = String(sourceId || '');
    if (!sid || !Array.isArray(this.pveBossAttacks) || this.pveBossAttacks.length === 0) return;
    this.pveBossAttacks = this.pveBossAttacks.filter((x) => String(x?.sourceId || '') !== sid);
  }

  damagePlayerFromEnemy(sourceId, targetSid, damage, now) {
    const target = this.state.players.get(targetSid);
    if (!target || target.hp <= 0) return false;
    const safeDamage = Math.max(1, Math.floor(Number(damage) || 0));
    target.hp = Math.max(0, target.hp - safeDamage);
    this.broadcast('pvp.damage', { fromSid: String(sourceId || ''), toSid: targetSid, damage: safeDamage, hp: target.hp });
    if (target.hp > 0 || this.state.phase === 'ended') return false;
    if (this.isCoopMode) {
      const aliveCount = Array.from(this.state.players.values()).filter((p) => p.hp > 0).length;
      if (aliveCount <= 0) {
        this.finalizeMatch('', 'all_down');
        return true;
      }
      return false;
    }
    const winnerSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== targetSid) || '';
    this.finalizeMatch(winnerSid, 'hp_zero');
    return true;
  }

  updateCoopBossAttacks(now) {
    if (!Array.isArray(this.pveBossAttacks) || this.pveBossAttacks.length === 0) return false;
    let ended = false;
    for (let i = this.pveBossAttacks.length - 1; i >= 0; i -= 1) {
      const atk = this.pveBossAttacks[i];
      if (!atk || now >= Number(atk.until || 0)) {
        this.pveBossAttacks.splice(i, 1);
        continue;
      }
      if (now < Number(atk.nextTickAt || 0)) continue;
      atk.nextTickAt = now + Math.max(50, Math.floor(Number(atk.tickMs || 120)));
      const rr = PLAYER_CONTACT_RADIUS + Math.max(4, Number(atk.width || 0)) * 0.5;
      const rrSq = rr * rr;
      for (const [sid, player] of this.state.players.entries()) {
        if (!player || player.hp <= 0) continue;
        const d2 = this.pointSegDistSq(
          Number(player.x || 0),
          Number(player.y || 0),
          Number(atk.x1 || 0),
          Number(atk.y1 || 0),
          Number(atk.x2 || 0),
          Number(atk.y2 || 0)
        );
        if (d2 > rrSq) continue;
        const hitKey = `atk|${atk.id}|${sid}`;
        const lastHit = this.pveContactAt.get(hitKey) || 0;
        if (now - lastHit < 260) continue;
        this.pveContactAt.set(hitKey, now);
        ended = this.damagePlayerFromEnemy(atk.sourceId, sid, atk.damage, now) || ended;
      }
    }
    return ended;
  }

  updateCoopBossEnemy(enemy, now, dtSec, targetSid, target) {
    if (!enemy || !target || !targetSid) return false;
    const stage = Math.max(1, Math.floor(Number(this.coopStage || 1)));
    const ai = enemy.ai || (enemy.ai = {
      phase: 'idle',
      phaseUntil: 0,
      cdUntil: now + 900,
      dirX: 1,
      dirY: 0,
      dashUntil: 0,
      comboLeft: 0,
      summonCount: 0
    });
    const elapsedSec = Math.max(0, Number(this.state.elapsedSec || ((now - this.startedAt) / 1000)));
    const rotate = (vx, vy, angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return { x: (vx * c) - (vy * s), y: (vx * s) + (vy * c) };
    };
    const setAim = () => {
      const dx = Number(target.x || 0) - Number(enemy.x || 0);
      const dy = Number(target.y || 0) - Number(enemy.y || 0);
      const len = Math.hypot(dx, dy) || 1;
      ai.dirX = dx / len;
      ai.dirY = dy / len;
    };
    const fanLines = (count, spread) => {
      const out = [];
      const mid = Math.floor(count * 0.5);
      for (let i = 0; i < count; i += 1) {
        const offset = (i - mid) * spread;
        const d = rotate(ai.dirX, ai.dirY, offset);
        const L = Math.max(WORLD_W, WORLD_H) * 2.2;
        out.push({
          x1: enemy.x,
          y1: enemy.y,
          x2: enemy.x + d.x * L,
          y2: enemy.y + d.y * L
        });
      }
      return out;
    };
    const radialLines = (count) => {
      const out = [];
      const L = Math.max(WORLD_W, WORLD_H) * 2.2;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2;
        out.push({
          x1: enemy.x,
          y1: enemy.y,
          x2: enemy.x + Math.cos(a) * L,
          y2: enemy.y + Math.sin(a) * L
        });
      }
      return out;
    };
    const clampEnemy = () => {
      enemy.x = clamp(enemy.x, ARENA_MIN_X, ARENA_MAX_X);
      enemy.y = clamp(enemy.y, ARENA_MIN_Y, ARENA_MAX_Y);
    };
    const summonAdds = (count) => {
      const safeCount = Math.max(1, Math.floor(Number(count) || 0));
      const livingCap = Math.max(4, this.getCoopAliveCap(stage));
      const baseA = Math.random() * Math.PI * 2;
      for (let i = 0; i < safeCount; i += 1) {
        if (this.pveEnemies.size >= livingCap + 6) break;
        const a = baseA + (i / safeCount) * Math.PI * 2 + ((Math.random() - 0.5) * 0.46);
        const radius = randInt(98, 168);
        const x = clamp(Number(enemy.x || 0) + Math.cos(a) * radius, ARENA_MIN_X, ARENA_MAX_X);
        const y = clamp(Number(enemy.y || 0) + Math.sin(a) * radius, ARENA_MIN_Y, ARENA_MAX_Y);
        let spawnType = 'elite';
        const pick = Math.random();
        if (!this.isCoopBossStage(stage) && stage >= 14 && pick > 0.84) {
          spawnType = 'miniboss';
        } else if (pick > 0.52) {
          spawnType = 'tank';
        }
        this.spawnPveEnemyAt(x, y, spawnType, elapsedSec, stage);
      }
    };

    if (ai.phase === 'idle') {
      if (now >= Number(ai.cdUntil || 0)) {
        setAim();
        if (ai.debugForceDashOnce) {
          ai.debugForceDashOnce = false;
          ai.phase = 'dash_warn';
          ai.phaseUntil = now + 220;
          ai.comboLeft = 1;
          const lines = fanLines(1, 0);
          this.broadcastBossAttack({
            kind: 'dash_warn',
            sourceId: String(enemy.id || ''),
            durationMs: 220,
            width: 12,
            line: lines[0]
          });
          enemy.vx = 0;
          enemy.vy = 0;
          return false;
        }
        const roll = Math.random();
        if (roll < 0.3) {
          ai.phase = 'dash_warn';
          ai.phaseUntil = now + 520;
          ai.comboLeft = randInt(2, 3);
          const lines = fanLines(1, 0);
          this.broadcastBossAttack({
            kind: 'dash_warn',
            sourceId: String(enemy.id || ''),
            durationMs: 520,
            width: 12,
            line: lines[0]
          });
          enemy.vx = 0;
          enemy.vy = 0;
          return false;
        }
        if (roll < 0.58) {
          ai.phase = 'laser_warn';
          ai.phaseUntil = now + 720;
          const lines = fanLines(5, 0.22);
          this.broadcastBossAttack({
            kind: 'line_warn',
            sourceId: String(enemy.id || ''),
            durationMs: 720,
            width: 9,
            lines
          });
          enemy.vx = 0;
          enemy.vy = 0;
          return false;
        }
        if (roll < 0.82) {
          ai.phase = 'nova_warn';
          ai.phaseUntil = now + 700;
          this.broadcastBossAttack({
            kind: 'nova_warn',
            sourceId: String(enemy.id || ''),
            durationMs: 700,
            x: enemy.x,
            y: enemy.y,
            radius: 210
          });
          enemy.vx = 0;
          enemy.vy = 0;
          return false;
        }
        ai.phase = 'summon';
        ai.phaseUntil = now + 520;
        ai.cdUntil = now + 1750;
        ai.summonCount = stage >= 15 ? randInt(3, 4) : randInt(2, 3);
        this.broadcastBossAttack({
          kind: 'summon',
          sourceId: String(enemy.id || ''),
          durationMs: 520,
          x: enemy.x,
          y: enemy.y,
          count: ai.summonCount
        });
        enemy.vx = 0;
        enemy.vy = 0;
        return false;
      }
      const dx = Number(target.x || 0) - Number(enemy.x || 0);
      const dy = Number(target.y || 0) - Number(enemy.y || 0);
      const len = Math.hypot(dx, dy) || 1;
      enemy.vx = (dx / len) * enemy.speed * 0.74;
      enemy.vy = (dy / len) * enemy.speed * 0.74;
      enemy.x += enemy.vx * dtSec;
      enemy.y += enemy.vy * dtSec;
      clampEnemy();
      return false;
    }

    if (ai.phase === 'dash_warn') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (now < Number(ai.phaseUntil || 0)) return false;
      ai.phase = 'dash';
      ai.dashUntil = now + 300;
      return false;
    }

    if (ai.phase === 'dash') {
      const dashSpeed = (900 + stage * 6.5);
      enemy.vx = ai.dirX * dashSpeed;
      enemy.vy = ai.dirY * dashSpeed;
      enemy.x += enemy.vx * dtSec;
      enemy.y += enemy.vy * dtSec;
      let hitWall = false;
      if (enemy.x <= ARENA_MIN_X || enemy.x >= ARENA_MAX_X || enemy.y <= ARENA_MIN_Y || enemy.y >= ARENA_MAX_Y) {
        hitWall = true;
      }
      clampEnemy();
      for (const [sid, p] of this.state.players.entries()) {
        if (!p || p.hp <= 0) continue;
        const dx = Number(p.x || 0) - Number(enemy.x || 0);
        const dy = Number(p.y || 0) - Number(enemy.y || 0);
        const distSq = dx * dx + dy * dy;
        const radius = PLAYER_CONTACT_RADIUS + 24;
        if (distSq > radius * radius) continue;
        const hitKey = `dash|${enemy.id}|${sid}`;
        const lastHit = this.pveContactAt.get(hitKey) || 0;
        if (now - lastHit < 180) continue;
        this.pveContactAt.set(hitKey, now);
        if (this.damagePlayerFromEnemy(enemy.id, sid, 30 + Math.floor(stage * 0.6), now)) return true;
      }
      if (now < Number(ai.dashUntil || 0) && !hitWall) return false;
      if (ai.comboLeft > 1) {
        ai.comboLeft -= 1;
        setAim();
        ai.phase = 'dash_warn';
        ai.phaseUntil = now + 280;
        const lines = fanLines(1, 0);
        this.broadcastBossAttack({
          kind: 'dash_warn',
          sourceId: String(enemy.id || ''),
          durationMs: 280,
          width: 12,
          line: lines[0]
        });
        return false;
      }
      ai.comboLeft = 0;
      ai.phase = 'idle';
      ai.cdUntil = now + 1600;
      enemy.vx = 0;
      enemy.vy = 0;
      return false;
    }

    if (ai.phase === 'laser_warn') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (now < Number(ai.phaseUntil || 0)) return false;
      ai.phase = 'laser';
      ai.phaseUntil = now + 700;
      ai.cdUntil = now + 1900;
      setAim();
      this.addBossLineAttacks(
        enemy,
        fanLines(5, 0.22),
        700,
        18,
        28 + Math.floor(stage * 0.9),
        120
      );
      return false;
    }

    if (ai.phase === 'summon') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (now < Number(ai.phaseUntil || 0)) return false;
      summonAdds(ai.summonCount || 2);
      ai.summonCount = 0;
      ai.phase = 'idle';
      ai.cdUntil = Math.max(Number(ai.cdUntil || 0), now + 1500);
      return false;
    }

    if (ai.phase === 'nova_warn') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (now < Number(ai.phaseUntil || 0)) return false;
      ai.phase = 'nova';
      ai.phaseUntil = now + 540;
      ai.cdUntil = now + 2200;
      this.addBossLineAttacks(
        enemy,
        radialLines(10),
        560,
        14,
        20 + Math.floor(stage * 0.75),
        130
      );
      const novaRadius = 210;
      for (const [sid, p] of this.state.players.entries()) {
        if (!p || p.hp <= 0) continue;
        const dx = Number(p.x || 0) - Number(enemy.x || 0);
        const dy = Number(p.y || 0) - Number(enemy.y || 0);
        const distSq = dx * dx + dy * dy;
        if (distSq > novaRadius * novaRadius) continue;
        const hitKey = `nova|${enemy.id}|${sid}`;
        const lastHit = this.pveContactAt.get(hitKey) || 0;
        if (now - lastHit < 260) continue;
        this.pveContactAt.set(hitKey, now);
        if (this.damagePlayerFromEnemy(enemy.id, sid, 24 + Math.floor(stage * 0.8), now)) return true;
      }
      return false;
    }

    if (ai.phase === 'laser' || ai.phase === 'nova') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (now >= Number(ai.phaseUntil || 0)) {
        ai.phase = 'idle';
      }
      return false;
    }

    ai.phase = 'idle';
    enemy.vx = 0;
    enemy.vy = 0;
    return false;
  }

  syncPveEnemies() {
    const enemies = [];
    for (const enemy of this.pveEnemies.values()) {
      enemies.push({
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        speed: enemy.speed,
        vx: Number(enemy.vx || 0),
        vy: Number(enemy.vy || 0)
      });
    }
    this.broadcast('pve.sync', { enemies, sentAt: Date.now() });
  }

  updatePlayerMovement(dtSec) {
    for (const [sid, st] of this.state.players.entries()) {
      if (!st || st.hp <= 0) continue;
      const input = this.playerInputs.get(sid) || { mx: 0, my: 0 };
      const mx = Number(input.mx || 0);
      const my = Number(input.my || 0);
      const len = Math.hypot(mx, my);
      const nx = len > 1e-6 ? mx / len : 0;
      const ny = len > 1e-6 ? my / len : 0;
      const combat = this.getCombatProfile(sid);
      const moveMul = Math.max(0.25, Number(combat.moveMul || 1));
      const speed = Math.min(MAX_NET_MOVE_SPEED, MOVE_SPEED_BASE * moveMul);
      st.x = clamp(st.x + nx * speed * dtSec, ARENA_MIN_X, ARENA_MAX_X);
      st.y = clamp(st.y + ny * speed * dtSec, ARENA_MIN_Y, ARENA_MAX_Y);
      const m = this.playerMotion.get(sid);
      if (m) {
        m.x = st.x;
        m.y = st.y;
        m.ts = Date.now();
      }
    }
  }

  updatePve(dtMs) {
    if (this.state.phase === 'countdown') {
      const now = Date.now();
      this.state.elapsedSec = 0;
      if (now < this.roundStartAt) return;
      this.state.phase = 'running';
      this.refreshCoopPartyState();
      this.startedAt = now;
      this.broadcast('match.go', { at: now });
    }
    if (this.state.phase !== 'running') return;
    if (this.state.players.size < 2) return;

    const dtSec = dtMs / 1000;
    const now = Date.now();
    gcExpiryMap(this.seenHitIds, now, 12000);
    const elapsedSec = (now - this.startedAt) / 1000;
    this.state.elapsedSec = elapsedSec;
    this.updatePlayerMovement(dtSec);
    if (this.isCoopMode) {
      this.updateCoopRevives(now);
      this.pushCoopReviveStatus();
    }

    for (const [sid, st] of this.state.players.entries()) {
      if (!st || st.hp <= 0) continue;
      const combat = this.getCombatProfile(sid);
      const regen = Math.max(0, Number(combat.hpRegenPerSec || 0));
      if (regen <= 0 || st.hp >= st.maxHp) continue;
      st.hp = Math.min(st.maxHp, st.hp + regen * dtSec);
    }

    this.pveSpawnAccMs += dtMs;
    if (this.isCoopMode) {
      const stage = Math.max(1, Math.floor(Number(this.coopStage || 1)));
      if (this.isCoopBossStage(stage)) {
        this.pveSpawnAccMs = 0;
        const hasBoss = Array.from(this.pveEnemies.values()).some((e) => String(e?.type || '') === 'boss');
        if (!hasBoss) {
          this.spawnCoopBoss(stage, elapsedSec);
        }
      } else {
        const spawnEveryMs = this.getCoopSpawnIntervalMs(stage);
        const aliveCap = this.getCoopAliveCap(stage);
        while (this.pveSpawnAccMs >= spawnEveryMs && this.pveEnemies.size < aliveCap) {
          this.pveSpawnAccMs -= spawnEveryMs;
          this.spawnPveEnemy(elapsedSec, '', stage);
        }
      }
    } else {
      const spawnEveryMs = Math.max(420, 1380 - elapsedSec * 7);
      const aliveCap = Math.min(56, 14 + Math.floor(elapsedSec / 10));
      while (this.pveSpawnAccMs >= spawnEveryMs && this.pveEnemies.size < aliveCap) {
        this.pveSpawnAccMs -= spawnEveryMs;
        this.spawnPveEnemy(elapsedSec);
      }
    }

    for (const [id, enemy] of this.pveEnemies.entries()) {
      let targetSid = '';
      let target = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const [sid, p] of this.state.players.entries()) {
        if (p.hp <= 0) continue;
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          targetSid = sid;
          target = p;
        }
      }
      if (!target || !targetSid) continue;

      if (this.isCoopMode && String(enemy.type || '') === 'boss') {
        if (this.updateCoopBossEnemy(enemy, now, dtSec, targetSid, target)) return;
      } else {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const len = Math.hypot(dx, dy) || 1;
        const vx = (dx / len) * enemy.speed;
        const vy = (dy / len) * enemy.speed;
        enemy.vx = vx;
        enemy.vy = vy;
        enemy.x = clamp(enemy.x + vx * dtSec, ARENA_MIN_X, ARENA_MAX_X);
        enemy.y = clamp(enemy.y + vy * dtSec, ARENA_MIN_Y, ARENA_MAX_Y);
      }
      const stEnemy = this.state.enemies.get(id);
      if (stEnemy) {
        stEnemy.x = enemy.x;
        stEnemy.y = enemy.y;
      }

      const curDx = Number(target.x || 0) - Number(enemy.x || 0);
      const curDy = Number(target.y || 0) - Number(enemy.y || 0);
      const curDist = Math.hypot(curDx, curDy);
      if (curDist <= PLAYER_CONTACT_RADIUS) {
        const contactKey = `${id}|${targetSid}`;
        const lastHit = this.pveContactAt.get(contactKey) || 0;
        if (now - lastHit >= 440) {
          this.pveContactAt.set(contactKey, now);
          const dmg = ENEMY_CONTACT_DAMAGE[enemy.type] || ENEMY_CONTACT_DAMAGE.scout;
          if (this.damagePlayerFromEnemy(id, targetSid, dmg, now)) {
            return;
          }
        }
      }
    }
    if (this.isCoopMode) {
      if (this.updateCoopBossAttacks(now)) return;
    }

    this.pveSyncAccMs += dtMs;
    if (this.pveSyncAccMs >= 100) {
      this.pveSyncAccMs = 0;
      this.syncPveEnemies();
    }
  }

  onAuth(_client, options, authContext) {
    const token = String(options?.token || authContext?.token || '');
    if (!token) throw new Error('missing_token');
    const payload = jwt.verify(token, JWT_SECRET);
    const decoded = (payload && typeof payload === 'object') ? payload : {};
    const userId = String(decoded.sub || decoded.userId || '');
    if (!userId) throw new Error('invalid_token');
    return {
      userId,
      name: String(decoded.name || decoded.email || 'Player')
    };
  }

  onJoin(client, options, auth) {
    if (this.isCoopMode && options && typeof options === 'object') {
      const debugEnabled = parseBoolParam(options?.debug, false);
      if (debugEnabled) {
        const stageRaw = Math.floor(Number(options?.debugStage || 0));
        if (Number.isFinite(stageRaw)) {
          this.debugCoopStage = clamp(stageRaw, 0, COOP_FINAL_STAGE);
        }
        this.debugCoopForceDash = parseBoolParam(options?.debugDash, this.debugCoopForceDash);
      }
    }
    const safeAuth = (auth && typeof auth === 'object') ? auth : {};
    const userId = String(safeAuth.userId || '');
    const name = String(safeAuth.name || 'Player');
    if (!userId) {
      client.leave(4001, 'auth_required');
      return;
    }
    ensurePvpPlayer(userId, name);
    this.sessionAuth.set(client.sessionId, { userId, name });

    const p = new PlayerState();
    p.userId = userId;
    p.name = name;
    p.x = WORLD_W * 0.5 + (this.clients.length === 1 ? -120 : 120);
    p.y = WORLD_H * 0.5;
    p.hp = MAX_HP_BASE;
    p.maxHp = MAX_HP_BASE;
    p.level = 1;
    p.xp = 0;
    p.xpToNext = calcXpToNext(1);
    p.facingX = this.clients.length === 1 ? 1 : -1;
    p.facingY = 0;
    this.state.players.set(client.sessionId, p);
    this.playerCombat.set(client.sessionId, {
      level: 1,
      xp: 0,
      xpToNext: calcXpToNext(1),
      maxHp: MAX_HP_BASE,
      unspentLevelups: 0,
      atkMul: 1,
      fireRateMul: 1,
      rangeMul: 1,
      critChance: 0,
      xpGainMul: 1,
      hpRegenPerSec: 0,
      lifeStealAcc: 0,
      maxHpMul: 1,
      moveMul: 1,
      ranks: Object.create(null)
    });
    this.playerMotion.set(client.sessionId, {
      x: p.x,
      y: p.y,
      ts: Date.now()
    });
    this.playerInputs.set(client.sessionId, { mx: 0, my: 0 });

    const profile = stGetPlayer.get(userId);
    client.send('pvp.profile', profile || { user_id: userId, name, mmr: 1000, wins: 0, losses: 0, matches: 0 });
    this.broadcastPvpProgress(client.sessionId, 0);

    if (this.clients.length < 2) {
      client.send('match.waiting', { players: this.clients.length });
      if (this.isCoopMode) client.send('coop.stage', {
        stage: this.coopStage,
        stageKills: this.coopStageKills,
        stageKillGoal: this.coopStageKillGoal
      });
    } else {
      const centerX = WORLD_W * 0.5;
      const centerY = WORLD_H * 0.5;
      // Spawn at the center of each half: left quarter / right quarter.
      const spread = WORLD_W * 0.25;
      const sorted = this.clients.map((x) => x.sessionId).sort();
      const leftSid = sorted[0] || '';
      const rightSid = sorted[1] || '';
      const left = this.state.players.get(leftSid);
      const right = this.state.players.get(rightSid);
      if (left) {
        left.x = centerX - spread;
        left.y = centerY;
        left.facingX = 1;
        left.facingY = 0;
        const lm = this.playerMotion.get(leftSid);
        if (lm) {
          lm.x = left.x;
          lm.y = left.y;
          lm.ts = Date.now();
        }
      }
      if (right) {
        right.x = centerX + spread;
        right.y = centerY;
        right.facingX = -1;
        right.facingY = 0;
        const rm = this.playerMotion.get(rightSid);
        if (rm) {
          rm.x = right.x;
          rm.y = right.y;
          rm.ts = Date.now();
        }
      }
      this.state.phase = 'countdown';
      this.startedAt = Date.now();
      this.roundStartAt = this.startedAt + 5000;
      this.pveSpawnAccMs = 0;
      this.pveSyncAccMs = 0;
      this.pveSeq = 1;
      this.pveBossAttacks = [];
      const startStage = (this.isCoopMode && this.debugCoopStage > 0)
        ? this.debugCoopStage
        : 1;
      this.coopStage = startStage;
      this.coopStageKills = 0;
      this.coopStageKillGoal = this.getCoopStageKillGoal(this.coopStage);
      this.pveEnemies.clear();
      this.state.enemies.clear();
      this.broadcast('match.start', {
        players: this.clients.length,
        startsInMs: 5000,
        leftSid,
        rightSid,
        centerX,
        centerY,
        spread
      });
      if (this.isCoopMode) {
        this.broadcast('coop.stage', {
          stage: this.coopStage,
          stageKills: this.coopStageKills,
          stageKillGoal: this.coopStageKillGoal
        });
      }
    }
    this.refreshCoopPartyState();
    if (this.isCoopMode) this.pushCoopReviveStatus(true);
  }

  resetCoopStageArena() {
    this.pveEnemies.clear();
    this.state.enemies.clear();
    this.pveBossAttacks = [];
    this.pveSpawnAccMs = 0;
    this.pveSyncAccMs = 0;
    this.pveContactAt.clear();
  }

  onCoopEnemyKilled(enemyType = 'scout') {
    if (!this.isCoopMode) return;
    if (this.state.phase !== 'running') return;
    const currentStage = Math.max(1, Math.floor(Number(this.coopStage || 1)));
    const isBossStage = this.isCoopBossStage(currentStage);
    if (isBossStage) {
      if (String(enemyType || '') !== 'boss') return;
      this.coopStageKills = this.coopStageKillGoal;
    } else {
      this.coopStageKills += 1;
      if (this.coopStageKills < this.coopStageKillGoal) {
        this.broadcast('coop.stage', {
          stage: this.coopStage,
          stageKills: this.coopStageKills,
          stageKillGoal: this.coopStageKillGoal
        });
        return;
      }
    }

    const clearedStage = this.coopStage;
    if (clearedStage >= COOP_FINAL_STAGE) {
      this.broadcast('coop.stage', {
        stage: this.coopStage,
        stageKills: this.coopStageKillGoal,
        stageKillGoal: this.coopStageKillGoal,
        clearedStage,
        finished: true
      });
      this.finalizeMatch('', 'stage_clear');
      return;
    }
    this.resetCoopStageArena();
    this.coopStage += 1;
    this.coopStageKills = 0;
    this.coopStageKillGoal = this.getCoopStageKillGoal(this.coopStage);
    this.broadcast('coop.stage', {
      stage: this.coopStage,
      stageKills: this.coopStageKills,
      stageKillGoal: this.coopStageKillGoal,
      clearedStage
    });
  }

  finalizeMatch(winnerSid, reason) {
    if (this.state.phase === 'ended') return;
    this.state.phase = 'ended';
    this.coopReviveHolds.clear();
    this.coopReviveStatusSig.clear();
    this.refreshCoopPartyState();
    this.pveEnemies.clear();
    this.pveBossAttacks = [];
    this.state.enemies.clear();
    this.state.winnerSid = winnerSid || '';
    this.broadcast('match.end', { winnerSid: winnerSid || null, reason, mode: this.mode });

    if (!this.resultCommitted && !this.isCoopMode) {
      this.resultCommitted = true;
      const loserSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== winnerSid) || '';
      const winnerAuth = this.sessionAuth.get(winnerSid);
      const loserAuth = this.sessionAuth.get(loserSid);
      if (winnerAuth?.userId && loserAuth?.userId) {
        const out = recordPvpResult(winnerAuth.userId, loserAuth.userId, reason);
        if (out) {
          this.broadcast('pvp.result', {
            winnerSid,
            reason,
            winner: out.winner,
            loser: out.loser
          });
        }
      }
    }

    this.clock.setTimeout(() => this.disconnect(), 1500);
  }

  onLeave(client) {
    let reviveChanged = false;
    if (this.coopReviveHolds.delete(client.sessionId)) reviveChanged = true;
    for (const [sid, hold] of Array.from(this.coopReviveHolds.entries())) {
      if (String(hold?.targetSid || '') !== client.sessionId) continue;
      this.coopReviveHolds.delete(sid);
      reviveChanged = true;
    }
    this.coopReviveStatusSig.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessionAuth.delete(client.sessionId);
    this.playerCombat.delete(client.sessionId);
    this.playerMotion.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    for (const key of this.lastDamageAt.keys()) {
      if (key.startsWith(`${client.sessionId}|`) || key.endsWith(`|${client.sessionId}`)) this.lastDamageAt.delete(key);
    }
    for (const key of this.lastAttackAt.keys()) {
      if (key.startsWith(`${client.sessionId}|`) || key.endsWith(`|${client.sessionId}`)) this.lastAttackAt.delete(key);
    }
    for (const key of this.pveContactAt.keys()) {
      if (key.endsWith(`|${client.sessionId}`)) this.pveContactAt.delete(key);
    }
    if (this.state.phase !== 'ended') {
      if (this.isCoopMode) {
        const alive = this.clients.map((x) => x.sessionId).filter((sid) => this.state.players.has(sid));
        if (alive.length === 0) this.finalizeMatch('', 'disconnect');
      } else {
        const winnerSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== client.sessionId) || '';
        if (winnerSid) this.finalizeMatch(winnerSid, 'disconnect');
      }
    }
    if (this.isCoopMode && this.state.phase === 'running' && reviveChanged) {
      this.pushCoopReviveStatus(true);
    }
    this.refreshCoopPartyState();
  }

  onDispose() {
    if (this.isCoopMode && this.partyKey) {
      coopPartyStateMap.delete(this.partyKey);
    }
  }
}

function getClientIp(req) {
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
  const xrip = String(req.headers?.['x-real-ip'] || '').trim();
  return xff || xrip || String(req.socket?.remoteAddress || 'unknown');
}

function checkAuthRateLimit(req) {
  const key = getClientIp(req);
  const now = Date.now();
  const prev = authRateMap.get(key);
  if (!prev || now > prev.resetAt) {
    authRateMap.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    if (authRateMap.size > 10000) {
      for (const [k, v] of authRateMap.entries()) {
        if (!v || Number(v.resetAt) <= now) authRateMap.delete(k);
      }
    }
    return { ok: true, retryAfterSec: 0 };
  }
  if (prev.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((prev.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  prev.count += 1;
  authRateMap.set(key, prev);
  return { ok: true, retryAfterSec: 0 };
}

const authHandler = async (req, res) => {
  try {
    const limit = checkAuthRateLimit(req);
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec });
    }
    const idToken = String(req.body?.idToken || '');
    const accessToken = String(req.body?.accessToken || '');
    if (!idToken && !accessToken) {
      return res.status(400).json({ error: 'idToken_or_accessToken_required' });
    }
    if (GOOGLE_AUDIENCES.length === 0) {
      return res.status(500).json({ error: 'google_client_id_missing_on_server' });
    }

    let payload = null;
    if (idToken) {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_AUDIENCES
      });
      payload = ticket.getPayload();
    } else {
      const tokenInfoResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
      if (!tokenInfoResp.ok) {
        return res.status(401).json({ error: 'invalid_google_access_token' });
      }
      const tokenInfo = await tokenInfoResp.json();
      const aud = String(tokenInfo?.aud || '');
      if (!aud || !GOOGLE_AUDIENCES.includes(aud)) {
        return res.status(401).json({ error: 'google_wrong_recipient', detail: `aud=${aud || 'missing'}` });
      }

      const userInfoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!userInfoResp.ok) {
        return res.status(401).json({ error: 'google_userinfo_failed' });
      }
      const userInfo = await userInfoResp.json();
      payload = {
        sub: String(userInfo?.sub || tokenInfo?.sub || ''),
        email: String(userInfo?.email || tokenInfo?.email || ''),
        name: String(userInfo?.name || userInfo?.email || 'Player'),
        picture: String(userInfo?.picture || '')
      };
    }

    if (!payload?.sub) return res.status(401).json({ error: 'invalid_google_token' });
    const user = {
      id: String(payload.sub),
      email: String(payload.email || ''),
      name: String(payload.name || payload.email || 'Player'),
      picture: String(payload.picture || '')
    };
    ensurePvpPlayer(user.id, user.name);
    const profile = ensureUserProfile(user.id, user.name);
    user.tag = String(profile?.tag || '');
    const token = jwt.sign(
      { sub: user.id, name: user.name, email: user.email, picture: user.picture },
      JWT_SECRET,
      { expiresIn: '14d' }
    );
    res.json({ token, user });
  } catch (err) {
    res.status(401).json({ error: 'google_verify_failed', detail: String(err?.message || err) });
  }
};

function verifyAuthHeader(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.startsWith('Bearer ')) throw new Error('missing_bearer_token');
  const token = auth.slice('Bearer '.length).trim();
  if (!token) throw new Error('missing_bearer_token');
  const payload = jwt.verify(token, JWT_SECRET);
  const userId = String(payload?.sub || payload?.userId || '');
  if (!userId) throw new Error('invalid_token');
  const name = String(payload?.name || payload?.email || 'Player');
  return { userId, name };
}

const gameServer = new Server({
  transport: new WebSocketTransport({
    pingInterval: 3000,
    pingMaxRetries: 2
  }),
  express: (expressApp) => {
    expressApp.use(cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`cors_origin_blocked:${String(origin || '')}`));
      },
      credentials: false
    }));
    expressApp.use(express.json({ limit: '1mb' }));
    expressApp.get('/health', (_req, res) => {
      res.json({ ok: true, ts: Date.now() });
    });
    expressApp.get('/pvp/stats/:userId', (req, res) => {
      const userId = String(req.params?.userId || '');
      if (!userId) return res.status(400).json({ error: 'user_id_required' });
      const row = stGetPlayer.get(userId);
      if (!row) return res.status(404).json({ error: 'not_found' });
      return res.json(row);
    });
    expressApp.get('/pvp/leaderboard', (req, res) => {
      const limitRaw = Number(req.query?.limit || 20);
      const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)));
      const rows = pvpDb.prepare(`
        SELECT user_id, name, mmr, wins, losses, matches, updated_at
        FROM pvp_players
        ORDER BY mmr DESC, wins DESC, losses ASC, updated_at DESC
        LIMIT ?
      `).all(limit);
      return res.json({ rows });
    });
    expressApp.get('/leaderboard', (req, res) => {
      const mode = String(req.query?.mode || 'survival').trim().toLowerCase();
      const limitRaw = Number(req.query?.limit || 30);
      const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)));
      if (mode === 'pvp') {
        const rows = pvpDb.prepare(`
          SELECT user_id, name, mmr, wins, losses, matches, updated_at
          FROM pvp_players
          ORDER BY mmr DESC, wins DESC, losses ASC, updated_at DESC
          LIMIT ?
        `).all(limit);
        return res.json({ mode, rows });
      }
      const runMode = normalizeRunMode(mode);
      if (!runMode) return res.status(400).json({ error: 'invalid_mode' });
      const rows = appDb.prepare(`
        SELECT mode, user_id, name, best_stage, best_score, best_time_sec, best_kills, updated_at
        FROM run_leaderboard
        WHERE mode = ?
        ORDER BY best_stage DESC, best_score DESC, best_kills DESC, best_time_sec DESC, updated_at ASC
        LIMIT ?
      `).all(runMode, limit);
      return res.json({ mode: runMode, rows });
    });
    expressApp.post('/leaderboard/submit', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        const mode = normalizeRunMode(req.body?.mode);
        if (!mode) return res.status(400).json({ error: 'invalid_mode' });
        const row = upsertRunLeaderboard(mode, userId, name, req.body || {});
        return res.json({ mode, row });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/friends/me', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        const me = ensureUserProfile(userId, name);
        if (!me) return res.status(404).json({ error: 'profile_not_found' });
        return res.json({ user: me });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/friends/list', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const rows = stListFriends.all(userId);
        return res.json({ rows });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/remove', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const friendUserId = String(req.body?.friendUserId || '').trim();
        if (!friendUserId) return res.status(400).json({ error: 'friend_user_id_required' });
        if (!areFriends(userId, friendUserId)) return res.status(404).json({ error: 'friend_not_found' });
        txRemoveFriendPair(userId, friendUserId);
        return res.json({ ok: true });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/add', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const tag = String(req.body?.tag || '').trim().toUpperCase();
        if (!tag) return res.status(400).json({ error: 'tag_required' });
        const target = stGetUserProfileByTag.get(tag);
        if (!target) return res.status(404).json({ error: 'tag_not_found' });
        if (target.user_id === userId) return res.status(400).json({ error: 'cannot_add_self' });
        txCreateFriendPair(userId, target.user_id);
        return res.json({ ok: true, friend: target });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/requests', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const tag = String(req.body?.tag || '').trim().toUpperCase();
        if (!tag) return res.status(400).json({ error: 'tag_required' });
        const target = stGetUserProfileByTag.get(tag);
        if (!target) return res.status(404).json({ error: 'tag_not_found' });
        if (target.user_id === userId) return res.status(400).json({ error: 'cannot_add_self' });
        const out = createFriendRequest(userId, target.user_id);
        if (out?.alreadyFriends) return res.status(400).json({ error: 'already_friends' });
        if (out?.reversePending) {
          txCreateFriendPair(userId, target.user_id);
          stUpdateFriendRequestStatus.run('accepted', Date.now(), out.request.id);
          return res.json({ ok: true, autoAccepted: true, friend: target });
        }
        if (!out?.id) return res.status(400).json({ error: 'request_create_failed' });
        return res.json({ ok: true, request: out, target: { user_id: target.user_id, name: target.name, tag: target.tag } });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/friends/requests', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const incoming = stGetIncomingFriendRequests.all(userId);
        const outgoing = stGetOutgoingFriendRequests.all(userId);
        return res.json({ incoming, outgoing });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/requests/:id/respond', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const requestId = Math.max(0, Math.floor(Number(req.params?.id || 0)));
        const accept = !!req.body?.accept;
        if (!requestId) return res.status(400).json({ error: 'request_id_required' });
        const row = stGetFriendRequestById.get(requestId);
        if (!row) return res.status(404).json({ error: 'request_not_found' });
        if (String(row.to_user_id) !== userId) return res.status(403).json({ error: 'request_forbidden' });
        if (String(row.status) !== 'pending') return res.status(400).json({ error: 'request_not_pending' });
        stUpdateFriendRequestStatus.run(accept ? 'accepted' : 'rejected', Date.now(), requestId);
        if (accept) txCreateFriendPair(userId, String(row.from_user_id));
        return res.json({ ok: true, requestId, status: accept ? 'accepted' : 'rejected' });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/friends/chat/:friendUserId', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const friendUserId = String(req.params?.friendUserId || '').trim();
        const limitRaw = Number(req.query?.limit || 60);
        const limit = Math.max(1, Math.min(300, Math.floor(limitRaw)));
        const day = String(req.query?.day || '').trim();
        const before = Math.max(0, Math.floor(Number(req.query?.before || 0)));
        const after = Math.max(0, Math.floor(Number(req.query?.after || 0)));
        if (!friendUserId) return res.status(400).json({ error: 'friend_user_id_required' });
        if (!areFriends(userId, friendUserId)) return res.status(403).json({ error: 'not_friends' });
        stUpsertFriendChatRead.run(userId, friendUserId, Date.now());
        let rows = [];
        if (day) {
          const range = parseChatDayRange(day);
          if (!range) return res.status(400).json({ error: 'invalid_day_format' });
          rows = stGetFriendConversationByRange.all(
            userId, friendUserId,
            friendUserId, userId,
            range.startMs, range.endMs, limit
          ).reverse();
        } else if (after > 0) {
          rows = stGetFriendConversationAfter.all(
            userId, friendUserId,
            friendUserId, userId,
            after, limit
          );
        } else if (before > 0) {
          rows = stGetFriendConversationBefore.all(
            userId, friendUserId,
            friendUserId, userId,
            before, limit
          ).reverse();
        } else {
          rows = stGetFriendConversationLatest.all(
            userId, friendUserId,
            friendUserId, userId,
            limit
          ).reverse();
        }
        return res.json({ rows });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/chat/:friendUserId/read', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const friendUserId = String(req.params?.friendUserId || '').trim();
        if (!friendUserId) return res.status(400).json({ error: 'friend_user_id_required' });
        if (!areFriends(userId, friendUserId)) return res.status(403).json({ error: 'not_friends' });
        stUpsertFriendChatRead.run(userId, friendUserId, Date.now());
        return res.json({ ok: true });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/chat/:friendUserId', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const friendUserId = String(req.params?.friendUserId || '').trim();
        if (!friendUserId) return res.status(400).json({ error: 'friend_user_id_required' });
        if (!areFriends(userId, friendUserId)) return res.status(403).json({ error: 'not_friends' });
        const message = sanitizeChatMessage(req.body?.message);
        if (!message) return res.status(400).json({ error: 'message_required' });
        const now = Date.now();
        stInsertFriendMessage.run(userId, friendUserId, message, now);
        const rows = stGetFriendConversationLatest.all(userId, friendUserId, friendUserId, userId, 1).reverse();
        return res.json({ ok: true, row: rows[0] || null });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/friends/invites', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const incoming = stGetIncomingInvites.all(userId);
        const outgoing = stGetOutgoingInvites.all(userId);
        return res.json({ incoming, outgoing });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/invite', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const friendUserId = String(req.body?.friendUserId || '').trim();
        if (!friendUserId) return res.status(400).json({ error: 'friend_user_id_required' });
        if (!areFriends(userId, friendUserId)) return res.status(403).json({ error: 'not_friends' });
        const invite = createFriendInvite(userId, friendUserId);
        if (!invite) return res.status(400).json({ error: 'invite_create_failed' });
        return res.json({ invite });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/friends/invites/:id/respond', (req, res) => {
      try {
        const { userId, name } = verifyAuthHeader(req);
        ensureUserProfile(userId, name);
        const inviteId = Math.max(0, Math.floor(Number(req.params?.id || 0)));
        const accept = !!req.body?.accept;
        if (!inviteId) return res.status(400).json({ error: 'invite_id_required' });
        const invite = stGetInviteById.get(inviteId);
        if (!invite) return res.status(404).json({ error: 'invite_not_found' });
        if (String(invite.to_user_id) !== userId) return res.status(403).json({ error: 'invite_forbidden' });
        if (String(invite.status) !== 'pending') return res.status(400).json({ error: 'invite_not_pending' });
        if (accept) {
          const inviterWaiting = isCoopInviterWaiting(invite.party_key, invite.from_user_id);
          if (!inviterWaiting) {
            stUpdateInviteStatus.run('expired', Date.now(), inviteId);
            return res.status(410).json({ error: 'invite_expired_host_not_waiting' });
          }
        }
        stUpdateInviteStatus.run(accept ? 'accepted' : 'rejected', Date.now(), inviteId);
        return res.json({
          ok: true,
          inviteId,
          status: accept ? 'accepted' : 'rejected',
          partyKey: accept ? String(invite.party_key || '') : ''
        });
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.get('/user/progress', (req, res) => {
      try {
        const { userId } = verifyAuthHeader(req);
        return res.json(readProgress(userId));
      } catch (err) {
        return res.status(401).json({ error: String(err?.message || err) });
      }
    });
    expressApp.put('/user/progress', (req, res) => {
      try {
        const { userId } = verifyAuthHeader(req);
        const safe = sanitizeProgressPayload(req.body || {});
        const now = Date.now();
        stUpsertProgress.run(
          userId,
          safe.gold,
          JSON.stringify(safe.relicState),
          JSON.stringify(safe.records),
          now
        );
        return res.json(readProgress(userId));
      } catch (err) {
        return res.status(400).json({ error: String(err?.message || err) });
      }
    });
    expressApp.post('/auth/google', authHandler);
  }
});

gameServer.define('battle', BattleRoom);
gameServer.define('battle_survival', BattleSurvivalRoom);
gameServer.define('battle_coop', class BattleCoopRoom extends BattleSurvivalRoom {
  onCreate(options = {}) {
    super.onCreate({ ...options, mode: 'coop' });
  }
}).filterBy(['partyKey']);

gameServer.listen(PORT).then(() => {
  console.log(`[game-server:colyseus] listening on :${PORT}`);
});



