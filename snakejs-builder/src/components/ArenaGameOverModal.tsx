import React, { useEffect, useState } from 'react';
import { RotateCcw, Home, ShoppingBag, Sparkles, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { GameMode, GameRewardResult, PlayerProfile } from '../types/game';
import { sound } from '../utils/audio';
import { getRankInfo } from '../utils/ranking';
import { getXpRequiredForLevel } from '../utils/progression';

interface ArenaGameOverModalProps {
  mass: number;
  kills: number;
  rank: number;
  totalPlayers: number;
  bestScore: number;
  gameMode: GameMode;
  rewardResult: GameRewardResult | null;
  profile: PlayerProfile;
  onRespawn: () => void;
  onInGameRespawn?: () => Promise<any>;
  onMenu: () => void;
  onOpenShop: () => void;
  onOpenPowersShop?: () => void;
}

export const ArenaGameOverModal: React.FC<ArenaGameOverModalProps> = ({
  mass,
  kills,
  rank,
  totalPlayers,
  bestScore,
  gameMode,
  rewardResult,
  profile,
  onRespawn,
  onInGameRespawn,
  onMenu,
  onOpenShop,
  onOpenPowersShop,
}) => {
  const isNewRecord = mass > bestScore;
  const targetCoins = rewardResult ? rewardResult.coins.total : 0;
  const [animatedCoins, setAnimatedCoins] = useState<number>(0);
  const [animatedXp, setAnimatedXp] = useState<number>(0);
  const [isRespawning, setIsRespawning] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Progressive count-up animation for earned coins & XP
  useEffect(() => {
    if (targetCoins <= 0 && (!rewardResult || rewardResult.xpEarned <= 0)) return;

    let startCoins = 0;
    const targetXp = rewardResult ? rewardResult.xpEarned : 0;
    let startXp = 0;

    const duration = 1000;
    const steps = 20;
    const incrementCoins = targetCoins / steps;
    const incrementXp = targetXp / steps;
    const intervalTime = duration / steps;

    const timer = setInterval(() => {
      startCoins += incrementCoins;
      startXp += incrementXp;

      if (startCoins >= targetCoins) {
        setAnimatedCoins(targetCoins);
        setAnimatedXp(targetXp);
        sound.playCoin();
        clearInterval(timer);
      } else {
        setAnimatedCoins(Math.floor(startCoins));
        setAnimatedXp(Math.floor(startXp));
        if (Math.random() < 0.25) sound.playCoin();
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [targetCoins, rewardResult]);

  const currentRankInfo = getRankInfo(profile.rank);
  const xpNeeded = getXpRequiredForLevel(profile.level);
  const xpPercentage = Math.min(100, Math.floor((profile.xp / xpNeeded) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-center my-auto">
        {/* Death Header */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-xl">💀</span>
          <span className="text-xs font-black uppercase tracking-widest text-rose-400">GAME OVER</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            gameMode === 'RANKED'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            {gameMode === 'RANKED' ? 'Arène Classée' : 'Classique'}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Partie Terminée
        </h2>

        {/* Milestone Notifications (Level Up / Rank Up / Rank Down) */}
        {rewardResult?.levelUp && (
          <div className="my-2.5 p-2 bg-gradient-to-r from-amber-500/20 via-yellow-500/25 to-amber-500/20 border border-amber-400/50 rounded-2xl animate-in zoom-in-90 duration-300">
            <div className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center justify-center gap-1">
              <span>🎉 LEVEL UP !</span>
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              Niveau <span className="text-slate-400">{rewardResult.oldLevel}</span> ➔{' '}
              <span className="text-amber-400 text-base">{rewardResult.newLevel}</span>
              <span className="text-[11px] text-amber-300 font-normal ml-1.5">(+{rewardResult.bonusCoinsFromLevelUp || 20} 🪙)</span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="my-2.5 p-2 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold animate-in slide-in-from-top-2 duration-200">
            ⚠️ {errorMsg}
          </div>
        )}

        {rewardResult?.rankChanged === 'up' && (
          <div className="my-2.5 p-2 bg-gradient-to-r from-emerald-500/20 via-teal-500/25 to-emerald-500/20 border border-emerald-400/50 rounded-2xl animate-in zoom-in-90 duration-300">
            <div className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center justify-center gap-1">
              <ChevronUp className="w-4 h-4 stroke-[3]" />
              <span>PROMOTION DE RANG !</span>
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {rewardResult.oldRank} ➔ <span className="text-emerald-300 font-extrabold">{rewardResult.newRank}</span>
            </div>
          </div>
        )}

        {rewardResult?.rankChanged === 'down' && (
          <div className="my-2.5 p-2 bg-gradient-to-r from-rose-500/20 to-red-500/20 border border-rose-500/40 rounded-2xl animate-in zoom-in-90 duration-300">
            <div className="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center justify-center gap-1">
              <ChevronDown className="w-4 h-4 stroke-[3]" />
              <span>RÉTROGRADATION</span>
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {rewardResult.oldRank} ➔ <span className="text-rose-400 font-extrabold">{rewardResult.newRank}</span>
            </div>
          </div>
        )}

        {/* Match Performance Grid */}
        <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-2xl my-2.5 text-center">
          <div>
            <div className="text-[9px] uppercase font-semibold text-slate-400">Score / Masse</div>
            <div className="text-base font-bold font-mono text-emerald-400 mt-0.5 tabular-nums">{mass}</div>
            {isNewRecord && (
              <span className="text-[8px] text-amber-400 font-bold block animate-bounce">Nouveau Record !</span>
            )}
          </div>

          <div>
            <div className="text-[9px] uppercase font-semibold text-slate-400">Frags</div>
            <div className="text-base font-bold font-mono text-amber-400 mt-0.5 tabular-nums flex items-center justify-center gap-1">
              <span>{kills}</span>
              <span className="text-[10px]">⚔️</span>
            </div>
          </div>

          <div>
            <div className="text-[9px] uppercase font-semibold text-slate-400">Rang Arène</div>
            <div className="text-base font-bold font-mono text-sky-400 mt-0.5 tabular-nums">#{rank}</div>
          </div>
        </div>

        {/* Rewards & Progression Card */}
        {rewardResult && (
          <div className="p-3 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl mb-3 shadow-lg flex flex-col gap-2">
            {/* Currency & XP gains row */}
            <div className="grid grid-cols-2 gap-2 text-left">
              {/* Coins Earned */}
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="text-[10px] text-slate-400 font-medium">Coins Gagnés</div>
                <div className="text-lg font-black font-mono text-amber-300 flex items-center gap-1">
                  <span>+{animatedCoins}</span>
                  <span className="text-base">🪙</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  Total : {profile.coins.toLocaleString('fr-FR')} 🪙
                </div>
              </div>

              {/* XP Earned */}
              <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                <div className="text-[10px] text-slate-400 font-medium">XP Gagnée</div>
                <div className="text-lg font-black font-mono text-sky-300 flex items-center gap-1">
                  <span>+{animatedXp}</span>
                  <span className="text-xs">⚡</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  Niveau {profile.level} ({xpPercentage}%)
                </div>
              </div>
            </div>

            {/* Level Progress Bar */}
            <div className="w-full text-left pt-0.5">
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 mb-1">
                <span>Progression Niv. {profile.level}</span>
                <span className="font-mono text-slate-300">{profile.xp} / {xpNeeded} XP</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-700 rounded-full"
                  style={{ width: `${xpPercentage}%` }}
                />
              </div>
            </div>

            {/* Ranked RR row if playing ranked */}
            {gameMode === 'RANKED' && (
              <div className="pt-2 border-t border-slate-800/80 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs font-bold">
                    <span>{currentRankInfo.icon}</span>
                    <span className={currentRankInfo.textColor}>{profile.rank}</span>
                  </div>
                  <div className={`text-xs font-bold font-mono ${
                    rewardResult.rrChange > 0 ? 'text-emerald-400' : rewardResult.rrChange < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {rewardResult.rrChange > 0 ? `+${rewardResult.rrChange}` : rewardResult.rrChange} RR
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, profile.rr))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
                  <span>{profile.rr} / 100 RR</span>
                  <span>Promotion à 100 RR</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {/* Instant 50-Coins Respawn Button */}
          {onInGameRespawn && (
            <button
              onClick={async () => {
                setErrorMsg(null);
                sound.playButton();
                if (profile.coins < 50) {
                  onOpenShop();
                  return;
                }
                try {
                  setIsRespawning(true);
                  const result = await onInGameRespawn() as any;
                  if (result && !result.success) {
                    setErrorMsg(result.error || 'Erreur lors du respawn.');
                  }
                } catch (err) {
                  setErrorMsg('Erreur de communication avec le serveur.');
                } finally {
                  setIsRespawning(false);
                }
              }}
              disabled={isRespawning}
              className={`w-full py-3 px-4 font-black rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer shadow-lg uppercase tracking-wider text-xs sm:text-sm ${
                profile.coins >= 50
                  ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-400/50'
                  : 'bg-slate-800 hover:bg-slate-750 text-amber-400 border border-amber-500/40'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-950 fill-current" />
              {profile.coins >= 50 ? (
                <span>{isRespawning ? 'Respawn en cours...' : 'Respawn Immédiat — 50 🪙'}</span>
              ) : (
                <span>Respawn — 50 🪙 (Acheter)</span>
              )}
            </button>
          )}

          <button
            onClick={() => {
              sound.playButton();
              onRespawn();
            }}
            className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer shadow-md shadow-emerald-500/20 uppercase tracking-wider text-xs sm:text-sm"
          >
            <RotateCcw className="w-4 h-4 stroke-[3]" />
            <span>Nouvelle Partie ({gameMode === 'RANKED' ? 'Classé' : 'Normal'})</span>
          </button>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                sound.playButton();
                onOpenShop();
              }}
              className="py-2 px-1.5 sm:px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[11px] sm:text-xs rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Obtenir des coins gratuits"
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span>Coins</span>
            </button>

            {onOpenPowersShop && (
              <button
                onClick={() => {
                  sound.playButton();
                  onOpenPowersShop();
                }}
                className="py-2 px-1.5 sm:px-3 bg-gradient-to-r from-amber-500/20 to-cyan-500/20 hover:from-amber-500/30 hover:to-cyan-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] sm:text-xs rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Améliorer vos pouvoirs (Aimant 1-10, Boules de feu, Bouclier...)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
                <span>Pouvoirs</span>
              </button>
            )}

            <button
              onClick={() => {
                sound.playButton();
                onMenu();
              }}
              className="py-2 px-1.5 sm:px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] sm:text-xs rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <Home className="w-3.5 h-3.5 shrink-0" />
              <span>Menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
