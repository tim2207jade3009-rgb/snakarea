export class SocketRateLimiter {
  private inputTokens: number = 60;
  private sensitiveTokens: number = 6;
  private totalTokens: number = 100;
  private lastRefill: number = Date.now();

  private readonly maxInputs = 60;
  private readonly maxSensitive = 6;
  private readonly maxTotal = 100;

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0.05) {
      this.inputTokens = Math.min(this.maxInputs, this.inputTokens + elapsedSec * 60);
      this.sensitiveTokens = Math.min(this.maxSensitive, this.sensitiveTokens + elapsedSec * 4);
      this.totalTokens = Math.min(this.maxTotal, this.totalTokens + elapsedSec * 100);
      this.lastRefill = now;
    }
  }

  public allow(messageType: string): boolean {
    this.refill();

    if (this.totalTokens < 1) {
      return false;
    }
    this.totalTokens -= 1;

    if (messageType === 'INPUT') {
      if (this.inputTokens < 1) return false;
      this.inputTokens -= 1;
      return true;
    }

    if (
      messageType === 'BUY_SKIN' ||
      messageType === 'EQUIP_SKIN' ||
      messageType === 'BUY_AVATAR' ||
      messageType === 'EQUIP_AVATAR' ||
      messageType === 'UPDATE_NAME' ||
      messageType === 'RESET_PROGRESS' ||
      messageType === 'JOIN_MATCHMAKING' ||
      messageType === 'GET_PROFILE'
    ) {
      if (this.sensitiveTokens < 1) return false;
      this.sensitiveTokens -= 1;
      return true;
    }

    return true;
  }
}
