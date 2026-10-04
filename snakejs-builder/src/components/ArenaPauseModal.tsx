import React from 'react';
import { Play, Home, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../utils/audio';

interface ArenaPauseModalProps {
  onResume: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
  mass: number;
  kills: number;
  rank: number;
}

export const ArenaPauseModal: React.FC<ArenaPauseModalProps> = ({
  onResume,
  onQuit,
  muted,
  onToggleMute,
  mass,
  kills,
  rank,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-sm bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl text-center my-auto">
        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto mb-3 text-2xl shadow-lg shadow-sky-500/10">
          ⏸️
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Partie en Pause
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          L'arène est suspendue. Prenez votre temps !
        </p>

        {/* Current Run Stats */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl my-4 text-center">
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Masse</div>
            <div className="text-lg font-bold font-mono text-emerald-400">{mass}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Frags</div>
            <div className="text-lg font-bold font-mono text-amber-400">{kills} ⚔️</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Rang</div>
            <div className="text-lg font-bold font-mono text-sky-400">#{rank}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => {
              sound.playButton();
              onResume();
            }}
            className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 uppercase tracking-wider text-sm transition-transform active:scale-[0.99] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950 stroke-none" />
            <span>Reprendre la Partie</span>
          </button>

          <button
            onClick={onToggleMute}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span>{muted ? 'Activer le Son' : 'Désactiver le Son'}</span>
          </button>

          <button
            onClick={() => {
              sound.playButton();
              onQuit();
            }}
            className="w-full py-2.5 px-4 bg-slate-800/60 hover:bg-slate-800 text-rose-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Quitter vers le Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
