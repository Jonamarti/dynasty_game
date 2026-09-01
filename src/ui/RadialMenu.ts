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

export class RadialMenu {
  private root: HTMLElement;
  private open = false;
  private onPick: ((option: ActionOption) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'radial';
    this.root.hidden = true;
    container.appendChild(this.root);

    // Any click that is not on a segment dismisses. Captured on the document so
    // it works over the canvas too.
    document.addEventListener('mousedown', event => {
      if (!this.open) return;
      if (!(event.target as HTMLElement).closest('.radial-item')) this.close();
    }, true);

    window.addEventListener('keydown', event => {
      if (this.open && event.key === 'Escape') this.close();
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
    this.root.innerHTML = '';
    this.root.hidden = false;
    this.open = true;

    const label = document.createElement('div');
    label.className = 'radial-title';
    label.textContent = title;
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

      if (option.enabled) {
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

    // Keep the whole menu on screen near an edge.
    const margin = RADIUS + 70;
    const x = Math.max(margin, Math.min(window.innerWidth - margin, screenX));
    const y = Math.max(margin, Math.min(window.innerHeight - margin, screenY));
    this.root.style.left = x + 'px';
    this.root.style.top = y + 'px';
  }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onPick = null;
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
