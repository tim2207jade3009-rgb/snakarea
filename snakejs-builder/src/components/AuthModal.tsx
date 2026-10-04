import React, { useState } from 'react';
import { LogIn, UserPlus, Shield, X, AlertCircle, CheckCircle2, Lock, User, Mail, Sparkles, Smartphone, Monitor } from 'lucide-react';
import { PlayerProfile } from '../types/game';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, passwordPlain: string) => Promise<{ success: boolean; error?: string; profile?: PlayerProfile }>;
  onRegister: (username: string, passwordPlain: string, email?: string) => Promise<{ success: boolean; error?: string; profile?: PlayerProfile }>;
  currentProfile: PlayerProfile;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  currentProfile,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMessage("Veuillez saisir un nom d'utilisateur.");
      return;
    }

    if (tab === 'register') {
      if (cleanUsername.length < 3 || cleanUsername.length > 20) {
        setErrorMessage("L'identifiant doit comporter entre 3 et 20 caractères.");
        return;
      }
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUsername)) {
        setErrorMessage("L'identifiant ne peut contenir que des lettres, chiffres, tirets et underscores.");
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Le mot de passe doit comporter au moins 6 caractères.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Les mots de passe ne correspondent pas.');
        return;
      }

      setLoading(true);
      try {
        const res = await onRegister(cleanUsername, password, email.trim() || undefined);
        setLoading(false);
        if (res.success) {
          setSuccessMessage('🎉 Compte créé avec succès ! Vos données sont synchronisées.');
          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setErrorMessage(res.error || "Échec de l'inscription.");
        }
      } catch (err) {
        setLoading(false);
        setErrorMessage('Erreur réseau. Veuillez réessayer.');
      }
    } else {
      if (!password) {
        setErrorMessage('Veuillez saisir votre mot de passe.');
        return;
      }

      setLoading(true);
      try {
        const res = await onLogin(cleanUsername, password);
        setLoading(false);
        if (res.success) {
          setSuccessMessage('👋 Bon retour dans l’arène ! Données synchronisées.');
          setTimeout(() => {
            onClose();
          }, 1000);
        } else {
          setErrorMessage(res.error || 'Identifiant ou mot de passe incorrect.');
        }
      } catch (err) {
        setLoading(false);
        setErrorMessage('Erreur réseau. Veuillez réessayer.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-emerald-500/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                {tab === 'login' ? 'Connexion Compte' : 'Créer un Compte'}
              </h2>
              <p className="text-xs text-slate-400">Synchronisez votre progression multi-appareils</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 p-1.5 m-4 mb-2 bg-slate-950/60 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'login'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Se Connecter
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'register'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Créer un Compte
          </button>
        </div>

        {/* Multi-device sync highlight */}
        <div className="mx-4 mb-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span>PC</span>
            <span className="text-slate-500">↔</span>
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Mobile</span>
          </div>
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Même profil partout
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-2 overflow-y-auto space-y-3.5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-red-200 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Identifiant / Nom d'utilisateur
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: SerpentDuFutur"
                maxLength={20}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
            {tab === 'register' && (
              <p className="text-[10px] text-slate-500 mt-1">
                De 3 à 20 caractères (lettres, chiffres, tirets, underscores).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          {tab === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Email (Optionnel)</span>
                  <span className="text-[10px] text-slate-500">Pour récupération future</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="joueur@exemple.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-2 pb-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 active:scale-[0.98] text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : tab === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  Se Connecter
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Créer mon Compte
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
