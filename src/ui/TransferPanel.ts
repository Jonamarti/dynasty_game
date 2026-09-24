import type { Simulation } from '../sim/core/Simulation.ts';
import type { Building } from '../sim/entities/Building.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { t } from '../i18n/i18n.ts';

/** A two-sided, partial-stack transfer window for a store within reach. */
export class TransferPanel {
  private readonly root: HTMLElement;
  private open = false;
  private person: Person | null = null;
  private store: Building | null = null;
  private sim: Simulation | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'transfer-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
    window.addEventListener('keydown', event => {
      if (this.open && event.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean { return this.open; }

  show(sim: Simulation, person: Person, store: Building): void {
    this.sim = sim;
    this.person = person;
    this.store = store;
    this.open = true;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.person = null;
    this.store = null;
    this.sim = null;
  }

  private render(): void {
    const sim = this.sim;
    const person = this.person;
    const store = this.store;
    if (!sim || !person || !store) return;
    this.root.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'transfer-card';
    const head = document.createElement('div');
    head.className = 'transfer-head';
    head.innerHTML = '<b>' + t('Transfer goods') + '</b><span>' +
      t(store.def.label) + '</span>';
    const close = document.createElement('button');
    close.className = 'transfer-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = t('Close');
    close.onclick = () => this.close();
    head.appendChild(close);
    card.appendChild(head);

    const capacities = document.createElement('div');
    capacities.className = 'transfer-capacities';
    capacities.textContent = t('You carry {used}/{max} · Store {stored}/{capacity}', {
      used: person.carrying, max: person.carryCapacity,
      stored: store.store.total, capacity: store.def.storage,
    });
    card.appendChild(capacities);

    const columns = document.createElement('div');
    columns.className = 'transfer-columns';
    const left = this.column(t('Your pack'), person.inventory.entries(), true);
    const right = this.column(t('The store'), store.store.entries(), false);
    columns.append(left, right);
    card.appendChild(columns);
    this.root.appendChild(card);
  }

  private column(title: string, entries: [string, number][], fromPack: boolean): HTMLElement {
    const section = document.createElement('section');
    section.className = 'transfer-column';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'transfer-empty';
      empty.textContent = t('empty');
      section.appendChild(empty);
      return section;
    }
    for (const [itemId, count] of entries) {
      const row = document.createElement('div');
      row.className = 'transfer-row';
      const label = document.createElement('span');
      label.textContent = t(ITEMS[itemId]?.label ?? itemId) + ' ×' + count;
      const max = fromPack
        ? Math.min(count, this.store?.storageFree ?? 0)
        : Math.min(count, (this.person?.carryCapacity ?? 0) - (this.person?.carrying ?? 0));
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '1';
      slider.max = String(Math.max(1, max));
      slider.value = String(Math.max(1, max));
      slider.disabled = max <= 0;
      const amount = document.createElement('span');
      amount.className = 'transfer-amount';
      amount.textContent = slider.value;
      slider.oninput = () => { amount.textContent = slider.value; };
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = fromPack ? t('Put in store') : t('Take out');
      button.disabled = max <= 0;
      button.onclick = () => {
        const person = this.person;
        const store = this.store;
        const sim = this.sim;
        if (!person || !store || !sim) return;
        const moved = fromPack
          ? sim.storeItem(person, store, itemId, Number(slider.value))
          : sim.takeItem(person, store, itemId, Number(slider.value));
        if (moved <= 0) {
          this.close();
          return;
        }
        this.render();
      };
      row.append(label, slider, amount, button);
      section.appendChild(row);
    }
    return section;
  }
}
