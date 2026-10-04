import React, { useState } from 'react';
import { CoinShopModal } from './CoinShopModal';
import {
  SkinOption,
  SkinRarity,
  GameMode,
  PlayerProfile,
} from '../types/game';
import { SKINS } from '../data/skins';
import { AVATARS } from '../data/avatars';
import { ABILITIES } from '../data/abilities';
import {
  Play,
  Trophy,
  Volume2,
  VolumeX,
  ShoppingBag,
  Check,
  Lock,
  User,
  Settings,
  RotateCcw,
  ChevronRight,
  Edit2,
  AlertTriangle,
  Info,
  X,
  Wifi,
  WifiOff,
  Globe,
  Users,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Smartphone,
  Target,
  Zap,
  Gift,
  Search,
} from 'lucide-react';
import { sound } from '../utils/audio';
import { SkinPreviewCanvas } from './SkinPreviewCanvas';
import { getRankInfo } from '../utils/ranking';
import { getXpRequiredForLevel } from '../utils/progression';
import { AuthModal } from './AuthModal';

interface ArenaMenuProps {
  profile: PlayerProfile;
  selectedSkin: SkinOption;
  onNameChange: (name: string) => void;
  onPlay: (mode: GameMode) => void;
  onOpenMissionsModal?: () => void;
  onLogin: (username: string, passwordPlain: string) => Promise<{ success: boolean; error?: string; profile?: PlayerProfile }>;
  onRegister: (username: string, passwordPlain: string, email?: string) => Promise<{ success: boolean; error?: string; profile?: PlayerProfile }>;
  onLogout: () => Promise<{ success: boolean }>;
  onBuySkin: (skinId: string) => Promise<{ success: boolean; message: string }>;
  onEquipSkin: (skinId: string) => Promise<boolean>;
  onEquipAvatar: (avatarId: string) => Promise<boolean>;
  onBuyAvatar: (avatarId: string, price: number) => Promise<{ success: boolean; message: string }>;
  onResetProgress: () => Promise<void>;
  muted: boolean;
  onToggleMute: () => void;
  isConnected: boolean;
  serverStatusText: string;
  matchmakingState: 'IDLE' | 'SEARCHING' | 'FOUND' | 'PLAYING';
  onlinePlayersCount: number;
  onProfileUpdated?: (updatedProfile: PlayerProfile) => void;
  onBuyAbility?: (abilityId: string, cost: number) => Promise<{ success: boolean; message: string }>;
}

const RARITY_LABELS: Record<SkinRarity, { label: string; badgeClass: string; borderClass: string }> = {
  common: {
    label: 'Commun',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-800 hover:border-slate-700',
  },
  rare: {
    label: 'Rare',
    badgeClass: 'bg-sky-950/80 text-sky-400 border-sky-800',
    borderClass: 'border-sky-900/60 hover:border-sky-500/80',
  },
  epic: {
    label: 'Épique',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800',
    borderClass: 'border-purple-900/60 hover:border-purple-500/80',
  },
  legendary: {
    label: 'Légendaire',
    badgeClass: 'bg-amber-950/90 text-amber-300 border-amber-600 shadow-sm shadow-amber-500/20',
    borderClass: 'border-amber-700/60 hover:border-amber-400',
  },
};

export const ArenaMenu: React.FC<ArenaMenuProps> = ({
  profile,
  selectedSkin,
  onNameChange,
  onPlay,
  onOpenMissionsModal,
  onLogin,
  onRegister,
  onLogout,
  onBuySkin,
  onEquipSkin,
  onEquipAvatar,
  onBuyAvatar,
  onResetProgress,
  muted,
  onToggleMute,
  isConnected,
  serverStatusText,
  matchmakingState,
  onlinePlayersCount,
  onProfileUpdated,
  onBuyAbility,
}) => {
  const [activeTab, setActiveTab] = useState<'play' | 'shop' | 'powers' | 'profile' | 'settings'>('play');
  const [rarityFilter, setRarityFilter] = useState<'all' | SkinRarity>('all');
  const [skinSearchQuery, setSkinSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showCoinShop, setShowCoinShop] = useState<boolean>(false);

  // Name editing
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>(profile.name);

  // Avatar Modal
  const [showAvatarModal, setShowAvatarModal] = useState<boolean>(false);

  // Reset confirmation modal
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (tempName.trim().length > 0) {
      onNameChange(tempName.trim());
      setIsEditingName(false);
      showToast('Pseudo mis à jour !', 'success');
    }
  };

  const handleBuySkin = async (skin: SkinOption) => {
    const res = await onBuySkin(skin.id);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  };

  const handleEquipSkin = async (skin: SkinOption) => {
    const success = await onEquipSkin(skin.id);
    if (success) {
      showToast(`Skin ${skin.name} équipé !`, 'success');
    }
  };

  const rankInfo = getRankInfo(profile.rank);
  const currentAvatar = AVATARS.find((a) => a.id === profile.avatarId) || AVATARS[0];
  const xpNeeded = getXpRequiredForLevel(profile.level);
  const xpPercentage = Math.min(100, Math.floor((profile.xp / xpNeeded) * 100));

  const filteredSkins = SKINS.filter((skin) => {
    if (rarityFilter !== 'all' && skin.rarity !== rarityFilter) return false;
    if (skinSearchQuery.trim().length > 0) {
      const q = skinSearchQuery.toLowerCase();
      return (
        skin.name.toLowerCase().includes(q) ||
        (skin.description && skin.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="relative w-full h-full min-h-screen flex items-center justify-center p-3 sm:p-5 bg-slate-950 overflow-y-auto">
      {/* Background Animated Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/5 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/5 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl" />
      </div>

      <div
        className={`relative z-10 w-full ${
          activeTab === 'shop' ? 'max-w-4xl' : activeTab === 'profile' ? 'max-w-2xl' : 'max-w-lg'
        } bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-7 shadow-2xl backdrop-blur-xl transition-all duration-300 my-auto`}
      >
        {/* Top Header with App Title, Quick Player Card, and Coins */}
        <div className="flex items-center justify-between gap-2.5 mb-4 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 shrink-0">
              {currentAvatar.emoji}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1
                  className="text-lg sm:text-xl font-black text-white tracking-tight"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  SNAKE AREA <span className="text-emerald-400">MULTIJOUEUR</span>
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Niv. {profile.level}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400">
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Multijoueur En Ligne
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      {serverStatusText}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {profile.isRegistered ? (
              <button
                onClick={async () => {
                  await onLogout();
                  showToast('Déconnecté avec succès', 'success');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-bold rounded-xl transition-colors cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Déconnexion</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  sound.playButton();
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-[11px] sm:text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                title="Se connecter ou créer un compte"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Connexion</span>
              </button>
            )}

            {/* Daily Missions Button */}
            {onOpenMissionsModal && (
              <button
                onClick={() => {
                  sound.playButton();
                  onOpenMissionsModal();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                title="Missions Quotidiennes"
              >
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Missions</span>
              </button>
            )}

            {/* Réclamer mes coins Button */}
            <button
              onClick={() => {
                sound.playButton();
                setShowCoinShop(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-[11px] sm:text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
              title="Réclamer mes coins"
            >
              <Gift className="w-3.5 h-3.5 text-emerald-400" />
              <span>Réclamer mes coins</span>
            </button>

            {/* Coins Balance Pill */}
            <div
              onClick={() => {
                sound.playButton();
                setShowCoinShop(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-950/70 border border-amber-500/50 rounded-xl text-amber-300 text-[11px] sm:text-sm font-bold shadow-md shadow-amber-500/10 cursor-pointer hover:bg-amber-900/70 transition-colors"
              title="Réclamer des coins gratuits"
            >
              <span className="text-sm sm:text-base">🪙</span>
              <span className="tabular-nums font-mono">{profile.coins.toLocaleString('fr-FR')}</span>
              <span className="text-[10px] bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded-md font-extrabold ml-0.5 hidden xs:inline">FREE</span>
            </div>

            {/* Mute Button */}
            <button
              onClick={onToggleMute}
              className="p-1.5 sm:p-2 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors cursor-pointer shrink-0"
              title={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs: JOUER | SKINS | POUVOIRS | PROFIL | PARAMÈTRES */}
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-2xl mb-4">
          <button
            onClick={() => {
              sound.playButton();
              setActiveTab('play');
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeTab === 'play'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            <span>Jouer</span>
          </button>

          <button
            onClick={() => {
              sound.playButton();
              setActiveTab('shop');
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeTab === 'shop'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span>Skins</span>
          </button>

          <button
            onClick={() => {
              sound.playButton();
              setActiveTab('powers');
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeTab === 'powers'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Pouvoirs</span>
          </button>

          <button
            onClick={() => {
              sound.playButton();
              setActiveTab('profile');
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Profil</span>
          </button>

          <button
            onClick={() => {
              sound.playButton();
              setActiveTab('settings');
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Options</span>
            <span className="sm:hidden">Opt</span>
          </button>
        </div>

        {/* Global Toast Message */}
        {toast && (
          <div
            className={`mb-3 p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500 text-rose-200'
            }`}
          >
            <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{toast.message}</span>
          </div>
        )}

        {/* ─── TAB 1: PLAY (MULTIJOUEUR CLASSIQUE & CLASSÉ) ──────────── */}
        {activeTab === 'play' && (
          <div className="flex flex-col gap-3.5">
            {/* Matchmaking Status Banner if Searching */}
            {matchmakingState === 'SEARCHING' && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-emerald-300 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Recherche d'une arène multijoueur disponible...</span>
              </div>
            )}

            {/* Player Info Summary & Name edit */}
            <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAvatarModal(true)}
                  className="relative group cursor-pointer"
                  title="Changer d'avatar"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentAvatar.bgColor} border ${currentAvatar.borderColor} flex items-center justify-center text-2xl shadow-md`}
                  >
                    {currentAvatar.emoji}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">
                    Éditer
                  </div>
                </button>

                <div>
                  {isEditingName ? (
                    <form onSubmit={handleSaveName} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        maxLength={16}
                        autoFocus
                        className="w-32 sm:w-40 px-2 py-1 bg-slate-900 border border-emerald-500 rounded-lg text-xs font-bold text-white outline-none"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        OK
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{profile.name}</span>
                      <button
                        onClick={() => {
                          setTempName(profile.name);
                          setIsEditingName(true);
                        }}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Changer de pseudo"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-mono">
                      Niveau <b className="text-emerald-400">{profile.level}</b>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Rang <b className={rankInfo.textColor}>{profile.rank}</b>
                    </span>
                  </div>
                </div>
              </div>

              {/* Skin Preview Badge */}
              <div
                onClick={() => {
                  sound.playButton();
                  setActiveTab('shop');
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition-all"
                title="Changer de skin"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  <SkinPreviewCanvas skin={selectedSkin} size={28} />
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-[9px] uppercase text-slate-400 font-bold">Skin Équipé</div>
                  <div className="text-xs font-bold text-slate-200 truncate max-w-[90px]">{selectedSkin.name}</div>
                </div>
              </div>
            </div>

            {/* Game Mode Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Mode 1: Multijoueur Classique */}
              <div
                onClick={() => {
                  sound.playButton();
                  onPlay('CLASSIC');
                }}
                className="group relative p-4 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 hover:border-emerald-400 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5" /> Multijoueur Libre
                    </span>
                    <span className="text-lg">🐍</span>
                  </div>
                  <h3 className="text-base font-black text-white">Partie Multijoueur</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Rejoignez instantanément une arène en ligne avec d'autres vrais joueurs ! Gagnez des Coins et de l'XP à chaque partie.
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">
                  <span>Rejoindre la Partie</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* Mode 2: Multijoueur Classé (Ranked) */}
              <div
                onClick={() => {
                  sound.playButton();
                  onPlay('RANKED');
                }}
                className="group relative p-4 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 hover:border-amber-400 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5" /> Compétitif En Ligne
                    </span>
                    <span className="text-lg">{rankInfo.icon}</span>
                  </div>
                  <h3 className="text-base font-black text-white flex items-center gap-1.5">
                    <span>Arène Classée</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rankInfo.textColor} bg-slate-800 border border-slate-700`}>
                      {profile.rank}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Affrontez les meilleurs joueurs en ligne, gagnez du RR et grimpez de Bronze jusqu'à Grandmaster !
                  </p>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>Cote de rang : {profile.rr} / 100 RR</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, profile.rr))}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
                  <span>Matchmaking Classé</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Controls reminder pill */}
            <div className="flex items-center justify-between flex-wrap gap-1 px-3 py-2 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px] text-slate-400">
              <span>Souris / Stick : Viser</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-semibold">Clic / Espace : Turbo</span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400 font-semibold">B : Bouclier</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-semibold">G : Givre</span>
              <span className="text-slate-600">•</span>
              <span className="text-orange-400 font-semibold">F : Aura</span>
            </div>
          </div>
        )}

        {/* ─── TAB 2: SHOP / BOUTIQUE (24 SKINS) ─────────────────────── */}
        {activeTab === 'shop' && (
          <div className="flex flex-col gap-3">
            {/* Claim Free Coins Banner */}
            <div className="p-3 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎁</span>
                <div>
                  <div className="text-xs font-bold text-emerald-300">Cadeaux de Bienvenue !</div>
                  <div className="text-[10px] text-slate-400">Réclamez vos packs de coins gratuits (1 fois max).</div>
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playButton();
                  setShowCoinShop(true);
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-emerald-500/15 cursor-pointer"
              >
                Réclamer mes coins
              </button>
            </div>

            {/* Header / Rarity Filter & Search Bar */}
            <div className="flex flex-col gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Collection ({profile.unlockedSkins.length} / {SKINS.length} Débloqués)
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[11px] overflow-x-auto max-w-full pb-0.5">
                  {(['all', 'common', 'rare', 'epic', 'legendary'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        sound.playButton();
                        setRarityFilter(r);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-colors cursor-pointer shrink-0 ${
                        rarityFilter === r
                          ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {r === 'all' ? 'Tous' : RARITY_LABELS[r].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={skinSearchQuery}
                  onChange={(e) => setSkinSearchQuery(e.target.value)}
                  placeholder="Rechercher parmi les 105 skins (nom, élément, dragon, néon...)..."
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-950/80 border border-slate-800 focus:border-amber-400/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
                {skinSearchQuery.length > 0 && (
                  <button
                    onClick={() => setSkinSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Skins Grid */}
            {filteredSkins.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Search className="w-8 h-8 text-slate-600 opacity-60" />
                <span>Aucun skin trouvé pour &quot;{skinSearchQuery}&quot;</span>
                <button
                  onClick={() => {
                    setSkinSearchQuery('');
                    setRarityFilter('all');
                  }}
                  className="text-amber-400 hover:underline font-bold"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[50vh] overflow-y-auto p-1">
                {filteredSkins.map((skin) => {
                  const isUnlocked = profile.unlockedSkins.includes(skin.id);
                  const isEquipped = profile.equippedSkinId === skin.id;
                  const canAfford = profile.coins >= skin.price;
                  const rarityMeta = RARITY_LABELS[skin.rarity];

                  return (
                    <div
                      key={skin.id}
                      className={`relative p-2.5 bg-slate-950/80 border rounded-2xl flex flex-col justify-between transition-all ${
                        isEquipped
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/20'
                          : rarityMeta.borderClass
                      }`}
                    >
                      <div>
                        {/* Rarity & Status */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${rarityMeta.badgeClass}`}>
                            {rarityMeta.label}
                          </span>
                          {isEquipped && (
                            <span className="text-[9px] font-extrabold text-emerald-400 flex items-center gap-0.5">
                              <Check className="w-3 h-3 stroke-[3]" /> Équipé
                            </span>
                          )}
                        </div>

                        {/* Animated Skin Canvas Preview */}
                        <div className="w-full flex items-center justify-center py-2 bg-slate-900/60 rounded-xl my-1 border border-slate-800/60">
                          <SkinPreviewCanvas skin={skin} size={54} />
                        </div>

                        <div className="text-xs font-bold text-white truncate">{skin.name}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1 leading-tight">{skin.description}</div>
                      </div>

                      {/* Action Button */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                        {isEquipped ? (
                          <button
                            disabled
                            className="w-full py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-[11px] font-bold cursor-default"
                          >
                            Sélectionné
                          </button>
                        ) : isUnlocked ? (
                          <button
                            onClick={() => handleEquipSkin(skin)}
                            className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            Équiper
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBuySkin(skin)}
                            className={`w-full py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              canAfford
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                                : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-750'
                            }`}
                          >
                            {canAfford ? (
                              <>
                                <span>Débloquer</span>
                                <span className="font-mono">{skin.price} 🪙</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span className="font-mono">{skin.price} 🪙</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: PROFIL DU JOUEUR ──────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-3.5">
             {/* Header Profile Card */}
            <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              {/* Avatar with click to change */}
              <button
                onClick={() => setShowAvatarModal(true)}
                className="relative group cursor-pointer shrink-0"
                title="Changer d'avatar"
              >
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${currentAvatar.bgColor} border-2 ${currentAvatar.borderColor} flex items-center justify-center text-3xl shadow-xl`}
                >
                  {currentAvatar.emoji}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">
                  Changer
                </div>
              </button>

              <div className="flex-1 w-full">
                <div className="flex items-center justify-center sm:justify-between">
                  <div className="text-lg font-black text-white">{profile.name}</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold">
                    <span>{rankInfo.icon}</span>
                    <span className={rankInfo.textColor}>{profile.rank}</span>
                  </div>
                </div>

                {/* Level & XP Bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
                    <span>Niveau {profile.level}</span>
                    <span className="font-mono text-slate-300">
                      {profile.xp} / {xpNeeded} XP ({xpPercentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${xpPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Ranked RR Bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
                    <span>Cote Compétitive (RR)</span>
                    <span className="font-mono text-amber-300">{profile.rr} / 100 RR</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, profile.rr))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Real Account Status Section */}
            {profile.isRegistered ? (
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex gap-2.5 items-start">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-emerald-300">Compte Protégé & Synchronisé</div>
                    <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                      Vous êtes connecté avec l'identifiant <span className="text-white font-semibold font-mono">{profile.name}</span>. Votre progression est stockée en toute sécurité et disponible sur PC, mobile et tablette !
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await onLogout();
                    showToast('Déconnecté', 'success');
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 w-full sm:w-auto text-center"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex gap-2.5 items-start">
                  <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-amber-300">Session Invité Temporelle</div>
                    <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                      Créez un compte gratuit pour conserver vos pièces, vos skins et votre rang RR, et vous y connecter depuis n'importe quel autre appareil !
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    sound.playButton();
                    setShowAuthModal(true);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer shrink-0 w-full sm:w-auto text-center"
                >
                  Protéger mon profil
                </button>
              </div>
            )}

            {/* Detailed Career Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Parties Jouées</div>
                <div className="text-xl font-black font-mono text-white mt-0.5">{profile.stats.gamesPlayed}</div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Victoires (Top 1)</div>
                <div className="text-xl font-black font-mono text-amber-400 mt-0.5 flex items-center justify-center gap-1">
                  <span>{profile.stats.wins}</span>
                  <Trophy className="w-4 h-4 text-amber-400" />
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Kills Totaux</div>
                <div className="text-xl font-black font-mono text-rose-400 mt-0.5 flex items-center justify-center gap-1">
                  <span>{profile.stats.totalKills}</span>
                  <span className="text-xs">⚔️</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Meilleur Score</div>
                <div className="text-xl font-black font-mono text-emerald-400 mt-0.5">{profile.stats.bestScore}</div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Meilleure Masse</div>
                <div className="text-xl font-black font-mono text-sky-400 mt-0.5">{profile.stats.bestMass}</div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Temps de Jeu</div>
                <div className="text-xl font-black font-mono text-slate-300 mt-0.5">
                  {Math.floor(profile.stats.totalPlayTime / 60)}m {profile.stats.totalPlayTime % 60}s
                </div>
              </div>
            </div>

            {/* Server Online Info */}
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-slate-300">
              <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-emerald-300">Serveur Multijoueur Autoritaire</div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Vos gains de parties, skins équipés, niveau et rangs compétitifs sont calculés et validés par le serveur en temps réel.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: POWERS ───────────────────────────────────────────── */}
        {activeTab === 'powers' && (
          <div className="flex flex-col gap-3">
            <div className="overflow-y-auto max-h-[50vh] pr-1 flex-1 space-y-2.5">
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
                      onClick={async () => {
                        if (!isUnlocked) {
                          if (profile.coins >= ability.cost) {
                            sound.playButton();
                            if (onBuyAbility) {
                              const res = await onBuyAbility(ability.id, ability.cost);
                              if (res.success) {
                                showToast('Achat réussi !', 'success');
                              } else {
                                showToast(res.message || 'Erreur lors de l’achat', 'error');
                              }
                            } else {
                              const updatedProfile = {
                                ...profile,
                                coins: profile.coins - ability.cost,
                                unlockedAbilities: [...(profile.unlockedAbilities || []), ability.id],
                              };
                              onProfileUpdated?.(updatedProfile);
                              showToast('Achat réussi !', 'success');
                            }
                          } else {
                            sound.playError();
                            showToast('Coins insuffisants !', 'error');
                          }
                        }
                      }}
                      disabled={isUnlocked}
                      className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                        isUnlocked
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95'
                      }`}
                    >
                      {isUnlocked ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
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
        )}

        {/* ─── TAB 4: OPTIONS & PARAMÈTRES ───────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3">
            {/* Server Connection Status Card */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  {isConnected ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
                  <span>Statut Multijoueur</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {isConnected ? 'Connecté au serveur de jeu temps réel' : 'Tentative de reconnexion au serveur...'}
                </div>
              </div>
              <div className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-mono font-bold text-emerald-400">
                {isConnected ? 'EN LIGNE' : 'HORS LIGNE'}
              </div>
            </div>

            {/* Audio Section */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Effets Sonores & Fanfares</div>
                <div className="text-[11px] text-slate-400">Sons de boost, festins, Level Up et promotions</div>
              </div>
              <button
                onClick={onToggleMute}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {muted ? 'Activer le Son' : 'Couper le Son'}
              </button>
            </div>

            {/* Reset Progress Danger Zone */}
            <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Réinitialiser la Progression</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Efface les données et remet le profil au Niveau 1
                </div>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Réinitialiser...
              </button>
            </div>
          </div>
        )}

        {/* SEO Descriptive Content Section */}
        <div className="mt-6 pt-5 border-t border-slate-800/60 text-center">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-2">
            Le meilleur jeu Snake en ligne gratuit
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            <strong>Snake Area</strong> est un jeu Snake multijoueur jouable directement en ligne. 
            Contrôlez votre serpent, récupérez les éléments du terrain et essayez d'obtenir le meilleur score 
            face aux autres joueurs dans ce <strong>jeu Snake gratuit</strong> et compétitif.
            Vivez l'expérience ultime du <strong>Snake multiplayer</strong> avec des milliers de joueurs 
            pour <strong>jouer à Snake en ligne</strong> quand vous le souhaitez.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800/40 text-xs font-bold text-slate-400 tracking-wider">
            by ToxikStudio
          </div>
        </div>
      </div>

      {/* ─── MODAL: AVATAR SELECTOR ─────────────────────────────────── */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">🦎</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Choisir un Avatar</h3>
              </div>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 py-4 max-h-[60vh] overflow-y-auto">
              {AVATARS.map((av) => {
                const isSelected = profile.avatarId === av.id;
                const isUnlocked = profile.unlockedAvatars.includes(av.id);
                const canAfford = av.unlockCoins ? profile.coins >= av.unlockCoins : false;

                return (
                  <div
                    key={av.id}
                    onClick={() => {
                      if (isUnlocked) {
                        onEquipAvatar(av.id);
                        setShowAvatarModal(false);
                        showToast(`Avatar ${av.name} équipé !`, 'success');
                      }
                    }}
                    className={`relative p-2.5 rounded-2xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-950/30 ring-2 ring-emerald-500/20'
                        : isUnlocked
                        ? 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        : 'border-slate-800/60 bg-slate-950/30 opacity-75'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${av.bgColor} border ${av.borderColor} flex items-center justify-center text-2xl mb-1 shadow-md`}
                    >
                      {av.emoji}
                    </div>
                    <div className="text-[11px] font-bold text-white truncate max-w-full">{av.name}</div>

                    {isUnlocked ? (
                      <span className="text-[9px] text-emerald-400 font-bold mt-1">
                        {isSelected ? 'Sélectionné' : 'Disponible'}
                      </span>
                    ) : av.unlockCoins ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuyAvatar(av.id, av.unlockCoins!);
                        }}
                        className={`mt-1 text-[9px] font-bold px-2 py-0.5 rounded-lg ${
                          canAfford ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {av.unlockCoins} 🪙
                      </button>
                    ) : (
                      <span className="text-[9px] text-slate-500 font-medium mt-1">
                        Niv. {av.unlockLevel || 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: RESET CONFIRMATION ──────────────────────────────── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-2 text-2xl">
              ⚠️
            </div>
            <h3 className="text-base font-black text-white">Réinitialiser la progression ?</h3>
            <p className="text-xs text-slate-400 mt-1 leading-snug">
              Cette action est irréversible. Vos Coins, vos skins achetés, votre niveau, votre rang et vos statistiques
              seront remis au Niveau 1.
            </p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  await onResetProgress();
                  setShowResetConfirm(false);
                  showToast('Progression réinitialisée.', 'success');
                }}
                className="flex-1 py-2 px-3 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl cursor-pointer shadow-lg shadow-rose-500/20"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REAL MULTI-DEVICE AUTHENTICATION MODAL ─────────────────── */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={onLogin}
        onRegister={onRegister}
        currentProfile={profile}
      />

      {/* ─── COINS SHOP & PURCHASES MODAL ──────────────────────────── */}
      <CoinShopModal
        isOpen={showCoinShop}
        onClose={() => setShowCoinShop(false)}
        profile={profile}
        onProfileUpdated={onProfileUpdated}
      />
    </div>
  );
};
