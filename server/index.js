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
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const AUTH_RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000));
const AUTH_RATE_LIMIT_MAX = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 40));
const PVP_DB_PATH = process.env.PVP_DB_PATH || path.join(process.cwd(), 'server', 'pvp.sqlite');
const APP_DB_PATH = process.env.APP_DB_PATH
  || process.env.PROGRESS_DB_PATH
  || path.join(process.cwd(), 'server', 'app.sqlite');

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

const ENEMY_CONTACT_DAMAGE = {
  scout: 7,
  tank: 12,
  brute: 12,
  elite: 18
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

function ensurePvpPlayer(userId, name) {
  if (!userId) return null;
  const now = Date.now();
  stInsertPlayer.run({ user_id: userId, name: String(name || 'Player'), updated_at: now });
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
  onCreate() {
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
    this.startedAt = Date.now();
    this.roundStartAt = 0;
    this.setSimulationInterval((dt) => this.updatePve(dt));

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
      if (this.state.phase !== 'running') {
        st.name = String(msg?.name || st.name || 'Player');
        const fax = Number(msg?.ax);
        const fay = Number(msg?.ay);
        if (Number.isFinite(fax) && Number.isFinite(fay)) {
          const al = Math.hypot(fax, fay) || 1;
          st.facingX = fax / al;
          st.facingY = fay / al;
        }
        return;
      }
      st.name = String(msg?.name || st.name || 'Player');
      const fax = Number(msg?.ax);
      const fay = Number(msg?.ay);
      if (Number.isFinite(fax) && Number.isFinite(fay)) {
        const al = Math.hypot(fax, fay) || 1;
        st.facingX = fax / al;
        st.facingY = fay / al;
      }
    });

    this.onMessage('pvp.damage', (c, msg) => {
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
      if (!attacker) return;
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
      this.broadcast('pve.damage', { id, hp: e.hp, damage: dmg, fromSid });
      if (e.hp <= 0) {
        const xpGain = e.type === 'elite' ? 28 : e.type === 'tank' ? 16 : 10;
        this.grantPvpXp(fromSid, xpGain);
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
        maxHpMul: 1,
        moveMul: 1,
        ranks: Object.create(null),
        unspentLevelups: 0
      };
    }
    return base;
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

  calcPveEnemyStats(type, difficultyScalar, elapsedSec) {
    let hp = 18;
    let speed = 110;
    if (type === 'tank') {
      hp = Math.floor(34 * difficultyScalar);
      speed = 90 * difficultyScalar;
    } else if (type === 'elite') {
      hp = Math.floor(24 * difficultyScalar);
      speed = 135 * difficultyScalar;
    } else {
      hp = Math.floor(10 * difficultyScalar);
      speed = 140 * difficultyScalar;
    }
    const slowMul = elapsedSec < 45 ? 0.42 : (elapsedSec < 90 ? 0.56 : 0.74);
    speed *= slowMul;
    return {
      hp: clamp(Math.floor(hp), 1, 999999),
      speed: clamp(speed, 1, 99999)
    };
  }

  pickPveSpawnPoint() {
    const players = Array.from(this.state.players.values()).filter((p) => p.hp > 0);
    const centerX = players.length > 0
      ? players.reduce((acc, p) => acc + p.x, 0) / players.length
      : WORLD_W * 0.5;
    const centerY = players.length > 0
      ? players.reduce((acc, p) => acc + p.y, 0) / players.length
      : WORLD_H * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const radius = randInt(460, 760);
    return {
      x: clamp(centerX + Math.cos(angle) * radius, ARENA_MIN_X, ARENA_MAX_X),
      y: clamp(centerY + Math.sin(angle) * radius, ARENA_MIN_Y, ARENA_MAX_Y)
    };
  }

  spawnPveEnemy(elapsedSec) {
    const r = Math.random();
    let type = 'scout';
    if (elapsedSec > 45 && r > 0.76) type = 'tank';
    if (elapsedSec > 90 && r > 0.9) type = 'elite';
    const { x, y } = this.pickPveSpawnPoint();
    const difficulty = this.getPvpDifficultyScalar(elapsedSec);
    const stats = this.calcPveEnemyStats(type, difficulty, elapsedSec);
    const id = `sp_${this.pveSeq++}_${Math.floor(elapsedSec * 1000)}`;
    this.pveEnemies.set(id, {
      id,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed
    });
    const stEnemy = new EnemyState();
    stEnemy.id = id;
    stEnemy.type = type;
    stEnemy.x = x;
    stEnemy.y = y;
    stEnemy.hp = stats.hp;
    stEnemy.maxHp = stats.hp;
    stEnemy.speed = stats.speed;
    this.state.enemies.set(id, stEnemy);
    this.broadcast('pve.spawn', {
      id,
      type,
      x,
      y,
      hp: stats.hp,
      speed: stats.speed,
      vx: 0,
      vy: 0
    });
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

    for (const [sid, st] of this.state.players.entries()) {
      if (!st || st.hp <= 0) continue;
      const combat = this.getCombatProfile(sid);
      const regen = Math.max(0, Number(combat.hpRegenPerSec || 0));
      if (regen <= 0 || st.hp >= st.maxHp) continue;
      st.hp = Math.min(st.maxHp, st.hp + regen * dtSec);
    }

    this.pveSpawnAccMs += dtMs;
    const spawnEveryMs = Math.max(420, 1380 - elapsedSec * 7);
    const aliveCap = Math.min(56, 14 + Math.floor(elapsedSec / 10));
    while (this.pveSpawnAccMs >= spawnEveryMs && this.pveEnemies.size < aliveCap) {
      this.pveSpawnAccMs -= spawnEveryMs;
      this.spawnPveEnemy(elapsedSec);
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

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      const vx = (dx / len) * enemy.speed;
      const vy = (dy / len) * enemy.speed;
      enemy.vx = vx;
      enemy.vy = vy;
      enemy.x = clamp(enemy.x + vx * dtSec, ARENA_MIN_X, ARENA_MAX_X);
      enemy.y = clamp(enemy.y + vy * dtSec, ARENA_MIN_Y, ARENA_MAX_Y);
      const stEnemy = this.state.enemies.get(id);
      if (stEnemy) {
        stEnemy.x = enemy.x;
        stEnemy.y = enemy.y;
      }

      if (bestDist <= PLAYER_CONTACT_RADIUS) {
        const contactKey = `${id}|${targetSid}`;
        const lastHit = this.pveContactAt.get(contactKey) || 0;
        if (now - lastHit >= 440) {
          this.pveContactAt.set(contactKey, now);
          const dmg = ENEMY_CONTACT_DAMAGE[enemy.type] || ENEMY_CONTACT_DAMAGE.scout;
          target.hp = Math.max(0, target.hp - dmg);
          this.broadcast('pvp.damage', { fromSid: id, toSid: targetSid, damage: dmg, hp: target.hp });
          if (target.hp <= 0 && this.state.phase !== 'ended') {
            const winnerSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== targetSid) || '';
            this.finalizeMatch(winnerSid, 'hp_zero');
            return;
          }
        }
      }
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

  onJoin(client, _options, auth) {
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
    }
  }

  finalizeMatch(winnerSid, reason) {
    if (this.state.phase === 'ended') return;
    this.state.phase = 'ended';
    this.pveEnemies.clear();
    this.state.enemies.clear();
    this.state.winnerSid = winnerSid || '';
    this.broadcast('match.end', { winnerSid: winnerSid || null, reason });

    if (!this.resultCommitted) {
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
      const winnerSid = this.clients.map((x) => x.sessionId).find((sid) => sid !== client.sessionId) || '';
      if (winnerSid) this.finalizeMatch(winnerSid, 'disconnect');
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
  return { userId };
}

const gameServer = new Server({
  transport: new WebSocketTransport({
    pingInterval: 3000,
    pingMaxRetries: 2
  }),
  express: (expressApp) => {
    expressApp.use(cors({ origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN, credentials: false }));
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

gameServer.listen(PORT).then(() => {
  console.log(`[game-server:colyseus] listening on :${PORT}`);
});



