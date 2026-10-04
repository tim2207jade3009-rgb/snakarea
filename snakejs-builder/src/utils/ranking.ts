import { RankTier } from '../types/game';

export const RANK_TIERS: RankTier[] = [
  'Bronze III',
  'Bronze II',
  'Bronze I',
  'Silver III',
  'Silver II',
  'Silver I',
  'Gold III',
  'Gold II',
  'Gold I',
  'Platinum III',
  'Platinum II',
  'Platinum I',
  'Diamond III',
  'Diamond II',
  'Diamond I',
  'Master',
  'Grandmaster',
];

export interface RankInfo {
  tier: RankTier;
  category: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master' | 'Grandmaster';
  badgeColor: string;
  textColor: string;
  glowColor: string;
  icon: string;
}

export function getRankInfo(rank: RankTier): RankInfo {
  if (rank.startsWith('Bronze')) {
    return {
      tier: rank,
      category: 'Bronze',
      badgeColor: 'from-amber-700 to-amber-900',
      textColor: 'text-amber-500',
      glowColor: 'rgba(217, 119, 6, 0.4)',
      icon: '🛡️',
    };
  }
  if (rank.startsWith('Silver')) {
    return {
      tier: rank,
      category: 'Silver',
      badgeColor: 'from-slate-400 to-slate-600',
      textColor: 'text-slate-300',
      glowColor: 'rgba(148, 163, 184, 0.4)',
      icon: '⚔️',
    };
  }
  if (rank.startsWith('Gold')) {
    return {
      tier: rank,
      category: 'Gold',
      badgeColor: 'from-yellow-400 to-amber-600',
      textColor: 'text-amber-300',
      glowColor: 'rgba(245, 158, 11, 0.5)',
      icon: '🏆',
    };
  }
  if (rank.startsWith('Platinum')) {
    return {
      tier: rank,
      category: 'Platinum',
      badgeColor: 'from-emerald-400 to-teal-600',
      textColor: 'text-emerald-300',
      glowColor: 'rgba(16, 185, 129, 0.5)',
      icon: '💠',
    };
  }
  if (rank.startsWith('Diamond')) {
    return {
      tier: rank,
      category: 'Diamond',
      badgeColor: 'from-sky-400 to-blue-600',
      textColor: 'text-sky-300',
      glowColor: 'rgba(56, 189, 248, 0.5)',
      icon: '💎',
    };
  }
  if (rank === 'Master') {
    return {
      tier: rank,
      category: 'Master',
      badgeColor: 'from-purple-500 to-indigo-700',
      textColor: 'text-purple-300',
      glowColor: 'rgba(168, 85, 247, 0.6)',
      icon: '🔮',
    };
  }
  return {
    tier: 'Grandmaster',
    category: 'Grandmaster',
    badgeColor: 'from-rose-500 to-red-700',
    textColor: 'text-rose-400',
    glowColor: 'rgba(244, 63, 94, 0.7)',
    icon: '👑',
  };
}

/**
 * Calculates RR change based on Ranked match placement and kills.
 * Generous RR gains and mild loss penalties make climbing ranks rewarding and accessible.
 */
export function calculateRankedRRChange(
  placement: number,
  kills: number,
  mass: number,
  totalPlayers: number
): number {
  let baseRR = 0;

  if (placement === 1) {
    baseRR = 45;
  } else if (placement <= 3) {
    baseRR = 32;
  } else if (placement <= 5) {
    baseRR = 22;
  } else if (placement <= 8) {
    baseRR = 14;
  } else if (placement <= 12) {
    baseRR = 8;
  } else if (placement <= 16) {
    baseRR = 2;
  } else {
    baseRR = -4;
  }

  // Generous kill bonus (up to +16 RR)
  const killBonus = Math.min(16, kills * 4);

  // Mass achievement bonus (up to +6 RR)
  const massBonus = mass >= 800 ? 6 : mass >= 400 ? 4 : mass >= 150 ? 2 : 0;

  let netRR = baseRR + killBonus + massBonus;

  // Cap swing between -6 and +55
  netRR = Math.max(-6, Math.min(55, netRR));

  return netRR;
}

/**
 * Applies RR change to current rank and calculates promotions / demotions
 */
export function processRRChange(
  currentRank: RankTier,
  currentRR: number,
  rrChange: number
): {
  newRank: RankTier;
  newRR: number;
  rankChanged: 'up' | 'down' | null;
} {
  const currentIndex = RANK_TIERS.indexOf(currentRank);
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;

  let totalRR = currentRR + rrChange;

  // Promotion check
  if (totalRR >= 100) {
    if (effectiveIndex < RANK_TIERS.length - 1) {
      const nextRank = RANK_TIERS[effectiveIndex + 1];
      const remainderRR = Math.min(45, Math.max(20, totalRR - 100));
      return {
        newRank: nextRank,
        newRR: remainderRR,
        rankChanged: 'up',
      };
    } else {
      // Already Grandmaster - cap at 100 RR
      return {
        newRank: 'Grandmaster',
        newRR: 100,
        rankChanged: null,
      };
    }
  }

  // Demotion check with soft landing cushion
  if (totalRR < 0) {
    if (effectiveIndex > 0) {
      const prevRank = RANK_TIERS[effectiveIndex - 1];
      const demotedRR = Math.max(80, 100 + totalRR); // generous 80-95 RR retention in lower tier
      return {
        newRank: prevRank,
        newRR: demotedRR,
        rankChanged: 'down',
      };
    } else {
      // Bottom of Bronze III - cannot demote
      return {
        newRank: 'Bronze III',
        newRR: 0,
        rankChanged: null,
      };
    }
  }

  return {
    newRank: currentRank,
    newRR: totalRR,
    rankChanged: null,
  };
}
