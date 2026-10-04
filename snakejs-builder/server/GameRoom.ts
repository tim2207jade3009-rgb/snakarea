import { WebSocket } from 'ws';
import { GameMode, SkinOption, LeaderboardEntry } from '../src/types/game';
import { SKINS } from '../src/data/skins';
import { profileStore } from './ProfileStore';
import {
  WorldSnapshotMessage,
  NetSnake,
  CompactOrb,
  CompactSegment,
  SnakeDiedMessage,
  KillFeedMessage,
  ServerMessage,
} from './protocol';

export const ARENA_RADIUS = 2600;
const TICK_RATE = 25; // 25 ticks/sec for snappy multiplayer
const TICK_MS = 1000 / TICK_RATE;
const MAX_PLAYERS_PER_ROOM = 40;
const TARGET_TOTAL_SNAKES = 10;
const INITIAL_ORB_COUNT = 450;
const MAX_ORB_COUNT = 800;

const BOT_NAMES = [
  'ViperKing', 'ShadowFang', 'SlitherGod', 'ApexPredator', 'NeonCobra',
  'TitanBoa', 'Zenith', 'GlitchSnake', 'MasterOuroboros', 'FrenchViper',
  'SpeedyG', 'Kaa_99', 'DragonLord', 'GhostStriker', 'ElectricEel',
  'ThunderWorm', 'BlackMamba', 'HydraX', 'Ragnarok', 'ZeroCool',
  'CyberVenom', 'PixelReaper', 'NovaSerpent', 'ToxicByte', 'Vortex9',
  'IronScales', 'BlazeTail', 'StarGazer', 'FrostBite', 'DarkNemesis',
];

const ORB_COLORS = [
  '#00f0ff', '#10b981', '#f43f5e', '#fbbf24', '#a855f7',
  '#38bdf8', '#fb923c', '#4ade80', '#e879f9', '#facc15',
];

interface InternalSnake {
  id: string;
  socketId?: string;
  ws?: WebSocket;
  playerId?: string;
  name: string;
  isPlayer: boolean;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  speed: number;
  mass: number;
  previousMass?: number;
  isBoosting: boolean;
  skinId: string;
  segments: { x: number; y: number }[];
  kills: number;
  eatenOrbs: number;
  unflushedEatenOrbs: number;
  magnetRadius: number;
  unlockedAbilities: string[];
  dead: boolean;
  turnSpeed: number;
  spawnProtectionUntil: number;
  shieldUntil?: number;
  slowedUntil?: number;
  respawnAt?: number;
  startTime: number;
  lastInputSeq: number;
}

function calculateMagnetRadius(unlockedAbilities?: string[]): number {
  if (!unlockedAbilities || unlockedAbilities.length === 0) return 0;
  let maxLevel = 0;
  for (let lvl = 1; lvl <= 10; lvl++) {
    if (unlockedAbilities.includes(`magnet_${lvl}`)) {
      maxLevel = lvl;
    }
  }
  return maxLevel > 0 ? 70 + maxLevel * 20 : 0;
}

interface InternalOrb {
  id: number;
  x: number;
  y: number;
  r: number;
  c: string;
  v: number;
}

export class GameRoom {
  public id: string;
  public mode: GameMode;
  public createdAt: number = Date.now();
  private isDestroyed: boolean = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private nextOrbId: number = 1;

  private snakes: Map<string, InternalSnake> = new Map();
  private sockets: Map<string, WebSocket> = new Map();
  private orbs: InternalOrb[] = [];
  private boostDropAccumulators: Map<string, number> = new Map();
  private tickCounter: number = 0;

  constructor(id: string, mode: GameMode) {
    this.id = id;
    this.mode = mode;
    this.initOrbs();
    this.populateBots();
    this.startLoop();
  }

  private getRandomArenaPos(margin = 250): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * (ARENA_RADIUS - margin);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  private initOrbs() {
    this.orbs = [];
    for (let i = 0; i < INITIAL_ORB_COUNT; i++) {
      const pos = this.getRandomArenaPos(80);
      const isBig = Math.random() < 0.12;
      this.orbs.push({
        id: this.nextOrbId++,
        x: pos.x,
        y: pos.y,
        r: isBig ? 6.5 : 3.2,
        c: ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
        v: isBig ? 4 : 1,
      });
    }
  }

  private createSnake(
    id: string,
    name: string,
    isPlayer: boolean,
    skinId: string,
    socketId?: string,
    ws?: WebSocket,
    playerId?: string,
    initialMass = 40
  ): InternalSnake {
    let x = 0;
    let y = 0;
    let safeSpawn = false;
    let attempts = 0;
    const existing = Array.from(this.snakes.values());

    while (!safeSpawn && attempts < 20) {
      attempts++;
      const pos = this.getRandomArenaPos(350);
      x = pos.x;
      y = pos.y;
      safeSpawn = true;
      for (const other of existing) {
        if (!other.dead && Math.hypot(other.x - x, other.y - y) < 450) {
          safeSpawn = false;
          break;
        }
      }
    }

    const angle = Math.random() * Math.PI * 2;
    const initialLength = Math.floor(16 + Math.pow(initialMass, 0.55) * 2.2);
    const headRadius = 12 + Math.sqrt(initialMass) * 1.0;
    const segSpacing = headRadius * 0.52;

    const segments: { x: number; y: number }[] = [];
    for (let i = 0; i < initialLength; i++) {
      segments.push({
        x: x - Math.cos(angle) * i * segSpacing,
        y: y - Math.sin(angle) * i * segSpacing,
      });
    }

    let unlockedAbilities: string[] = [];
    if (isPlayer && playerId) {
      try {
        const prof = profileStore.getProfile(playerId);
        if (prof) {
          unlockedAbilities = prof.unlockedAbilities || [];
        }
      } catch (err) {
        console.warn('Error reading profile in createSnake:', err);
      }
    }
    const magnetRadius = calculateMagnetRadius(unlockedAbilities);

    return {
      id,
      socketId,
      ws,
      playerId,
      name,
      isPlayer,
      x,
      y,
      angle,
      targetAngle: angle,
      speed: 3.8,
      mass: initialMass,
      isBoosting: false,
      skinId,
      segments,
      kills: 0,
      eatenOrbs: 0,
      unflushedEatenOrbs: 0,
      magnetRadius,
      unlockedAbilities,
      dead: false,
      turnSpeed: isPlayer ? 0.12 : 0.062,
      spawnProtectionUntil: Date.now() + (isPlayer ? 4500 : 3000),
      startTime: Date.now(),
      lastInputSeq: 0,
    };
  }

  private populateBots() {
    const activeCount = Array.from(this.snakes.values()).filter((s) => !s.dead).length;
    const needed = Math.max(0, TARGET_TOTAL_SNAKES - activeCount);
    if (needed <= 0) return;

    // To prevent lag spikes, only spawn one bot per check
    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const skin = SKINS[Math.floor(Math.random() * SKINS.length)].id;
    const mass = Math.floor(25 + Math.random() * 55 + (Math.random() < 0.08 ? 50 : 0));
    const bot = this.createSnake(botId, name, false, skin, undefined, undefined, undefined, mass);
    this.snakes.set(botId, bot);
  }

  public addPlayer(
    socketId: string,
    ws: WebSocket,
    playerId: string,
    name: string,
    skinId: string
  ): InternalSnake {
    this.sockets.set(socketId, ws);

    // If snake exists with same socket, respawn
    this.snakes.delete(socketId);

    // Also remove any other snakes with same accountId (ghosts from previous connections)
    for (const [sid, s] of this.snakes.entries()) {
      if (s.playerId === playerId && s.isPlayer) {
        this.snakes.delete(sid);
      }
    }

    const validSkinId = SKINS.some((s) => s.id === skinId) ? skinId : 'cyber_cyan';
    const playerSnake = this.createSnake(
      socketId,
      name.slice(0, 16),
      true,
      validSkinId,
      socketId,
      ws,
      playerId,
      40
    );

    this.snakes.set(socketId, playerSnake);
    return playerSnake;
  }

  public removePlayer(socketId: string) {
    this.sockets.delete(socketId);
    const snake = this.snakes.get(socketId);
    if (snake) {
      if (!snake.dead) {
        this.killSnake(snake);
        // If they were alive and disconnected, we remove them to prevent ghost snakes
        this.snakes.delete(socketId);
      } else {
        // If they were already dead, keep them in the map for a while
        // so they can still click "Respawn" if they reconnect quickly.
        // They will be cleaned up when the room is destroyed or if they join again.
        snake.ws = undefined;
      }
    }
  }

  public getSnakes(): Map<string, InternalSnake> {
    return this.snakes;
  }

  public respawnPlayer(socketId: string, accountId: string, ws?: WebSocket) {
    let snake: InternalSnake | undefined = this.snakes.get(socketId);
    
    // Try to find by accountId if socket changed
    if (!snake) {
      for (const [sid, s] of this.snakes.entries()) {
        if (s.playerId === accountId && s.isPlayer) {
          snake = s;
          // If socket changed, remove the old mapping
          if (sid !== socketId) {
            this.snakes.delete(sid);
          }
          break;
        }
      }
    }

    if (!snake) {
      return { success: false, error: 'Joueur introuvable dans la salle.' };
    }

    // Update socket and WS in case of reconnection
    if (ws) {
      snake.ws = ws;
      snake.socketId = socketId;
      // Ensure it's correctly mapped under the current socketId
      this.snakes.set(socketId, snake);
    }

    if (!snake.dead) {
      return { success: false, error: 'Le serpent est déjà en vie.' };
    }

    const res = profileStore.respawn(accountId);
    if (!res.success) {
      return res;
    }

    let x = 0;
    let y = 0;
    let safeSpawn = false;
    let attempts = 0;
    const existing = Array.from(this.snakes.values());

    while (!safeSpawn && attempts < 25) {
      attempts++;
      const pos = this.getRandomArenaPos(400);
      x = pos.x;
      y = pos.y;
      safeSpawn = true;
      for (const other of existing) {
        if (!other.dead && Math.hypot(other.x - x, other.y - y) < 450) {
          safeSpawn = false;
          break;
        }
      }
    }

    const angle = Math.random() * Math.PI * 2;
    const initialMass = Math.max(40, snake.previousMass || 40);
    const initialLength = Math.floor(16 + Math.pow(initialMass, 0.55) * 2.2);
    const headRadius = 12 + Math.sqrt(initialMass) * 1.0;
    const segSpacing = headRadius * 0.52;

    const segments: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < initialLength; i++) {
      segments.push({
        x: x - Math.cos(angle) * i * segSpacing,
        y: y - Math.sin(angle) * i * segSpacing,
      });
    }

    snake.x = x;
    snake.y = y;
    snake.angle = angle;
    snake.targetAngle = angle;
    snake.mass = initialMass;
    snake.kills = 0;
    snake.eatenOrbs = 0;
    snake.unflushedEatenOrbs = 0;
    snake.dead = false;
    snake.segments = segments;
    snake.spawnProtectionUntil = Date.now() + 4500;
    snake.startTime = Date.now();

    if (res.profile) {
      snake.unlockedAbilities = res.profile.unlockedAbilities || [];
      snake.magnetRadius = calculateMagnetRadius(snake.unlockedAbilities);
    }

    return {
      success: true,
      coins: res.coins,
      profile: res.profile,
      respawnMass: initialMass,
      snakeId: snake.id,
    };
  }

  public refreshPlayerProfile(playerId: string) {
    try {
      const prof = profileStore.getProfile(playerId);
      if (!prof) return;
      for (const snake of this.snakes.values()) {
        if (snake.playerId === playerId) {
          snake.unlockedAbilities = prof.unlockedAbilities || [];
          snake.magnetRadius = calculateMagnetRadius(snake.unlockedAbilities);
        }
      }
    } catch (err) {
      console.warn('Error in refreshPlayerProfile:', err);
    }
  }

  public handlePlayerInput(socketId: string, angle: number, isBoosting: boolean, seq: number) {
    const snake = this.snakes.get(socketId);
    if (!snake || snake.dead) return;

    // Validate angle
    if (!isNaN(angle) && isFinite(angle)) {
      snake.targetAngle = angle;
    }
    snake.isBoosting = Boolean(isBoosting) && snake.mass > 25;
    snake.lastInputSeq = seq;
  }

  public usePower(socketId: string, powerId: string, _angle?: number) {
    let snake = this.snakes.get(socketId);
    if (!snake) {
      for (const s of this.snakes.values()) {
        if (s.socketId === socketId || s.playerId === socketId) {
          snake = s;
          break;
        }
      }
    }
    if (!snake || snake.dead) return;

    // Authoritative check: Player MUST have purchased and unlocked the ability
    if (snake.isPlayer) {
      const unlocked = snake.unlockedAbilities || [];

      if (powerId === 'shield' && !unlocked.includes('shield')) {
        return;
      }
      if ((powerId === 'frost' || powerId === 'frost_pulse') && !unlocked.includes('frost_pulse')) {
        return;
      }
      if ((powerId === 'fireball' || powerId === 'fire_aura') && !unlocked.includes('fireball')) {
        return;
      }
    }

    if (powerId === 'shield') {
      snake.shieldUntil = Date.now() + 5000;
    } else if (powerId === 'frost' || powerId === 'frost_pulse') {
      const now = Date.now();
      const frostDuration = 6000; // 6s duration
      for (const [sid, s] of this.snakes.entries()) {
        if (s.id !== snake.id && (sid !== socketId || !s.isPlayer)) {
          s.slowedUntil = now + frostDuration;
        }
      }
    }
  }

  private killSnake(deadSnake: InternalSnake, killerSnake?: InternalSnake) {
    if (deadSnake.dead) return;

    const now = Date.now();
    // Shield protection: completely immune to death
    if (deadSnake.shieldUntil && deadSnake.shieldUntil > now) {
      return;
    }
    // Spawn protection: completely immune to death
    if (deadSnake.spawnProtectionUntil && deadSnake.spawnProtectionUntil > now) {
      return;
    }

    // A killer that is currently protected (shield or spawn protection) cannot kill other players
    if (killerSnake) {
      const killerProtected =
        (killerSnake.shieldUntil && killerSnake.shieldUntil > now) ||
        (killerSnake.spawnProtectionUntil && killerSnake.spawnProtectionUntil > now);
      if (killerProtected) {
        return;
      }
    }

    deadSnake.previousMass = deadSnake.mass;
    deadSnake.dead = true;
    deadSnake.respawnAt = Date.now() + 1800;
    this.boostDropAccumulators.delete(deadSnake.id);

    // Mass conversion: 95% dropped as energy orbs
    const massToDrop = Math.max(25, Math.floor(deadSnake.mass * 0.95));
    const segments = deadSnake.segments;
    const segCount = segments.length;

    const orbCount = Math.max(12, Math.min(75, Math.ceil(segCount * 0.85)));
    const baseVal = Math.max(1, Math.floor(massToDrop / orbCount));
    const remainder = massToDrop % orbCount;
    const skinObj = SKINS.find((s) => s.id === deadSnake.skinId) || SKINS[0];

    const droppedOrbs: InternalOrb[] = [];
    for (let i = 0; i < orbCount; i++) {
      const segIndex = Math.min(segCount - 1, Math.floor((i / orbCount) * segCount));
      const seg = segments[segIndex] || { x: deadSnake.x, y: deadSnake.y };
      const scatterAngle = Math.random() * Math.PI * 2;
      const scatterDist = Math.random() * 16;
      const orbValue = baseVal + (i < remainder ? 1 : 0);

      const orbColor = skinObj.bodyColors[i % skinObj.bodyColors.length] || skinObj.headColor;

      droppedOrbs.push({
        id: this.nextOrbId++,
        x: seg.x + Math.cos(scatterAngle) * scatterDist,
        y: seg.y + Math.sin(scatterAngle) * scatterDist,
        r: Math.min(10.5, 4.0 + Math.sqrt(orbValue) * 1.5),
        c: orbColor,
        v: orbValue,
      });
    }

    // Cluster at head
    for (let h = 0; h < 4; h++) {
      const hAngle = (h / 4) * Math.PI * 2;
      droppedOrbs.push({
        id: this.nextOrbId++,
        x: deadSnake.x + Math.cos(hAngle) * 20,
        y: deadSnake.y + Math.sin(hAngle) * 20,
        r: 8.5,
        c: skinObj.headColor,
        v: Math.max(3, baseVal * 2),
      });
    }

    this.orbs = this.orbs.concat(droppedOrbs);
    if (this.orbs.length > MAX_ORB_COUNT) {
      this.orbs = this.orbs.slice(this.orbs.length - MAX_ORB_COUNT);
    }

    // Killer rewards
    if (killerSnake) {
      killerSnake.kills += 1;
      this.broadcast({
        type: 'KILL_FEED',
        killerName: killerSnake.name,
        victimName: deadSnake.name,
        mass: Math.floor(deadSnake.mass),
        isYouKiller: false,
      });
    }

    // If the dead entity is a real connected player:
    if (deadSnake.isPlayer && deadSnake.ws && deadSnake.playerId) {
      const survivalSec = Math.max(2, Math.floor((Date.now() - deadSnake.startTime) / 1000));
      const leaderboard = this.getLeaderboard();
      const rankEntry = leaderboard.find((e) => e.name === deadSnake.name);
      const finalRank = rankEntry ? rankEntry.rank : leaderboard.length;

      // Flush remainder of eaten orbs to daily missions
      const remainderOrbs = (deadSnake.eatenOrbs || 0) % 5;
      if (remainderOrbs > 0) {
        try {
          profileStore.updateDailyMissionProgress(deadSnake.playerId, [
            { missionType: 'EAT_ORBS', increment: remainderOrbs },
          ]);
        } catch {
          // Ignore
        }
      }

      // Authoritative database update on server
      const { rewardResult, updatedProfile } = profileStore.applyMatchResults(
        deadSnake.playerId,
        this.mode,
        Math.floor(deadSnake.mass),
        deadSnake.kills,
        finalRank,
        survivalSec,
        this.snakes.size
      );

      const deathMsg: SnakeDiedMessage = {
        type: 'SNAKE_DIED',
        deadSnakeId: deadSnake.id,
        deadSnakeName: deadSnake.name,
        killerId: killerSnake?.id,
        killerName: killerSnake?.name,
        isYou: true,
        finalMass: Math.floor(deadSnake.mass),
        finalKills: deadSnake.kills,
        finalRank,
        survivalSeconds: survivalSec,
        rewardResult,
        updatedProfile,
      };

      if (deadSnake.ws.readyState === WebSocket.OPEN) {
        try {
          deadSnake.ws.send(JSON.stringify(deathMsg));
        } catch (err) {
          console.warn('Failed to send SNAKE_DIED message:', err);
        }
      }
    }
  }

  private getLeaderboard(): LeaderboardEntry[] {
    const list = Array.from(this.snakes.values())
      .filter((s) => !s.dead)
      .sort((a, b) => b.mass - a.mass);

    return list.map((s, idx) => ({
      rank: idx + 1,
      name: s.name,
      mass: Math.floor(s.mass),
      isPlayer: s.isPlayer,
    }));
  }

  private tick(dt: number) {
    try {
      const now = Date.now();
      this.tickCounter++;
      
      // Safety: Cap dt to prevent massive jumps or NaN if performance.now() is weird
      const safeDt = Math.min(0.25, Math.max(0.001, dt || 0.016));
      const dtFactor = safeDt * 60; // normalized to 60fps scale
      const snakes = Array.from(this.snakes.values());

      // 1. Process Bot AI
      for (const snake of snakes) {
        if (snake.dead || snake.isPlayer) continue;

        snake.isBoosting = false;
        
        // Boundary check is cheap, do it every tick
        const distToCenter = Math.hypot(snake.x, snake.y);
        if (distToCenter > ARENA_RADIUS - 350) {
          snake.targetAngle = Math.atan2(-snake.y, -snake.x);
          continue;
        }

        // Expensive AI logic only every 8 ticks to save CPU
        // Jitter based on snake id to spread load perfectly across the cycle
        const snakeHash = snake.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        if ((this.tickCounter + snakeHash) % 8 !== 0) continue;

        // Natural threat detection with reaction latency & blind spots
        let threatFound = false;
        const forwardDist = 30 + Math.sqrt(Math.max(1, snake.mass)) * 0.5; // Reduced look-ahead
        const forwardX = snake.x + Math.cos(snake.angle) * forwardDist;
        const forwardY = snake.y + Math.sin(snake.angle) * forwardDist;

        for (const other of snakes) {
          if (other.dead || other.id === snake.id) continue;
          
          // Skip snakes too far away
          if (Math.hypot(snake.x - other.x, snake.y - other.y) > 350) continue; // Reduced check radius

          // Check even fewer segments (every 12th)
          for (let sIdx = 0; sIdx < other.segments.length; sIdx += 12) {
            const seg = other.segments[sIdx];
            if (!seg) continue;
            if (Math.hypot(forwardX - seg.x, forwardY - seg.y) < 38) {
              const awayAngle = Math.atan2(snake.y - seg.y, snake.x - seg.x);
              snake.targetAngle = awayAngle + (Math.random() - 0.5) * 0.2; // Less aggressive turn
              threatFound = true;
              break;
            }
          }
          if (threatFound) break;
        }

        if (!threatFound) {
          // Wander or eat
          let nearestOrb: InternalOrb | null = null;
          let nearestDist = 180; // Reduced food detection range

          // Scan even fewer orbs (step 15)
          for (let oIdx = 0; oIdx < this.orbs.length; oIdx += 15) {
            const orb = this.orbs[oIdx];
            if (!orb) continue;
            const d = Math.hypot(orb.x - snake.x, orb.y - snake.y);
            if (d < nearestDist) {
              nearestDist = d;
              nearestOrb = orb;
            }
          }

          if (nearestOrb) {
            const o = nearestOrb as InternalOrb;
            snake.targetAngle = Math.atan2(o.y - snake.y, o.x - snake.x);
          } else {
            if (Math.random() < 0.15) { 
              snake.targetAngle += (Math.random() - 0.5) * 0.6; // Gentler wandering
            }
          }
        }
      }

      // 2. Physics Movement & Segments IK
      for (const snake of snakes) {
        if (snake.dead) continue;

        if (!Number.isFinite(snake.angle)) snake.angle = 0;
        const targetAngle = Number.isFinite(snake.targetAngle) ? snake.targetAngle : 0;
        const angleDiff = Math.atan2(Math.sin(targetAngle - snake.angle), Math.cos(targetAngle - snake.angle));

        const effectiveTurn = snake.isPlayer
          ? snake.isBoosting
            ? 0.14
            : 0.12
          : 0.055; // Slightly slower turn for bots

        const turnFactor = 1 - Math.pow(1 - effectiveTurn, dtFactor);
        snake.angle += angleDiff * turnFactor;

        const safeMass = Math.max(1, isNaN(snake.mass) ? 40 : snake.mass);
        let baseSpeed = snake.isPlayer
          ? Math.max(3.8, 4.3 - Math.pow(safeMass, 0.16) * 0.11)
          : Math.max(2.6, 3.1 - Math.pow(safeMass, 0.18) * 0.11);

        // Frost slow effect: bots and enemy snakes move 2x slower (50% speed)
        if (snake.slowedUntil && snake.slowedUntil > now) {
          baseSpeed *= 0.5;
        }

        const currentSpeed = snake.isBoosting && snake.mass > 25 ? baseSpeed * 2.15 : baseSpeed;
        snake.speed = currentSpeed;

        const moveDist = currentSpeed * dtFactor;
        snake.x += Math.cos(snake.angle) * moveDist;
        snake.y += Math.sin(snake.angle) * moveDist;

        // Boosting mass drain
        if (snake.isBoosting && snake.mass > 25) {
          snake.mass -= 0.08 * dtFactor;
          if (isNaN(snake.mass)) snake.mass = 25;
          let acc = this.boostDropAccumulators.get(snake.id) || 0;
          acc += dtFactor;
          if (acc >= 3.5 && this.orbs.length < MAX_ORB_COUNT) {
            acc = 0;
            const tail = snake.segments[snake.segments.length - 1];
            if (tail) {
              this.orbs.push({
                id: this.nextOrbId++,
                x: tail.x + (Math.random() - 0.5) * 8,
                y: tail.y + (Math.random() - 0.5) * 8,
                r: 2.5,
                c: '#fbbf24',
                v: 1,
              });
            }
          }
          this.boostDropAccumulators.set(snake.id, acc);
        }

        // Boundary Check
        const distFromCenter = Math.hypot(snake.x, snake.y);
        if (distFromCenter >= ARENA_RADIUS || isNaN(distFromCenter)) {
          this.killSnake(snake);
          continue;
        }

        // IK Segment update
        const targetLength = Math.min(500, Math.floor(16 + Math.pow(safeMass, 0.55) * 2.2));
        const headRadius = 12 + Math.sqrt(safeMass) * 1.0;
        const segSpacing = headRadius * 0.52;

        while (snake.segments.length < targetLength) {
          const last = snake.segments[snake.segments.length - 1] || { x: snake.x, y: snake.y };
          snake.segments.push({ x: last.x, y: last.y });
        }
        if (snake.segments.length > targetLength) {
          snake.segments.length = targetLength;
        }

        if (snake.segments.length === 0) {
          snake.segments.push({ x: snake.x, y: snake.y });
        }

        snake.segments[0].x = snake.x;
        snake.segments[0].y = snake.y;

        for (let j = 1; j < snake.segments.length; j++) {
          const prev = snake.segments[j - 1];
          const curr = snake.segments[j];
          if (!prev || !curr) continue;
          const dx = prev.x - curr.x;
          const dy = prev.y - curr.y;
          const dist = Math.hypot(dx, dy);

          if (dist > segSpacing) {
            const ratio = (dist - segSpacing) / dist;
            curr.x += dx * ratio;
            curr.y += dy * ratio;
          }
        }
      }

      // 3. Snake Collisions (Head into other Snake Body)
      for (let i = 0; i < snakes.length; i++) {
        const snakeA = snakes[i];
        if (snakeA.dead) continue;

        const isAProtected =
          (snakeA.spawnProtectionUntil && snakeA.spawnProtectionUntil > now) ||
          (snakeA.shieldUntil && snakeA.shieldUntil > now);
        if (isAProtected) continue; // Protected snake cannot crash and die

        const headRadiusA = 12 + Math.sqrt(snakeA.mass) * 1.0;

        for (let j = 0; j < snakes.length; j++) {
          const snakeB = snakes[j];
          if (snakeB.dead || snakeA.id === snakeB.id) continue;

          const isBProtected =
            (snakeB.spawnProtectionUntil && snakeB.spawnProtectionUntil > now) ||
            (snakeB.shieldUntil && snakeB.shieldUntil > now);
          if (isBProtected) {
            // A protected snake (shield or spawn) cannot kill others with its body!
            continue;
          }

          const segRadiusB = (12 + Math.sqrt(snakeB.mass) * 1.0) * 0.85;
          const killDist = (headRadiusA + segRadiusB) * 0.72;

          for (let sIdx = 0; sIdx < snakeB.segments.length; sIdx++) {
            const seg = snakeB.segments[sIdx];
            if (!seg) continue;
            const d = Math.hypot(snakeA.x - seg.x, snakeA.y - seg.y);
            if (d < killDist) {
              this.killSnake(snakeA, snakeB);
              break;
            }
          }
          if (snakeA.dead) break;
        }
      }

      // 4. Head-to-Head Collisions
      for (let i = 0; i < snakes.length; i++) {
        const snakeA = snakes[i];
        if (snakeA.dead) continue;

        for (let j = i + 1; j < snakes.length; j++) {
          const snakeB = snakes[j];
          if (snakeB.dead) continue;

          const headDist = Math.hypot(snakeA.x - snakeB.x, snakeA.y - snakeB.y);
          const rA = 12 + Math.sqrt(snakeA.mass) * 1.0;
          const rB = 12 + Math.sqrt(snakeB.mass) * 1.0;

          if (headDist < (rA + rB) * 0.78) {
            const aProtected =
              (snakeA.spawnProtectionUntil && snakeA.spawnProtectionUntil > now) ||
              (snakeA.shieldUntil && snakeA.shieldUntil > now);
            const bProtected =
              (snakeB.spawnProtectionUntil && snakeB.spawnProtectionUntil > now) ||
              (snakeB.shieldUntil && snakeB.shieldUntil > now);

            // If EITHER snake is protected (shield or spawn protection), neither snake can kill the other!
            if (aProtected || bProtected) {
              continue;
            }

            // Favor real players in head-to-head duels when neither is protected
            if (snakeA.isPlayer && !snakeB.isPlayer) {
              if (snakeA.mass >= snakeB.mass * 0.85) {
                this.killSnake(snakeB, snakeA);
              } else {
                this.killSnake(snakeA, snakeB);
              }
            } else if (!snakeA.isPlayer && snakeB.isPlayer) {
              if (snakeB.mass >= snakeA.mass * 0.85) {
                this.killSnake(snakeA, snakeB);
              } else {
                this.killSnake(snakeB, snakeA);
              }
            } else {
              if (snakeA.mass > snakeB.mass * 1.05) {
                this.killSnake(snakeB, snakeA);
              } else if (snakeB.mass > snakeA.mass * 1.05) {
                this.killSnake(snakeA, snakeB);
              } else {
                if (Math.random() < 0.5) {
                  this.killSnake(snakeB, snakeA);
                } else {
                  this.killSnake(snakeA, snakeB);
                }
              }
            }
            break;
          }
        }
      }

      // 5. Food Eating & Magnet Ability (Zero DB lookups in the loop!)
      const eatenOrbIds = new Set<number>();
      for (const snake of snakes) {
        if (snake.dead) continue;

        const magnetRadius = snake.magnetRadius || 0;
        const headRadius = 12 + Math.sqrt(snake.mass) * 1.0;
        const eatRadius = headRadius + (snake.isBoosting ? 20 : 10);
        const maxRange = Math.max(eatRadius, magnetRadius);

        for (const orb of this.orbs) {
          if (eatenOrbIds.has(orb.id)) continue;

          // Fast rejection box to save CPU
          const dx = snake.x - orb.x;
          const dy = snake.y - orb.y;
          if (Math.abs(dx) > maxRange || Math.abs(dy) > maxRange) continue;

          const dist = Math.hypot(dx, dy);

          if (magnetRadius > 0 && dist < magnetRadius && dist > eatRadius) {
            const pullSpeed = 4.5 + (dist / magnetRadius) * 2.0;
            const angleToHead = Math.atan2(snake.y - orb.y, snake.x - orb.x);
            orb.x += Math.cos(angleToHead) * pullSpeed;
            orb.y += Math.sin(angleToHead) * pullSpeed;
          }

          const distAfterPull = Math.hypot(snake.x - orb.x, snake.y - orb.y);
          if (distAfterPull < eatRadius) {
            eatenOrbIds.add(orb.id);
            snake.mass += orb.v;
            if (snake.isPlayer && snake.playerId) {
              snake.eatenOrbs = (snake.eatenOrbs || 0) + 1;
              snake.unflushedEatenOrbs = (snake.unflushedEatenOrbs || 0) + 1;
              if (snake.unflushedEatenOrbs >= 20) {
                const toFlush = snake.unflushedEatenOrbs;
                snake.unflushedEatenOrbs = 0;
                try {
                  profileStore.updateDailyMissionProgress(snake.playerId, [
                    { missionType: 'EAT_ORBS', increment: toFlush },
                  ]);
                } catch {
                  // Ignore
                }
              }
            }
          }
        }
      }

      if (eatenOrbIds.size > 0) {
        this.orbs = this.orbs.filter((o) => !eatenOrbIds.has(o.id));
      }

      // 6. Food maintenance
      if (this.orbs.length < INITIAL_ORB_COUNT) {
        const needed = Math.min(15, INITIAL_ORB_COUNT - this.orbs.length);
        for (let n = 0; n < needed; n++) {
          const pos = this.getRandomArenaPos(60);
          this.orbs.push({
            id: this.nextOrbId++,
            x: pos.x,
            y: pos.y,
            r: 3 + Math.random() * 2,
            c: ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
            v: 1,
          });
        }
      }

      // 7. Respawn bots (staggered - only one per tick)
      let botRespawnedThisTick = false;
      for (const snake of snakes) {
        if (snake.dead && !snake.isPlayer) {
          const respawnTime = snake.respawnAt || 0;
          if (now >= respawnTime && !botRespawnedThisTick) {
            const skin = SKINS[Math.floor(Math.random() * SKINS.length)].id;
            const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            const newBot = this.createSnake(
              `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name,
              false,
              skin,
              undefined,
              undefined,
              undefined,
              Math.floor(25 + Math.random() * 45)
            );
            this.snakes.set(newBot.id, newBot);
            this.snakes.delete(snake.id);
            botRespawnedThisTick = true; // Stop after spawning one to spread load
          }
        }
      }

      // Maintain population occasionally (every 3 seconds)
      if (this.tickCounter % 75 === 0) {
        this.populateBots();
      }

      // 8. Broadcast authoritative world state snapshot
      this.broadcastSnapshot();
    } catch (err) {
      console.error(`[GameRoom ${this.id}] Error in tick():`, err);
    }
  }

  private broadcastSnapshot() {
    if (this.sockets.size === 0) return;

    try {
      const allSnakes = Array.from(this.snakes.values()).filter(s => !s.dead);
      const leaderboard = this.getLeaderboard();
      const realPlayersCount = Array.from(this.snakes.values()).filter((s) => s.isPlayer && !s.dead).length;
      const now = Date.now();

      for (const [socketId, ws] of this.sockets.entries()) {
        if (ws.readyState !== WebSocket.OPEN) continue;

        const viewer = this.snakes.get(socketId);
        if (!viewer || viewer.dead) {
            // If viewer is dead or gone, send a minimal snapshot for the game over screen or spectating
            const snapshot: WorldSnapshotMessage = {
              type: 'SNAPSHOT',
              t: now,
              snakes: [],
              orbs: [],
              leaderboard,
              totalAlive: allSnakes.length,
              realPlayersCount,
            };
            try {
              ws.send(JSON.stringify(snapshot));
            } catch {}
            continue;
        }

        // Filter snakes: only include those within a reasonable distance (viewport + margin)
        const nearbySnakes: NetSnake[] = [];
        for (const s of allSnakes) {
          const distSq = Math.pow(s.x - viewer.x, 2) + Math.pow(s.y - viewer.y, 2);
          if (distSq < 2000 * 2000 || s.id === viewer.id) {
            nearbySnakes.push({
              id: s.id,
              name: s.name,
              isPlayer: s.isPlayer,
              isBot: !s.isPlayer,
              x: Math.round(s.x * 10) / 10,
              y: Math.round(s.y * 10) / 10,
              angle: Math.round(s.angle * 100) / 100,
              speed: Math.round(s.speed * 10) / 10,
              mass: Math.round(s.mass),
              isBoosting: s.isBoosting,
              skinId: s.skinId,
              segments: s.segments.map((seg) => ({
                x: Math.round(seg.x * 10) / 10,
                y: Math.round(seg.y * 10) / 10,
              })),
              kills: s.kills,
              dead: s.dead,
              spawnProtectionUntil: s.spawnProtectionUntil,
            });
          }
        }

        // Filter orbs: only include nearby orbs
        const nearbyOrbs: CompactOrb[] = [];
        for (const o of this.orbs) {
          const distSq = Math.pow(o.x - viewer.x, 2) + Math.pow(o.y - viewer.y, 2);
          if (distSq < 1300 * 1300) {
            nearbyOrbs.push({
              id: o.id,
              x: Math.round(o.x),
              y: Math.round(o.y),
              r: Math.round(o.r * 10) / 10,
              c: o.c,
              v: o.v,
            });
          }
        }

        const snapshot: WorldSnapshotMessage = {
          type: 'SNAPSHOT',
          t: now,
          snakes: nearbySnakes,
          orbs: nearbyOrbs,
          leaderboard,
          totalAlive: allSnakes.length,
          realPlayersCount,
        };
        try {
          ws.send(JSON.stringify(snapshot));
        } catch {}
      }
    } catch (err) {
      console.error(`[GameRoom ${this.id}] Error in broadcastSnapshot():`, err);
    }
  }

  private broadcast(msg: ServerMessage) {
    try {
      const payload = JSON.stringify(msg);
      for (const ws of this.sockets.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
          } catch {}
        }
      }
    } catch (err) {
      console.error(`[GameRoom ${this.id}] Error in broadcast():`, err);
    }
  }

  private startLoop() {
    let lastTime = performance.now();
    this.loopInterval = setInterval(() => {
      try {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        this.tick(dt);
      } catch (err) {
        console.error(`[GameRoom ${this.id}] Unhandled loop error:`, err);
      }
    }, TICK_MS);
  }

  public getPlayerCount(): number {
    return this.sockets.size;
  }

  public isFull(): boolean {
    return this.sockets.size >= MAX_PLAYERS_PER_ROOM;
  }

  public destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    this.sockets.clear();
    this.snakes.clear();
    this.orbs = [];
  }
}
