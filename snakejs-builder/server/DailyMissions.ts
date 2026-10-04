import { DailyMission, MissionType } from '../src/types/game';

export const DAILY_MISSION_DEFINITIONS: Omit<DailyMission, 'progress' | 'completed' | 'claimed'>[] = [
  {
    id: 'm_eat_orbs',
    title: "Glouton d'Énergie",
    description: "Manger 50 orbes d'énergie dans l'arène",
    type: 'EAT_ORBS',
    target: 50,
    rewardCoins: 150,
    icon: '⚡',
  },
  {
    id: 'm_survive_time',
    title: "Manoeuvre de Survie",
    description: "Survivre pendant au moins 2 minutes (120s)",
    type: 'SURVIVE_TIME',
    target: 120,
    rewardCoins: 250,
    icon: '⏱️',
  },
  {
    id: 'm_kills',
    title: "Chasseur de Serpents",
    description: "Éliminer 3 serpents adverses",
    type: 'ELIMINATE_SNAKES',
    target: 3,
    rewardCoins: 300,
    icon: '⚔️',
  },
  {
    id: 'm_reach_mass',
    title: "Masse Titanesque",
    description: "Atteindre une masse de 500 dans une partie",
    type: 'REACH_MASS',
    target: 500,
    rewardCoins: 200,
    icon: '👑',
  },
  {
    id: 'm_play_games',
    title: "Combattant Régulier",
    description: "Jouer 3 parties dans l'arène",
    type: 'PLAY_GAMES',
    target: 3,
    rewardCoins: 100,
    icon: '🎮',
  },
];

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
