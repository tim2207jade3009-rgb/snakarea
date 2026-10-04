import React, { useEffect, useState } from 'react';
import { X, Target, CheckCircle2, Award, Clock, Sparkles, Loader2, Coins } from 'lucide-react';
import { DailyMission, PlayerDailyMissions, PlayerProfile } from '../types/game';
import { sound } from '../utils/audio';
import { net } from '../services/network';

interface DailyMissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  dailyMissions: PlayerDailyMissions | null;
  onMissionsUpdated: (missions: PlayerDailyMissions) => void;
  onProfileUpdated: (updatedProfile: PlayerProfile) => void;
}

export const DailyMissionsModal: React.FC<DailyMissionsModalProps> = ({
  isOpen,
  onClose,
  dailyMissions,
  onMissionsUpdated,
  onProfileUpdated,
}) => {
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token =
      net.getSessionToken() ||
      (typeof window !== 'undefined' ? localStorage.getItem('snake_arena_session_token') : null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Calculate time remaining until UTC midnight reset
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nextUtc = new Date();
      nextUtc.setUTCHours(24, 0, 0, 0);

      const diffMs = nextUtc.getTime() - now.getTime();
      if (diffMs <= 0) {
        setTimeLeft('Réinitialisation imminente');
        return;
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Refresh missions when opened
  useEffect(() => {
    if (isOpen) {
      fetch('/api/missions', { headers: getAuthHeaders() })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.dailyMissions) {
            onMissionsUpdated(data.dailyMissions);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaim = async (mission: DailyMission) => {
    if (mission.claimed || !mission.completed || claimingMissionId) return;

    sound.playButton();
    setClaimingMissionId(mission.id);

    try {
      const res = await fetch('/api/missions/claim', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ missionId: mission.id }),
      });

      const data = await res.json();
      if (data.success) {
        sound.playCoin();
        setToastMessage(`🎉 +${data.coinsCredited} 🪙 ajoutés à votre solde !`);
        setTimeout(() => setToastMessage(null), 3500);

        if (data.missions) onMissionsUpdated(data.missions);
        if (data.profile) onProfileUpdated(data.profile);
      } else {
        setToastMessage(data.error || 'Impossible de réclamer cette récompense.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('Error claiming mission:', err);
    } finally {
      setClaimingMissionId(null);
    }
  };

  const missions = dailyMissions?.missions || [];
  const completedCount = missions.filter((m) => m.completed || m.progress >= m.target).length;
  const claimedCount = missions.filter((m) => m.claimed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Missions Quotidiennes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {claimedCount}/{missions.length} Réclamées
                </span>
              </h2>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Réinitialisation dans : <strong className="text-amber-400 font-mono">{timeLeft}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playButton();
              onClose();
            }}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Toast */}
        {toastMessage && (
          <div className="my-3 p-2.5 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 animate-in fade-in shadow-lg">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Missions List */}
        <div className="overflow-y-auto my-3 pr-1 space-y-3 flex-1">
          {missions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span>Chargement des missions du jour...</span>
            </div>
          ) : (
            missions.map((mission) => {
              const isCompleted = mission.completed || mission.progress >= mission.target;
              const isClaimed = mission.claimed;
              const pct = Math.min(100, Math.floor((mission.progress / mission.target) * 100));

              return (
                <div
                  key={mission.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isClaimed
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                      : isCompleted
                      ? 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl shrink-0">
                      {mission.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs sm:text-sm font-extrabold text-white truncate">
                          {mission.title}
                        </h3>
                        <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1 shrink-0">
                          <Coins className="w-3 h-3 text-amber-400" />
                          +{mission.rewardCoins} 🪙
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {mission.description}
                      </p>

                      {/* Progress Bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isClaimed
                                ? 'bg-slate-600'
                                : isCompleted
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-300 shrink-0">
                          {mission.progress}/{mission.target}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Claim Button / Status */}
                  <div className="w-full sm:w-auto shrink-0 flex justify-end">
                    {isClaimed ? (
                      <div className="px-3.5 py-1.5 bg-slate-800/80 border border-slate-700/50 rounded-xl text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Réclamé</span>
                      </div>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleClaim(mission)}
                        disabled={claimingMissionId === mission.id}
                        className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        {claimingMissionId === mission.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Award className="w-3.5 h-3.5" />
                            <span>Réclamer (+{mission.rewardCoins} 🪙)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="px-3.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] font-bold text-slate-500">
                        En cours ({pct}%)
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 text-center flex items-center justify-between">
          <span>Complétez des missions chaque jour pour maximiser vos Coins.</span>
          <span className="text-amber-400/80 font-semibold">Total dispo : {missions.reduce((a, m) => a + m.rewardCoins, 0)} 🪙</span>
        </div>
      </div>
    </div>
  );
};
