/**
 * A household's remembered rivalries, rendered from the player's family's
 * feud ledger and the player's own knowledge of named people.
 *
 * Rival household records may live in another comarca or only in the global
 * archive. The view therefore accepts canonical maps from its caller, but it
 * never reads a rival's wealth, home, feud ledger, or private household name.
 * Every person name goes through Knowledge; an unnamed rival remains simply
 * "a rival household".
 */
import type { Household } from '../sim/entities/Household.ts';
import type { Person } from '../sim/entities/Person.ts';
import type { RelationshipGraph } from '../sim/social/Relationships.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { t, onLanguageChange } from '../i18n/i18n.ts';

export interface RivalHouseContext {
  observer: Person;
  householdsById: ReadonlyMap<number, Household>;
  peopleById: ReadonlyMap<number, Person>;
  relationships: RelationshipGraph;
}

export interface KnownRivalHouse {
  id: number;
  /** Names of rival members the observer can name; never an omniscient roster. */
  people: string[];
}

/**
 * Project the player's household ledger into names this observer actually
 * knows. Missing archive records do not erase the feud: the persistent ID is
 * still shown with no invented name, which is the continuity contract across
 * comarca transfers.
 */
export function knownRivalHouses(context: RivalHouseContext): KnownRivalHouse[] {
  const { observer, householdsById, peopleById, relationships } = context;
  if (observer.householdId === null) return [];
  const ownHousehold = householdsById.get(observer.householdId);
  if (!ownHousehold) return [];

  return [...ownHousehold.feud.keys()]
    .filter(id => id !== ownHousehold.id)
    .sort((a, b) => a - b)
    .map(id => {
      const rival = householdsById.get(id);
      if (!rival) return { id, people: [] };

      // Include the family's named suspect first, then other named members.
      // Every name still passes through the observer's Knowledge gate; the
      // suspect ID alone grants no name.
      const suspectId = ownHousehold.feudSuspects.get(id);
      const candidates = [
        ...(suspectId === undefined ? [] : [suspectId]),
        ...rival.memberIds,
      ];
      const seen = new Set<number>();
      const people: string[] = [];
      for (const personId of candidates) {
        if (seen.has(personId)) continue;
        seen.add(personId);
        const person = peopleById.get(personId);
        if (!person || person.householdId !== rival.id) continue;
        const knowledge = knowledgeOfPerson(observer, person, relationships);
        if (!knowledge.knowsName || people.includes(knowledge.displayName)) continue;
        people.push(knowledge.displayName);
      }
      return { id, people };
    });
}

export class RivalHouseOverlay {
  private readonly root: HTMLElement;
  private context: RivalHouseContext | null = null;
  private signature = '';

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'rivalhouses';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target === this.root || target.closest('[data-rival-close]')) this.close();
    });
    window.addEventListener('keydown', event => {
      if (this.isOpen && event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    onLanguageChange(() => {
      this.signature = '';
      if (this.isOpen) this.render();
    });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(context: RivalHouseContext): void {
    this.context = context;
    this.signature = '';
    this.root.hidden = false;
    this.render();
  }

  update(context: RivalHouseContext): void {
    if (!this.isOpen) return;
    this.context = context;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.context = null;
    this.signature = '';
  }

  private render(): void {
    const context = this.context;
    if (!context) return;
    const rivals = knownRivalHouses(context);
    const digest = JSON.stringify(rivals);
    if (digest === this.signature && this.root.childElementCount > 0) return;
    this.signature = digest;

    const content = rivals.length === 0
      ? `<p class="rivalhouses-empty">${escapeHtml(t('Your household has no recorded rival houses.'))}</p>`
      : `<ul class="rivalhouses-list">${rivals.map(rival => {
          const names = rival.people.length
            ? `<p>${escapeHtml(t('Known people: {names}', { names: rival.people.join(', ') }))}</p>`
            : `<p>${escapeHtml(t('No names from this household are known to you.'))}</p>`;
          return `<li><h2>${escapeHtml(t('A rival household'))}</h2>${names}` +
            `<p>${escapeHtml(t('Your family remembers an open feud.'))}</p></li>`;
        }).join('')}</ul>`;
    this.root.innerHTML =
      `<section class="rivalhouses-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('Rival households'))}">` +
        `<header><h1>${escapeHtml(t('Rival households'))}</h1>` +
          `<button type="button" data-rival-close>${escapeHtml(t('Close'))}</button></header>` +
        `<div class="rivalhouses-content">${content}</div>` +
      `</section>`;
  }
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}
