export interface Point {
  x: number;
  y: number;
}

export interface FoodOrb {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  value: number;
  pulseOffset: number;
}

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface SkinOption {
  id: string;
  name: string;
  rarity: SkinRarity;
  price: number;
  headColor: string;
  bodyColors: string[];
  eyeColor: string;
  glowColor: string;
  pattern?: 'solid' | 'stripes' | 'neon' | 'rings' | 'gradient' | 'cosmic' | 'dragon';
  animated?: boolean;
  description?: string;
}

export interface CoinsReward {
  total: number;
  massReward: number;
  killReward: number;
  rankReward: number;
  survivalReward: number;
}

export interface SnakeSegment {
  x: number;
  y: number;
}

export interface Snake {
  id: string;
  name: string;
  isPlayer: boolean;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  speed: number;
  mass: number;
  isBoosting: boolean;
  skin: SkinOption;
  segments: SnakeSegment[];
  kills: number;
  dead: boolean;
  turnSpeed: number;
  spawnProtectionUntil: number;
  respawnAt?: number;
}

export interface ArenaStats {
  kills: number;
  bestLength: number;
  bestScore: number;
  gamesPlayed: number;
  totalKills: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  mass: number;
  isPlayer: boolean;
}

// ─── PROGRESSION & RANKING TYPES ─────────────────────────────────────

export type GameMode = 'CLASSIC' | 'RANKED';

export type RankTier =
  | 'Bronze III'
  | 'Bronze II'
  | 'Bronze I'
  | 'Silver III'
  | 'Silver II'
  | 'Silver I'
  | 'Gold III'
  | 'Gold II'
  | 'Gold I'
  | 'Platinum III'
  | 'Platinum II'
  | 'Platinum I'
  | 'Diamond III'
  | 'Diamond II'
  | 'Diamond I'
  | 'Master'
  | 'Grandmaster';

export interface AvatarOption {
  id: string;
  name: string;
  emoji: string;
  unlockLevel?: number;
  unlockCoins?: number;
  unlockRank?: RankTier;
  description: string;
  bgColor: string;
  borderColor: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  totalKills: number;
  bestScore: number;
  bestMass: number;
  totalPlayTime: number; // in seconds
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
}

export interface PlayerProfile {
  id: string; // 'local_player'
  name: string;
  coins: number;
  level: number;
  xp: number; // current XP in the level
  rank: RankTier;
  rr: number; // 0 to 100 Rank Rating
  avatarId: string;
  unlockedAvatars: string[];
  unlockedSkins: string[];
  unlockedAbilities: string[]; // List of ability IDs
  equippedAbilityId?: string;
  equippedSkinId: string;
  stats: PlayerStats;
  updatedAt: number;
  isRegistered?: boolean;
}

export interface GameRewardResult {
  coins: CoinsReward;
  xpEarned: number;
  rrChange: number;
  levelUp: boolean;
  oldLevel: number;
  newLevel: number;
  rankChanged: 'up' | 'down' | null;
  oldRank: RankTier;
  newRank: RankTier;
  bonusCoinsFromLevelUp: number;
}

// ─── DAILY MISSIONS TYPES ─────────────────────────────────────────────

export type MissionType = 'EAT_ORBS' | 'SURVIVE_TIME' | 'ELIMINATE_SNAKES' | 'REACH_MASS' | 'PLAY_GAMES';

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  target: number;
  rewardCoins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  icon: string;
}

export interface PlayerDailyMissions {
  dateKey: string;
  missions: DailyMission[];
}
