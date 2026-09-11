/**
 * Right-click radial menu.
 *
 * Options come from `sim/ai/ActionCatalog`, never from here, so the menu can
 * only ever offer verbs the simulation understands, and gaining a verb in the
 * world makes it appear in the menu without the UI being touched.
 *
 * DOM rather than canvas-drawn: hit-testing, hover states, focus and text
 * layout are free here and fiddly on a canvas, and the menu is not the part of
 * this project worth spending frame budget on.
 */
import type { ActionOption } from '../sim/ai/ActionCatalog.ts';

const RADIUS = 76;

export interface RadialSelection {
  option: ActionOption;
}

/** One ring: what is on it, and what was clicked to get here. */
interface Page {
  title: string;
  options: ActionOption[];
}

export class RadialMenu {
  private root: HTMLElement;
  private open = false;
  private onPick: ((option: ActionOption) => void) | null = null;
  /**
   * The rings behind the one on screen, innermost last.
   *
   * M9 phase 3. A flat menu could not survive the content: `groundActions`
   * emits one option per recipe the actor knows, so a competent crafter got a
   * ring of fifteen overlapping buttons. Grouping them under "Make…" needs
   * somewhere for the group to go, and this is it — a stack rather than a
   * single parent because a submenu of submenus is a matter of what the
   * catalogue emits, not of what the menu can draw.
   */
  private stack: Page[] = [];
  /**
   * Where the ring is pinned, fixed by `show` and reused by every page under
   * it. A submenu that re-derived its own position would jump out from under
   * the cursor that opened it.
   */
  private x = 0;
  private y = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'radial';
    this.root.hidden = true;
    container.appendChild(this.root);

    // Any click that is not on a segment dismisses. Captured on the document so
    // it works over the canvas too.
    document.addEventListener('mousedown', event => {
      if (!this.open) return;
      // The back title is part of the menu, not somewhere else on the screen.
      // This listener is in the capture phase, so without naming it here it
      // would close the whole menu before the title's own handler ever ran —
      // and going back one page would be indistinguishable from dismissing.
      const target = event.target as HTMLElement;
      if (!target.closest('.radial-item') && !target.closest('.radial-title')) this.close();
    }, true);

    window.addEventListener('keydown', event => {
      if (!this.open || event.key !== 'Escape') return;
      // Out of the submenu first, out of the menu second. Escape that always
      // dismissed made the page stack a one-way door for anybody who navigates
      // by keyboard.
      const parent = this.stack.pop();
      if (parent) this.draw(parent);
      else this.close();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Shows the menu at a screen position.
   *
   * `title` names what was clicked, which matters more than it sounds: a menu
   * of verbs with no subject is ambiguous the moment two people stand together.
   */
  show(
    screenX: number,
    screenY: number,
    title: string,
    options: ActionOption[],
    onPick: (option: ActionOption) => void
  ): void {
    if (options.length === 0) return;
    this.onPick = onPick;
    this.stack = [];
    this.x = Math.max(RADIUS + 70, Math.min(window.innerWidth - RADIUS - 70, screenX));
    this.y = Math.max(RADIUS + 70, Math.min(window.innerHeight - RADIUS - 70, screenY));
    this.draw({ title, options });
  }

  /**
   * Draws one ring, in place.
   *
   * Separate from `show` because a submenu must not move: the whole point of
   * opening a group is that the player's cursor is already there, and a ring
   * that jumped to a new position on every descent would undo that. The
   * position is fixed by `show` and every page after it reuses it.
   */
  private draw(page: Page): void {
    const { title, options } = page;
    this.root.innerHTML = '';
    this.root.hidden = false;
    this.open = true;

    const label = document.createElement('div');
    label.className = 'radial-title';
    if (this.stack.length > 0) {
      // The title doubles as the way out. A submenu with no way back is a
      // trap: `bugs.md` already records the screenshot tour degrading silently
      // for want of one, and the cheapest place to put the escape is the thing
      // the player is already looking at to know where they are.
      label.classList.add('is-back');
      label.textContent = '‹ ' + title;
      label.onmousedown = event => {
        event.preventDefault();
        event.stopPropagation();
        const parent = this.stack.pop();
        if (parent) this.draw(parent);
      };
    } else {
      label.textContent = title;
    }
    this.root.appendChild(label);

    // Lay the options out clockwise from the top. With one or two options a
    // full circle looks broken, so a short list fans across the top instead.
    const count = options.length;
    const startAngle = -Math.PI / 2;
    const sweep = count <= 2 ? Math.PI * 0.5 : Math.PI * 2;
    const step = count <= 2 ? (count === 1 ? 0 : sweep / (count - 1)) : sweep / count;
    const offset = count <= 2 ? -sweep / 2 : 0;

    options.forEach((option, index) => {
      const angle = startAngle + offset + step * index;
      const item = document.createElement('button');
      item.className = 'radial-item' + (option.enabled ? '' : ' is-disabled') +
        (option.hostile ? ' is-hostile' : '');
      item.style.left = (RADIUS * Math.cos(angle)).toFixed(1) + 'px';
      item.style.top = (RADIUS * Math.sin(angle)).toFixed(1) + 'px';
      item.title = option.enabled ? option.label : (option.reason ?? option.label);
      item.innerHTML =
        '<span class="radial-icon">' + option.icon + '</span>' +
        '<span class="radial-label">' + escapeHtml(option.label) + '</span>';

      if (option.children && option.children.length > 0) {
        item.classList.add('has-children');
        item.onclick = () => {
          this.stack.push(page);
          // The group's own label becomes the title of the page it opens, so
          // the ring always says what the verbs on it are for — "Make…" over a
          // ring of recipes, rather than the name of whatever was right-clicked
          // three pages ago.
          this.draw({ title: option.label, options: option.children! });
        };
      } else if (option.enabled) {
        item.onclick = () => {
          // Take the callback before closing: close() clears it, so invoking it
          // afterwards silently did nothing and every menu choice was swallowed.
          const pick = this.onPick;
          this.close();
          pick?.(option);
        };
      }
      this.root.appendChild(item);
    });

    this.root.style.left = this.x + 'px';
    this.root.style.top = this.y + 'px';
  }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onPick = null;
    this.stack = [];
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
