import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Snake,
  FoodOrb,
  SkinOption,
  LeaderboardEntry,
  GameMode,
  PlayerProfile,
  GameRewardResult,
  PlayerDailyMissions,
} from '../types/game';
import { SKINS } from '../data/skins';
import { sound } from '../utils/audio';
import { trackGameStart, trackGameOver, trackSkinPurchase } from '../utils/analytics';
import {
  DEFAULT_PROFILE,
  getPlayerProfile,
  savePlayerProfile,
} from '../services/database';
import { net } from '../services/network';
import { ServerMessage, WorldSnapshotMessage } from '../../server/protocol';

export const ARENA_RADIUS = 2600;

export function useSnakeArena() {
  // ─── Profile & Game Mode State ─────────────────────────────────────
  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  const [dailyMissions, setDailyMissions] = useState<PlayerDailyMissions | null>(null);
  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(false);
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
  const [lastRewardResult, setLastRewardResult] = useState<GameRewardResult | null>(null);

  // Connection & Matchmaking State
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverStatusText, setServerStatusText] = useState<string>('Connexion...');
  const [matchmakingState, setMatchmakingState] = useState<'IDLE' | 'SEARCHING' | 'FOUND' | 'PLAYING'>('IDLE');
  const [onlinePlayersCount, setOnlinePlayersCount] = useState<number>(1);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [mySnakeId, setMySnakeId] = useState<string | null>(null);

  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'GAMEOVER'>('MENU');
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [playerMass, setPlayerMass] = useState<number>(40);
  const [playerKills, setPlayerKills] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerRank, setPlayerRank] = useState<number>(1);
  const [killBanner, setKillBanner] = useState<string | null>(null);
  const [spawnProtectionRemaining, setSpawnProtectionRemaining] = useState<number>(0);

  // References for 60 FPS rendering & networking
  const snakesRef = useRef<Snake[]>([]);
  const orbsRef = useRef<FoodOrb[]>([]);
  const playerSnakeRef = useRef<Snake | null>(null);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeJoystickAngleRef = useRef<number | null>(null);
  const isBoostingRef = useRef<boolean>(false);
  const inputSeqRef = useRef<number>(0);
  const lastInputSentTimeRef = useRef<number>(0);
  const killBannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const profileRef = useRef<PlayerProfile>(profile);
  const gameStateRef = useRef<'MENU' | 'PLAYING' | 'GAMEOVER'>(gameState);
  const gameModeRef = useRef<GameMode>(gameMode);
  const lastLeaderboardUpdateRef = useRef<number>(0);

  // Target positions for interpolation
  const snakeTargetPositions = useRef<Map<string, { x: number; y: number; angle: number; speed: number; mass: number; segments: { x: number; y: number }[] }>>(new Map());

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  // Currently equipped skin
  const selectedSkin = SKINS.find((s) => s.id === profile.equippedSkinId) || SKINS[0];

  const fetchDailyMissions = useCallback(async () => {
    try {
      const token =
        net.getSessionToken() ||
        (typeof window !== 'undefined' ? localStorage.getItem('snake_arena_session_token') : null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/missions', { headers });
      const data = await res.json();
      if (data.success && data.dailyMissions) {
        setDailyMissions(data.dailyMissions);
      }
    } catch (err) {
      console.error('Failed to fetch daily missions:', err);
    }
  }, []);

  // ─── 1. Load Local Profile & Authenticate with WebSocket Server ───
  useEffect(() => {
    let isMounted = true;

    getPlayerProfile()
      .then((loadedProfile) => {
        if (!isMounted) return;
        setProfile(loadedProfile);
        setIsDbLoaded(true);
        fetchDailyMissions();

        // Connect to real-time server with stored preferred name
        net.connect(loadedProfile.name, (connected, statusText) => {
          if (!isMounted) return;
          setIsConnected(connected);
          setServerStatusText(statusText);
        });
      })
      .catch((err) => {
        console.error('Error loading profile:', err);
        if (isMounted) setIsDbLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [fetchDailyMissions]);

  // ─── 2. Handle Server WebSocket Messages ───────────────────────────
  useEffect(() => {
    const unsubscribe = net.addListener((msg: ServerMessage) => {
      switch (msg.type) {
        case 'AUTH_SUCCESS': {
          setProfile(msg.profile);
          savePlayerProfile(msg.profile).catch(console.error);
          fetchDailyMissions();
          break;
        }

        case 'AUTH_LOGOUT_SUCCESS': {
          setProfile(msg.newProfile);
          savePlayerProfile(msg.newProfile).catch(console.error);
          break;
        }

        case 'ROOM_JOINED': {
          setCurrentRoomId(msg.roomId);
          setMySnakeId(msg.playerId); // In our protocol, msg.playerId is the socketId/snakeId
          setMatchmakingState('PLAYING');
          setGameState('PLAYING');
          setIsPaused(false);
          setLastRewardResult(null);
          break;
        }

        case 'SNAPSHOT': {
          const snapshot = msg as WorldSnapshotMessage;
          setOnlinePlayersCount((prev) => {
            const next = snapshot.realPlayersCount || 1;
            return prev !== next ? next : prev;
          });

          setLeaderboard((prev) => {
            if (prev.length !== snapshot.leaderboard.length) return snapshot.leaderboard;
            let changed = false;
            for (let i = 0; i < prev.length; i++) {
              if (prev[i].name !== snapshot.leaderboard[i].name || prev[i].mass !== snapshot.leaderboard[i].mass) {
                changed = true;
                break;
              }
            }
            return changed ? snapshot.leaderboard : prev;
          });

          // Update Food Orbs
          const newOrbs: FoodOrb[] = snapshot.orbs.map((o) => ({
            id: o.id,
            x: o.x,
            y: o.y,
            radius: o.r,
            color: o.c,
            value: o.v,
            pulseOffset: Math.random() * Math.PI * 2,
          }));
          orbsRef.current = newOrbs;

          // Process Net Snakes
          const existingSnakes = snakesRef.current;
          const updatedSnakes: Snake[] = [];
          const activeSnakeIds = new Set<string>();

          for (const netSnake of snapshot.snakes) {
            activeSnakeIds.add(netSnake.id);
            // Priority 1: ID match. Priority 2: Name match (fallback for bots/backwards compat)
            const isMe = netSnake.id === mySnakeId || (netSnake.isPlayer && netSnake.name === profileRef.current.name);
            const skinObj = SKINS.find((s) => s.id === netSnake.skinId) || SKINS[0];

            let existing = existingSnakes.find((s) => s.id === netSnake.id);
            if (!existing) {
              existing = {
                id: netSnake.id,
                name: netSnake.name,
                isPlayer: isMe,
                x: netSnake.x,
                y: netSnake.y,
                angle: netSnake.angle,
                targetAngle: netSnake.angle,
                speed: netSnake.speed,
                mass: netSnake.mass,
                isBoosting: netSnake.isBoosting,
                skin: skinObj,
                segments: netSnake.segments.map((seg) => ({ x: seg.x, y: seg.y })),
                kills: netSnake.kills,
                dead: netSnake.dead,
                turnSpeed: isMe ? 0.12 : 0.062,
                spawnProtectionUntil: netSnake.spawnProtectionUntil,
              };
            } else {
              existing.isPlayer = isMe;
              existing.mass = netSnake.mass;
              existing.kills = netSnake.kills;
              existing.dead = netSnake.dead;
              existing.isBoosting = netSnake.isBoosting;
              existing.spawnProtectionUntil = netSnake.spawnProtectionUntil;
              existing.skin = skinObj;
            }

            // Store target for smooth 60fps interpolation
            snakeTargetPositions.current.set(netSnake.id, {
              x: netSnake.x,
              y: netSnake.y,
              angle: netSnake.angle,
              speed: netSnake.speed,
              mass: netSnake.mass,
              segments: netSnake.segments,
            });

            updatedSnakes.push(existing);

            if (isMe) {
              playerSnakeRef.current = existing;
              setPlayerMass((prev) => (Math.abs(prev - netSnake.mass) >= 1 ? netSnake.mass : prev));
              setPlayerKills((prev) => (prev !== netSnake.kills ? netSnake.kills : prev));
              const remainingProt = Math.max(0, netSnake.spawnProtectionUntil - Date.now());
              setSpawnProtectionRemaining((prev) => {
                if (prev === 0 && remainingProt === 0) return 0;
                if (Math.abs(prev - remainingProt) > 300 || (remainingProt === 0 && prev > 0)) {
                  return remainingProt;
                }
                return prev;
              });
            }
          }

          // Clean up target positions of dead/despawned snakes to prevent memory leaks
          for (const id of snakeTargetPositions.current.keys()) {
            if (!activeSnakeIds.has(id)) {
              snakeTargetPositions.current.delete(id);
            }
          }

          snakesRef.current = updatedSnakes;

          // Compute player rank on leaderboard
          const myEntryIdx = snapshot.leaderboard.findIndex((e) => e.name === profileRef.current.name);
          if (myEntryIdx !== -1) {
            const nextRank = myEntryIdx + 1;
            setPlayerRank((prev) => (prev !== nextRank ? nextRank : prev));
          }
          break;
        }

        case 'SNAKE_DIED': {
          if (msg.isYou) {
            if (msg.rewardResult) {
              setLastRewardResult(msg.rewardResult);
              trackGameOver({
                mode: gameMode,
                score: playerMass,
                kills: playerKills,
                survivalTime: (Date.now() - (gameStartTimeRef.current || Date.now())) / 1000,
                coinsEarned: msg.rewardResult.coins.total,
              });
            }
            if (msg.updatedProfile) {
              setProfile(msg.updatedProfile);
              savePlayerProfile(msg.updatedProfile).catch(console.error);
            }
            setGameState('GAMEOVER');
            sound.playDeath();
            fetchDailyMissions();
          }
          break;
        }

        case 'KILL_FEED': {
          if (msg.isYouKiller) {
            setKillBanner(`Vous avez éliminé ${msg.victimName} (+${Math.floor(msg.mass / 2)} masse) !`);
            sound.playKill();
            if (killBannerTimerRef.current) clearTimeout(killBannerTimerRef.current);
            killBannerTimerRef.current = setTimeout(() => {
              setKillBanner(null);
            }, 3000);
          }
          break;
        }

        case 'PROFILE_UPDATED': {
          if (msg.profile) {
            setProfile(msg.profile);
            savePlayerProfile(msg.profile).catch(console.error);
          }
          break;
        }

        case 'PLAYER_RESPAWNED': {
          if (msg.success) {
            if (msg.profile) {
              setProfile(msg.profile);
              savePlayerProfile(msg.profile).catch(console.error);
            }
            if (msg.snakeId) {
              setMySnakeId(msg.snakeId);
            }
            if (msg.respawnMass !== undefined) {
              setPlayerMass(msg.respawnMass);
            }
            setGameState('PLAYING');
            setIsPaused(false);
          }
          break;
        }

        case 'MATCHMAKING_STATUS': {
          if (msg.status === 'SEARCHING') setMatchmakingState('SEARCHING');
          else if (msg.status === 'FOUND') setMatchmakingState('FOUND');
          else if (msg.status === 'ERROR') setMatchmakingState('IDLE');
          break;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // ─── 3. Game Loop & Input Sending (25 Hz) ──────────────────────────
  useEffect(() => {
    if (gameState !== 'PLAYING' || isPaused) return;

    const inputInterval = setInterval(() => {
      let desiredAngle = 0;

      if (activeJoystickAngleRef.current !== null) {
        desiredAngle = activeJoystickAngleRef.current;
      } else {
        const mx = mousePosRef.current.x;
        const my = mousePosRef.current.y;
        if (mx !== 0 || my !== 0) {
          desiredAngle = Math.atan2(my, mx);
        }
      }

      inputSeqRef.current += 1;
      net.sendInput(desiredAngle, isBoostingRef.current, inputSeqRef.current);
      lastInputSentTimeRef.current = Date.now();
    }, 40); // 25 times per second

    return () => {
      clearInterval(inputInterval);
    };
  }, [gameState, isPaused]);

  // ─── 4. Client Interpolation Frame Loop (60 FPS) ────────────────────
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();

    const renderLoop = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;
      
      const dtFactor = dt * 60; // relative to 60fps
      // Smoothly approach target: 0.35 per 1/60s
      const lerpAmount = 1 - Math.pow(1 - 0.35, dtFactor);

      const snakes = snakesRef.current;
      const targets = snakeTargetPositions.current;

      for (const snake of snakes) {
        const target = targets.get(snake.id);
        if (target) {
          // Smooth interpolation
          snake.x += (target.x - snake.x) * lerpAmount;
          snake.y += (target.y - snake.y) * lerpAmount;
          snake.speed = target.speed;
          
          // Interpolate mass for smooth zoom and size transitions
          if (!snake.mass) snake.mass = target.mass;
          snake.mass += (target.mass - snake.mass) * lerpAmount;

          // Safe angle interpolation (O(1) with trigonometric wrapping - immune to infinite loops)
          if (!Number.isFinite(snake.angle)) snake.angle = 0;
          const targetAngle = Number.isFinite(target.angle) ? target.angle : 0;
          const angleDiff = Math.atan2(Math.sin(targetAngle - snake.angle), Math.cos(targetAngle - snake.angle));
          snake.angle += angleDiff * lerpAmount;

          // Segment smooth following
          if (target.segments && target.segments.length > 0) {
            if (snake.segments.length !== target.segments.length) {
              snake.segments = target.segments.map((s) => ({ x: s.x, y: s.y }));
            } else {
              for (let i = 0; i < snake.segments.length; i++) {
                snake.segments[i].x += (target.segments[i].x - snake.segments[i].x) * Math.min(1, lerpAmount * 1.5);
                snake.segments[i].y += (target.segments[i].y - snake.segments[i].y) * Math.min(1, lerpAmount * 1.5);
              }
            }
          }
        }
      }

      animFrame = requestAnimationFrame(renderLoop);
    };

    animFrame = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // ─── Player Actions ────────────────────────────────────────────────
  const startGame = useCallback((mode: GameMode = 'CLASSIC') => {
    setGameMode(mode);
    setMatchmakingState('SEARCHING');
    gameStartTimeRef.current = Date.now();
    sound.playButton();
    trackGameStart(mode, profileRef.current.equippedSkinId);
    net.joinMatchmaking(mode, profileRef.current.name, profileRef.current.avatarId, profileRef.current.equippedSkinId);
  }, []);

  const changePlayerName = useCallback((newName: string) => {
    const trimmed = newName.trim().slice(0, 16);
    if (!trimmed) return;
    net.updateName(trimmed);
  }, []);

  const login = useCallback(async (username: string, passwordPlain: string) => {
    const res = await net.login(username, passwordPlain);
    if (res.success && res.profile) {
      setProfile(res.profile);
      savePlayerProfile(res.profile).catch(console.error);
      sound.playUnlock();
    } else {
      sound.playError();
    }
    return res;
  }, []);

  const register = useCallback(async (username: string, passwordPlain: string, email?: string) => {
    const res = await net.register(username, passwordPlain, email, true);
    if (res.success && res.profile) {
      setProfile(res.profile);
      savePlayerProfile(res.profile).catch(console.error);
      sound.playUnlock();
    } else {
      sound.playError();
    }
    return res;
  }, []);

  const logout = useCallback(async () => {
    const res = await net.logout();
    sound.playButton();
    return res;
  }, []);

  const updateProfile = useCallback((updatedProfile: PlayerProfile) => {
    setProfile(updatedProfile);
    profileRef.current = updatedProfile;
    savePlayerProfile(updatedProfile).catch(console.error);
  }, []);

  const buySkin = useCallback(async (skinId: string) => {
    const targetSkin = SKINS.find((s) => s.id === skinId);
    if (!targetSkin) return { success: false, message: 'Skin introuvable.' };

    if (profileRef.current.coins < targetSkin.price) {
      sound.playError();
      return {
        success: false,
        message: `Coins insuffisants ! Il vous manque ${targetSkin.price - profileRef.current.coins} 🪙`,
      };
    }

    // Optimistic instant local update
    const updated: PlayerProfile = {
      ...profileRef.current,
      coins: profileRef.current.coins - targetSkin.price,
      unlockedSkins: Array.from(new Set([...profileRef.current.unlockedSkins, skinId])),
      equippedSkinId: skinId,
    };
    updateProfile(updated);

    net.buySkin(skinId);
    sound.playUnlock();
    trackSkinPurchase(skinId, targetSkin.price, targetSkin.rarity);
    return { success: true, message: `🎉 Skin ${targetSkin.name} débloqué et équipé !` };
  }, [updateProfile]);

  const equipSkin = useCallback(async (skinId: string) => {
    const targetSkin = SKINS.find((s) => s.id === skinId);
    if (!targetSkin || !profileRef.current.unlockedSkins.includes(skinId)) return false;

    const updated: PlayerProfile = {
      ...profileRef.current,
      equippedSkinId: skinId,
    };
    updateProfile(updated);

    net.equipSkin(skinId);
    sound.playButton();
    return true;
  }, [updateProfile]);

  const equipAvatar = useCallback(async (avatarId: string) => {
    if (!profileRef.current.unlockedAvatars.includes(avatarId)) return false;

    const updated: PlayerProfile = {
      ...profileRef.current,
      avatarId: avatarId,
    };
    updateProfile(updated);

    net.equipAvatar(avatarId);
    sound.playButton();
    return true;
  }, [updateProfile]);

  const buyAvatar = useCallback(async (avatarId: string, price: number) => {
    if (profileRef.current.coins < price) {
      sound.playError();
      return { success: false, message: 'Solde insuffisant.' };
    }

    const updated: PlayerProfile = {
      ...profileRef.current,
      coins: profileRef.current.coins - price,
      unlockedAvatars: Array.from(new Set([...profileRef.current.unlockedAvatars, avatarId])),
      avatarId: avatarId,
    };
    updateProfile(updated);

    net.buyAvatar(avatarId);
    sound.playUnlock();
    return { success: true, message: 'Avatar débloqué et équipé !' };
  }, [updateProfile]);

  const buyAbility = useCallback(async (abilityId: string, cost: number) => {
    if (profileRef.current.unlockedAbilities?.includes(abilityId)) {
      return { success: false, message: 'Pouvoir déjà débloqué.' };
    }
    if (profileRef.current.coins < cost) {
      sound.playError();
      return { success: false, message: 'Coins insuffisants !' };
    }

    // Instant local state update
    const updated: PlayerProfile = {
      ...profileRef.current,
      coins: profileRef.current.coins - cost,
      unlockedAbilities: Array.from(new Set([...(profileRef.current.unlockedAbilities || []), abilityId])),
    };
    updateProfile(updated);
    sound.playUnlock();

    // Call server to persist on account if logged in
    try {
      const token =
        net.getSessionToken() ||
        (typeof window !== 'undefined' ? localStorage.getItem('snake_arena_session_token') : null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/abilities/purchase', {
        method: 'POST',
        headers,
        body: JSON.stringify({ abilityId, cost }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        updateProfile(data.profile);
      }
    } catch {
      // Ignored: already saved locally
    }

    return { success: true, message: 'Pouvoir débloqué avec succès !' };
  }, [updateProfile]);

  const resetGameProgress = useCallback(async () => {
    net.resetProgress();
    sound.playButton();
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const setJoystickDirection = useCallback((angle: number | null) => {
    activeJoystickAngleRef.current = angle;
  }, []);

  const handlePointerMove = useCallback((clientX: number, clientY: number, width: number, height: number) => {
    mousePosRef.current = {
      x: clientX - width / 2,
      y: clientY - height / 2,
    };
  }, []);

  const setBoosting = useCallback((boosting: boolean) => {
    isBoostingRef.current = boosting;
  }, []);

  const respawnInGame = useCallback(async () => {
    return new Promise((resolve) => {
      const cleanup = net.addListener((msg) => {
        if (msg.type === 'PLAYER_RESPAWNED') {
          cleanup();
          resolve(msg);
        } else if (msg.type === 'ERROR') {
          cleanup();
          resolve({ success: false, error: msg.message });
        }
      });
      net.send({ type: 'RESPAWN' });
      // Safety timeout
      setTimeout(() => {
        cleanup();
        resolve({ success: false, error: 'Délai de réponse dépassé. Veuillez réessayer.' });
      }, 10000);
    });
  }, []);

  return {
    gameState,
    gameMode,
    setGameMode,
    profile,
    isDbLoaded,
    playerName: profile.name,
    setPlayerName: changePlayerName,
    login,
    register,
    logout,
    coins: profile.coins,
    unlockedSkins: profile.unlockedSkins,
    selectedSkin,
    buySkin,
    equipSkin,
    equipAvatar,
    buyAvatar,
    buyAbility,
    resetGameProgress,
    updateProfile,
    isPaused,
    setIsPaused,
    togglePause,
    setJoystickDirection,
    lastRewardResult,
    playerMass,
    playerKills,
    playerRank,
    leaderboard,
    killBanner,
    spawnProtectionRemaining,
    stats: profile.stats,
    snakesRef,
    orbsRef,
    playerSnakeRef,
    startGame,
    handlePointerMove,
    setBoosting,
    respawnInGame,
    isConnected,
    serverStatusText,
    matchmakingState,
    onlinePlayersCount,
    currentRoomId,
    dailyMissions,
    fetchDailyMissions,
    setDailyMissions,
    setProfile,
  };
}
