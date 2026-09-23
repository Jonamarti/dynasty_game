import { t } from '../i18n/i18n.ts';
/**
 * One labelled setting: a drag, a number box, and a way back to the default.
 *
 * Extracted rather than written twice. The project had exactly one slider — the
 * HUD speed control — and the settings screen needs thirty-odd, so this is the
 * shared one; house style is explicit that two copies of an idea drift apart and
 * the drift shows up months later as a mystifying bug.
 *
 * Both controls, not one. A range alone cannot express 0.0042 and a number box
 * alone cannot be dragged, so they are bound together: the range drives on
 * `input` for the feel of it, the box commits on `change` for the precision.
 *
 * `set()` writes both controls **without** firing the change callback, which is
 * what lets the difficulty slider re-stamp thirty rows at once without thirty
 * feedback loops and without rebuilding any DOM — rebuilding while a range is
 * under the pointer kills the drag mid-gesture.
 */

export interface SliderRowSpec {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  /** Decimal places shown in the number box. */
  places: number;
  /** A small chip beside the label, e.g. 'new world'. */
  tag?: string;
  /** Tooltip for the chip. */
  tagTitle?: string;
}

export interface SliderRow {
  el: HTMLElement;
  /** Writes the value into both controls, and marks the row changed or not. */
  set(value: number, changed: boolean): void;
}

export function sliderRow(
  spec: SliderRowSpec,
  value: number,
  onChange: (value: number) => void,
  onReset: () => void
): SliderRow {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const labelCell = document.createElement('div');
  labelCell.className = 'settings-row-label';
  const name = document.createElement('span');
  name.className = 'settings-row-name';
  name.textContent = spec.label;
  labelCell.appendChild(name);
  if (spec.tag) {
    const tag = document.createElement('span');
    tag.className = 'settings-tag';
    tag.textContent = spec.tag;
    if (spec.tagTitle) tag.title = spec.tagTitle;
    labelCell.appendChild(tag);
  }
  if (spec.hint) {
    const hint = document.createElement('div');
    hint.className = 'settings-row-hint';
    hint.textContent = spec.hint;
    labelCell.appendChild(hint);
  }

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'settings-range';
  range.min = String(spec.min);
  range.max = String(spec.max);
  range.step = String(spec.step);

  const box = document.createElement('input');
  box.type = 'number';
  box.className = 'settings-number';
  box.min = String(spec.min);
  box.max = String(spec.max);
  box.step = String(spec.step);

  const reset = document.createElement('button');
  reset.className = 'settings-row-reset';
  reset.type = 'button';
  reset.textContent = '↺';
  reset.title = t('Back to this difficulty’s value');

  row.append(labelCell, range, box, reset);

  const show = (v: number) => {
    range.value = String(v);
    box.value = v.toFixed(spec.places);
  };

  /**
   * Clamped, never NaN, and never quietly zero.
   *
   * Three separate ways a number box can hand back something useless, and the
   * last one is a trap worth naming. A NaN hunger rate is a world where nobody
   * is ever hungry and nothing anywhere says why, so "0.o5" has to snap back.
   * But `Number('')` is **0**, not NaN — and an empty box is the *normal* result
   * of typing a decimal comma into a browser whose locale wants a point, which
   * this machine's does. Without the blank guard, a European player typing
   * "0,08" gets the field's minimum rather than the value they had, and nothing
   * tells them their keystrokes were thrown away. The comma is accepted too,
   * for the case where the browser hands it through rather than rejecting it.
   */
  const commit = (raw: string): void => {
    const text = raw.trim().replace(',', '.');
    if (text === '') {
      show(last);
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      show(last);
      return;
    }
    const clamped = Math.min(spec.max, Math.max(spec.min, parsed));
    last = clamped;
    show(clamped);
    onChange(clamped);
  };

  let last = value;
  show(value);

  range.oninput = () => {
    last = Number(range.value);
    box.value = last.toFixed(spec.places);
    onChange(last);
  };
  box.onchange = () => commit(box.value);
  box.onblur = () => commit(box.value);
  reset.onclick = () => onReset();

  return {
    el: row,
    set(next: number, changed: boolean): void {
      last = next;
      show(next);
      row.classList.toggle('is-changed', changed);
    },
  };
}
