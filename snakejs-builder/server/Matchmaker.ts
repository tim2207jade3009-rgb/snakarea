import { WebSocket } from 'ws';
import { GameMode } from '../src/types/game';
import { GameRoom, ARENA_RADIUS } from './GameRoom';
import { RoomJoinedMessage, MatchmakingStatusMessage } from './protocol';

export class Matchmaker {
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private nextRoomNumber: number = 1;

  public findOrCreateRoom(
    socketId: string,
    ws: WebSocket,
    playerId: string,
    name: string,
    avatarId: string,
    skinId: string,
    mode: GameMode,
    _powers?: any
  ): GameRoom {
    // Leave previous room if any
    this.leaveRoom(socketId);

    // Find non-full room with matching mode
    let targetRoom: GameRoom | null = null;
    for (const room of this.rooms.values()) {
      if (room.mode === mode && !room.isFull()) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      const roomId = `room_${mode.toLowerCase()}_${this.nextRoomNumber++}`;
      targetRoom = new GameRoom(roomId, mode);
      this.rooms.set(roomId, targetRoom);
    }

    this.socketToRoom.set(socketId, targetRoom.id);
    targetRoom.addPlayer(socketId, ws, playerId, name, skinId);

    // Send ROOM_JOINED message
    const joinMsg: RoomJoinedMessage = {
      type: 'ROOM_JOINED',
      roomId: targetRoom.id,
      playerId: socketId,
      mode: targetRoom.mode,
      arenaRadius: ARENA_RADIUS,
      tickRate: 25,
    };

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(joinMsg));
      } catch (err) {
        console.warn('Failed to send ROOM_JOINED message:', err);
      }
    }

    return targetRoom;
  }

  public refreshPlayerProfile(playerId: string) {
    for (const room of this.rooms.values()) {
      room.refreshPlayerProfile(playerId);
    }
  }

  public handleUsePower(socketId: string, powerId: string, angle?: number) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room) {
      room.usePower(socketId, powerId, angle);
    }
  }

  public handleInput(socketId: string, angle: number, isBoosting: boolean, seq: number) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room) {
      room.handlePlayerInput(socketId, angle, isBoosting, seq);
    }
  }

  public respawnPlayer(socketId: string, accountId: string, ws: WebSocket) {
    if (!accountId) {
      return { success: false, error: 'Compte non authentifié. Veuillez vous reconnecter.' };
    }
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) {
      // If socket is not in a room, try to find by accountId in all rooms
      for (const room of this.rooms.values()) {
        const snakes = room.getSnakes();
        for (const snake of snakes.values()) {
          if (snake.playerId === accountId && snake.isPlayer) {
            this.socketToRoom.set(socketId, room.id);
            return room.respawnPlayer(socketId, accountId, ws);
          }
        }
      }
      return { success: false, error: 'Joueur hors partie.' };
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Partie introuvable.' };
    }
    return room.respawnPlayer(socketId, accountId, ws);
  }

  public leaveRoom(socketId: string) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (room) {
      room.removePlayer(socketId);
      // If room has no human players and has been active for more than 30 seconds, clean up
      if (room.getPlayerCount() === 0 && Date.now() - room.createdAt > 30000) {
        room.destroy();
        this.rooms.delete(roomId);
      }
    }
  }

  public getTotalOnlinePlayers(): number {
    return this.socketToRoom.size;
  }

  public getRoomStats(): { totalRooms: number; totalPlayers: number } {
    return {
      totalRooms: this.rooms.size,
      totalPlayers: this.socketToRoom.size,
    };
  }
}

export const matchmaker = new Matchmaker();
