/**
 * Asks how many of a stack to move, before a give, a store or a take happens.
 *
 * M9 phase 2, note 9: `handOver`, `storeItem` and `doTake` used to move a
 * whole stack (or a hardcoded six) because nothing in the interface ever
 * offered a smaller number. This is that offer — one popup, reused for all
 * three verbs, built on `sliderRow` rather than a second slider-and-number-box
 * pair written out again.
 *
 * Lives beside `EntityPicker` for the same reasons: its own root on
 * `document.body` so a HUD rebuild cannot erase it, dismissed by a click
 * elsewhere or Escape, and the callback taken before `close()` clears it so a
 * confirm click cannot be swallowed by its own cleanup.
 */
import { sliderRow } from './SliderRow.ts';
import { t } from '../i18n/i18n.ts';

export class QuantityPicker {
  private root: HTMLElement;
  private open = false;
  private onConfirm: ((count: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'quantity-picker';
    this.root.hidden = true;
    container.appendChild(this.root);

    document.addEventListener('pointerdown', event => {
      if (!this.open) return;
      if (!(event.target as HTMLElement).closest('.quantity-picker')) this.close();
    }, true);

    window.addEventListener('keydown', event => {
      if (this.open && event.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Shows the popup near a screen point.
   *
   * `initial` defaults to the whole stack, which is what `give` and `store`
   * want — they used to move the whole thing unconditionally, and asking for
   * less is the exception. `take` passes something smaller: withdrawing an
   * entire granary by default, just because a slider has to start somewhere,
   * would be a strange result for what used to be a handful.
   *
   * `max` of zero or less is refused rather than shown empty — the same rule
   * `EntityPicker.show` follows for an empty candidate list.
   */
  show(
    screenX: number, screenY: number, label: string, max: number,
    onConfirm: (count: number) => void, initial = max
  ): void {
    if (max <= 0) return;
    this.onConfirm = onConfirm;
    this.root.innerHTML = '';
    this.open = true;
    this.root.hidden = false;

    const heading = document.createElement('div');
    heading.className = 'quantity-picker-label';
    heading.textContent = label;
    this.root.appendChild(heading);

    const start = Math.min(max, Math.max(1, initial));
    let value = start;
    // The reset arrow's ordinary meaning — "back to the default" — fits
    // exactly, so it is left wired up rather than hidden: there is a real
    // default, it is just wherever this popup started.
    const row = sliderRow(
      { label: t('How many'), min: 1, max, step: 1, places: 0 },
      start,
      v => { value = Math.round(v); },
      () => { value = start; row.set(start, false); }
    );
    this.root.appendChild(row.el);

    const actions = document.createElement('div');
    actions.className = 'quantity-picker-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'quantity-picker-cancel';
    cancel.textContent = t('Cancel');
    cancel.onclick = () => this.close();
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'quantity-picker-confirm';
    confirm.textContent = t('Confirm');
    confirm.onclick = () => {
      const go = this.onConfirm;
      this.close();
      go?.(value);
    };
    actions.append(cancel, confirm);
    this.root.appendChild(actions);

    const width = 260;
    const height = 108;
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, screenX + 6));
    const y = Math.max(8, Math.min(window.innerHeight - height - 8, screenY + 6));
    this.root.style.left = x + 'px';
    this.root.style.top = y + 'px';
  }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onConfirm = null;
  }
}
