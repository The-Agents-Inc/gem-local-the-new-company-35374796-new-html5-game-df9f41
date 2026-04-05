/**
 * Spatial hash grid for fast broad-phase collision detection.
 * Replaces O(n*m) all-pairs checks with O(n) insert + O(1) neighbor lookup.
 */

export interface SpatialEntity {
  x: number;
  y: number;
  readonly radius: number;
  alive: boolean;
}

export class SpatialHash<T extends SpatialEntity> {
  private cellSize: number;
  private invCellSize: number;
  private buckets = new Map<number, T[]>();

  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
  }

  clear() {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
    }
  }

  private key(cx: number, cy: number): number {
    // Cantor-style hash — works for negative cell coords too
    // Shift to positive space first to avoid issues
    const a = cx + 0x7fff;
    const b = cy + 0x7fff;
    return (a << 16) | (b & 0xffff);
  }

  insert(entity: T) {
    const r = entity.radius;
    const minCx = Math.floor((entity.x - r) * this.invCellSize);
    const maxCx = Math.floor((entity.x + r) * this.invCellSize);
    const minCy = Math.floor((entity.y - r) * this.invCellSize);
    const maxCy = Math.floor((entity.y + r) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.buckets.get(k);
        if (!bucket) {
          bucket = [];
          this.buckets.set(k, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  /** Bulk-insert an array of entities (alive only). */
  build(entities: T[]) {
    this.clear();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.alive) this.insert(e);
    }
  }

  /** Query all entities whose cells overlap with the given circle. May return duplicates. */
  query(x: number, y: number, radius: number, out: T[]): void {
    out.length = 0;
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCy = Math.floor((y - radius) * this.invCellSize);
    const maxCy = Math.floor((y + radius) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            out.push(bucket[i]);
          }
        }
      }
    }
  }
}
