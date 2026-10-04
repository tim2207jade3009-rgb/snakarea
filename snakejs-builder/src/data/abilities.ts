import { Ability } from '../types/game';

export const ABILITIES: Ability[] = [
  { id: 'magnet_1', name: 'Aimant (Niv. 1)', description: 'Aspire légèrement les bulles (Rayon: 80px).', cost: 100, icon: '🧲' },
  { id: 'magnet_2', name: 'Aimant (Niv. 2)', description: 'Aspire les bulles (Rayon: 100px).', cost: 250, icon: '🧲' },
  { id: 'magnet_3', name: 'Aimant (Niv. 3)', description: 'Aspire les bulles (Rayon: 120px).', cost: 500, icon: '🧲' },
  { id: 'magnet_4', name: 'Aimant (Niv. 4)', description: 'Aspire les bulles (Rayon: 140px).', cost: 900, icon: '🧲' },
  { id: 'magnet_5', name: 'Aimant (Niv. 5)', description: 'Aspire les bulles (Rayon: 160px).', cost: 1400, icon: '🧲' },
  { id: 'magnet_6', name: 'Aimant (Niv. 6)', description: 'Aspire les bulles (Rayon: 180px).', cost: 2100, icon: '🧲' },
  { id: 'magnet_7', name: 'Aimant (Niv. 7)', description: 'Aspire les bulles (Rayon: 200px).', cost: 3000, icon: '🧲' },
  { id: 'magnet_8', name: 'Aimant (Niv. 8)', description: 'Aspire les bulles (Rayon: 220px).', cost: 4200, icon: '🧲' },
  { id: 'magnet_9', name: 'Aimant (Niv. 9)', description: 'Aspire les bulles (Rayon: 240px).', cost: 5800, icon: '🧲' },
  { id: 'magnet_10', name: 'Aimant Ultime (Niv. 10)', description: 'Aspiration maximale équilibrée (Rayon: 270px).', cost: 8000, icon: '🧲' },
  { id: 'fireball', name: 'Boule de Feu', description: 'Lance une boule de feu pour repousser les adversaires.', cost: 2500, icon: '🔥' },
  { id: 'shield', name: 'Bouclier Éphémère', description: 'Protège temporairement contre les collisions.', cost: 3500, icon: '🛡️' },
  { id: 'frost_pulse', name: 'Onde de Givre', description: 'Ralentit les serpents proches.', cost: 4500, icon: '❄️' },
];
