import { useState, useEffect, useCallback } from 'react';
import { useSnakeArena } from './hooks/useSnakeArena';
import { ArenaCanvas } from './components/ArenaCanvas';
import { ArenaHUD } from './components/ArenaHUD';
import { ArenaMenu } from './components/ArenaMenu';
import { ArenaGameOverModal } from './components/ArenaGameOverModal';
import { ArenaPauseModal } from './components/ArenaPauseModal';
import { CoinShopModal } from './components/CoinShopModal';
import { DailyMissionsModal } from './components/DailyMissionsModal';
import { sound } from './utils/audio';
import { net } from './services/network';

export default function App() {
  const {
    gameState,
    gameMode,
    profile,
    selectedSkin,
    login,
    register,
    logout,
    buySkin,
    equipSkin,
    equipAvatar,
    buyAvatar,
    buyAbility,
    setPlayerName,
    resetGameProgress,
    updateProfile,
    isPaused,
    togglePause,
    setIsPaused,
    setJoystickDirection,
    lastRewardResult,
    playerMass,
    playerKills,
    playerRank,
    leaderboard,
    killBanner,
    spawnProtectionRemaining,
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
    dailyMissions,
    setDailyMissions,
    setProfile,
  } = useSnakeArena();

  const [muted, setMuted] = useState<boolean>(() => sound.getMuted());
  const [isBoostingState, setIsBoostingState] = useState<boolean>(false);
  
  // Power abilities states & countdowns
  const [fireAuraActive, setFireAuraActive] = useState<boolean>(false);
  const [fireAuraCooldown, setFireAuraCooldown] = useState<number>(0);

  const [shieldActive, setShieldActive] = useState<boolean>(false);
  const [shieldCooldown, setShieldCooldown] = useState<number>(0);

  const [frostActive, setFrostActive] = useState<boolean>(false);
  const [frostCooldown, setFrostCooldown] = useState<number>(0);

  const [showMenuDirectly, setShowMenuDirectly] = useState<boolean>(false);
  const [showShopModal, setShowShopModal] = useState<boolean>(false);
  const [showMissionsModal, setShowMissionsModal] = useState<boolean>(false);

  const handleToggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
  };

  const handleSetBoosting = (boosting: boolean) => {
    setIsBoostingState(boosting);
    setBoosting(boosting);
  };

  // Cooldown countdown timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. Shield: 12s total cooldown (5s active + 7s recharge)
      setShieldCooldown((prev) => {
        if (prev <= 1) {
          setShieldActive(false);
          return 0;
        }
        if (prev <= 7) {
          setShieldActive(false);
        }
        return prev - 1;
      });

      // 2. Frost: 15s total cooldown (6s active + 9s recharge)
      setFrostCooldown((prev) => {
        if (prev <= 1) {
          setFrostActive(false);
          return 0;
        }
        if (prev <= 9) {
          setFrostActive(false);
        }
        return prev - 1;
      });

      // 3. Fire Aura: 10s total cooldown (5s active + 5s recharge)
      setFireAuraCooldown((prev) => {
        if (prev <= 1) {
          setFireAuraActive(false);
          return 0;
        }
        if (prev <= 5) {
          setFireAuraActive(false);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Ability Trigger Actions (Usable ONLY if purchased and unlocked!)
  const handleUseShield = useCallback(() => {
    if (!profile.unlockedAbilities?.includes('shield')) return;
    if (shieldCooldown > 0 || shieldActive) return;
    sound.playButton();
    setShieldActive(true);
    setShieldCooldown(12);
    net.usePower('shield');
  }, [profile.unlockedAbilities, shieldCooldown, shieldActive]);

  const handleUseFrost = useCallback(() => {
    if (!profile.unlockedAbilities?.includes('frost_pulse')) return;
    if (frostCooldown > 0 || frostActive) return;
    sound.playButton();
    setFrostActive(true);
    setFrostCooldown(15);
    net.usePower('frost');
  }, [profile.unlockedAbilities, frostCooldown, frostActive]);

  const handleUseFireAura = useCallback(() => {
    if (!profile.unlockedAbilities?.includes('fireball')) return;
    if (fireAuraCooldown > 0 || fireAuraActive) return;
    sound.playButton();
    setFireAuraActive(true);
    setFireAuraCooldown(10);
    net.usePower('fireball');
  }, [profile.unlockedAbilities, fireAuraCooldown, fireAuraActive]);

  // Keyboard shortcuts: Escape (pause), B/S (Shield), G/C (Frost), F/A (Fire Aura)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'PLAYING') {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          togglePause();
        } else if (e.key === 'b' || e.key === 'B' || e.key === 's' || e.key === 'S') {
          if (profile.unlockedAbilities?.includes('shield')) {
            handleUseShield();
          }
        } else if (e.key === 'g' || e.key === 'G' || e.key === 'c' || e.key === 'C') {
          if (profile.unlockedAbilities?.includes('frost_pulse')) {
            handleUseFrost();
          }
        } else if (e.key === 'f' || e.key === 'F' || e.key === 'a' || e.key === 'A') {
          if (profile.unlockedAbilities?.includes('fireball')) {
            handleUseFireAura();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, profile.unlockedAbilities, togglePause, handleUseShield, handleUseFrost, handleUseFireAura]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none text-slate-100 touch-none">
      {gameState === 'MENU' || showMenuDirectly ? (
        <ArenaMenu
          profile={profile}
          selectedSkin={selectedSkin}
          onNameChange={setPlayerName}
          onPlay={(mode) => {
            setShowMenuDirectly(false);
            startGame(mode);
          }}
          onOpenMissionsModal={() => setShowMissionsModal(true)}
          onLogin={login}
          onRegister={register}
          onLogout={logout}
          onBuySkin={buySkin}
          onEquipSkin={equipSkin}
          onEquipAvatar={equipAvatar}
          onBuyAvatar={buyAvatar}
          onBuyAbility={buyAbility}
          onResetProgress={resetGameProgress}
          onProfileUpdated={updateProfile}
          muted={muted}
          onToggleMute={handleToggleMute}
          isConnected={isConnected}
          serverStatusText={serverStatusText}
          matchmakingState={matchmakingState}
          onlinePlayersCount={onlinePlayersCount}
        />
      ) : (
        <div className="relative w-full h-full">
          {/* Main 60FPS Arena Canvas */}
          <ArenaCanvas
            snakesRef={snakesRef}
            orbsRef={orbsRef}
            playerSnakeRef={playerSnakeRef}
            onPointerMove={handlePointerMove}
            onSetBoosting={handleSetBoosting}
            fireAuraActive={fireAuraActive}
            shieldActive={shieldActive}
            frostActive={frostActive}
          />

          {/* In-Game HUD: Leaderboard, Radar, Live Stats, Kill Banner, Mobile Joystick & Boost Button */}
          <ArenaHUD
            playerMass={playerMass}
            playerKills={playerKills}
            playerRank={playerRank}
            totalPlayers={snakesRef.current.filter((s) => !s.dead).length}
            onlinePlayersCount={onlinePlayersCount}
            leaderboard={leaderboard}
            killBanner={killBanner}
            spawnProtectionRemaining={spawnProtectionRemaining}
            coins={profile.coins}
            unlockedAbilities={profile.unlockedAbilities || []}
            isBoosting={isBoostingState}
            fireAuraActive={fireAuraActive}
            fireAuraCooldown={fireAuraCooldown}
            onUseFireAura={handleUseFireAura}
            shieldActive={shieldActive}
            shieldCooldown={shieldCooldown}
            onUseShield={handleUseShield}
            frostActive={frostActive}
            frostCooldown={frostCooldown}
            onUseFrost={handleUseFrost}
            muted={muted}
            dailyMissions={dailyMissions}
            snakeCount={snakesRef.current.filter(s => !s.dead).length}
            orbCount={orbsRef.current.length}
            snakesRef={snakesRef}
            playerSnakeRef={playerSnakeRef}
            onOpenMissionsModal={() => setShowMissionsModal(true)}
            onToggleMute={handleToggleMute}
            onSetBoosting={handleSetBoosting}
            onPause={togglePause}
            onJoystickDirection={setJoystickDirection}
          />

          {/* Pause Modal */}
          {isPaused && (
            <ArenaPauseModal
              onResume={() => setIsPaused(false)}
              onQuit={() => {
                setIsPaused(false);
                setShowMenuDirectly(true);
              }}
              muted={muted}
              onToggleMute={handleToggleMute}
              mass={playerMass}
              kills={playerKills}
              rank={playerRank}
            />
          )}

          {/* Fatal Collision / Game Over Screen with Level Up, XP, RR and Animated Coins */}
          {gameState === 'GAMEOVER' && (
            <ArenaGameOverModal
              mass={playerMass}
              kills={playerKills}
              rank={playerRank}
              totalPlayers={snakesRef.current.length}
              bestScore={profile.stats.bestScore}
              gameMode={gameMode}
              rewardResult={lastRewardResult}
              profile={profile}
              onRespawn={() => startGame(gameMode)}
              onInGameRespawn={async () => {
                await respawnInGame();
              }}
              onMenu={() => setShowMenuDirectly(true)}
              onOpenShop={() => setShowShopModal(true)}
            />
          )}
        </div>
      )}

      {/* Global Virtual Coins Shop Modal */}
      <CoinShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        profile={profile}
        onProfileUpdated={updateProfile}
      />

      {/* Daily Missions Modal */}
      <DailyMissionsModal
        isOpen={showMissionsModal}
        onClose={() => setShowMissionsModal(false)}
        profile={profile}
        dailyMissions={dailyMissions}
        onMissionsUpdated={setDailyMissions}
        onProfileUpdated={updateProfile}
      />
    </div>
  );
}
