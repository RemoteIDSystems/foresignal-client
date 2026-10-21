import type { GeometryInstance } from 'cesium';
import type { StyleModel } from '../style/model';
import { boxMayHold, drawCell } from './cellGeometry';
import { clusterStyle } from './clientClusters';
import type { HexCell } from './hexCells';
import type { RecordBatch } from './recordBatch';
import {
  compareHits,
  hitTest,
  type Pickable,
  type PickQuery,
  type RecordHit,
  type RecordPickId,
} from './recordPicking';

/** The owner the client cells are drawn under in the shared cell primitives; no layer id has `#`. */
export const CLIENT_CELLS_OWNER = '#client-cells';

/** How long a burst of tiles may take to land before the cells are drawn again, in ms. */
const CLIENT_CELL_REDRAW_MS = 60;

/** One cell across the layers: its ring, the records it counts, and how many of each layer. */
interface MergedCell {
  ring: [number, number][];
  count: number;
  byLayer: Map<string, number>;
}

/**
 * The client's cells (037) for every record layer on a viewer that clusters its points: each
 * layer hands in, per tile, the cells its points fall in ({@link pointCells}), and the cells are
 * merged across the layers into one grid, each counting every layer's records there. So a world
 * view of many layers draws one cell per place, not one per layer stacked on each other. They are
 * drawn into the batch's cell primitives, styled as the backend's aggregate cells are
 * ({@link clusterStyle}), and named in picking by the layer with the most records in them.
 */
export class ClientCellLayer {
  /** Cells per layer and tile, keyed `layer|tile`. */
  private readonly parts = new Map<string, { layer: string; cells: HexCell[] }>();
  private pickables: { pickable: Pickable; box: [number, number, number, number] }[] = [];
  private drawn = { cells: 0, records: 0 };
  private timer?: ReturnType<typeof setTimeout>;
  private waiting: (() => void)[] = [];
  private destroyed = false;

  /**
   * @param batch The shared primitives the cells are drawn into.
   * @param model The overlay style, for the cells' look; set again with {@link setModel}.
   */
  constructor(
    private readonly batch: RecordBatch,
    private model?: StyleModel,
  ) {}

  /** Sets the overlay style the cells are drawn with, and draws them again. */
  setModel(model: StyleModel | undefined): void {
    this.model = model;
    this.schedule();
  }

  /** Sets one layer's cells for one tile; none removes them. */
  set(layer: string, tile: string, cells: HexCell[]): void {
    const key = `${layer}|${tile}`;
    if (cells.length === 0) {
      this.delete(layer, tile);
      return;
    }
    this.parts.set(key, { layer, cells });
    this.schedule();
  }

  /** Removes one layer's cells for one tile. */
  delete(layer: string, tile: string): void {
    if (this.parts.delete(`${layer}|${tile}`)) this.schedule();
  }

  /** Removes every cell of a layer. */
  deleteLayer(layer: string): void {
    let changed = false;
    for (const [key, part] of [...this.parts]) {
      if (part.layer === layer) changed = this.parts.delete(key) || changed;
    }
    if (changed) this.schedule();
  }

  /**
   * Calls `callback` once the cells set so far are drawn on the map, so the points they replace
   * can stay until then and the switch does not blink.
   */
  whenShown(callback: () => void): void {
    this.waiting.push(callback);
    this.schedule();
  }

  /** Cells drawn now, across the layers. */
  get cellCount(): number {
    return this.drawn.cells;
  }

  /** Records the drawn cells count, across the layers. */
  get recordCount(): number {
    return this.drawn.records;
  }

  /** One layer's share: the cells its points fall in, and the records it counts in them. */
  layerShare(layer: string): { cells: number; records: number } {
    let cells = 0;
    let records = 0;
    for (const part of this.parts.values()) {
      if (part.layer !== layer) continue;
      cells += part.cells.length;
      for (const cell of part.cells) records += cell.count;
    }
    return { cells, records };
  }

  /** The cells under the pointer. */
  pick(query: PickQuery): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const { pickable, box } of this.pickables) {
      if (!boxMayHold(box, query.longitude, query.latitude)) continue;
      const hit = hitTest(pickable, query);
      if (hit) hits.push(hit);
    }
    return hits.sort(compareHits);
  }

  /** Removes the cells and stops drawing. */
  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.parts.clear();
    this.waiting = [];
    this.batch.cellFills.delete(CLIENT_CELLS_OWNER);
    this.batch.cellLines.delete(CLIENT_CELLS_OWNER);
  }

  private schedule(): void {
    if (this.destroyed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.draw(), CLIENT_CELL_REDRAW_MS);
  }

  /** Merges every layer's cells and hands them to the shared cell primitives. */
  private draw(): void {
    this.timer = undefined;
    if (this.destroyed) return;
    const merged = new Map<string, MergedCell>();
    for (const { layer, cells } of this.parts.values()) {
      for (const cell of cells) {
        let into = merged.get(cell.key);
        if (!into) {
          into = { ring: cell.ring, count: 0, byLayer: new Map() };
          merged.set(cell.key, into);
        }
        into.count += cell.count;
        into.byLayer.set(layer, (into.byLayer.get(layer) ?? 0) + cell.count);
      }
    }
    const style = this.model ? clusterStyle(this.model) : undefined;
    const fills: GeometryInstance[] = [];
    const lines: GeometryInstance[] = [];
    const pickables: typeof this.pickables = [];
    let records = 0;
    if (style) {
      for (const [key, cell] of merged) {
        records += cell.count;
        const most = [...cell.byLayer].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
        const id: RecordPickId = {
          layer: most,
          kind: most,
          count: cell.count,
          ...(cell.byLayer.size > 1 && { layers: cell.byLayer.size }),
        };
        const drawing = drawCell({ key, ring: cell.ring, count: cell.count }, style, id);
        fills.push(drawing.fill);
        lines.push(drawing.outline);
        pickables.push({ pickable: drawing.pickable, box: drawing.box });
      }
    }
    this.batch.cellFills.set(CLIENT_CELLS_OWNER, fills);
    this.batch.cellLines.set(CLIENT_CELLS_OWNER, lines);
    this.pickables = pickables;
    this.drawn = { cells: pickables.length, records };
    const waiting = this.waiting;
    this.waiting = [];
    if (waiting.length > 0) {
      this.batch.cellFills.whenBuilt(() =>
        this.batch.cellLines.whenBuilt(() => {
          for (const callback of waiting) callback();
        }),
      );
    }
  }
}
