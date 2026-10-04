import { sqliteDb } from './SqliteDatabase';
import { PlayerProfile, GameMode, GameRewardResult } from '../src/types/game';

/**
 * ProfileStore now delegates all state persistence to the local SQLite database
 * (data/snake-arena.sqlite) with atomic transactions.
 */
export class ProfileStore {
  public async waitUntilReady(): Promise<void> {
    await sqliteDb.waitUntilReady();
  }

  public authenticate(
    sessionToken?: string,
    preferredName?: string
  ): { sessionToken: string; accountId: string; profile: PlayerProfile } {
    return sqliteDb.authenticate(sessionToken, preferredName);
  }

  public register(
    username: string,
    passwordPlain: string,
    email?: string,
    guestSessionToken?: string
  ) {
    return sqliteDb.register(username, passwordPlain, email, guestSessionToken);
  }

  public login(username: string, passwordPlain: string, clientIp?: string) {
    return sqliteDb.login(username, passwordPlain, clientIp);
  }

  public logout(sessionToken: string): boolean {
    return sqliteDb.logout(sessionToken);
  }

  public getAccountIdByToken(sessionToken: string): string | null {
    return sqliteDb.getAccountIdByToken(sessionToken);
  }

  public getProfile(accountId: string): PlayerProfile | null {
    return sqliteDb.getProfile(accountId);
  }

  public updateName(accountId: string, newName: string): { success: boolean; profile: PlayerProfile } {
    return sqliteDb.updateName(accountId, newName);
  }

  public syncPreferences(
    accountId: string,
    prefs: { name?: string; equippedSkinId?: string; avatarId?: string }
  ): { success: boolean; profile: PlayerProfile } {
    return sqliteDb.syncPreferences(accountId, prefs);
  }

  public buySkin(accountId: string, skinId: string): { success: boolean; profile: PlayerProfile; message: string } {
    return sqliteDb.buySkin(accountId, skinId);
  }

  public equipSkin(accountId: string, skinId: string): { success: boolean; profile: PlayerProfile; message?: string } {
    return sqliteDb.equipSkin(accountId, skinId);
  }

  public equipAvatar(accountId: string, avatarId: string): { success: boolean; profile: PlayerProfile; message?: string } {
    return sqliteDb.equipAvatar(accountId, avatarId);
  }

  public buyAvatar(
    accountId: string,
    avatarId: string
  ): { success: boolean; profile: PlayerProfile; message: string } {
    return sqliteDb.buyAvatar(accountId, avatarId);
  }

  public resetProgress(accountId: string): PlayerProfile {
    return sqliteDb.resetProgress(accountId);
  }

  public applyMatchResults(
    accountId: string,
    gameMode: GameMode,
    finalMass: number,
    finalKills: number,
    finalRank: number,
    survivalSeconds: number,
    totalPlayersInRoom: number
  ): { rewardResult: GameRewardResult; updatedProfile: PlayerProfile } {
    return sqliteDb.applyMatchResults(
      accountId,
      gameMode,
      finalMass,
      finalKills,
      finalRank,
      survivalSeconds,
      totalPlayersInRoom
    );
  }

  public createBackup(name?: string): string {
    return sqliteDb.createBackup(name);
  }

  public respawn(accountId: string) {
    return sqliteDb.respawn(accountId);
  }

  public getDailyMissions(accountId: string, dateKey?: string) {
    return sqliteDb.getDailyMissions(accountId, dateKey);
  }

  public updateDailyMissionProgress(
    accountId: string,
    updates: Array<{ missionType: any; increment?: number; setMax?: number }>
  ) {
    return sqliteDb.updateDailyMissionProgress(accountId, updates);
  }

  public claimDailyMissionReward(accountId: string, missionId: string) {
    return sqliteDb.claimDailyMissionReward(accountId, missionId);
  }

  public claimProduct(accountId: string, productId: string) {
    return sqliteDb.claimProduct(accountId, productId);
  }

  public buyAbility(accountId: string, abilityId: string, cost: number) {
    return sqliteDb.buyAbility(accountId, abilityId, cost);
  }

  public getClaimedProducts(accountId: string) {
    return sqliteDb.getClaimedProducts(accountId);
  }
}

export const profileStore = new ProfileStore();
