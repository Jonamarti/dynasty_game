import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import type { Case, OwnVerdict } from '../sim/social/Justice.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { t } from '../i18n/i18n.ts';

/** The player-chief's docket. A case stays here until the chief chooses. */
export class VerdictOverlay {
  private readonly root: HTMLElement;
  private shownKey: string | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'verdict-overlay';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  update(sim: Simulation): void {
    const chief = sim.player;
    const told = sim.pendingVerdicts[0];
    if (!chief || !told || !chief.alive || chief.bandId !== told.plaintiffBandId ||
      told.accusedBandId !== chief.bandId) {
      if (!this.root.hidden) this.close();
      return;
    }
    const key = `${told.plaintiffId}:${told.accusedId}:${told.tick}`;
    if (this.shownKey === key) return;
    this.shownKey = key;
    this.render(sim, chief, told);
  }

  private render(sim: Simulation, chief: Person, told: Case): void {
    const plaintiff = sim.peopleById.get(told.plaintiffId);
    const accused = sim.peopleById.get(told.accusedId);
    if (!plaintiff || !accused) return;
    const plaintiffName = knowledgeOfPerson(chief, plaintiff, sim.relationships).displayName;
    const accusedName = knowledgeOfPerson(chief, accused, sim.relationships).displayName;
    this.root.innerHTML =
      '<div class="verdict-card">' +
      '<div class="verdict-title">' + escapeHtml(t('A case awaits your verdict')) + '</div>' +
      '<div class="verdict-summary">' + escapeHtml(t('{plaintiff} accuses {accused}', {
        plaintiff: plaintiffName, accused: accusedName,
      })) + '</div>' +
      '<div class="verdict-kind">' + escapeHtml(t('The matter is {kind}', {
        kind: debtKindLabel(told.kind),
      })) + '</div>' +
      '<div class="verdict-actions">' +
      verdictButton('order', t('Order amends')) +
      verdictButton('shame', t('Public shame')) +
      verdictButton('dismiss', t('Dismiss the case')) +
      verdictButton('exile', t('Exile the accused')) +
      '</div></div>';
    this.root.hidden = false;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-verdict]')) {
      button.onclick = () => {
        const verdict = button.dataset.verdict as OwnVerdict;
        if (sim.resolveVerdict(chief, told, verdict)) {
          this.shownKey = null;
          this.close();
        }
      };
    }
  }

  private close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.shownKey = null;
  }
}

function verdictButton(verdict: OwnVerdict, label: string): string {
  return '<button class="hud-button verdict-button" data-verdict="' + verdict + '">' +
    escapeHtml(label) + '</button>';
}

function debtKindLabel(kind: Case['kind']): string {
  if (kind === 'theft') return t('theft');
  if (kind === 'threaten') return t('threat');
  return t('assault');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}
