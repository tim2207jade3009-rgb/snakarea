import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { PlayerProfile, GameMode, GameRewardResult, CoinsReward, RankTier, DailyMission, PlayerDailyMissions, MissionType } from '../src/types/game';
import { SKINS } from '../src/data/skins';
import { AVATARS } from '../src/data/avatars';
import { calculateRankedRRChange, processRRChange } from '../src/utils/ranking';
import { calculateGameXp, processXpGain } from '../src/utils/progression';
import { PRODUCTS, RESPAWN_COST, CoinProduct } from './Products';
import { DAILY_MISSION_DEFINITIONS, getTodayDateKey } from './DailyMissions';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'snake-arena.sqlite');
const PROFILES_JSON_FILE = path.join(DATA_DIR, 'profiles.json');
const SESSIONS_JSON_FILE = path.join(DATA_DIR, 'sessions.json');

const DEFAULT_PROFILE_TEMPLATE: Omit<PlayerProfile, 'id' | 'name' | 'updatedAt'> = {
  coins: 50,
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
};

// Brute-force rate limiter (in-memory sliding window)
class LoginAttemptLimiter {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();

  public isBlocked(key: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (now > entry.resetAt) {
      this.attempts.delete(key);
      return false;
    }
    return entry.count >= 8; // Max 8 failed attempts in 5 minutes
  }

  public recordFailedAttempt(key: string) {
    const now = Date.now();
    const entry = this.attempts.get(key) || { count: 0, resetAt: now + 5 * 60 * 1000 };
    if (now > entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + 5 * 60 * 1000;
    } else {
      entry.count += 1;
    }
    this.attempts.set(key, entry);
  }

  public reset(key: string) {
    this.attempts.delete(key);
  }
}

export class SqliteDatabase {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private isReady: boolean = false;
  private initPromise: Promise<void>;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private loginLimiter = new LoginAttemptLimiter();

  constructor() {
    this.initPromise = this.initialize();
  }

  public async waitUntilReady(): Promise<void> {
    await this.initPromise;
  }

  private async initialize() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      this.SQL = await initSqlJs();

      if (fs.existsSync(SQLITE_FILE)) {
        const fileBuffer = fs.readFileSync(SQLITE_FILE);
        this.db = new this.SQL.Database(fileBuffer);
      } else {
        this.db = new this.SQL.Database();
      }

      // Configure WAL / fast pragmas & create tables
      this.db.run(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL DEFAULT '',
          email TEXT,
          avatar_id TEXT NOT NULL,
          equipped_skin_id TEXT NOT NULL,
          coins INTEGER NOT NULL DEFAULT 50,
          xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 1,
          rank TEXT NOT NULL DEFAULT 'Bronze III',
          rr INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS account_skins (
          account_id TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          PRIMARY KEY (account_id, skin_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS account_avatars (
          account_id TEXT NOT NULL,
          avatar_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          PRIMARY KEY (account_id, avatar_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS player_stats (
          account_id TEXT PRIMARY KEY,
          games_played INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          total_kills INTEGER NOT NULL DEFAULT 0,
          best_score INTEGER NOT NULL DEFAULT 0,
          best_mass INTEGER NOT NULL DEFAULT 0,
          total_play_time INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_accounts_updated ON accounts(updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
      `);

      // Migration check: Add password_hash & email columns if older schema exists
      this.ensureColumnsExist();

      // Run JSON migration if needed
      this.migrateFromProfilesJson();

      this.isReady = true;
      this.persistToDiskNow();
      console.log('📦 SQLite Database initialized successfully (data/snake-arena.sqlite)');
    } catch (err) {
      console.error('CRITICAL: SQLite database initialization failed:', err);
      throw err;
    }
  }

  private ensureColumnsExist() {
    if (!this.db) return;
    try {
      this.db.run("ALTER TABLE accounts ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';");
    } catch {}
    try {
      this.db.run('ALTER TABLE accounts ADD COLUMN email TEXT;');
    } catch {}
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS daily_missions (
          account_id TEXT NOT NULL,
          date_key TEXT NOT NULL,
          mission_id TEXT NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          claimed INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (account_id, date_key, mission_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
      `);
    } catch {}
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS account_claims (
          account_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          claimed_at INTEGER NOT NULL,
          PRIMARY KEY (account_id, product_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS account_abilities (
          account_id TEXT NOT NULL,
          ability_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          PRIMARY KEY (account_id, ability_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
      `);
    } catch {}
  }

  public getClaimedProducts(accountId: string): string[] {
    if (!this.db || !accountId) return [];
    const stmt = this.db.prepare('SELECT product_id FROM account_claims WHERE account_id = ?');
    stmt.bind([accountId]);
    const claimed: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { product_id: string };
      claimed.push(row.product_id);
    }
    stmt.free();
    return claimed;
  }

  public getUnlockedAbilities(accountId: string): string[] {
    if (!this.db || !accountId) return [];
    const stmt = this.db.prepare('SELECT ability_id FROM account_abilities WHERE account_id = ?');
    stmt.bind([accountId]);
    const abilities: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { ability_id: string };
      abilities.push(row.ability_id);
    }
    stmt.free();
    return abilities;
  }

  public claimProduct(accountId: string, productId: string): { success: boolean; coinsGranted: number; error?: string } {
    if (!this.db) throw new Error('Database not ready');

    const product = PRODUCTS[productId];
    if (!product) return { success: false, coinsGranted: 0, error: 'Produit invalide.' };

    this.db.run('BEGIN TRANSACTION;');
    try {
      // Check if already claimed
      const checkStmt = this.db.prepare('SELECT 1 FROM account_claims WHERE account_id = ? AND product_id = ?');
      checkStmt.bind([accountId, productId]);
      const alreadyClaimed = checkStmt.step();
      checkStmt.free();

      if (alreadyClaimed) {
        this.db.run('ROLLBACK;');
        return { success: false, coinsGranted: 0, error: 'Vous avez déjà réclamé ce pack.' };
      }

      const now = Date.now();
      // Grant coins
      this.db.run('UPDATE accounts SET coins = coins + ?, updated_at = ? WHERE id = ?', [
        product.coins,
        now,
        accountId,
      ]);

      // Record claim
      this.db.run('INSERT INTO account_claims (account_id, product_id, claimed_at) VALUES (?, ?, ?)', [
        accountId,
        productId,
        now,
      ]);

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      return { success: true, coinsGranted: product.coins };
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Claim product failed:', err);
      return { success: false, coinsGranted: 0, error: 'Une erreur est survenue.' };
    }
  }

  private migrateFromProfilesJson() {
    if (!this.db) return;

    // Check if migration was already applied
    const res = this.db.exec("SELECT id FROM migrations WHERE id = 'migration_profiles_json'");
    if (res.length > 0 && res[0].values.length > 0) {
      return; // Already migrated
    }

    if (!fs.existsSync(PROFILES_JSON_FILE)) {
      this.db.run("INSERT INTO migrations (id, applied_at) VALUES ('migration_profiles_json', ?)", [Date.now()]);
      return;
    }

    try {
      console.log('🔄 Migrating existing server data from profiles.json into SQLite...');
      const rawProfiles = fs.readFileSync(PROFILES_JSON_FILE, 'utf-8');
      const profilesData = JSON.parse(rawProfiles);

      let sessionsData: Record<string, string> = {};
      if (fs.existsSync(SESSIONS_JSON_FILE)) {
        try {
          sessionsData = JSON.parse(fs.readFileSync(SESSIONS_JSON_FILE, 'utf-8'));
        } catch {}
      }

      this.db.run('BEGIN TRANSACTION;');

      if (typeof profilesData === 'object' && profilesData !== null) {
        for (const [id, prof] of Object.entries(profilesData)) {
          if (!prof || typeof prof !== 'object') continue;
          const p = prof as Partial<PlayerProfile>;
          const accountId = id;
          const username = (p.name && typeof p.name === 'string' ? p.name.trim().slice(0, 16) : 'Vipère') || 'Vipère';
          const avatarId = p.avatarId || 'avatar_viper';
          const equippedSkinId = p.equippedSkinId || 'cyber_cyan';
          const coins = typeof p.coins === 'number' ? Math.max(0, Math.floor(p.coins)) : 50;
          const xp = typeof p.xp === 'number' ? Math.max(0, Math.floor(p.xp)) : 0;
          const level = typeof p.level === 'number' ? Math.max(1, Math.floor(p.level)) : 1;
          const rank = typeof p.rank === 'string' ? p.rank : 'Bronze III';
          const rr = typeof p.rr === 'number' ? Math.max(0, Math.floor(p.rr)) : 0;
          const now = Date.now();
          const updatedAt = typeof p.updatedAt === 'number' ? p.updatedAt : now;

          this.db.run(
            `INSERT OR REPLACE INTO accounts (id, username, password_hash, avatar_id, equipped_skin_id, coins, xp, level, rank, rr, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [accountId, username, '', avatarId, equippedSkinId, coins, xp, level, rank, rr, now, updatedAt]
          );

          // Skins
          const skins = Array.isArray(p.unlockedSkins) ? p.unlockedSkins : ['cyber_cyan', 'toxic_lime'];
          for (const skinId of skins) {
            if (typeof skinId === 'string') {
              this.db.run(
                'INSERT OR IGNORE INTO account_skins (account_id, skin_id, acquired_at) VALUES (?, ?, ?)',
                [accountId, skinId, now]
              );
            }
          }

          // Avatars
          const avatars = Array.isArray(p.unlockedAvatars) ? p.unlockedAvatars : ['avatar_viper', 'avatar_cobra', 'avatar_neon'];
          for (const avId of avatars) {
            if (typeof avId === 'string') {
              this.db.run(
                'INSERT OR IGNORE INTO account_avatars (account_id, avatar_id, acquired_at) VALUES (?, ?, ?)',
                [accountId, avId, now]
              );
            }
          }

          // Stats
          const stats = p.stats || ({} as any);
          this.db.run(
            `INSERT OR REPLACE INTO player_stats (account_id, games_played, wins, total_kills, best_score, best_mass, total_play_time, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              accountId,
              stats.gamesPlayed || 0,
              stats.wins || 0,
              stats.totalKills || 0,
              stats.bestScore || 0,
              stats.bestMass || 0,
              stats.totalPlayTime || 0,
              now,
            ]
          );
        }
      }

      // Sessions
      if (typeof sessionsData === 'object' && sessionsData !== null) {
        for (const [token, accId] of Object.entries(sessionsData)) {
          if (typeof token === 'string' && typeof accId === 'string') {
            this.db.run(
              'INSERT OR REPLACE INTO sessions (token, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
              [token, accId, Date.now(), Date.now()]
            );
          }
        }
      }

      this.db.run("INSERT INTO migrations (id, applied_at) VALUES ('migration_profiles_json', ?)", [Date.now()]);
      this.db.run('COMMIT;');

      // Create backup of old JSON files
      const backupProfiles = path.join(DATA_DIR, `profiles.json.migrated_backup_${Date.now()}`);
      fs.copyFileSync(PROFILES_JSON_FILE, backupProfiles);
      console.log(`✅ Migration complete. Preserved backup at ${backupProfiles}`);
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Error during profiles.json SQLite migration:', err);
    }
  }

  public persistToDiskNow() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tempFile = `${SQLITE_FILE}.tmp.${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      // Use async writeFile to avoid blocking the event loop for a long time
      fs.writeFile(tempFile, buffer, (err) => {
        if (err) {
          console.error('Failed to write temp SQLite file:', err);
          return;
        }
        fs.rename(tempFile, SQLITE_FILE, (err) => {
          if (err) console.error('Failed to rename temp SQLite file:', err);
        });
      });
    } catch (err) {
      console.error('Failed to export SQLite data:', err);
    }
  }

  public schedulePersist() {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.persistToDiskNow();
    }, 250);
  }

  public createBackup(backupName?: string): string {
    this.persistToDiskNow();
    const name = backupName || `snake-arena-backup_${Date.now()}.sqlite`;
    const targetPath = path.join(DATA_DIR, name);
    fs.copyFileSync(SQLITE_FILE, targetPath);
    console.log(`💾 SQLite database backup created: ${targetPath}`);
    return targetPath;
  }

  // ─── USER ACCOUNT REGISTRATION & LOGIN ─────────────────────────────

  public register(
    username: string,
    passwordPlain: string,
    email?: string,
    guestSessionToken?: string
  ): { success: boolean; sessionToken?: string; accountId?: string; profile?: PlayerProfile; error?: string } {
    if (!this.db) throw new Error('Database not ready');

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return { success: false, error: "L'identifiant doit comporter entre 3 et 20 caractères." };
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
      return { success: false, error: "L'identifiant ne peut contenir que des lettres, chiffres, tirets et underscores." };
    }
    if (!passwordPlain || passwordPlain.length < 6) {
      return { success: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' };
    }

    // Check if username is already taken (case-insensitive)
    const checkStmt = this.db.prepare('SELECT id FROM accounts WHERE username = ? COLLATE NOCASE');
    checkStmt.bind([cleanUsername]);
    const exists = checkStmt.step();
    let existingId: string | null = null;
    if (exists) {
      const row = checkStmt.getAsObject() as { id: string };
      existingId = row.id;
    }
    checkStmt.free();

    // Check if promoting guest account
    let guestAccountId: string | null = null;
    if (guestSessionToken) {
      guestAccountId = this.getAccountIdByToken(guestSessionToken);
    }

    if (exists && existingId !== guestAccountId) {
      return { success: false, error: 'Cet identifiant est déjà utilisé. Veuillez en choisir un autre.' };
    }

    // Hash password with bcrypt salt
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(passwordPlain, salt);
    const now = Date.now();

    this.db.run('BEGIN TRANSACTION;');
    try {
      let targetAccountId: string;
      let sessionToken: string;

      if (guestAccountId && this.getProfile(guestAccountId)) {
        // Upgrade existing guest account so they retain their progress, skins, and coins!
        targetAccountId = guestAccountId;
        sessionToken = guestSessionToken || crypto.randomBytes(32).toString('hex');

        this.db.run(
          `UPDATE accounts SET username = ?, password_hash = ?, email = ?, updated_at = ? WHERE id = ?`,
          [cleanUsername, passwordHash, email || null, now, targetAccountId]
        );
      } else {
        // Create new account
        targetAccountId = `acc_${crypto.randomBytes(16).toString('hex')}`;
        sessionToken = crypto.randomBytes(32).toString('hex');

        this.db.run(
          `INSERT INTO accounts (id, username, password_hash, email, avatar_id, equipped_skin_id, coins, xp, level, rank, rr, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            targetAccountId,
            cleanUsername,
            passwordHash,
            email || null,
            DEFAULT_PROFILE_TEMPLATE.avatarId,
            DEFAULT_PROFILE_TEMPLATE.equippedSkinId,
            DEFAULT_PROFILE_TEMPLATE.coins,
            DEFAULT_PROFILE_TEMPLATE.xp,
            DEFAULT_PROFILE_TEMPLATE.level,
            DEFAULT_PROFILE_TEMPLATE.rank,
            DEFAULT_PROFILE_TEMPLATE.rr,
            now,
            now,
          ]
        );

        for (const skinId of DEFAULT_PROFILE_TEMPLATE.unlockedSkins) {
          this.db.run('INSERT INTO account_skins (account_id, skin_id, acquired_at) VALUES (?, ?, ?)', [
            targetAccountId,
            skinId,
            now,
          ]);
        }

        for (const avId of DEFAULT_PROFILE_TEMPLATE.unlockedAvatars) {
          this.db.run('INSERT INTO account_avatars (account_id, avatar_id, acquired_at) VALUES (?, ?, ?)', [
            targetAccountId,
            avId,
            now,
          ]);
        }

        this.db.run(
          `INSERT INTO player_stats (account_id, games_played, wins, total_kills, best_score, best_mass, total_play_time, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [targetAccountId, 0, 0, 0, 0, 0, 0, now]
        );
      }

      // Record session
      this.db.run(
        'INSERT OR REPLACE INTO sessions (token, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
        [sessionToken, targetAccountId, now, now]
      );

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      const profile = this.getProfile(targetAccountId)!;
      return {
        success: true,
        sessionToken,
        accountId: targetAccountId,
        profile,
      };
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Registration failed:', err);
      return { success: false, error: "Une erreur est survenue lors de l'inscription." };
    }
  }

  public login(
    username: string,
    passwordPlain: string,
    clientIp = 'unknown'
  ): { success: boolean; sessionToken?: string; accountId?: string; profile?: PlayerProfile; error?: string } {
    if (!this.db) throw new Error('Database not ready');

    const cleanUsername = username.trim();
    const rateLimitKey = `${clientIp}_${cleanUsername.toLowerCase()}`;

    if (this.loginLimiter.isBlocked(rateLimitKey)) {
      return {
        success: false,
        error: 'Trop de tentatives échouées. Veuillez patienter 5 minutes avant de réessayer.',
      };
    }

    if (!cleanUsername || !passwordPlain) {
      return { success: false, error: 'Identifiant ou mot de passe incorrect' };
    }

    // Look up account
    const stmt = this.db.prepare('SELECT id, password_hash FROM accounts WHERE username = ? COLLATE NOCASE');
    stmt.bind([cleanUsername]);
    if (!stmt.step()) {
      stmt.free();
      this.loginLimiter.recordFailedAttempt(rateLimitKey);
      return { success: false, error: 'Identifiant ou mot de passe incorrect' };
    }

    const row = stmt.getAsObject() as { id: string; password_hash: string };
    stmt.free();

    // Check password
    if (!row.password_hash || !bcrypt.compareSync(passwordPlain, row.password_hash)) {
      this.loginLimiter.recordFailedAttempt(rateLimitKey);
      return { success: false, error: 'Identifiant ou mot de passe incorrect' };
    }

    // Login successful
    this.loginLimiter.reset(rateLimitKey);

    const now = Date.now();
    const sessionToken = crypto.randomBytes(32).toString('hex');

    this.db.run('INSERT INTO sessions (token, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', [
      sessionToken,
      row.id,
      now,
      now,
    ]);
    this.persistToDiskNow();

    const profile = this.getProfile(row.id)!;
    return {
      success: true,
      sessionToken,
      accountId: row.id,
      profile,
    };
  }

  public logout(sessionToken: string): boolean {
    if (!this.db || !sessionToken) return false;
    this.db.run('DELETE FROM sessions WHERE token = ?', [sessionToken]);
    this.persistToDiskNow();
    return true;
  }

  // ─── AUTHENTICATION & SESSIONS ─────────────────────────────────────

  public authenticate(
    sessionToken?: string,
    preferredName?: string
  ): { sessionToken: string; accountId: string; profile: PlayerProfile } {
    if (!this.db) throw new Error('Database not ready');

    const now = Date.now();

    // 1. Check existing session token
    if (sessionToken && typeof sessionToken === 'string' && sessionToken.length >= 32) {
      const stmt = this.db.prepare('SELECT account_id FROM sessions WHERE token = ?');
      stmt.bind([sessionToken]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as { account_id: string };
        stmt.free();

        const accountId = row.account_id;
        this.db.run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', [now, sessionToken]);
        this.schedulePersist();

        const profile = this.getProfile(accountId);
        if (profile) {
          return { sessionToken, accountId, profile };
        }
      } else {
        stmt.free();
      }
    }

    // 2. Generate guest account & cryptographic session token
    const accountId = `acc_${crypto.randomBytes(16).toString('hex')}`;
    const newSessionToken = crypto.randomBytes(32).toString('hex');

    const safeName =
      (preferredName && preferredName.trim().slice(0, 16).replace(/[\x00-\x1F\x7F<>]/g, '')) || 'Vipère';

    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run(
        `INSERT INTO accounts (id, username, password_hash, avatar_id, equipped_skin_id, coins, xp, level, rank, rr, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          safeName,
          '',
          DEFAULT_PROFILE_TEMPLATE.avatarId,
          DEFAULT_PROFILE_TEMPLATE.equippedSkinId,
          DEFAULT_PROFILE_TEMPLATE.coins,
          DEFAULT_PROFILE_TEMPLATE.xp,
          DEFAULT_PROFILE_TEMPLATE.level,
          DEFAULT_PROFILE_TEMPLATE.rank,
          DEFAULT_PROFILE_TEMPLATE.rr,
          now,
          now,
        ]
      );

      for (const skinId of DEFAULT_PROFILE_TEMPLATE.unlockedSkins) {
        this.db.run('INSERT INTO account_skins (account_id, skin_id, acquired_at) VALUES (?, ?, ?)', [
          accountId,
          skinId,
          now,
        ]);
      }

      for (const avId of DEFAULT_PROFILE_TEMPLATE.unlockedAvatars) {
        this.db.run('INSERT INTO account_avatars (account_id, avatar_id, acquired_at) VALUES (?, ?, ?)', [
          accountId,
          avId,
          now,
        ]);
      }

      this.db.run(
        `INSERT INTO player_stats (account_id, games_played, wins, total_kills, best_score, best_mass, total_play_time, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [accountId, 0, 0, 0, 0, 0, 0, now]
      );

      this.db.run('INSERT INTO sessions (token, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', [
        newSessionToken,
        accountId,
        now,
        now,
      ]);

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      const profile = this.getProfile(accountId)!;
      return {
        sessionToken: newSessionToken,
        accountId,
        profile,
      };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  public getAccountIdByToken(sessionToken: string): string | null {
    if (!this.db || !sessionToken) return null;
    const stmt = this.db.prepare('SELECT account_id FROM sessions WHERE token = ?');
    stmt.bind([sessionToken]);
    let accountId: string | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as { account_id: string };
      accountId = row.account_id;
    }
    stmt.free();
    return accountId;
  }

  public getProfile(accountId: string): PlayerProfile | null {
    if (!this.db || !accountId) return null;

    const accStmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    accStmt.bind([accountId]);
    if (!accStmt.step()) {
      accStmt.free();
      return null;
    }
    const acc = accStmt.getAsObject() as {
      id: string;
      username: string;
      password_hash?: string;
      avatar_id: string;
      equipped_skin_id: string;
      coins: number;
      xp: number;
      level: number;
      rank: string;
      rr: number;
      updated_at: number;
    };
    accStmt.free();

    // Fetch unlocked skins
    const skinsStmt = this.db.prepare('SELECT skin_id FROM account_skins WHERE account_id = ?');
    skinsStmt.bind([accountId]);
    const unlockedSkins: string[] = [];
    while (skinsStmt.step()) {
      const row = skinsStmt.getAsObject() as { skin_id: string };
      unlockedSkins.push(row.skin_id);
    }
    skinsStmt.free();

    // Fetch unlocked avatars
    const avatarsStmt = this.db.prepare('SELECT avatar_id FROM account_avatars WHERE account_id = ?');
    avatarsStmt.bind([accountId]);
    const unlockedAvatars: string[] = [];
    while (avatarsStmt.step()) {
      const row = avatarsStmt.getAsObject() as { avatar_id: string };
      unlockedAvatars.push(row.avatar_id);
    }
    avatarsStmt.free();

    // Fetch unlocked abilities
    const abilitiesStmt = this.db.prepare('SELECT ability_id FROM account_abilities WHERE account_id = ?');
    abilitiesStmt.bind([accountId]);
    const unlockedAbilities: string[] = [];
    while (abilitiesStmt.step()) {
      const row = abilitiesStmt.getAsObject() as { ability_id: string };
      unlockedAbilities.push(row.ability_id);
    }
    abilitiesStmt.free();

    // Fetch stats
    const statsStmt = this.db.prepare('SELECT * FROM player_stats WHERE account_id = ?');
    statsStmt.bind([accountId]);
    let stats = {
      gamesPlayed: 0,
      wins: 0,
      totalKills: 0,
      bestScore: 0,
      bestMass: 0,
      totalPlayTime: 0,
    };
    if (statsStmt.step()) {
      const s = statsStmt.getAsObject() as any;
      stats = {
        gamesPlayed: s.games_played || 0,
        wins: s.wins || 0,
        totalKills: s.total_kills || 0,
        bestScore: s.best_score || 0,
        bestMass: s.best_mass || 0,
        totalPlayTime: s.total_play_time || 0,
      };
    }
    statsStmt.free();

    const isRegistered = Boolean(acc.password_hash && acc.password_hash.length > 0);

    return {
      id: acc.id,
      name: acc.username,
      avatarId: acc.avatar_id,
      equippedSkinId: acc.equipped_skin_id,
      coins: acc.coins,
      xp: acc.xp,
      level: acc.level,
      rank: acc.rank as RankTier,
      rr: acc.rr,
      unlockedSkins: unlockedSkins.length > 0 ? unlockedSkins : ['cyber_cyan'],
      unlockedAvatars: unlockedAvatars.length > 0 ? unlockedAvatars : ['avatar_viper'],
      unlockedAbilities: unlockedAbilities,
      stats,
      updatedAt: acc.updated_at,
      isRegistered,
    };
  }

  public updateName(accountId: string, newName: string): { success: boolean; profile: PlayerProfile } {
    if (!this.db) throw new Error('Database not ready');

    const sanitized = newName.trim().slice(0, 16).replace(/[\x00-\x1F\x7F<>]/g, '') || 'Serpent';
    const now = Date.now();

    this.db.run('UPDATE accounts SET username = ?, updated_at = ? WHERE id = ?', [sanitized, now, accountId]);
    this.persistToDiskNow();

    const profile = this.getProfile(accountId)!;
    return { success: true, profile };
  }

  public syncPreferences(
    accountId: string,
    prefs: { name?: string; equippedSkinId?: string; avatarId?: string }
  ): { success: boolean; profile: PlayerProfile } {
    if (!this.db) throw new Error('Database not ready');

    const profile = this.getProfile(accountId);
    if (!profile) throw new Error('Account not found');

    const now = Date.now();
    let newName = profile.name;
    let newSkin = profile.equippedSkinId;
    let newAvatar = profile.avatarId;

    if (prefs.name && typeof prefs.name === 'string') {
      const safe = prefs.name.trim().slice(0, 16).replace(/[\x00-\x1F\x7F<>]/g, '');
      if (safe.length > 0) newName = safe;
    }

    if (prefs.equippedSkinId && profile.unlockedSkins.includes(prefs.equippedSkinId)) {
      newSkin = prefs.equippedSkinId;
    }

    if (prefs.avatarId && profile.unlockedAvatars.includes(prefs.avatarId)) {
      newAvatar = prefs.avatarId;
    }

    this.db.run(
      'UPDATE accounts SET username = ?, equipped_skin_id = ?, avatar_id = ?, updated_at = ? WHERE id = ?',
      [newName, newSkin, newAvatar, now, accountId]
    );
    this.persistToDiskNow();

    return { success: true, profile: this.getProfile(accountId)! };
  }

  // ─── SQLITE TRANSACTIONAL SHOP PURCHASES ───────────────────────────

  public buySkin(accountId: string, skinId: string): { success: boolean; profile: PlayerProfile; message: string } {
    if (!this.db) throw new Error('Database not ready');

    const targetSkin = SKINS.find((s) => s.id === skinId);
    if (!targetSkin) {
      const p = this.getProfile(accountId) || (DEFAULT_PROFILE_TEMPLATE as any);
      return { success: false, profile: p, message: 'Skin introuvable.' };
    }

    this.db.run('BEGIN TRANSACTION;');
    try {
      const profile = this.getProfile(accountId);
      if (!profile) {
        this.db.run('ROLLBACK;');
        return { success: false, profile: DEFAULT_PROFILE_TEMPLATE as any, message: 'Compte non authentifié.' };
      }

      if (profile.unlockedSkins.includes(skinId)) {
        this.db.run('UPDATE accounts SET equipped_skin_id = ?, updated_at = ? WHERE id = ?', [
          skinId,
          Date.now(),
          accountId,
        ]);
        this.db.run('COMMIT;');
        this.persistToDiskNow();
        return { success: true, profile: this.getProfile(accountId)!, message: `Skin ${targetSkin.name} équipé !` };
      }

      const serverPrice = targetSkin.price;
      if (profile.coins < serverPrice) {
        this.db.run('ROLLBACK;');
        return { success: false, profile, message: `Coins insuffisants ! Il vous manque ${serverPrice - profile.coins} 🪙` };
      }

      const now = Date.now();
      this.db.run('UPDATE accounts SET coins = coins - ?, equipped_skin_id = ?, updated_at = ? WHERE id = ?', [
        serverPrice,
        skinId,
        now,
        accountId,
      ]);

      this.db.run('INSERT INTO account_skins (account_id, skin_id, acquired_at) VALUES (?, ?, ?)', [
        accountId,
        skinId,
        now,
      ]);

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      return { success: true, profile: this.getProfile(accountId)!, message: `🎉 Skin ${targetSkin.name} débloqué et équipé !` };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  public buyAbility(accountId: string, abilityId: string, cost: number): { success: boolean; profile: PlayerProfile; message: string } {
    if (!this.db) throw new Error('Database not ready');

    this.db.run('BEGIN TRANSACTION;');
    try {
      const profile = this.getProfile(accountId);
      if (!profile) {
        this.db.run('ROLLBACK;');
        return { success: false, profile: DEFAULT_PROFILE_TEMPLATE as any, message: 'Compte introuvable.' };
      }

      if (profile.unlockedAbilities?.includes(abilityId)) {
        this.db.run('ROLLBACK;');
        return { success: false, profile, message: 'Capacité déjà possédée.' };
      }

      if (profile.coins < cost) {
        this.db.run('ROLLBACK;');
        return { success: false, profile, message: 'Solde insuffisant.' };
      }

      const now = Date.now();
      this.db.run('UPDATE accounts SET coins = coins - ?, updated_at = ? WHERE id = ?', [cost, now, accountId]);
      this.db.run('INSERT INTO account_abilities (account_id, ability_id, acquired_at) VALUES (?, ?, ?)', [
        accountId,
        abilityId,
        now,
      ]);

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      return { success: true, profile: this.getProfile(accountId)!, message: 'Capacité achetée !' };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  public equipSkin(accountId: string, skinId: string): { success: boolean; profile: PlayerProfile; message?: string } {
    if (!this.db) throw new Error('Database not ready');

    const profile = this.getProfile(accountId);
    if (!profile) {
      return { success: false, profile: DEFAULT_PROFILE_TEMPLATE as any, message: 'Compte introuvable.' };
    }

    if (!profile.unlockedSkins.includes(skinId)) {
      return { success: false, profile, message: 'Ce skin n’est pas débloqué sur votre compte.' };
    }

    this.db.run('UPDATE accounts SET equipped_skin_id = ?, updated_at = ? WHERE id = ?', [skinId, Date.now(), accountId]);
    this.persistToDiskNow();

    return { success: true, profile: this.getProfile(accountId)! };
  }

  public buyAvatar(accountId: string, avatarId: string): { success: boolean; profile: PlayerProfile; message: string } {
    if (!this.db) throw new Error('Database not ready');

    const targetAvatar = AVATARS.find((a) => a.id === avatarId);
    if (!targetAvatar || targetAvatar.unlockCoins === undefined) {
      const p = this.getProfile(accountId) || (DEFAULT_PROFILE_TEMPLATE as any);
      return { success: false, profile: p, message: 'Avatar non disponible à l’achat.' };
    }

    this.db.run('BEGIN TRANSACTION;');
    try {
      const profile = this.getProfile(accountId);
      if (!profile) {
        this.db.run('ROLLBACK;');
        return { success: false, profile: DEFAULT_PROFILE_TEMPLATE as any, message: 'Compte introuvable.' };
      }

      if (profile.unlockedAvatars.includes(avatarId)) {
        this.db.run('UPDATE accounts SET avatar_id = ?, updated_at = ? WHERE id = ?', [avatarId, Date.now(), accountId]);
        this.db.run('COMMIT;');
        this.persistToDiskNow();
        return { success: true, profile: this.getProfile(accountId)!, message: 'Avatar équipé.' };
      }

      const serverPrice = targetAvatar.unlockCoins;
      if (profile.coins < serverPrice) {
        this.db.run('ROLLBACK;');
        return { success: false, profile, message: `Solde insuffisant (${serverPrice} 🪙 requis).` };
      }

      const now = Date.now();
      this.db.run('UPDATE accounts SET coins = coins - ?, avatar_id = ?, updated_at = ? WHERE id = ?', [
        serverPrice,
        avatarId,
        now,
        accountId,
      ]);
      this.db.run('INSERT INTO account_avatars (account_id, avatar_id, acquired_at) VALUES (?, ?, ?)', [
        accountId,
        avatarId,
        now,
      ]);

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      return { success: true, profile: this.getProfile(accountId)!, message: `Avatar ${targetAvatar.name} débloqué !` };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  public equipAvatar(accountId: string, avatarId: string): { success: boolean; profile: PlayerProfile; message?: string } {
    if (!this.db) throw new Error('Database not ready');

    const profile = this.getProfile(accountId);
    if (!profile) {
      return { success: false, profile: DEFAULT_PROFILE_TEMPLATE as any, message: 'Compte introuvable.' };
    }

    if (!profile.unlockedAvatars.includes(avatarId)) {
      return { success: false, profile, message: 'Cet avatar n’est pas débloqué.' };
    }

    this.db.run('UPDATE accounts SET avatar_id = ?, updated_at = ? WHERE id = ?', [avatarId, Date.now(), accountId]);
    this.persistToDiskNow();

    return { success: true, profile: this.getProfile(accountId)! };
  }

  public resetProgress(accountId: string): PlayerProfile {
    if (!this.db) throw new Error('Database not ready');

    const now = Date.now();
    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run(
        `UPDATE accounts SET coins = ?, xp = ?, level = ?, rank = ?, rr = ?, avatar_id = ?, equipped_skin_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          DEFAULT_PROFILE_TEMPLATE.coins,
          DEFAULT_PROFILE_TEMPLATE.xp,
          DEFAULT_PROFILE_TEMPLATE.level,
          DEFAULT_PROFILE_TEMPLATE.rank,
          DEFAULT_PROFILE_TEMPLATE.rr,
          DEFAULT_PROFILE_TEMPLATE.avatarId,
          DEFAULT_PROFILE_TEMPLATE.equippedSkinId,
          now,
          accountId,
        ]
      );

      this.db.run('DELETE FROM account_skins WHERE account_id = ?', [accountId]);
      for (const skinId of DEFAULT_PROFILE_TEMPLATE.unlockedSkins) {
        this.db.run('INSERT INTO account_skins (account_id, skin_id, acquired_at) VALUES (?, ?, ?)', [
          accountId,
          skinId,
          now,
        ]);
      }

      this.db.run('DELETE FROM account_avatars WHERE account_id = ?', [accountId]);
      for (const avId of DEFAULT_PROFILE_TEMPLATE.unlockedAvatars) {
        this.db.run('INSERT INTO account_avatars (account_id, avatar_id, acquired_at) VALUES (?, ?, ?)', [
          accountId,
          avId,
          now,
        ]);
      }

      this.db.run(
        `UPDATE player_stats SET games_played = 0, wins = 0, total_kills = 0, best_score = 0, best_mass = 0, total_play_time = 0, updated_at = ?
         WHERE account_id = ?`,
        [now, accountId]
      );

      this.db.run('COMMIT;');
      this.persistToDiskNow();
      return this.getProfile(accountId)!;
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  // ─── SQLITE TRANSACTIONAL MATCH RESULTS ────────────────────────────

  public applyMatchResults(
    accountId: string,
    gameMode: GameMode,
    finalMass: number,
    finalKills: number,
    finalRank: number,
    survivalSeconds: number,
    totalPlayersInRoom: number
  ): { rewardResult: GameRewardResult; updatedProfile: PlayerProfile } {
    if (!this.db) throw new Error('Database not ready');

    this.db.run('BEGIN TRANSACTION;');
    try {
      let prof = this.getProfile(accountId);
      if (!prof) {
        prof = this.authenticate().profile;
      }

      // 1. Calculate Coins Reward (Harder & Rarer)
      const massReward = Math.max(1, Math.floor(finalMass / 75));
      const killReward = finalKills * 4;
      const rankReward =
        finalRank === 1 ? 18 : finalRank <= 3 ? 10 : finalRank <= 5 ? 6 : finalRank <= 10 ? 3 : 1;
      const survivalReward = Math.min(6, Math.floor(survivalSeconds / 30));
      const totalCoinsEarned = massReward + killReward + rankReward + survivalReward;

      const coinsReward: CoinsReward = {
        total: totalCoinsEarned,
        massReward,
        killReward,
        rankReward,
        survivalReward,
      };

      // 2. XP & Level
      const xpEarned = calculateGameXp(finalMass, finalKills, finalRank, survivalSeconds);
      const levelUpResult = processXpGain(prof.level, prof.xp, xpEarned);

      // 3. RR calculation for Ranked (Generous)
      const rrDelta =
        gameMode === 'RANKED'
          ? calculateRankedRRChange(finalRank, finalKills, finalMass, totalPlayersInRoom)
          : 0;

      const rankChangeResult =
        gameMode === 'RANKED'
          ? processRRChange(prof.rank, prof.rr, rrDelta)
          : { newRank: prof.rank, newRR: prof.rr, rankChanged: null };

      const newCoins = prof.coins + totalCoinsEarned + levelUpResult.bonusCoins;
      const newLevel = levelUpResult.newLevel;
      const newXp = levelUpResult.newXp;
      const newRank = rankChangeResult.newRank;
      const newRR = rankChangeResult.newRR;
      const now = Date.now();

      // Update accounts table
      this.db.run(
        `UPDATE accounts SET coins = ?, level = ?, xp = ?, rank = ?, rr = ?, updated_at = ? WHERE id = ?`,
        [newCoins, newLevel, newXp, newRank, newRR, now, accountId]
      );

      // Update player_stats table
      const newWins = prof.stats.wins + (finalRank === 1 ? 1 : 0);
      const newKills = prof.stats.totalKills + finalKills;
      const newBestScore = Math.max(prof.stats.bestScore, finalMass);
      const newBestMass = Math.max(prof.stats.bestMass, finalMass);
      const newPlayTime = prof.stats.totalPlayTime + survivalSeconds;
      const newGamesPlayed = prof.stats.gamesPlayed + 1;

      this.db.run(
        `UPDATE player_stats SET games_played = ?, wins = ?, total_kills = ?, best_score = ?, best_mass = ?, total_play_time = ?, updated_at = ?
         WHERE account_id = ?`,
        [newGamesPlayed, newWins, newKills, newBestScore, newBestMass, newPlayTime, now, accountId]
      );

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      // Automatically update Daily Missions progress
      try {
        this.updateDailyMissionProgress(accountId, [
          { missionType: 'PLAY_GAMES', increment: 1 },
          { missionType: 'ELIMINATE_SNAKES', increment: finalKills },
          { missionType: 'SURVIVE_TIME', setMax: survivalSeconds },
          { missionType: 'REACH_MASS', setMax: finalMass },
        ]);
      } catch (err) {
        console.error('Error updating mission progress in applyMatchResults:', err);
      }

      const updatedProfile = this.getProfile(accountId)!;

      const rewardResult: GameRewardResult = {
        coins: coinsReward,
        xpEarned,
        rrChange: rrDelta,
        levelUp: levelUpResult.levelUp,
        oldLevel: prof.level,
        newLevel: updatedProfile.level,
        rankChanged: rankChangeResult.rankChanged,
        oldRank: prof.rank,
        newRank: updatedProfile.rank,
        bonusCoinsFromLevelUp: levelUpResult.bonusCoins,
      };

      return { rewardResult, updatedProfile };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  // ─── RESPAWN ACTION ───────────────────────────────────────────────

  public respawn(accountId: string): {
    success: boolean;
    coins?: number;
    profile?: PlayerProfile;
    error?: string;
  } {
    if (!this.db) throw new Error('Database not ready');

    this.db.run('BEGIN TRANSACTION;');
    try {
      const prof = this.getProfile(accountId);
      if (!prof) {
        this.db.run('ROLLBACK;');
        return { success: false, error: 'Compte introuvable.' };
      }

      if (prof.coins < RESPAWN_COST) {
        this.db.run('ROLLBACK;');
        return {
          success: false,
          coins: prof.coins,
          error: `Coins insuffisants (${RESPAWN_COST} 🪙 requis, vous en avez ${prof.coins}).`,
        };
      }

      const now = Date.now();
      // Atomic deduction
      this.db.run(
        'UPDATE accounts SET coins = coins - ?, updated_at = ? WHERE id = ? AND coins >= ?',
        [RESPAWN_COST, now, accountId, RESPAWN_COST]
      );

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      const updatedProfile = this.getProfile(accountId)!;
      if (updatedProfile.coins === prof.coins) {
        return { success: false, coins: prof.coins, error: 'Coins insuffisants (50 🪙 requis).' };
      }

      return { success: true, coins: updatedProfile.coins, profile: updatedProfile };
    } catch (err: any) {
      this.db.run('ROLLBACK;');
      return { success: false, error: err.message || 'Erreur lors du respawn.' };
    }
  }

  // ─── DAILY MISSIONS METHODS ──────────────────────────────────────────

  public getDailyMissions(accountId: string, requestedDateKey?: string): PlayerDailyMissions {
    if (!this.db) throw new Error('Database not ready');

    const dateKey = requestedDateKey || getTodayDateKey();
    const now = Date.now();

    const stmt = this.db.prepare(
      'SELECT mission_id, progress, completed, claimed FROM daily_missions WHERE account_id = ? AND date_key = ?'
    );
    stmt.bind([accountId, dateKey]);

    const existingMap = new Map<string, { progress: number; completed: boolean; claimed: boolean }>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        mission_id: string;
        progress: number;
        completed: number;
        claimed: number;
      };
      existingMap.set(row.mission_id, {
        progress: row.progress || 0,
        completed: Boolean(row.completed),
        claimed: Boolean(row.claimed),
      });
    }
    stmt.free();

    this.db.run('BEGIN TRANSACTION;');
    try {
      for (const def of DAILY_MISSION_DEFINITIONS) {
        if (!existingMap.has(def.id)) {
          this.db.run(
            `INSERT OR IGNORE INTO daily_missions (account_id, date_key, mission_id, progress, completed, claimed, updated_at)
             VALUES (?, ?, ?, 0, 0, 0, ?)`,
            [accountId, dateKey, def.id, now]
          );
          existingMap.set(def.id, { progress: 0, completed: false, claimed: false });
        }
      }
      this.db.run('COMMIT;');
      this.schedulePersist();
    } catch (err) {
      this.db.run('ROLLBACK;');
    }

    const missions: DailyMission[] = DAILY_MISSION_DEFINITIONS.map((def) => {
      const state = existingMap.get(def.id) || { progress: 0, completed: false, claimed: false };
      const completed = state.completed || state.progress >= def.target;
      return {
        ...def,
        progress: Math.min(def.target, state.progress),
        completed,
        claimed: state.claimed,
      };
    });

    return { dateKey, missions };
  }

  public updateDailyMissionProgress(
    accountId: string,
    updates: Array<{ missionType: MissionType; increment?: number; setMax?: number }>
  ): PlayerDailyMissions {
    if (!this.db) throw new Error('Database not ready');

    const currentMissions = this.getDailyMissions(accountId);
    const dateKey = currentMissions.dateKey;
    const now = Date.now();

    this.db.run('BEGIN TRANSACTION;');
    try {
      for (const update of updates) {
        for (const mission of currentMissions.missions) {
          if (mission.type === update.missionType && !mission.claimed) {
            let newProgress = mission.progress;
            if (update.increment) {
              newProgress += update.increment;
            }
            if (update.setMax) {
              newProgress = Math.max(newProgress, update.setMax);
            }

            const completed = newProgress >= mission.target ? 1 : 0;

            this.db.run(
              `UPDATE daily_missions 
               SET progress = ?, completed = ?, updated_at = ? 
               WHERE account_id = ? AND date_key = ? AND mission_id = ?`,
              [newProgress, completed, now, accountId, dateKey, mission.id]
            );
          }
        }
      }
      this.db.run('COMMIT;');
      this.schedulePersist();
    } catch (err) {
      this.db.run('ROLLBACK;');
    }

    return this.getDailyMissions(accountId, dateKey);
  }

  public claimDailyMissionReward(
    accountId: string,
    missionId: string
  ): { success: boolean; coinsCredited?: number; profile?: PlayerProfile; missions?: PlayerDailyMissions; error?: string } {
    if (!this.db) throw new Error('Database not ready');

    const dateKey = getTodayDateKey();
    const currentMissions = this.getDailyMissions(accountId, dateKey);
    const targetMission = currentMissions.missions.find((m) => m.id === missionId);

    if (!targetMission) {
      return { success: false, error: 'Mission introuvable.' };
    }

    if (targetMission.claimed) {
      return { success: false, error: 'Récompense déjà réclamée.' };
    }

    if (!targetMission.completed && targetMission.progress < targetMission.target) {
      return { success: false, error: 'Mission non encore accomplie.' };
    }

    const now = Date.now();
    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run(
        `UPDATE daily_missions SET claimed = 1, completed = 1, updated_at = ? WHERE account_id = ? AND date_key = ? AND mission_id = ?`,
        [now, accountId, dateKey, missionId]
      );

      this.db.run(
        `UPDATE accounts SET coins = coins + ?, updated_at = ? WHERE id = ?`,
        [targetMission.rewardCoins, now, accountId]
      );

      this.db.run('COMMIT;');
      this.persistToDiskNow();

      const updatedProfile = this.getProfile(accountId)!;
      const updatedMissions = this.getDailyMissions(accountId, dateKey);

      return {
        success: true,
        coinsCredited: targetMission.rewardCoins,
        profile: updatedProfile,
        missions: updatedMissions,
      };
    } catch (err: any) {
      this.db.run('ROLLBACK;');
      return { success: false, error: err.message || 'Échec de la réclamation.' };
    }
  }
}

export const sqliteDb = new SqliteDatabase();
