// Google Analytics 4 Helper

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export const GA_TRACKING_ID = 'G-4HWSW1QQEN';

/**
 * Initialize Google Analytics 4 dynamically if not already loaded
 */
export function initAnalytics() {
  if (typeof window === 'undefined') return;

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer?.push(arguments);
    };
  }

  // Ensure gtag.js script is loaded
  const existingScript = document.querySelector(
    `script[src*="googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}"]`
  );

  if (!existingScript) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`;
    document.head.prepend(script);
  }

  window.gtag('js', new Date());
  window.gtag('config', GA_TRACKING_ID, {
    send_page_view: true,
  });
}

/**
 * Send a custom event to Google Analytics 4
 */
export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    try {
      window.gtag('event', eventName, params);
    } catch {
      // Ignore analytics errors
    }
  }
}

/**
 * Track game session events
 */
export function trackGameStart(mode: string, skinId: string) {
  trackEvent('game_start', {
    game_mode: mode,
    skin_id: skinId,
  });
}

export function trackGameOver(data: {
  mode: string;
  score: number;
  kills: number;
  survivalTime: number;
  coinsEarned: number;
}) {
  trackEvent('game_over', {
    game_mode: data.mode,
    score: data.score,
    kills: data.kills,
    duration_seconds: Math.round(data.survivalTime),
    coins_earned: data.coinsEarned,
  });
}

export function trackSkinPurchase(skinId: string, price: number, rarity: string) {
  trackEvent('unlock_skin', {
    skin_id: skinId,
    price: price,
    rarity: rarity,
  });
}

export function trackAbilityUse(abilityId: string) {
  trackEvent('use_ability', {
    ability_id: abilityId,
  });
}
