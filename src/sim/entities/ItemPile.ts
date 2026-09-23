/**
 * Goods on the ground.
 *
 * Dropping needs somewhere for things to go. Deleting them would be simpler and
 * would also be a lie: this world is otherwise careful that goods move rather
 * than appear and vanish — a dead person's estate passes to an heir, a theft
 * moves a stack from one pack to another, a harvest takes exactly what the bush
 * loses. A pile keeps that true, and it costs one small entity.
 *
 * Piles merge when dropped on top of each other and disappear when emptied, so
 * a camp does not silently accumulate thousands of one-berry heaps.
 */
import { Inventory } from './Item.ts';
import { t, language } from '../../i18n/i18n.ts';
import { ITEMS } from './Item.ts';

let nextPileId = 1;

export function resetPileIds(): void {
  nextPileId = 1;
}

export class ItemPile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly contents = new Inventory();
  /** Who put it down, so the UI can say whose it is. */
  readonly ownerId: number | null;
  /** Tick it was dropped, for "left here yesterday". */
  readonly droppedTick: number;

  constructor(x: number, y: number, ownerId: number | null, tick: number) {
    this.id = nextPileId++;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.droppedTick = tick;
  }

  get empty(): boolean {
    return this.contents.total === 0;
  }

  /** A short label for the map and the inspector. */
  get label(): string {
    const stacks = this.contents.entries();
    if (stacks.length === 0) return t('nothing');
    // English has always shown the id here; a translation has only the label.
    if (stacks.length === 1) {
      const id = stacks[0]![0];
      return language() === 'en' ? id : t(ITEMS[id]?.label ?? id).toLowerCase();
    }
    return t('{n} kinds of goods', { n: stacks.length });
  }
}
