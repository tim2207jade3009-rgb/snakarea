// Progression, XP and Level management for Snake Area multijoueur

/**
 * Calculates XP required to advance from current level to next level
 * e.g. Level 1 -> Level 2: 100 XP
 *      Level 2 -> Level 3: 150 XP
 *      Level 3 -> Level 4: 210 XP
 *      Level 4 -> Level 5: 280 XP
 */
export function getXpRequiredForLevel(level: number): number {
  if (level <= 1) return 100;
  return Math.floor(70 + level * 40 + Math.pow(level, 1.35) * 15);
}

/**
 * Calculates XP awarded after a game based on performance
 */
export function calculateGameXp(
  mass: number,
  kills: number,
  rank: number,
  survivalSeconds: number
): number {
  const baseParticipation = 25;
  const massXp = Math.floor(Math.sqrt(mass) * 2.8 + mass / 20);
  const killXp = kills * 22;

  let rankBonus = 5;
  if (rank === 1) rankBonus = 65;
  else if (rank <= 3) rankBonus = 40;
  else if (rank <= 5) rankBonus = 25;
  else if (rank <= 10) rankBonus = 12;

  const survivalXp = Math.min(45, Math.floor(survivalSeconds * 1.2));

  return Math.max(20, baseParticipation + massXp + killXp + rankBonus + survivalXp);
}

/**
 * Processes XP gain, calculates level ups, carries over remaining XP,
 * and grants level-up rewards (+50 coins per level).
 */
export function processXpGain(
  currentLevel: number,
  currentXp: number,
  xpGained: number
): {
  newLevel: number;
  newXp: number;
  levelUp: boolean;
  levelsGained: number;
  bonusCoins: number;
} {
  let level = currentLevel;
  let xp = currentXp + xpGained;
  let levelsGained = 0;

  while (true) {
    const required = getXpRequiredForLevel(level);
    if (xp >= required) {
      xp -= required;
      level += 1;
      levelsGained += 1;
    } else {
      break;
    }
  }

  const bonusCoins = levelsGained * 20;

  return {
    newLevel: level,
    newXp: xp,
    levelUp: levelsGained > 0,
    levelsGained,
    bonusCoins,
  };
}
