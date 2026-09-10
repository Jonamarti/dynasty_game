/**
 * Bubbles for a stack of things under the cursor.
 *
 * Before this, a click on a crowded tile went through `lastPick` — repeated
 * clicks in the same spot cycled blindly through whatever was stacked there,
 * with no indication of what was in the stack, how deep it went, or which of
 * them you were about to get. That is a guessing game, and a person standing on
 * a berry bush inside a hut is three guesses.
 *
 * The chooser is explicit instead: one bubble per candidate, named as far as
 * the player's own character can name it. It lives on `document.body` rather
 * than inside `#hud` for the same reason `RadialMenu` does — the HUD rebuilds
 * its own subtree and would silently erase anything living in it.
 */
export interface PickerEntry<T> {
  target: T;
  icon: string;
  /** As the player's character knows it: never a stranger's real name. */
  label: string;
}

/**
 * Generic over what a bubble stands for. `ActionTarget` for the map's own
 * click chooser; a bare item id for M9 phase 2's "which item?" step of
 * ordering a `take` — the column of bubbles is the same either way, and only
 * the map click chooser needs a hover ring on the world underneath it.
 */
export class EntityPicker<T> {
  private root: HTMLElement;
  private open = false;
  private onPick: ((target: T) => void) | null = null;
  private onHover: ((target: T | null) => void) | null = null;

  /**
   * `rootClass` defaults to `picker`, the map click chooser's long-standing
   * class. A second, permanently-mounted instance for the item chooser needs
   * a class of its own — several e2e specs assert on `.picker` expecting
   * exactly one match, a premise that held when only one ever existed, and a
   * second element sharing the class broke it for tests with nothing to do
   * with items at all.
   */
  constructor(container: HTMLElement, rootClass = 'picker') {
    this.root = document.createElement('div');
    this.root.className = rootClass;
    this.root.hidden = true;
    container.appendChild(this.root);

    // Dismissed by a click elsewhere or Escape, exactly like the radial menu.
    // Captured on the document so it works over the canvas too.
    document.addEventListener('mousedown', event => {
      if (!this.open) return;
      if (!(event.target as HTMLElement).closest('.picker-item')) this.close();
    }, true);

    window.addEventListener('keydown', event => {
      if (this.open && event.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Shows one bubble per candidate at the cursor.
   *
   * `onHover` is handed the entry under the pointer so the map can outline it —
   * without that the bubbles name things but do not point at them, which on a
   * tile holding three similar bushes is barely better than cycling.
   */
  show(
    screenX: number,
    screenY: number,
    entries: PickerEntry<T>[],
    onPick: (target: T) => void,
    onHover: (target: T | null) => void
  ): void {
    if (entries.length === 0) return;
    this.onPick = onPick;
    this.onHover = onHover;
    this.root.innerHTML = '';
    this.root.hidden = false;
    this.open = true;

    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = 'picker-item';
      item.innerHTML =
        '<span class="picker-icon">' + entry.icon + '</span>' +
        '<span class="picker-label">' + escapeHtml(entry.label) + '</span>';
      item.onmouseenter = () => this.onHover?.(entry.target);
      item.onmouseleave = () => this.onHover?.(null);
      item.onclick = () => {
        // Take the callbacks before closing: `close` clears them, and invoking
        // afterwards silently does nothing — the bug that swallowed every
        // radial-menu choice once already.
        const pick = this.onPick;
        this.close();
        pick?.(entry.target);
      };
      this.root.appendChild(item);
    }

    // Keep the whole column on screen near an edge.
    const height = entries.length * 30 + 12;
    const x = Math.max(8, Math.min(window.innerWidth - 190, screenX + 6));
    const y = Math.max(8, Math.min(window.innerHeight - height - 8, screenY + 6));
    this.root.style.left = x + 'px';
    this.root.style.top = y + 'px';
  }

  close(): void {
    if (this.open) this.onHover?.(null);
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onPick = null;
    this.onHover = null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
