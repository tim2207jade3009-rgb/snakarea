import { GameMode } from '../src/types/game';
import { ClientMessage } from './protocol';

export function sanitizeString(val: unknown, maxLen = 32): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  // Strip control characters & dangerous tags
  return trimmed.replace(/[\x00-\x1F\x7F<>]/g, '');
}

export function validateUsername(val: unknown): { valid: boolean; sanitized?: string; error?: string } {
  if (typeof val !== 'string') {
    return { valid: false, error: "L'identifiant doit être une chaîne de caractères." };
  }
  const trimmed = val.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: "L'identifiant doit comporter au moins 3 caractères." };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: "L'identifiant ne peut pas dépasser 20 caractères." };
  }
  const validPattern = /^[a-zA-Z0-9_\-\.]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: "L'identifiant ne peut contenir que des lettres, chiffres, tirets et underscores." };
  }
  return { valid: true, sanitized: trimmed };
}

export function validatePassword(val: unknown): { valid: boolean; error?: string } {
  if (typeof val !== 'string') {
    return { valid: false, error: 'Le mot de passe est obligatoire.' };
  }
  if (val.length < 6) {
    return { valid: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' };
  }
  if (val.length > 128) {
    return { valid: false, error: 'Le mot de passe est trop long (maximum 128 caractères).' };
  }
  return { valid: true };
}

export function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

export function isValidAngle(val: unknown): val is number {
  return isValidNumber(val) && Math.abs(val) <= 1000;
}

export function isValidGameMode(val: unknown): val is GameMode {
  return val === 'CLASSIC' || val === 'RANKED';
}

export interface ValidationResult<T = ClientMessage> {
  valid: boolean;
  sanitized?: T;
  error?: string;
}

export function validateClientMessage(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'Message must be a valid JSON object' };
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type;

  if (typeof type !== 'string') {
    return { valid: false, error: 'Missing or invalid message type' };
  }

  switch (type) {
    case 'AUTH_INIT': {
      const sessionToken = typeof obj.sessionToken === 'string' ? sanitizeString(obj.sessionToken, 128) || undefined : undefined;
      const preferredName = typeof obj.preferredName === 'string' ? sanitizeString(obj.preferredName, 16) || undefined : undefined;
      return {
        valid: true,
        sanitized: {
          type: 'AUTH_INIT',
          sessionToken,
          preferredName,
        } as ClientMessage,
      };
    }

    case 'AUTH_REGISTER': {
      const uRes = validateUsername(obj.username);
      if (!uRes.valid || !uRes.sanitized) {
        return { valid: false, error: uRes.error || 'Identifiant invalide' };
      }
      const pRes = validatePassword(obj.password);
      if (!pRes.valid) {
        return { valid: false, error: pRes.error || 'Mot de passe invalide' };
      }
      const email = typeof obj.email === 'string' ? sanitizeString(obj.email, 100) || undefined : undefined;
      const guestSessionToken = typeof obj.guestSessionToken === 'string' ? sanitizeString(obj.guestSessionToken, 128) || undefined : undefined;

      return {
        valid: true,
        sanitized: {
          type: 'AUTH_REGISTER',
          username: uRes.sanitized,
          password: obj.password as string,
          email,
          guestSessionToken,
        } as ClientMessage,
      };
    }

    case 'AUTH_LOGIN': {
      const uRes = validateUsername(obj.username);
      if (!uRes.valid || !uRes.sanitized) {
        return { valid: false, error: 'Identifiant ou mot de passe incorrect' };
      }
      const pRes = validatePassword(obj.password);
      if (!pRes.valid) {
        return { valid: false, error: 'Identifiant ou mot de passe incorrect' };
      }

      return {
        valid: true,
        sanitized: {
          type: 'AUTH_LOGIN',
          username: uRes.sanitized,
          password: obj.password as string,
        } as ClientMessage,
      };
    }

    case 'AUTH_LOGOUT': {
      return {
        valid: true,
        sanitized: {
          type: 'AUTH_LOGOUT',
        } as ClientMessage,
      };
    }

    case 'INPUT': {
      if (!isValidAngle(obj.angle)) {
        return { valid: false, error: 'Invalid angle parameter' };
      }
      const isBoosting = Boolean(obj.isBoosting);
      const seq = isValidNumber(obj.seq) ? Math.floor(obj.seq) : 0;
      return {
        valid: true,
        sanitized: {
          type: 'INPUT',
          angle: obj.angle,
          isBoosting,
          seq,
        } as ClientMessage,
      };
    }

    case 'JOIN_MATCHMAKING': {
      const mode = isValidGameMode(obj.mode) ? obj.mode : 'CLASSIC';
      const skinId = sanitizeString(obj.skinId, 32) || 'cyber_cyan';
      const avatarId = sanitizeString(obj.avatarId, 32) || 'avatar_viper';
      const name = sanitizeString(obj.name, 16) || 'Vipère';

      return {
        valid: true,
        sanitized: {
          type: 'JOIN_MATCHMAKING',
          name,
          avatarId,
          skinId,
          mode,
        } as ClientMessage,
      };
    }

    case 'LEAVE_ROOM': {
      return { valid: true, sanitized: { type: 'LEAVE_ROOM' } as ClientMessage };
    }

    case 'PING': {
      const time = isValidNumber(obj.time) ? obj.time : Date.now();
      return { valid: true, sanitized: { type: 'PING', time } as ClientMessage };
    }

    case 'GET_PROFILE': {
      return { valid: true, sanitized: { type: 'GET_PROFILE' } as ClientMessage };
    }

    case 'UPDATE_NAME': {
      const name = sanitizeString(obj.name, 16);
      if (!name) {
        return { valid: false, error: 'Invalid player name' };
      }
      return {
        valid: true,
        sanitized: {
          type: 'UPDATE_NAME',
          name,
        } as ClientMessage,
      };
    }

    case 'BUY_SKIN': {
      const skinId = sanitizeString(obj.skinId, 32);
      if (!skinId) {
        return { valid: false, error: 'Invalid skin ID' };
      }
      return {
        valid: true,
        sanitized: {
          type: 'BUY_SKIN',
          skinId,
        } as ClientMessage,
      };
    }

    case 'EQUIP_SKIN': {
      const skinId = sanitizeString(obj.skinId, 32);
      if (!skinId) {
        return { valid: false, error: 'Invalid skin ID' };
      }
      return {
        valid: true,
        sanitized: {
          type: 'EQUIP_SKIN',
          skinId,
        } as ClientMessage,
      };
    }

    case 'EQUIP_AVATAR': {
      const avatarId = sanitizeString(obj.avatarId, 32);
      if (!avatarId) {
        return { valid: false, error: 'Invalid avatar ID' };
      }
      return {
        valid: true,
        sanitized: {
          type: 'EQUIP_AVATAR',
          avatarId,
        } as ClientMessage,
      };
    }

    case 'BUY_AVATAR': {
      const avatarId = sanitizeString(obj.avatarId, 32);
      if (!avatarId) {
        return { valid: false, error: 'Invalid avatar ID' };
      }
      return {
        valid: true,
        sanitized: {
          type: 'BUY_AVATAR',
          avatarId,
        } as ClientMessage,
      };
    }

    case 'RESET_PROGRESS': {
      return {
        valid: true,
        sanitized: {
          type: 'RESET_PROGRESS',
        } as ClientMessage,
      };
    }

    case 'SYNC_PREFERENCES': {
      const name = typeof obj.name === 'string' ? sanitizeString(obj.name, 16) || undefined : undefined;
      const equippedSkinId = typeof obj.equippedSkinId === 'string' ? sanitizeString(obj.equippedSkinId, 32) || undefined : undefined;
      const avatarId = typeof obj.avatarId === 'string' ? sanitizeString(obj.avatarId, 32) || undefined : undefined;

      return {
        valid: true,
        sanitized: {
          type: 'SYNC_PREFERENCES',
          name,
          equippedSkinId,
          avatarId,
        } as ClientMessage,
      };
    }

    case 'RESPAWN': {
      return {
        valid: true,
        sanitized: {
          type: 'RESPAWN'
        } as ClientMessage,
      };
    }

    case 'USE_POWER': {
      const powerId = sanitizeString(obj.powerId, 32);
      if (!powerId) {
        return { valid: false, error: 'Identifiant de pouvoir invalide' };
      }
      const angle = isValidNumber(obj.angle) ? obj.angle : undefined;
      return {
        valid: true,
        sanitized: {
          type: 'USE_POWER',
          powerId: powerId as any,
          angle,
        } as ClientMessage,
      };
    }

    default:
      return { valid: false, error: `Unknown message type: ${type}` };
  }
}
