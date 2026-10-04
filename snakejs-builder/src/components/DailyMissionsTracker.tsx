import React, { useState } from 'react';
import { Target, ChevronDown, ChevronUp, Award, Sparkles } from 'lucide-react';
import { PlayerDailyMissions } from '../types/game';
import { sound } from '../utils/audio';

interface DailyMissionsTrackerProps {
  dailyMissions: PlayerDailyMissions | null;
  onOpenMissionsModal: () => void;
}

export const DailyMissionsTracker: React.FC<DailyMissionsTrackerProps> = ({
  dailyMissions,
  onOpenMissionsModal,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const missions = dailyMissions?.missions || [];
  const completedUnclaimedCount = missions.filter((m) => (m.completed || m.progress >= m.target) && !m.claimed).length;

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1 max-w-[240px]">
      {/* Trigger / Header Badge */}
      <button
        onClick={() => {
          sound.playButton();
          setIsExpanded(!isExpanded);
        }}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xl flex items-center gap-2 cursor-pointer ${
          completedUnclaimedCount > 0
            ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 border-amber-300 animate-pulse shadow-amber-500/20'
            : 'bg-slate-900/90 text-slate-200 border-slate-800 hover:border-slate-700 backdrop-blur-md'
        }`}
      >
        <Target className={`w-3.5 h-3.5 ${completedUnclaimedCount > 0 ? 'text-slate-950' : 'text-amber-400'}`} />
        <span>Missions</span>

        {completedUnclaimedCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-300 font-extrabold text-[10px]">
            {completedUnclaimedCount}
          </span>
        )}

        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
      </button>

      {/* Expanded Progress Widget */}
      {isExpanded && (
        <div className="w-full bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-slate-400 border-b border-slate-800 pb-1">
            <span>Missions du jour</span>
            <span className="text-amber-400">Progression</span>
          </div>

          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-0.5">
            {missions.length === 0 ? (
              <div className="text-[10px] text-slate-500 text-center py-2">Missions non chargées</div>
            ) : (
              missions.map((m) => {
                const isCompleted = m.completed || m.progress >= m.target;
                const pct = Math.min(100, Math.floor((m.progress / m.target) * 100));

                return (
                  <div key={m.id} className="text-[11px] leading-tight flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-slate-200 font-bold truncate flex items-center gap-1">
                        <span>{m.icon}</span>
                        <span className="truncate">{m.title}</span>
                      </span>
                      <span className={`font-mono text-[10px] shrink-0 font-bold ${m.claimed ? 'text-slate-500' : isCompleted ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {m.claimed ? 'Réclamé' : `${m.progress}/${m.target}`}
                      </span>
                    </div>

                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          m.claimed
                            ? 'bg-slate-600'
                            : isCompleted
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            onClick={() => {
              sound.playButton();
              onOpenMissionsModal();
            }}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer mt-0.5"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Voir Toutes / Réclamer</span>
          </button>
        </div>
      )}
    </div>
  );
};
