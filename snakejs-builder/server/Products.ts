export interface CoinProduct {
  id: string;
  name: string;
  coins: number;
  price: number; // in cents e.g., 199 for 1.99 EUR
  currency: string;
  formattedPrice: string;
  popular?: boolean;
  bestValue?: boolean;
}

export const RESPAWN_COST = 50;

export const PRODUCTS: Record<string, CoinProduct> = {
  coins_1000: {
    id: 'coins_1000',
    name: '1 000 Coins',
    coins: 1000,
    price: 0,
    currency: 'EUR',
    formattedPrice: 'Gratuit',
  },
  coins_5000: {
    id: 'coins_5000',
    name: '5 000 Coins',
    coins: 5000,
    price: 0,
    currency: 'EUR',
    formattedPrice: 'Gratuit',
    popular: true,
  },
  coins_10000: {
    id: 'coins_10000',
    name: '10 000 Coins',
    coins: 10000,
    price: 0,
    currency: 'EUR',
    formattedPrice: 'Gratuit',
  },
  coins_25000: {
    id: 'coins_25000',
    name: '25 000 Coins',
    coins: 25000,
    price: 0,
    currency: 'EUR',
    formattedPrice: 'Gratuit',
    bestValue: true,
  },
};
