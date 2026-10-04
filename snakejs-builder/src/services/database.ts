import { PlayerProfile, PlayerStats, RankTier } from '../types/game';
import { RANK_TIERS } from '../utils/ranking';
import { SKINS } from '../data/skins';
import { AVATARS } from '../data/avatars';

const DB_NAME = 'snakeArenaDB';
const DB_VERSION = 1;
const STORE_NAME = 'playerProfile';
const PROFILE_KEY = 'local_player';

export const DEFAULT_PROFILE: PlayerProfile = {
  id: PROFILE_KEY,
  name: 'Vipère',
  coins: 50, // Starter bonus
  level: 1,
  xp: 0,
  rank: 'Bronze III',
  rr: 0,
  avatarId: 'avatar_viper',
  unlockedAvatars: ['avatar_viper', 'avatar_cobra', 'avatar_neon'],
  unlockedSkins: ['cyber_cyan', 'toxic_lime'],
  unlockedAbilities: [],
  equippedSkinId: 'cyber_cyan',
  stats: {
    gamesPlayed: 0,
    wins: 0,
    totalKills: 0,
    bestScore: 0,
    bestMass: 0,
    totalPlayTime: 0,
  },
  updatedAt: Date.now(),
};

let dbInstance: IDBDatabase | null = null;

/**
 * Opens or initializes the IndexedDB database instance
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB n’est pas supporté par ce navigateur.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Checks for existing legacy localStorage data and migrates it seamlessly
 */
function migrateFromLocalStorage(): PlayerProfile | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawCoins = localStorage.getItem('snake_arena_coins');
    const rawSkins = localStorage.getItem('snake_arena_unlocked_skins');
    const rawEquipped = localStorage.getItem('snake_arena_equipped_skin');
    const rawStats = localStorage.getItem('snake_arena_stats');
    const rawName = localStorage.getItem('snake_arena_name');

    if (!rawCoins && !rawSkins && !rawStats) {
      return null; // Nothing to migrate
    }

    const migrated: PlayerProfile = { ...DEFAULT_PROFILE };

    if (rawCoins) {
      const parsedCoins = parseInt(rawCoins, 10);
      if (!isNaN(parsedCoins) && parsedCoins >= 0) {
        migrated.coins = Math.max(migrated.coins, parsedCoins);
      }
    }

    if (rawName && rawName.trim().length > 0) {
      migrated.name = rawName.trim().slice(0, 16);
    }

    if (rawSkins) {
      try {
        const skinsArr = JSON.parse(rawSkins);
        if (Array.isArray(skinsArr) && skinsArr.length > 0) {
          migrated.unlockedSkins = Array.from(new Set([...migrated.unlockedSkins, ...skinsArr]));
        }
      } catch {
        // keep default
      }
    }

    if (rawEquipped && typeof rawEquipped === 'string') {
      migrated.equippedSkinId = rawEquipped;
    }

    if (rawStats) {
      try {
        const s = JSON.parse(rawStats);
        migrated.stats = {
          gamesPlayed: typeof s.gamesPlayed === 'number' ? s.gamesPlayed : 0,
          wins: 0,
          totalKills: typeof s.totalKills === 'number' ? s.totalKills : (typeof s.kills === 'number' ? s.kills : 0),
          bestScore: typeof s.bestScore === 'number' ? s.bestScore : 0,
          bestMass: typeof s.bestLength === 'number' ? s.bestLength : 0,
          totalPlayTime: 0,
        };
      } catch {
        // keep default
      }
    }

    return migrated;
  } catch (err) {
    console.warn('Erreur lors de la migration localStorage:', err);
    return null;
  }
}

/**
 * Initializes and retrieves the player profile from IndexedDB,
 * creating it or migrating from localStorage if needed.
 */
export async function getPlayerProfile(): Promise<PlayerProfile> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(PROFILE_KEY);

    request.onsuccess = () => {
      const data = request.result as PlayerProfile | undefined;
      if (data && data.id === PROFILE_KEY) {
        // Verify sanity & ensure all required fields are present
        const merged: PlayerProfile = {
          ...DEFAULT_PROFILE,
          ...data,
          stats: {
            ...DEFAULT_PROFILE.stats,
            ...(data.stats || {}),
          },
          unlockedAvatars: data.unlockedAvatars && data.unlockedAvatars.length > 0
            ? data.unlockedAvatars
            : DEFAULT_PROFILE.unlockedAvatars,
          unlockedSkins: data.unlockedSkins && data.unlockedSkins.length > 0
            ? data.unlockedSkins
            : DEFAULT_PROFILE.unlockedSkins,
        };
        resolve(merged);
      } else {
        // First run: check for localStorage migration or create default
        const migrated = migrateFromLocalStorage();
        const initialProfile = migrated || DEFAULT_PROFILE;

        // Save initial profile
        savePlayerProfile(initialProfile)
          .then(() => resolve(initialProfile))
          .catch((e) => {
            console.error('Échec sauvegarde initiale IndexedDB:', e);
            resolve(initialProfile);
          });
      }
    };

    request.onerror = () => {
      console.warn('Erreur lecture IndexedDB, fallback mémoire/localStorage');
      const fallback = migrateFromLocalStorage() || DEFAULT_PROFILE;
      resolve(fallback);
    };
  });
}

/**
 * Atomically saves the player profile into IndexedDB with data-loss prevention
 */
export async function savePlayerProfile(profile: PlayerProfile): Promise<boolean> {
  // Safety checks against accidental zeroing/corruption
  if (!profile || profile.coins < 0 || profile.level < 1) {
    console.error('Sauvegarde rejetée: données invalides', profile);
    return false;
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const safeProfile: PlayerProfile = {
      ...profile,
      id: PROFILE_KEY,
      updatedAt: Date.now(),
    };

    const request = store.put(safeProfile);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      console.error('Erreur écriture IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Unlocks a skin transactionally: verifies balance, deducts coins, adds skin, equips it
 */
export async function unlockSkinTransaction(
  skinId: string,
  price: number
): Promise<{ success: boolean; profile: PlayerProfile; error?: string }> {
  const current = await getPlayerProfile();

  if (current.unlockedSkins.includes(skinId)) {
    return { success: true, profile: current };
  }

  if (current.coins < price) {
    return {
      success: false,
      profile: current,
      error: 'Solde de Coins insuffisant.',
    };
  }

  const updated: PlayerProfile = {
    ...current,
    coins: current.coins - price,
    unlockedSkins: [...current.unlockedSkins, skinId],
    equippedSkinId: skinId,
  };

  await savePlayerProfile(updated);
  return { success: true, profile: updated };
}

/**
 * Equips a skin if already unlocked
 */
export async function equipSkinTransaction(skinId: string): Promise<PlayerProfile> {
  const current = await getPlayerProfile();
  if (!current.unlockedSkins.includes(skinId)) {
    return current;
  }
  const updated: PlayerProfile = {
    ...current,
    equippedSkinId: skinId,
  };
  await savePlayerProfile(updated);
  return updated;
}

/**
 * Equips an avatar if already unlocked
 */
export async function equipAvatarTransaction(avatarId: string): Promise<PlayerProfile> {
  const current = await getPlayerProfile();
  if (!current.unlockedAvatars.includes(avatarId)) {
    return current;
  }
  const updated: PlayerProfile = {
    ...current,
    avatarId,
  };
  await savePlayerProfile(updated);
  return updated;
}

/**
 * Unlocks an avatar with coins if not yet unlocked
 */
export async function unlockAvatarTransaction(
  avatarId: string,
  price: number
): Promise<{ success: boolean; profile: PlayerProfile; error?: string }> {
  const current = await getPlayerProfile();
  if (current.unlockedAvatars.includes(avatarId)) {
    return { success: true, profile: current };
  }

  if (current.coins < price) {
    return {
      success: false,
      profile: current,
      error: 'Solde de Coins insuffisant.',
    };
  }

  const updated: PlayerProfile = {
    ...current,
    coins: current.coins - price,
    unlockedAvatars: [...current.unlockedAvatars, avatarId],
    avatarId,
  };

  await savePlayerProfile(updated);
  return { success: true, profile: updated };
}

/**
 * Resets local progress and re-creates clean Level 1 profile
 */
export async function resetProgress(): Promise<PlayerProfile> {
  const fresh: PlayerProfile = {
    ...DEFAULT_PROFILE,
    updatedAt: Date.now(),
  };

  await savePlayerProfile(fresh);

  // Clear legacy localStorage as well so it doesn't re-trigger migration
  if (typeof window !== 'undefined') {
    localStorage.removeItem('snake_arena_coins');
    localStorage.removeItem('snake_arena_unlocked_skins');
    localStorage.removeItem('snake_arena_equipped_skin');
    localStorage.removeItem('snake_arena_stats');
  }

  return fresh;
}

/**
 * Exports player data to a formatted JSON string for backup
 */
export async function exportSave(): Promise<string> {
  const profile = await getPlayerProfile();
  const exportPayload = {
    app: 'snake-arena-io',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Imports and validates a player backup JSON string
 */
export async function importSave(
  jsonString: string
): Promise<{ success: boolean; profile?: PlayerProfile; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString);

    const profileData: Partial<PlayerProfile> = parsed.profile || parsed;

    if (!profileData || typeof profileData !== 'object') {
      return { success: false, error: 'Format de fichier de sauvegarde invalide.' };
    }

    // Deep validation
    const coins = typeof profileData.coins === 'number' && profileData.coins >= 0 ? profileData.coins : 0;
    const level = typeof profileData.level === 'number' && profileData.level >= 1 ? profileData.level : 1;
    const xp = typeof profileData.xp === 'number' && profileData.xp >= 0 ? profileData.xp : 0;
    const rr = typeof profileData.rr === 'number' && profileData.rr >= 0 ? Math.min(100, profileData.rr) : 0;

    const rank: RankTier =
      profileData.rank && RANK_TIERS.includes(profileData.rank as RankTier)
        ? (profileData.rank as RankTier)
        : 'Bronze III';

    const name =
      typeof profileData.name === 'string' && profileData.name.trim().length > 0
        ? profileData.name.trim().slice(0, 16)
        : 'Vipère';

    const unlockedSkins = Array.isArray(profileData.unlockedSkins)
      ? profileData.unlockedSkins.filter((id) => SKINS.some((s) => s.id === id))
      : ['cyber_cyan', 'toxic_lime'];

    const equippedSkinId =
      typeof profileData.equippedSkinId === 'string' && SKINS.some((s) => s.id === profileData.equippedSkinId)
        ? profileData.equippedSkinId
        : 'cyber_cyan';

    const unlockedAvatars = Array.isArray(profileData.unlockedAvatars)
      ? profileData.unlockedAvatars.filter((id) => AVATARS.some((a) => a.id === id))
      : ['avatar_viper', 'avatar_cobra', 'avatar_neon'];

    const avatarId =
      typeof profileData.avatarId === 'string' && AVATARS.some((a) => a.id === profileData.avatarId)
        ? profileData.avatarId
        : 'avatar_viper';

    const rawStats = (profileData.stats as Record<string, unknown> | undefined) || {};
    const stats: PlayerStats = {
      gamesPlayed: Math.max(0, Number(rawStats.gamesPlayed) || 0),
      wins: Math.max(0, Number(rawStats.wins) || 0),
      totalKills: Math.max(0, Number(rawStats.totalKills) || 0),
      bestScore: Math.max(0, Number(rawStats.bestScore) || 0),
      bestMass: Math.max(0, Number(rawStats.bestMass) || 0),
      totalPlayTime: Math.max(0, Number(rawStats.totalPlayTime) || 0),
    };

    const validatedProfile: PlayerProfile = {
      id: PROFILE_KEY,
      name,
      coins,
      level,
      xp,
      rank,
      rr,
      avatarId,
      unlockedAvatars: unlockedAvatars.length > 0 ? unlockedAvatars : ['avatar_viper'],
      unlockedSkins: unlockedSkins.length > 0 ? unlockedSkins : ['cyber_cyan', 'toxic_lime'],
      unlockedAbilities: Array.isArray(profileData.unlockedAbilities) ? (profileData.unlockedAbilities as string[]) : [],
      equippedSkinId,
      stats,
      updatedAt: Date.now(),
    };

    await savePlayerProfile(validatedProfile);
    return { success: true, profile: validatedProfile };
  } catch (err: unknown) {
    return {
      success: false,
      error: `Erreur d’importation : ${err instanceof Error ? err.message : 'Fichier JSON corrompu'}`,
    };
  }
}
