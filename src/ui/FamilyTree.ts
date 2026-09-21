/**
 * A map of who somebody is descended from, and who descends from them.
 *
 * The second of phase 7's two visualisers, and it reuses the tech web's own
 * shape rather than inventing a new one: absolutely-positioned DOM nodes over
 * an inline `<svg>` of edges, a cached layout rebuilt only on a real change, a
 * digest that stops a sixty-times-a-second `update` from detaching whatever
 * the cursor is over.
 *
 * ## What it shows, and what it refuses to
 *
 * Opening it on somebody you have never met gets you the same veil the Ties
 * tab already gives their family — you do not know their family until you
 * know *them*. Passing that gate does not make every relative on the tree
 * yours to read, though: `FamilyTreeLayout` can pull in a spouse's parent or
 * a grandchild the player has never laid eyes on, and each one of those is
 * still routed through `knowledgeOfPerson` individually. A stranger on your
 * own family tree shows up as "a young man", not by name.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { layOutFamily, type FamilyLayout, type FamilyNode } from './FamilyTreeLayout.ts';
import { panelBox } from './PanelBox.ts';

export class FamilyTreeOverlay {
  private root: HTMLElement;
  private subject: Person | null = null;
  private sim: Simulation | null = null;
  private signature = '';

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'familytree';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-close]')) {
        this.close();
        return;
      }
      if (target === this.root) this.close();
    });

    window.addEventListener('keydown', event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(sim: Simulation, subject: Person | null): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    if (!subject) return;
    this.sim = sim;
    this.subject = subject;
    this.signature = '';
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.subject = null;
    this.sim = null;
    this.signature = '';
  }

  /** Redraws while open, so a birth or a death shows up without reopening it. */
  update(sim: Simulation): void {
    if (!this.isOpen) return;
    if (!this.subject || !this.subject.alive) {
      this.close();
      return;
    }
    this.sim = sim;
    this.render();
  }

  private render(): void {
    const sim = this.sim;
    const subject = this.subject;
    if (!sim || !subject) return;

    const observer = sim.player;
    const known = observer ? knowledgeOfPerson(observer, subject, sim.relationships) : null;
    const name = known ? known.displayName : subject.name;

    // The same gate `Hud.tabTies` puts on a family section: a stranger's
    // family is not yours to see until you know them at all.
    if (observer && known && known.level === 'stranger') {
      this.signature = 'veiled:' + subject.id;
      if (this.root.childElementCount > 0 &&
          this.root.firstElementChild?.querySelector('.familytree-veil')) return;
      this.root.innerHTML =
        '<div class="familytree-card">' +
        '<div class="familytree-head"><b>' + escapeHtml(name) + '</b>' +
        '<button class="familytree-close" data-close="1">close</button></div>' +
        '<div class="familytree-veil">You do not know their family until you know ' +
        'them. Spend time with them first.</div>' +
        '</div>';
      return;
    }

    const box = this.boxSize();
    const layout = layOutFamily(subject, sim.peopleById, box.width, box.height);

    const digest = this.digest(subject, layout, observer);
    if (digest === this.signature && this.root.childElementCount > 0) return;
    this.signature = digest;

    const edges = layout.edges.map(edge => {
      const from = layout.nodes.find(n => n.personId === edge.from);
      const to = layout.nodes.find(n => n.personId === edge.to);
      if (!from || !to) return '';
      return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) +
        '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) +
        '" class="familytree-edge is-' + edge.kind + '" />';
    }).join('');

    const nodes = layout.nodes.map(node => this.nodeHtml(node, sim, observer)).join('');

    this.root.innerHTML =
      '<div class="familytree-card">' +
      '<div class="familytree-head">' +
        '<b>' + escapeHtml(name) + '</b>' +
        '<span class="familytree-sub">' + layout.nodes.length +
          (layout.nodes.length === 1 ? ' person' : ' people') + ' on the tree</span>' +
        '<button class="familytree-close" data-close="1">close</button>' +
      '</div>' +
      '<div class="familytree-canvas" style="width:' + layout.width +
        'px;height:' + layout.height + 'px">' +
        '<svg class="familytree-edges" width="' + layout.width + '" height="' +
          layout.height + '">' + edges + '</svg>' +
        nodes +
      '</div>' +
      '</div>';
  }

  private nodeHtml(node: FamilyNode, sim: Simulation, observer: Person | null): string {
    const person = sim.peopleById.get(node.personId);
    if (!person) return '';
    const known = observer
      ? knowledgeOfPerson(observer, person, sim.relationships)
      : { displayName: person.name };
    const label = known.displayName + (person.alive ? '' : ' †');

    return '<div class="familytree-node' +
      (node.isSubject ? ' is-subject' : '') +
      (!person.alive ? ' is-dead' : '') + '"' +
      ' style="left:' + node.x.toFixed(1) + 'px;top:' + node.y.toFixed(1) + 'px">' +
      '<span class="familytree-name">' + escapeHtml(label) + '</span>' +
      '</div>';
  }

  /**
   * Everything that would change the picture, as one string.
   *
   * Includes each node's position (a birth or death changes the shape of the
   * tree itself), whether they are alive (the † marker), and the observer's
   * own knowledge of them — meeting a stranger on your own family tree for
   * the first time should put their name up without the panel having to be
   * closed and reopened.
   */
  private digest(subject: Person, layout: FamilyLayout, observer: Person | null): string {
    const sim = this.sim!;
    const parts = [String(subject.id)];
    for (const node of layout.nodes) {
      const person = sim.peopleById.get(node.personId);
      const known = person && observer
        ? knowledgeOfPerson(observer, person, sim.relationships)
        : null;
      parts.push(
        node.personId + ':' + node.x.toFixed(0) + ',' + node.y.toFixed(0) +
        ':' + (person?.alive ? '1' : '0') +
        ':' + (known ? known.displayName : '')
      );
    }
    return parts.join('|');
  }

  /** See `PanelBox.ts` — shared, because all three of these panels had it wrong. */
  private boxSize(): { width: number; height: number } {
    return panelBox(240, 1000, 760);
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
