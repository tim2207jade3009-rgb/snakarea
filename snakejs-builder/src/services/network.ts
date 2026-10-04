import {
  ClientMessage,
  ServerMessage,
  AuthSuccessMessage,
  AuthErrorMessage,
  AuthLogoutSuccessMessage,
  WorldSnapshotMessage,
  SnakeDiedMessage,
  KillFeedMessage,
  RoomJoinedMessage,
  MatchmakingStatusMessage,
  ProfileUpdatedMessage,
} from '../../server/protocol';
import { GameMode, PlayerProfile } from '../types/game';

type MessageListener = (msg: ServerMessage) => void;

const SESSION_TOKEN_KEY = 'snake_arena_session_token';

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private isConnected: boolean = false;
  private listeners: Set<MessageListener> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionStatusCallback: ((connected: boolean, statusText: string) => void) | null = null;

  private sessionToken: string | null = null;
  private accountId: string | null = null;
  private currentProfile: PlayerProfile | null = null;

  constructor() {
    this.initUrl();
    if (typeof window !== 'undefined') {
      this.sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
    }
  }

  private initUrl() {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.url = `${protocol}//${window.location.host}`;
    }
  }

  public connect(
    preferredName?: string,
    onStatusChange?: (connected: boolean, statusText: string) => void
  ) {
    if (onStatusChange) {
      this.connectionStatusCallback = onStatusChange;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.initUrl();
    if (!this.url) return;

    this.updateStatus(false, 'Connexion au serveur...');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.updateStatus(true, 'Connecté au serveur');
        this.startPing();

        // Immediately authenticate with server using stored session token
        this.send({
          type: 'AUTH_INIT',
          sessionToken: this.sessionToken || undefined,
          preferredName,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;

          if (msg.type === 'AUTH_SUCCESS') {
            this.sessionToken = msg.sessionToken;
            this.accountId = msg.accountId;
            this.currentProfile = msg.profile;
            if (typeof window !== 'undefined') {
              localStorage.setItem(SESSION_TOKEN_KEY, msg.sessionToken);
            }
          } else if (msg.type === 'AUTH_LOGOUT_SUCCESS') {
            this.sessionToken = msg.newSessionToken;
            this.currentProfile = msg.newProfile;
            if (typeof window !== 'undefined') {
              localStorage.setItem(SESSION_TOKEN_KEY, msg.newSessionToken);
            }
          } else if (msg.type === 'PROFILE_UPDATED') {
            this.currentProfile = msg.profile;
          }

          for (const listener of this.listeners) {
            listener(msg);
          }
        } catch (e) {
          console.warn('Error parsing server message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopPing();
        this.updateStatus(false, 'Déconnecté du serveur. Reconnexion...');
        this.scheduleReconnect(preferredName);
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        this.isConnected = false;
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.scheduleReconnect(preferredName);
    }
  }

  private updateStatus(connected: boolean, statusText: string) {
    this.isConnected = connected;
    if (this.connectionStatusCallback) {
      this.connectionStatusCallback(connected, statusText);
    }
  }

  private scheduleReconnect(preferredName?: string) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(preferredName);
    }, 2500);
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', time: Date.now() });
    }, 15000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public addListener(listener: MessageListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── AUTHENTICATION METHODS ────────────────────────────────────────

  public login(username: string, password: string): Promise<{ success: boolean; error?: string; profile?: PlayerProfile }> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        return resolve({ success: false, error: 'Non connecté au serveur. Veuillez patienter.' });
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ success: false, error: 'Délai de connexion dépassé.' });
      }, 5000);

      const cleanup = this.addListener((msg) => {
        if (msg.type === 'AUTH_SUCCESS') {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: true, profile: msg.profile });
        } else if (msg.type === 'AUTH_ERROR') {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: msg.message });
        }
      });

      this.send({
        type: 'AUTH_LOGIN',
        username,
        password,
      });
    });
  }

  public register(
    username: string,
    password: string,
    email?: string,
    keepGuestProgress = true
  ): Promise<{ success: boolean; error?: string; profile?: PlayerProfile }> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        return resolve({ success: false, error: 'Non connecté au serveur. Veuillez patienter.' });
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ success: false, error: 'Délai de création de compte dépassé.' });
      }, 5000);

      const cleanup = this.addListener((msg) => {
        if (msg.type === 'AUTH_SUCCESS') {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: true, profile: msg.profile });
        } else if (msg.type === 'AUTH_ERROR') {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: msg.message });
        }
      });

      this.send({
        type: 'AUTH_REGISTER',
        username,
        password,
        email,
        guestSessionToken: keepGuestProgress ? (this.sessionToken || undefined) : undefined,
      });
    });
  }

  public logout(): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        this.sessionToken = null;
        if (typeof window !== 'undefined') localStorage.removeItem(SESSION_TOKEN_KEY);
        return resolve({ success: true });
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ success: true });
      }, 3000);

      const cleanup = this.addListener((msg) => {
        if (msg.type === 'AUTH_LOGOUT_SUCCESS') {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: true });
        }
      });

      this.send({ type: 'AUTH_LOGOUT' });
    });
  }

  // ─── GAME & PREFERENCES METHODS ────────────────────────────────────

  public joinMatchmaking(mode: GameMode, name?: string, avatarId?: string, skinId?: string) {
    this.send({
      type: 'JOIN_MATCHMAKING',
      name,
      avatarId,
      skinId,
      mode,
    });
  }

  public sendInput(angle: number, isBoosting: boolean, seq: number) {
    this.send({
      type: 'INPUT',
      angle,
      isBoosting,
      seq,
    });
  }

  public usePower(powerId: 'fireball' | 'shield' | 'dash' | 'frost' | string, angle?: number) {
    this.send({
      type: 'USE_POWER',
      powerId,
      angle,
    });
  }

  public upgradePower(powerId: string) {
    this.send({
      type: 'UPGRADE_POWER',
      powerId,
    });
  }

  public leaveRoom() {
    this.send({ type: 'LEAVE_ROOM' });
  }

  public syncPreferences(prefs: { name?: string; equippedSkinId?: string; avatarId?: string }) {
    this.send({
      type: 'SYNC_PREFERENCES',
      ...prefs,
    });
  }

  public updateName(name: string) {
    this.send({
      type: 'UPDATE_NAME',
      name,
    });
  }

  public buySkin(skinId: string) {
    this.send({
      type: 'BUY_SKIN',
      skinId,
    });
  }

  public equipSkin(skinId: string) {
    this.send({
      type: 'EQUIP_SKIN',
      skinId,
    });
  }

  public equipAvatar(avatarId: string) {
    this.send({
      type: 'EQUIP_AVATAR',
      avatarId,
    });
  }

  public buyAvatar(avatarId: string) {
    this.send({
      type: 'BUY_AVATAR',
      avatarId,
    });
  }

  public resetProgress() {
    this.send({
      type: 'RESET_PROGRESS',
    });
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getAccountId(): string | null {
    return this.accountId;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public getCurrentProfile(): PlayerProfile | null {
    return this.currentProfile;
  }
}

export const net = new NetworkClient();
