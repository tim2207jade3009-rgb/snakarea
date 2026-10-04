import { GameMode, PlayerProfile, GameRewardResult, LeaderboardEntry } from '../src/types/game';

// ─── CLIENT TO SERVER MESSAGES ────────────────────────────────────────

export interface AuthInitMessage {
  type: 'AUTH_INIT';
  sessionToken?: string;
  preferredName?: string;
}

export interface AuthLoginMessage {
  type: 'AUTH_LOGIN';
  username: string;
  password: string;
}

export interface AuthRegisterMessage {
  type: 'AUTH_REGISTER';
  username: string;
  password: string;
  email?: string;
  guestSessionToken?: string; // Optional: link existing guest progress to new registered account
}

export interface AuthLogoutMessage {
  type: 'AUTH_LOGOUT';
}

export interface ClientInputMessage {
  type: 'INPUT';
  angle: number;
  isBoosting: boolean;
  seq: number;
}

export interface JoinMatchmakingMessage {
  type: 'JOIN_MATCHMAKING';
  name?: string;
  avatarId?: string;
  skinId?: string;
  mode: GameMode;
  powers?: any;
}

export interface UsePowerMessage {
  type: 'USE_POWER';
  powerId: 'fireball' | 'shield' | 'dash' | 'frost' | string;
  angle?: number;
}

export interface UpgradePowerMessage {
  type: 'UPGRADE_POWER';
  powerId: string;
}

export interface LeaveRoomMessage {
  type: 'LEAVE_ROOM';
}

export interface PingMessage {
  type: 'PING';
  time: number;
}

export interface GetProfileMessage {
  type: 'GET_PROFILE';
}

export interface UpdateNameMessage {
  type: 'UPDATE_NAME';
  name: string;
}

export interface BuySkinMessage {
  type: 'BUY_SKIN';
  skinId: string;
}

export interface EquipSkinMessage {
  type: 'EQUIP_SKIN';
  skinId: string;
}

export interface EquipAvatarMessage {
  type: 'EQUIP_AVATAR';
  avatarId: string;
}

export interface BuyAvatarMessage {
  type: 'BUY_AVATAR';
  avatarId: string;
}

export interface ResetProgressMessage {
  type: 'RESET_PROGRESS';
}

export interface SyncPreferencesMessage {
  type: 'SYNC_PREFERENCES';
  name?: string;
  equippedSkinId?: string;
  avatarId?: string;
}

export interface RespawnMessage {
  type: 'RESPAWN';
}

export type ClientMessage =
  | AuthInitMessage
  | AuthLoginMessage
  | AuthRegisterMessage
  | AuthLogoutMessage
  | ClientInputMessage
  | JoinMatchmakingMessage
  | LeaveRoomMessage
  | PingMessage
  | GetProfileMessage
  | UpdateNameMessage
  | BuySkinMessage
  | EquipSkinMessage
  | EquipAvatarMessage
  | BuyAvatarMessage
  | ResetProgressMessage
  | SyncPreferencesMessage
  | RespawnMessage
  | UsePowerMessage
  | UpgradePowerMessage;

// ─── SERVER TO CLIENT MESSAGES ────────────────────────────────────────

export interface AuthSuccessMessage {
  type: 'AUTH_SUCCESS';
  sessionToken: string;
  accountId: string;
  profile: PlayerProfile;
  isRegistered?: boolean;
}

export interface AuthErrorMessage {
  type: 'AUTH_ERROR';
  code: string;
  message: string;
}

export interface AuthLogoutSuccessMessage {
  type: 'AUTH_LOGOUT_SUCCESS';
  newSessionToken: string;
  newProfile: PlayerProfile;
}

export interface CompactSegment {
  x: number;
  y: number;
}

export interface NetSnake {
  id: string;
  name: string;
  isPlayer: boolean;
  isBot: boolean;
  x: number;
  y: number;
  angle: number;
  speed: number;
  mass: number;
  isBoosting: boolean;
  skinId: string;
  segments: CompactSegment[];
  kills: number;
  dead: boolean;
  spawnProtectionUntil: number;
  shieldActive?: boolean;
  dashActive?: boolean;
  isSlowed?: boolean;
  magnetLevel?: number;
}

export interface CompactOrb {
  id: number;
  x: number;
  y: number;
  r: number;
  c: string;
  v: number;
}

export interface CompactProjectile {
  id: number;
  ownerId: string;
  type: 'fireball';
  x: number;
  y: number;
  angle: number;
  radius: number;
}

export interface CompactEffect {
  id: number;
  type: 'explosion' | 'shield_break' | 'frost_wave' | 'dash_burst';
  x: number;
  y: number;
  radius?: number;
}

export interface WorldSnapshotMessage {
  type: 'SNAPSHOT';
  t: number;
  snakes: NetSnake[];
  orbs: CompactOrb[];
  leaderboard: LeaderboardEntry[];
  totalAlive: number;
  realPlayersCount: number;
  projectiles?: CompactProjectile[];
  effects?: CompactEffect[];
}

export interface PowerUpgradedMessage {
  type: 'POWER_UPGRADED';
  success: boolean;
  powerId: string;
  newLevel: number;
  profile: PlayerProfile;
  error?: string;
}

export interface MatchmakingStatusMessage {
  type: 'MATCHMAKING_STATUS';
  status: 'SEARCHING' | 'FOUND' | 'JOINING' | 'ERROR';
  message: string;
  roomId?: string;
  mode?: GameMode;
  realPlayersCount?: number;
}

export interface RoomJoinedMessage {
  type: 'ROOM_JOINED';
  roomId: string;
  playerId: string;
  mode: GameMode;
  arenaRadius: number;
  tickRate: number;
}

export interface SnakeDiedMessage {
  type: 'SNAKE_DIED';
  deadSnakeId: string;
  deadSnakeName: string;
  killerId?: string;
  killerName?: string;
  isYou: boolean;
  finalMass: number;
  finalKills: number;
  finalRank: number;
  survivalSeconds: number;
  rewardResult?: GameRewardResult;
  updatedProfile?: PlayerProfile;
}

export interface KillFeedMessage {
  type: 'KILL_FEED';
  killerName: string;
  victimName: string;
  mass: number;
  isYouKiller: boolean;
}

export interface ProfileUpdatedMessage {
  type: 'PROFILE_UPDATED';
  profile: PlayerProfile;
  success: boolean;
  message?: string;
}

export interface PongMessage {
  type: 'PONG';
  time: number;
}

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

export interface PlayerRespawnedMessage {
  type: 'PLAYER_RESPAWNED';
  success: boolean;
  coins: number;
  profile?: PlayerProfile;
  error?: string;
  respawnMass?: number;
  snakeId?: string;
}

export type ServerMessage =
  | AuthSuccessMessage
  | AuthErrorMessage
  | AuthLogoutSuccessMessage
  | WorldSnapshotMessage
  | MatchmakingStatusMessage
  | RoomJoinedMessage
  | SnakeDiedMessage
  | KillFeedMessage
  | ProfileUpdatedMessage
  | PongMessage
  | ErrorMessage
  | PlayerRespawnedMessage
  | PowerUpgradedMessage;
