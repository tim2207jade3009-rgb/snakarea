import React, { useState } from 'react';
import { PlayerProfile } from '../types/game';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { sound } from '../utils/audio';
import { ABILITIES } from '../data/abilities';

interface PowersShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  onProfileUpdated: (updated: PlayerProfile) => void;
  onOpenCoinShop: () => void;
}

export const PowersShopModal: React.FC<PowersShopModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
  onOpenCoinShop,
}) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen) return null;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBuyAbility = (ability: typeof ABILITIES[0]) => {
    sound.playButton();
    if (profile.unlockedAbilities?.includes(ability.id)) return;
    if (profile.coins < ability.cost) {
      showToast('Coins insuffisants !', 'error');
      return;
    }

    const updatedProfile = {
        ...profile,
        coins: profile.coins - ability.cost,
        unlockedAbilities: [...(profile.unlockedAbilities || []), ability.id],
    };
    onProfileUpdated(updatedProfile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative my-auto flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
          <h2 className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Boutique de Pouvoirs</h2>
          <button onClick={onClose} className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Toast Feedback */}
        {toast && (
          <div
            className={`mb-3 p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        <div className="overflow-y-auto pr-1 flex-1 space-y-2.5">
          {ABILITIES.map((ability) => {
            const isUnlocked = profile.unlockedAbilities?.includes(ability.id);
            return (
              <div key={ability.id} className="p-3.5 rounded-2xl border bg-slate-950/60 border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0">
                    {ability.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">{ability.name}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{ability.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleBuyAbility(ability)}
                  disabled={isUnlocked}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                    isUnlocked
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95'
                  }`}
                >
                  {isUnlocked ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Possédé</span>
                    </>
                  ) : (
                    <span>{ability.cost.toLocaleString('fr-FR')} 🪙</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
