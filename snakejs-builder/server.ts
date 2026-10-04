import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { matchmaker } from './server/Matchmaker';
import { profileStore } from './server/ProfileStore';
import { PRODUCTS, RESPAWN_COST } from './server/Products';
import { validateClientMessage, validateUsername, validatePassword } from './server/validators';
import { SocketRateLimiter } from './server/RateLimiter';
import {
  ClientMessage,
  ServerMessage,
  ProfileUpdatedMessage,
  AuthSuccessMessage,
  AuthErrorMessage,
  AuthLogoutSuccessMessage,
  PongMessage,
  ErrorMessage,
  PlayerRespawnedMessage,
} from './server/protocol';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'snake_arena_session';

function parseCookieString(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });

  return list;
}

// REST rate limiter per IP for auth
const authIpAttempts: Map<string, { count: number; resetAt: number }> = new Map();
function isAuthRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = authIpAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    authIpAttempts.delete(ip);
    return false;
  }
  return entry.count >= 15; // 15 attempts per 2 minutes
}
function recordAuthAttempt(ip: string) {
  const now = Date.now();
  const entry = authIpAttempts.get(ip) || { count: 0, resetAt: now + 2 * 60 * 1000 };
  entry.count += 1;
  authIpAttempts.set(ip, entry);
}

async function startServer() {
  // Ensure SQLite database is fully initialized and migrated before handling requests
  await profileStore.waitUntilReady();

  const app = express();
  const server = http.createServer(app);

  app.use(
    express.json({
      limit: '100kb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(cookieParser());

  // REST API Endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      db: 'sqlite',
      onlinePlayers: matchmaker.getTotalOnlinePlayers(),
      rooms: matchmaker.getRoomStats(),
      timestamp: Date.now(),
    });
  });

  // Explicit SEO Endpoints
  app.get('/robots.txt', (_req, res) => {
    const robotsPath = path.resolve(__dirname, isProduction ? 'dist/robots.txt' : 'public/robots.txt');
    res.type('text/plain').sendFile(robotsPath);
  });

  app.get('/sitemap.xml', (_req, res) => {
    const sitemapPath = path.resolve(__dirname, isProduction ? 'dist/sitemap.xml' : 'public/sitemap.xml');
    res.type('application/xml').sendFile(sitemapPath);
  });

  // REST Auth Endpoints
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    if (isAuthRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'Trop de tentatives. Veuillez patienter un moment.' });
    }
    recordAuthAttempt(clientIp);

    const { username, password, email, guestSessionToken } = req.body || {};
    const uRes = validateUsername(username);
    if (!uRes.valid || !uRes.sanitized) {
      return res.status(400).json({ success: false, error: uRes.error || 'Identifiant invalide' });
    }
    const pRes = validatePassword(password);
    if (!pRes.valid) {
      return res.status(400).json({ success: false, error: pRes.error || 'Mot de passe invalide' });
    }

    const reg = profileStore.register(uRes.sanitized, password, email, guestSessionToken);
    if (!reg.success || !reg.sessionToken || !reg.profile) {
      return res.status(400).json({ success: false, error: reg.error || 'Échec de l’inscription' });
    }

    res.cookie(SESSION_COOKIE_NAME, reg.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.json({
      success: true,
      sessionToken: reg.sessionToken,
      accountId: reg.accountId,
      profile: reg.profile,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    if (isAuthRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'Trop de tentatives. Veuillez patienter un moment.' });
    }
    recordAuthAttempt(clientIp);

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Identifiant ou mot de passe incorrect' });
    }

    const auth = profileStore.login(username, password, clientIp);
    if (!auth.success || !auth.sessionToken || !auth.profile) {
      return res.status(401).json({ success: false, error: auth.error || 'Identifiant ou mot de passe incorrect' });
    }

    res.cookie(SESSION_COOKIE_NAME, auth.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      sessionToken: auth.sessionToken,
      accountId: auth.accountId,
      profile: auth.profile,
    });
  });

  // Helper to extract session token from Cookie or Authorization header
  const extractSessionToken = (req: Request): string | null => {
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      return req.cookies[SESSION_COOKIE_NAME];
    }
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token) return token;
      } else {
        const token = authHeader.trim();
        if (token) return token;
      }
    }
    return null;
  };

  // Helper to get authenticated account ID from token
  const getAuthenticatedAccountId = (req: Request): string | null => {
    const token = extractSessionToken(req);
    if (!token) return null;
    const accountId = profileStore.getAccountIdByToken(token);
    return accountId || null;
  };

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const sessionToken = extractSessionToken(req);
    if (sessionToken) {
      profileStore.logout(sessionToken);
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    return res.json({ success: true });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) {
      return res.json({ success: false, authenticated: false });
    }
    const accountId = profileStore.getAccountIdByToken(sessionToken);
    if (!accountId) {
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.json({ success: false, authenticated: false });
    }
    const profile = profileStore.getProfile(accountId);
    if (!profile) {
      return res.json({ success: false, authenticated: false });
    }
    return res.json({ success: true, authenticated: true, sessionToken, profile });
  });

  // ─── SHOP & PAYMENTS REST ENDPOINTS ──────────────────────────────────
  app.get('/api/payments/products', (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    const claimedIds = accountId ? profileStore.getClaimedProducts(accountId) : [];

    res.json({
      success: true,
      products: Object.values(PRODUCTS).map(p => ({
        ...p,
        isClaimed: claimedIds.includes(p.id),
        formattedPrice: 'Gratuit'
      })),
      currency: 'EUR',
      mode: 'free',
    });
  });

  app.post('/api/payments/claim', async (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Vous devez être connecté pour réclamer des coins.' });
    }

    const { productId } = req.body || {};
    if (!productId || !PRODUCTS[productId]) {
      return res.status(400).json({ success: false, error: 'Produit invalide.' });
    }

    const result = profileStore.claimProduct(accountId, productId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const profile = profileStore.getProfile(accountId);
    return res.json({ ...result, profile });
  });

  app.post('/api/abilities/purchase', async (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Vous devez être connecté.' });
    }

    const { abilityId, cost } = req.body || {};
    if (!abilityId || typeof cost !== 'number') {
      return res.status(400).json({ success: false, error: 'Paramètres invalides.' });
    }

    try {
      const result = profileStore.buyAbility(accountId, abilityId, cost);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.message || 'Erreur lors de l’achat.' });
      }

      matchmaker.refreshPlayerProfile(accountId);
      return res.json({ success: true, message: result.message, profile: result.profile });
    } catch (err: any) {
      console.error('Ability purchase server error:', err);
      return res.status(500).json({ success: false, error: 'Erreur interne du serveur lors de l’achat.' });
    }
  });

  // ─── IN-GAME RESPAWN REST ENDPOINT ─────────────────────────────────
  app.post('/api/game/respawn', (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Non authentifié.' });
    }

    const result = profileStore.respawn(accountId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  // ─── DAILY MISSIONS REST ENDPOINTS ──────────────────────────────────
  app.get('/api/missions', (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Non authentifié.' });
    }

    const dailyMissions = profileStore.getDailyMissions(accountId);
    return res.json({ success: true, dailyMissions });
  });

  app.post('/api/missions/claim', (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Non authentifié.' });
    }

    const { missionId } = req.body || {};
    if (!missionId) {
      return res.status(400).json({ success: false, error: 'missionId manquant.' });
    }

    const result = profileStore.claimDailyMissionReward(accountId, missionId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  app.post('/api/missions/progress', (req: Request, res: Response) => {
    const accountId = getAuthenticatedAccountId(req);
    if (!accountId) {
      return res.status(401).json({ success: false, error: 'Non authentifié.' });
    }

    const { updates } = req.body || {};
    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'updates manquant ou invalide.' });
    }

    const dailyMissions = profileStore.updateDailyMissionProgress(accountId, updates);
    return res.json({ success: true, dailyMissions });
  });

  // WebSocket Server attached to same HTTP Server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const socketId = `sock_${crypto.randomUUID()}`;
    const rateLimiter = new SocketRateLimiter();

    // Disable Nagle's algorithm for faster small packet delivery
    const rawSocket = (ws as any)._socket;
    if (rawSocket && rawSocket.setNoDelay) {
      rawSocket.setNoDelay(true);
    }

    // Extract potential cookie session from upgrade request
    const cookies = parseCookieString(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE_NAME];

    let authenticatedAccountId: string | null = null;
    let sessionToken: string | null = null;

    if (cookieToken && cookieToken.length >= 32) {
      const accId = profileStore.getAccountIdByToken(cookieToken);
      if (accId) {
        authenticatedAccountId = accId;
        sessionToken = cookieToken;
      }
    }

    ws.on('message', (rawData) => {
      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawData.toString());
        } catch {
          const err: ErrorMessage = {
            type: 'ERROR',
            code: 'MALFORMED_JSON',
            message: 'Invalid JSON payload received.',
          };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(err));
          return;
        }

        // Validate structure & sanitize fields
        const validation = validateClientMessage(parsed);
        if (!validation.valid || !validation.sanitized) {
          const err: ErrorMessage = {
            type: 'ERROR',
            code: 'VALIDATION_FAILED',
            message: validation.error || 'Message validation failed.',
          };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(err));
          return;
        }

        const msg = validation.sanitized;

        // Apply rate limiter per socket
        if (!rateLimiter.allow(msg.type)) {
          return;
        }

        // Handle PING without requiring auth
        if (msg.type === 'PING') {
          const pong: PongMessage = { type: 'PONG', time: msg.time };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(pong));
          return;
        }

        // Handle AUTH_INIT
        if (msg.type === 'AUTH_INIT') {
          const tokenToUse = msg.sessionToken || sessionToken || undefined;
          const auth = profileStore.authenticate(tokenToUse, msg.preferredName);
          authenticatedAccountId = auth.accountId;
          sessionToken = auth.sessionToken;

          const authResp: AuthSuccessMessage = {
            type: 'AUTH_SUCCESS',
            sessionToken: auth.sessionToken,
            accountId: auth.accountId,
            profile: auth.profile,
            isRegistered: auth.profile.isRegistered,
          };

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(authResp));
          }
          return;
        }

        // Handle AUTH_LOGIN
        if (msg.type === 'AUTH_LOGIN') {
          const loginRes = profileStore.login(msg.username, msg.password);
          if (!loginRes.success || !loginRes.sessionToken || !loginRes.profile) {
            const errResp: AuthErrorMessage = {
              type: 'AUTH_ERROR',
              code: 'INVALID_CREDENTIALS',
              message: loginRes.error || 'Identifiant ou mot de passe incorrect.',
            };
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errResp));
            return;
          }

          authenticatedAccountId = loginRes.accountId!;
          sessionToken = loginRes.sessionToken;

          const authResp: AuthSuccessMessage = {
            type: 'AUTH_SUCCESS',
            sessionToken: loginRes.sessionToken,
            accountId: loginRes.accountId!,
            profile: loginRes.profile,
            isRegistered: true,
          };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(authResp));
          return;
        }

        // Handle AUTH_REGISTER
        if (msg.type === 'AUTH_REGISTER') {
          const guestToken = msg.guestSessionToken || sessionToken || undefined;
          const regRes = profileStore.register(msg.username, msg.password, msg.email, guestToken);
          if (!regRes.success || !regRes.sessionToken || !regRes.profile) {
            const errResp: AuthErrorMessage = {
              type: 'AUTH_ERROR',
              code: 'REGISTRATION_FAILED',
              message: regRes.error || "Une erreur est survenue lors de l'inscription.",
            };
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errResp));
            return;
          }

          authenticatedAccountId = regRes.accountId!;
          sessionToken = regRes.sessionToken;

          const authResp: AuthSuccessMessage = {
            type: 'AUTH_SUCCESS',
            sessionToken: regRes.sessionToken,
            accountId: regRes.accountId!,
            profile: regRes.profile,
            isRegistered: true,
          };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(authResp));
          return;
        }

        // Handle AUTH_LOGOUT
        if (msg.type === 'AUTH_LOGOUT') {
          if (sessionToken) {
            profileStore.logout(sessionToken);
          }
          // Spawn new guest profile for seamless transition
          const newAuth = profileStore.authenticate();
          authenticatedAccountId = newAuth.accountId;
          sessionToken = newAuth.sessionToken;

          const logoutResp: AuthLogoutSuccessMessage = {
            type: 'AUTH_LOGOUT_SUCCESS',
            newSessionToken: newAuth.sessionToken,
            newProfile: newAuth.profile,
          };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(logoutResp));
          return;
        }

        // All subsequent actions require authenticated session
        if (!authenticatedAccountId) {
          const auth = profileStore.authenticate();
          authenticatedAccountId = auth.accountId;
          sessionToken = auth.sessionToken;

          const authResp: AuthSuccessMessage = {
            type: 'AUTH_SUCCESS',
            sessionToken: auth.sessionToken,
            accountId: auth.accountId,
            profile: auth.profile,
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(authResp));
          }
        }

        switch (msg.type) {
          case 'JOIN_MATCHMAKING': {
            const prof = profileStore.getProfile(authenticatedAccountId);
            if (!prof) break;

            const safeSkinId =
              msg.skinId && prof.unlockedSkins.includes(msg.skinId) ? msg.skinId : prof.equippedSkinId;
            const safeAvatarId =
              msg.avatarId && prof.unlockedAvatars.includes(msg.avatarId) ? msg.avatarId : prof.avatarId;

            matchmaker.findOrCreateRoom(
              socketId,
              ws,
              authenticatedAccountId,
              prof.name,
              safeAvatarId,
              safeSkinId,
              msg.mode || 'CLASSIC'
            );
            break;
          }

          case 'INPUT': {
            matchmaker.handleInput(socketId, msg.angle, msg.isBoosting, msg.seq);
            break;
          }

          case 'USE_POWER': {
            matchmaker.handleUsePower(socketId, msg.powerId, msg.angle);
            break;
          }

          case 'LEAVE_ROOM': {
            matchmaker.leaveRoom(socketId);
            break;
          }

          case 'GET_PROFILE': {
            const prof = profileStore.getProfile(authenticatedAccountId);
            if (prof && ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: prof,
                success: true,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'UPDATE_NAME': {
            const updated = profileStore.updateName(authenticatedAccountId, msg.name);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: updated.profile,
                success: updated.success,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'SYNC_PREFERENCES': {
            const updated = profileStore.syncPreferences(authenticatedAccountId, {
              name: msg.name,
              equippedSkinId: msg.equippedSkinId,
              avatarId: msg.avatarId,
            });
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: updated.profile,
                success: updated.success,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'BUY_SKIN': {
            const resBuy = profileStore.buySkin(authenticatedAccountId, msg.skinId);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: resBuy.profile,
                success: resBuy.success,
                message: resBuy.message,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'EQUIP_SKIN': {
            const resEquip = profileStore.equipSkin(authenticatedAccountId, msg.skinId);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: resEquip.profile,
                success: resEquip.success,
                message: resEquip.message,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'BUY_AVATAR': {
            const resBuyAv = profileStore.buyAvatar(authenticatedAccountId, msg.avatarId);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: resBuyAv.profile,
                success: resBuyAv.success,
                message: resBuyAv.message,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'EQUIP_AVATAR': {
            const resEquipAv = profileStore.equipAvatar(authenticatedAccountId, msg.avatarId);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: resEquipAv.profile,
                success: resEquipAv.success,
                message: resEquipAv.message,
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'RESET_PROGRESS': {
            const resetProf = profileStore.resetProgress(authenticatedAccountId);
            if (ws.readyState === WebSocket.OPEN) {
              const resp: ProfileUpdatedMessage = {
                type: 'PROFILE_UPDATED',
                profile: resetProf,
                success: true,
                message: 'Progression réinitialisée avec succès.',
              };
              ws.send(JSON.stringify(resp));
            }
            break;
          }

          case 'RESPAWN': {
            try {
              if (!authenticatedAccountId) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'PLAYER_RESPAWNED',
                    success: false,
                    error: 'Session non authentifiée. Veuillez rafraîchir la page.'
                  }));
                }
                break;
              }
              const resp = matchmaker.respawnPlayer(socketId, authenticatedAccountId, ws) as any;
              if (ws.readyState === WebSocket.OPEN) {
                const respMsg: PlayerRespawnedMessage = {
                  type: 'PLAYER_RESPAWNED',
                  success: resp.success,
                  coins: resp.coins || 0,
                  profile: resp.profile,
                  error: resp.error,
                  respawnMass: resp.respawnMass,
                };
                ws.send(JSON.stringify(respMsg));
              }
            } catch (err: any) {
              console.error('CRITICAL: RESPAWN handler error:', err);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'PLAYER_RESPAWNED',
                  success: false,
                  error: 'Erreur interne du serveur lors du respawn.'
                }));
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error('Safe WS error handler:', err);
      }
    });

    ws.on('close', () => {
      matchmaker.leaveRoom(socketId);
    });

    ws.on('error', (err) => {
      console.warn('WS error on socket', socketId, err);
      matchmaker.leaveRoom(socketId);
    });
  });

  // Vite Integration
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Snake Arena IO Server listening on http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'Production' : 'Development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
