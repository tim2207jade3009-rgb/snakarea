import React, { useState, useEffect } from 'react';
import { LeaderboardEntry, PlayerDailyMissions, Snake } from '../types/game';
import { Trophy, Zap, Volume2, VolumeX, Shield, Pause, ChevronDown, ChevronUp, X, Users, Globe, Target } from 'lucide-react';
import { sound } from '../utils/audio';
import { VirtualJoystick } from './VirtualJoystick';
import { DailyMissionsTracker } from './DailyMissionsTracker';

interface ArenaHUDProps {
  playerMass: number;
  playerKills: number;
  playerRank: number;
  totalPlayers: number;
  onlinePlayersCount: number;
  leaderboard: LeaderboardEntry[];
  killBanner: string | null;
  spawnProtectionRemaining: number;
  coins: number;
  unlockedAbilities: string[];
  isBoosting: boolean;
  fireAuraActive: boolean;
  fireAuraCooldown: number;
  onUseFireAura: () => void;
  shieldActive: boolean;
  shieldCooldown: number;
  onUseShield: () => void;
  frostActive: boolean;
  frostCooldown: number;
  onUseFrost: () => void;
  muted: boolean;
  dailyMissions: PlayerDailyMissions | null;
  snakeCount: number;
  orbCount: number;
  snakesRef: React.MutableRefObject<Snake[]>;
  playerSnakeRef: React.MutableRefObject<Snake | null>;
  onOpenMissionsModal: () => void;
  onToggleMute: () => void;
  onSetBoosting: (boosting: boolean) => void;
  onPause: () => void;
  onJoystickDirection: (angle: number | null) => void;
}

export const ArenaHUD: React.FC<ArenaHUDProps> = ({
  playerMass,
  playerKills,
  playerRank,
  totalPlayers,
  onlinePlayersCount,
  leaderboard,
  killBanner,
  spawnProtectionRemaining,
  coins,
  unlockedAbilities,
  isBoosting,
  fireAuraActive,
  fireAuraCooldown,
  onUseFireAura,
  shieldActive,
  shieldCooldown,
  onUseShield,
  frostActive,
  frostCooldown,
  onUseFrost,
  muted,
  dailyMissions,
  onOpenMissionsModal,
  onToggleMute,
  onSetBoosting,
  onPause,
  onJoystickDirection,
  snakeCount,
  orbCount,
  snakesRef,
  playerSnakeRef,
}) => {
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [isShortLandscape, setIsShortLandscape] = useState<boolean>(false);
  const [dismissPortraitTip, setDismissPortraitTip] = useState<boolean>(false);
  const minimapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Performance monitoring state
  const [fps, setFps] = useState<number>(0);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const loop = () => {
      try {
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastTime)));
          frameCount = 0;
          lastTime = now;
        }

        // Render Tactical Radar Minimap
        const minimap = minimapCanvasRef.current;
        const player = playerSnakeRef.current;
        const snakes = snakesRef.current;
        const ARENA_RADIUS = 2600;

        if (minimap && player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
          const mctx = minimap.getContext('2d');
          if (mctx) {
            const mSize = minimap.width;
            const mCenter = mSize / 2;
            const mRadius = mSize * 0.44;

            mctx.clearRect(0, 0, mSize, mSize);

            // Radar background circle
            const gradient = mctx.createRadialGradient(mCenter, mCenter, 0, mCenter, mCenter, mRadius);
            gradient.addColorStop(0, 'rgba(6, 10, 18, 0.9)');
            gradient.addColorStop(1, 'rgba(10, 15, 25, 0.95)');
            mctx.fillStyle = gradient;
            mctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            mctx.lineWidth = 1.5;
            mctx.beginPath();
            mctx.arc(mCenter, mCenter, mRadius, 0, Math.PI * 2);
            mctx.fill();
            mctx.stroke();

            // Radar rings
            mctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            mctx.lineWidth = 1;
            mctx.beginPath();
            mctx.arc(mCenter, mCenter, mRadius * 0.5, 0, Math.PI * 2);
            mctx.stroke();

            // Arena Center Point
            mctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            mctx.beginPath();
            mctx.arc(mCenter, mCenter, 2.5, 0, Math.PI * 2);
            mctx.fill();

            const mapScale = mRadius / ARENA_RADIUS;

            // Draw Snakes on Radar
            for (let i = 0; i < snakes.length; i++) {
              const s = snakes[i];
              if (!s || s.dead || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
              const mx = mCenter + s.x * mapScale;
              const my = mCenter + s.y * mapScale;

              if (s.id === player.id) {
                // Local Player - Neon Green
                mctx.shadowColor = '#10b981';
                mctx.shadowBlur = 6;
                mctx.fillStyle = '#10b981';
                mctx.beginPath();
                mctx.arc(mx, my, 4.2, 0, Math.PI * 2);
                mctx.fill();
                mctx.shadowBlur = 0;
                mctx.strokeStyle = '#ffffff';
                mctx.lineWidth = 1;
                mctx.stroke();
              } else {
                // Highlight dangerous opponents (much larger and nearby)
                const distSq = Math.pow(s.x - player.x, 2) + Math.pow(s.y - player.y, 2);
                const isDangerous = (s.mass || 0) > (player.mass || 40) * 1.4 && distSq < 1500 * 1500;
                
                if (isDangerous) {
                  const pulse = 1 + Math.sin(now * 0.012) * 0.35;
                  mctx.fillStyle = '#f43f5e'; // Rose
                  mctx.shadowColor = '#f43f5e';
                  mctx.shadowBlur = 10 * pulse;
                  mctx.beginPath();
                  mctx.arc(mx, my, 4 * pulse, 0, Math.PI * 2);
                  mctx.fill();
                  mctx.shadowBlur = 0;
                  
                  // Alert ping line to dangerous enemy
                  mctx.strokeStyle = 'rgba(244, 63, 94, 0.15)';
                  mctx.lineWidth = 1;
                  mctx.beginPath();
                  mctx.moveTo(mCenter + player.x * mapScale, mCenter + player.y * mapScale);
                  mctx.lineTo(mx, my);
                  mctx.stroke();
                } else {
                  const isHuge = (s.mass || 0) > 600;
                  mctx.fillStyle = isHuge ? '#fb923c' : 'rgba(200, 200, 200, 0.45)';
                  mctx.beginPath();
                  mctx.arc(mx, my, isHuge ? 3 : 2, 0, Math.PI * 2);
                  mctx.fill();
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Radar minimap render error caught:', err);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [snakesRef, playerSnakeRef]);

  useEffect(() => {
    const handleOrientation = () => {
      if (typeof window !== 'undefined') {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const portrait = h > w;
        setIsPortrait(portrait);
        setIsShortLandscape(!portrait && h < 520);
      }
    };

    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', () => {
      handleOrientation();
      setTimeout(handleOrientation, 150);
      setTimeout(handleOrientation, 350);
    });

    return () => {
      window.removeEventListener('resize', handleOrientation);
    };
  }, []);

  const shouldShowFullLeaderboard = !isShortLandscape || showLeaderboard;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-2 sm:p-4 select-none overflow-hidden">
      {/* Top Bar: Stats, Actions & Leaderboard */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Player Stats Card & Control Buttons */}
        <div className="pointer-events-auto flex flex-col gap-1.5 max-w-[70%] sm:max-w-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Stats Badge */}
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-xl flex items-center gap-2.5 sm:gap-4 text-xs">
              <div>
                <div className="text-[9px] sm:text-[10px] uppercase font-semibold text-slate-400">Masse</div>
                <div className="text-sm sm:text-lg font-bold font-mono text-emerald-400 tabular-nums">
                  {playerMass}
                </div>
              </div>

              <div className="w-px h-5 sm:h-7 bg-slate-800" />

              <div>
                <div className="text-[9px] sm:text-[10px] uppercase font-semibold text-slate-400">Frags</div>
                <div className="text-sm sm:text-lg font-bold font-mono text-amber-400 tabular-nums flex items-center gap-1">
                  <span>{playerKills}</span>
                  <span className="text-[10px]">⚔️</span>
                </div>
              </div>

              <div className="w-px h-5 sm:h-7 bg-slate-800" />

              <div>
                <div className="text-[9px] sm:text-[10px] uppercase font-semibold text-slate-400">Rang</div>
                <div className="text-sm sm:text-lg font-bold font-mono text-sky-400 tabular-nums">
                  #{playerRank} <span className="text-[9px] sm:text-[10px] text-slate-400 font-normal">/{totalPlayers}</span>
                </div>
              </div>
            </div>

            {/* Online Players Count Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-[11px] font-bold shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{onlinePlayersCount} {onlinePlayersCount > 1 ? 'Joueurs' : 'Joueur'}</span>
            </div>

            {/* Pause Button */}
            <button
              onClick={() => {
                sound.playButton();
                onPause();
              }}
              className="p-1.5 sm:p-2 bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-xl text-slate-200 transition-all cursor-pointer shadow-md flex items-center gap-1"
              title="Pause (Échap / P)"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold hidden md:inline">Menu</span>
            </button>

            {/* Mute Button */}
            <button
              onClick={onToggleMute}
              className="p-1.5 sm:p-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors cursor-pointer shadow-md"
              title={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>

            {/* Coins Balance Indicator */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900/80 border border-amber-500/40 rounded-xl text-amber-300 text-[11px] font-bold font-mono shadow-sm">
              <span>🪙</span>
              <span>{coins.toLocaleString('fr-FR')}</span>
            </div>

            {/* Daily Missions Live Tracker HUD Component */}
            <DailyMissionsTracker
              dailyMissions={dailyMissions}
              onOpenMissionsModal={onOpenMissionsModal}
            />

            {/* Performance Monitoring Overlay (Non-intrusive) */}
            <div className="flex items-center gap-3 px-2 py-1 bg-slate-950/40 backdrop-blur-sm border border-slate-800/50 rounded-lg text-[9px] font-mono text-slate-400">
              <div className="flex items-center gap-1">
                <span className={fps < 30 ? 'text-rose-400' : fps < 55 ? 'text-amber-400' : 'text-emerald-400'}>{fps}</span>
                <span>FPS</span>
              </div>
              <div className="w-px h-2 bg-slate-800/50" />
              <div className="flex items-center gap-1">
                <span className="text-slate-300">{snakeCount}</span>
                <span>SNAKES</span>
              </div>
              <div className="w-px h-2 bg-slate-800/50" />
              <div className="flex items-center gap-1">
                <span className="text-slate-300">{orbCount}</span>
                <span>ORBS</span>
              </div>
            </div>
          </div>

          {/* Spawn Protection Active Pill */}
          {spawnProtectionRemaining > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-950/90 border border-sky-400/60 rounded-xl text-xs shadow-lg shadow-sky-500/10 animate-pulse w-fit">
              <Shield className="w-3 h-3 text-sky-400 stroke-[2.5]" />
              <span className="text-sky-200 font-semibold text-[10px]">
                Zone Sûre : Invulnérable ({spawnProtectionRemaining}s)
              </span>
            </div>
          )}

          {/* Portrait gentle suggestion */}
          {isPortrait && !dismissPortraitTip && (
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 shadow-md w-fit">
              <span>🔄 Conseil : Tournez l'écran en paysage pour élargir la vue</span>
              <button
                onClick={() => setDismissPortraitTip(true)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
                title="Fermer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Top-Center: Kill Notification Banner */}
        {killBanner && (
          <div className="pointer-events-none self-start px-3 py-1.5 sm:px-4 sm:py-2 bg-emerald-950/95 border border-emerald-500 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <span className="text-sm sm:text-base">💥</span>
            <div>
              <div className="text-[9px] sm:text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Victime Piégée !</div>
              <div className="text-[11px] sm:text-xs font-semibold text-white">{killBanner}</div>
            </div>
          </div>
        )}

        {/* Top-Right: Live Leaderboard */}
        <div className="pointer-events-auto flex flex-col items-end">
          {/* Toggle Button on mobile or short landscape */}
          {(isShortLandscape || !shouldShowFullLeaderboard) && (
            <button
              onClick={() => setShowLeaderboard(!showLeaderboard)}
              className="px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-xl text-[10px] font-bold text-amber-400 flex items-center gap-1 shadow-md cursor-pointer mb-1 hover:bg-slate-800 transition-colors"
            >
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>Top 10</span>
              {showLeaderboard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {shouldShowFullLeaderboard && (
            <div className="flex flex-col bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-xl p-2 sm:p-3 shadow-xl w-40 sm:w-52 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/80 mb-1">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-white tracking-tight uppercase">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span>Top 10 Arène</span>
                </div>
                {isShortLandscape && (
                  <button
                    onClick={() => setShowLeaderboard(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-0.5 text-xs max-h-[140px] sm:max-h-none overflow-y-auto">
                {leaderboard.slice(0, 10).map((item) => (
                  <div
                    key={`${item.rank}_${item.name}`}
                    className={`flex items-center justify-between py-0.5 px-1 rounded transition-colors ${
                      item.isPlayer
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 truncate max-w-[95px] sm:max-w-[120px]">
                      <span className={`text-[9px] font-mono ${item.rank <= 3 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                        #{item.rank}
                      </span>
                      <span className="truncate text-[10px] sm:text-[11px]">{item.name}</span>
                    </div>
                    <span className="font-mono tabular-nums text-[9px] sm:text-[10px] text-slate-400">
                      {item.mass}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Area: Virtual Joystick (Left) and Turbo Boost Button (Right) */}
      <div className="flex items-end justify-between w-full pointer-events-none pb-1 sm:pb-2 px-1">
        {/* Virtual Tactile Joystick (Bottom-Left) */}
        <div className="pointer-events-auto mb-1 ml-1">
          <VirtualJoystick onDirectionChange={onJoystickDirection} compact={isShortLandscape} />
        </div>

        {/* Turbo Boost Button Area & Radar Overlay */}
        <div className="flex items-end gap-2 sm:gap-3 pointer-events-auto mb-1.5 mr-1">
          {/* Unlocked Abilities Action Buttons (Only shown if purchased!) */}
          {(unlockedAbilities.includes('fireball') ||
            unlockedAbilities.includes('shield') ||
            unlockedAbilities.includes('frost_pulse')) && (
            <div className="flex flex-col gap-1.5 mr-1">
              {/* 1. Fire Aura Button (Only if purchased) */}
              {unlockedAbilities.includes('fireball') && (
                <button
                  onClick={onUseFireAura}
                  disabled={fireAuraCooldown > 0}
                  style={{ touchAction: 'none' }}
                  className={`relative w-11 h-11 sm:w-13 sm:h-13 rounded-2xl border flex flex-col items-center justify-center transition-all shadow-xl ${
                    fireAuraActive
                      ? 'bg-orange-500 text-slate-950 border-orange-300 ring-2 ring-orange-400 animate-pulse scale-105'
                      : fireAuraCooldown > 0
                      ? 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-orange-600/90 hover:bg-orange-500 text-white border-orange-400 active:scale-95 shadow-orange-600/30 cursor-pointer'
                  }`}
                  title="Aura de Feu (Raccourci: F)"
                >
                  <span className="text-base sm:text-lg">🔥</span>
                  <span className="text-[7px] font-black uppercase">
                    {fireAuraActive ? 'Actif' : fireAuraCooldown > 0 ? `${fireAuraCooldown}s` : 'Aura [F]'}
                  </span>
                  {fireAuraCooldown > 0 && !fireAuraActive && (
                    <div className="absolute inset-0 bg-slate-950/60 rounded-2xl flex items-center justify-center font-mono font-black text-[11px] text-amber-400">
                      {fireAuraCooldown}s
                    </div>
                  )}
                </button>
              )}

              {/* 2. Shield Button (Only if purchased) */}
              {unlockedAbilities.includes('shield') && (
                <button
                  onClick={onUseShield}
                  disabled={shieldCooldown > 0}
                  style={{ touchAction: 'none' }}
                  className={`relative w-11 h-11 sm:w-13 sm:h-13 rounded-2xl border flex flex-col items-center justify-center transition-all shadow-xl ${
                    shieldActive
                      ? 'bg-blue-500 text-slate-950 border-blue-300 ring-2 ring-blue-400 animate-pulse scale-105'
                      : shieldCooldown > 0
                      ? 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600/90 hover:bg-blue-500 text-white border-blue-400 active:scale-95 shadow-blue-600/30 cursor-pointer'
                  }`}
                  title="Bouclier Éphémère (Raccourci: B)"
                >
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-[7px] font-black uppercase">
                    {shieldActive ? 'Actif' : shieldCooldown > 0 ? `${shieldCooldown}s` : 'Bouclier [B]'}
                  </span>
                  {shieldCooldown > 0 && !shieldActive && (
                    <div className="absolute inset-0 bg-slate-950/60 rounded-2xl flex items-center justify-center font-mono font-black text-[11px] text-sky-400">
                      {shieldCooldown}s
                    </div>
                  )}
                </button>
              )}

              {/* 3. Frost Pulse Button (Only if purchased) */}
              {unlockedAbilities.includes('frost_pulse') && (
                <button
                  onClick={onUseFrost}
                  disabled={frostCooldown > 0}
                  style={{ touchAction: 'none' }}
                  className={`relative w-11 h-11 sm:w-13 sm:h-13 rounded-2xl border flex flex-col items-center justify-center transition-all shadow-xl ${
                    frostActive
                      ? 'bg-cyan-400 text-slate-950 border-cyan-200 ring-2 ring-cyan-300 animate-pulse scale-105'
                      : frostCooldown > 0
                      ? 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-cyan-600/90 hover:bg-cyan-500 text-white border-cyan-400 active:scale-95 shadow-cyan-600/30 cursor-pointer'
                  }`}
                  title="Onde de Givre - Ralentit les ennemis de 50% (Raccourci: G)"
                >
                  <span className="text-base sm:text-lg">❄️</span>
                  <span className="text-[7px] font-black uppercase">
                    {frostActive ? 'Actif' : frostCooldown > 0 ? `${frostCooldown}s` : 'Givre [G]'}
                  </span>
                  {frostCooldown > 0 && !frostActive && (
                    <div className="absolute inset-0 bg-slate-950/60 rounded-2xl flex items-center justify-center font-mono font-black text-[11px] text-cyan-400">
                      {frostCooldown}s
                    </div>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Radar / Minimap Overlay */}
          <div className="flex flex-col items-center">
            <canvas
              ref={minimapCanvasRef}
              width={120}
              height={120}
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-full shadow-2xl backdrop-blur-md border border-slate-800/80 bg-slate-950/50"
            />
            <div className="text-[8px] sm:text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1">
              <Target className="w-2 h-2" />
              Radar Tactique
            </div>
          </div>

          {/* Large Touch Turbo Boost Button */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              sound.playButton();
              onSetBoosting(true);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              onSetBoosting(false);
            }}
            onPointerCancel={() => onSetBoosting(false)}
            onPointerLeave={() => onSetBoosting(false)}
            style={{ touchAction: 'none' }}
            className={`${
              isShortLandscape ? 'w-16 h-16' : 'w-18 h-18 sm:w-22 sm:h-22'
            } rounded-full border-2 flex flex-col items-center justify-center transition-all active:scale-95 shadow-2xl cursor-pointer select-none ${
              isBoosting
                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/40 ring-4 ring-amber-400/50 scale-105'
                : 'bg-slate-900/90 text-amber-400 border-amber-500/60 hover:bg-slate-800'
            }`}
            title="Turbo Boost (Espace / Clic)"
          >
            <Zap className={`${isShortLandscape ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8'} fill-current stroke-[2]`} />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
              Boost
            </span>
          </button>
        </div>

        {/* Branding Credit Watermark at Bottom Center */}
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500/70 tracking-widest uppercase z-10 select-none">
          by ToxikStudio
        </div>
      </div>
    </div>
  );
};
