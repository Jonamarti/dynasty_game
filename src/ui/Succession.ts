/**
 * The moment the game is named after.
 *
 * When the player's character dies the game does not end — it hands them to
 * whoever inherits. This overlay is where that happens: what your character
 * died of, what they did with the years they had, and who you are about to
 * become.
 *
 * It reads the chronicle rather than a score, because a life here is not a
 * total. The point of writing every deed down as it happened is that at the end
 * there is something to read back.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { BUILDINGS } from '../sim/entities/Building.ts';

export class SuccessionOverlay {
  private root: HTMLElement;
  private shownFor: number | null = null;

  constructor(container: HTMLElement, private readonly onContinue: (heir: Person | null) => void) {
    this.root = document.createElement('div');
    this.root.className = 'succession';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Shows the overlay if a succession is pending and not already displayed. */
  update(sim: Simulation): void {
    const pending = sim.succession;
    if (!pending) {
      if (!this.root.hidden) this.close();
      return;
    }
    if (this.shownFor === pending.died.id) return;

    this.shownFor = pending.died.id;
    this.render(sim, pending.died, pending.heir);
  }

  private render(sim: Simulation, died: Person, heir: Person | null): void {
    const household = died.householdId === null
      ? null
      : sim.householdsById.get(died.householdId);

    const milestones = died.chronicle
      .filter(entry => entry.kind === 'milestone')
      .slice(-6);
    const deeds = died.chronicle.length;
    const reckoning = reckon(sim, died);

    const relation = !heir ? '' :
      died.childIds.includes(heir.id) ? (heir.sex === 'female' ? 'their daughter' : 'their son') :
      heir.id === died.spouseId ? 'their widow' :
      'their kin';

    this.root.innerHTML =
      '<div class="succession-card">' +
      '<div class="succession-death">' + escapeHtml(died.fullName) + ' has died</div>' +
      '<div class="succession-cause">' + escapeHtml(died.causeOfDeath ?? 'unknown causes') +
        ', aged ' + died.years + '</div>' +

      (milestones.length > 0
        ? '<div class="succession-section">Their life</div>' +
          milestones.map(entry =>
            '<div class="succession-entry"><span>' +
            Math.floor(entry.ageDays / 80) + 'y</span>' +
            escapeHtml(entry.text) + '</div>').join('')
        : '<div class="succession-quiet">A quiet life, and no record of it.</div>') +

      reckoning.map(line =>
        '<div class="succession-entry succession-reckoning"><span>' + escapeHtml(line.label) +
        '</span>' + escapeHtml(line.text) + '</div>').join('') +

      '<div class="succession-tally">' + deeds +
        (deeds === 1 ? ' thing' : ' things') + ' remembered' +
        (household ? ' · ' + escapeHtml(household.name) + ' household' : '') +
      '</div>' +

      (heir
        ? '<div class="succession-section">The line continues</div>' +
          '<div class="succession-heir">' + escapeHtml(heir.fullName) + '</div>' +
          '<div class="succession-cause">' + escapeHtml(relation) + ', aged ' + heir.years +
            '</div>' +
          '<button class="hud-button succession-go">Continue as ' +
            escapeHtml(heir.name) + '</button>'
        : '<div class="succession-section">No heir</div>' +
          '<div class="succession-quiet">They left nobody behind. You will carry on ' +
          'as someone else of their band.</div>' +
          '<button class="hud-button succession-go">Carry on</button>') +
      '</div>';

    this.root.hidden = false;
    const button = this.root.querySelector('.succession-go') as HTMLButtonElement | null;
    if (button) {
      button.onclick = () => {
        const next = sim.takeUpSuccession();
        this.close();
        this.onContinue(next);
      };
    }
  }

  private close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }
}

/**
 * M11 phase 13e (owner's note 2): who they killed and what they raised.
 *
 * Neither is a milestone, so the six milestones above never showed either,
 * and a life that took three others or put up half the camp read the same as
 * one that did neither. Both are counted off the chronicle, from the fields
 * `emit` and a finished build stamp on their lines, with no new state. The
 * victims are named as the dead person knew them — through `Knowledge`,
 * because a stranger killed in the dark is still a stranger.
 */
function reckon(sim: Simulation, died: Person): { label: string; text: string }[] {
  const lines: { label: string; text: string }[] = [];

  const killed: string[] = [];
  for (const entry of died.chronicle) {
    if (entry.kind !== 'did' || entry.deed?.type !== 'murder' || entry.deed.targetId === null) continue;
    const victim = sim.peopleById.get(entry.deed.targetId);
    killed.push(victim ? knowledgeOfPerson(died, victim, sim.relationships).displayName : 'someone');
  }
  if (killed.length > 0) lines.push({ label: 'killed', text: killed.join(', ') });

  const raised = new Map<string, number>();
  for (const entry of died.chronicle) {
    if (entry.built) raised.set(entry.built, (raised.get(entry.built) ?? 0) + 1);
  }
  if (raised.size > 0) {
    lines.push({
      label: 'raised',
      text: [...raised].map(([id, n]) =>
        (BUILDINGS[id]?.label ?? id).toLowerCase() + (n > 1 ? ' ×' + n : '')).join(', '),
    });
  }
  return lines;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
