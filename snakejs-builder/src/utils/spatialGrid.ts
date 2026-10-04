import { FoodOrb } from '../types/game';

const CELL_SIZE = 160;
const OFFSET = 3200; // Offset to ensure positive grid coordinates (arena radius = 2600)

export interface SegmentEntry {
  snakeId: string;
  segmentIndex: number;
  x: number;
  y: number;
  radius: number;
  mass: number;
}

/**
 * High-performance 2D Spatial Hash Grid for Snake Segments and Food Orbs
 * Reduces collision complexity from O(Snakes * Segments) down to O(Nearby Segments)
 */
export class SpatialGrid {
  private cells: Map<number, SegmentEntry[]> = new Map();
  private orbCells: Map<number, FoodOrb[]> = new Map();

  private getKey(x: number, y: number): number {
    const cx = Math.floor((x + OFFSET) / CELL_SIZE);
    const cy = Math.floor((y + OFFSET) / CELL_SIZE);
    return (cx << 16) | (cy & 0xffff);
  }

  public clearSegments(): void {
    this.cells.clear();
  }

  public rebuildSnakes(snakes: { id: string; dead: boolean; mass: number; segments: { x: number; y: number }[] }[]): void {
    this.clearSegments();
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (s.dead) continue;
      const headRadius = 12 + Math.sqrt(s.mass) * 1.0;
      for (let j = 0; j < s.segments.length; j++) {
        const seg = s.segments[j];
        this.insertSegment({
          snakeId: s.id,
          segmentIndex: j,
          x: seg.x,
          y: seg.y,
          radius: headRadius * 0.85,
          mass: s.mass,
        });
      }
    }
  }

  public insertSegment(entry: SegmentEntry): void {
    const key = this.getKey(entry.x, entry.y);
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push(entry);
  }

  public querySegments(
    x: number,
    y: number,
    radius: number,
    callback: (entry: SegmentEntry) => boolean | void
  ): void {
    const minX = x - radius;
    const maxX = x + radius;
    const minY = y - radius;
    const maxY = y + radius;

    const minCx = Math.floor((minX + OFFSET) / CELL_SIZE);
    const maxCx = Math.floor((maxX + OFFSET) / CELL_SIZE);
    const minCy = Math.floor((minY + OFFSET) / CELL_SIZE);
    const maxCy = Math.floor((maxY + OFFSET) / CELL_SIZE);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = (cx << 16) | (cy & 0xffff);
        const list = this.cells.get(key);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            if (callback(list[i]) === false) {
              return;
            }
          }
        }
      }
    }
  }

  public rebuildOrbs(orbs: FoodOrb[]): void {
    this.orbCells.clear();
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      const key = this.getKey(orb.x, orb.y);
      let list = this.orbCells.get(key);
      if (!list) {
        list = [];
        this.orbCells.set(key, list);
      }
      list.push(orb);
    }
  }

  public queryOrbs(
    x: number,
    y: number,
    radius: number,
    callback: (orb: FoodOrb) => boolean | void
  ): void {
    const minX = x - radius;
    const maxX = x + radius;
    const minY = y - radius;
    const maxY = y + radius;

    const minCx = Math.floor((minX + OFFSET) / CELL_SIZE);
    const maxCx = Math.floor((maxX + OFFSET) / CELL_SIZE);
    const minCy = Math.floor((minY + OFFSET) / CELL_SIZE);
    const maxCy = Math.floor((maxY + OFFSET) / CELL_SIZE);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = (cx << 16) | (cy & 0xffff);
        const list = this.orbCells.get(key);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            if (callback(list[i]) === false) {
              return;
            }
          }
        }
      }
    }
  }
}

export const spatialGrid = new SpatialGrid();
