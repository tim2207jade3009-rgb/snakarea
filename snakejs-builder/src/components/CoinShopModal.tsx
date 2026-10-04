import React, { useEffect, useState } from 'react';
import { X, Sparkles, CheckCircle, AlertCircle, ShoppingBag, Loader2, Zap } from 'lucide-react';
import { PlayerProfile } from '../types/game';
import { sound } from '../utils/audio';
import { net } from '../services/network';
import { savePlayerProfile } from '../services/database';

export interface CoinProduct {
  id: string;
  name: string;
  coins: number;
  price: number;
  currency: string;
  formattedPrice: string;
  popular?: boolean;
  bestValue?: boolean;
  isClaimed?: boolean;
}

interface CoinShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  onProfileUpdated?: (updatedProfile: PlayerProfile) => void;
}

export const CoinShopModal: React.FC<CoinShopModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [products, setProducts] = useState<CoinProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchProducts();
  }, [isOpen]);

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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payments/products', {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimProduct = async (product: CoinProduct) => {
    if (product.isClaimed) {
      showToast('Vous avez déjà réclamé ce pack.', 'info');
      return;
    }
    sound.playButton();
    setPurchasingProductId(product.id);
    try {
      const res = await fetch('/api/payments/claim', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.error || 'Erreur lors de la réclamation.', 'error');
        setPurchasingProductId(null);
        return;
      }

      showToast(`Bravo ! Vous avez reçu ${product.coins} Coins !`, 'success');
      if (data.profile) {
        await savePlayerProfile(data.profile);
        if (onProfileUpdated) {
          onProfileUpdated(data.profile);
        }
      }
      fetchProducts(); // Refresh to show as claimed
      setPurchasingProductId(null);
    } catch (err) {
      showToast('Connexion au serveur impossible.', 'error');
      setPurchasingProductId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-lg">
              🪙
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Boutique de {profile.name}
              </h2>
              <p className="text-[11px] text-slate-400">Packs & Pouvoirs • Solde : <span className="font-mono text-amber-300 font-bold">{profile.coins.toLocaleString('fr-FR')} 🪙</span></p>
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

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`mb-3 p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                : 'bg-sky-950/80 border-sky-500/50 text-sky-300'
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

        {/* Products List */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-2.5">
          {products.map((product) => (
            <div
              key={product.id}
              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                product.popular
                  ? 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/50 shadow-md shadow-amber-500/10'
                  : product.bestValue
                  ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0">
                  🪙
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">{product.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    +{product.coins.toLocaleString('fr-FR')} Coins Virtuels
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleClaimProduct(product)}
                disabled={purchasingProductId === product.id || product.isClaimed}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                  product.isClaimed
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-md shadow-emerald-500/15 cursor-pointer active:scale-95'
                }`}
              >
                {purchasingProductId === product.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : product.isClaimed ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Réclamé</span>
                  </>
                ) : (
                  <span>Réclamer Gratuitement</span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
