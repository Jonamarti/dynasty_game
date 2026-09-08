/**
 * A map of somebody's ties, drawn as a sociogram rather than a list.
 *
 * The Ties tab already lists this in words, sorted by strength; this is the
 * same data laid out so the *shape* of a social circle is visible at a
 * glance — who is central, who is off to one side, and which two people the
 * subject knows cannot stand each other.
 *
 * Gated on `knowsTies`, the same threshold `Hud.tabTies` uses for its own
 * "who they know" section — a plainer bar than the family tree's, because
 * unlike a family this can name people the subject actively dislikes, which
 * is a sharper thing to hand over than who their parents are.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { layOutTribe, type TribeLayout, type TribeNode } from './TribeGraphLayout.ts';

export class TribeGraphOverlay {
  private root: HTMLElement;
  private subject: Person | null = null;
  private sim: Simulation | null = null;
  private signature = '';

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tribegraph';
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

    if (observer && known && !known.knowsTies) {
      this.signature = 'veiled:' + subject.id;
      if (this.root.childElementCount > 0 &&
          this.root.firstElementChild?.querySelector('.tribegraph-veil')) return;
      this.root.innerHTML =
        '<div class="tribegraph-card">' +
        '<div class="tribegraph-head"><b>' + escapeHtml(name) + '</b>' +
        '<button class="tribegraph-close" data-close="1">close</button></div>' +
        '<div class="tribegraph-veil">You would have to know them better to say ' +
        'who they answer to, or who they cannot stand.</div>' +
        '</div>';
      return;
    }

    const box = this.boxSize();
    const layout = layOutTribe(subject.id, sim.relationships, box.width, box.height);

    const digest = this.digest(layout, observer);
    if (digest === this.signature && this.root.childElementCount > 0) return;
    this.signature = digest;

    const edges = layout.edges.map(edge => {
      const from = layout.nodes.find(n => n.personId === edge.from);
      const to = layout.nodes.find(n => n.personId === edge.to);
      if (!from || !to) return '';
      const positive = edge.opinion >= 0;
      const width = Math.min(3.4, 0.6 + Math.abs(edge.opinion) / 30);
      return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) +
        '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) +
        '" class="tribegraph-edge ' + (positive ? 'is-pos' : 'is-neg') +
        '" stroke-width="' + width.toFixed(1) + '" />';
    }).join('');

    const nodes = layout.nodes.map(node => this.nodeHtml(node, sim, observer)).join('');

    const shown = layout.nodes.length - 1;
    const total = sim.relationships.knownBy(subject.id).length;
    this.root.innerHTML =
      '<div class="tribegraph-card">' +
      '<div class="tribegraph-head">' +
        '<b>' + escapeHtml(name) + '</b>' +
        '<span class="tribegraph-sub">' +
          (total > shown
            ? 'the ' + shown + ' strongest of ' + total + ' they know'
            : shown + (shown === 1 ? ' person they know' : ' people they know')) +
        '</span>' +
        '<button class="tribegraph-close" data-close="1">close</button>' +
      '</div>' +
      '<div class="tribegraph-canvas" style="width:' + layout.width +
        'px;height:' + layout.height + 'px">' +
        '<svg class="tribegraph-edges" width="' + layout.width + '" height="' +
          layout.height + '">' + edges + '</svg>' +
        nodes +
      '</div>' +
      '</div>';
  }

  private nodeHtml(node: TribeNode, sim: Simulation, observer: Person | null): string {
    const person = sim.peopleById.get(node.personId);
    if (!person) return '';
    const known = observer
      ? knowledgeOfPerson(observer, person, sim.relationships)
      : { displayName: person.name };
    const label = known.displayName + (person.alive ? '' : ' †');
    const positive = node.subjectOpinion >= 0;

    return '<div class="tribegraph-node' +
      (node.isSubject ? ' is-subject' : positive ? ' is-pos' : ' is-neg') +
      (!person.alive ? ' is-dead' : '') + '"' +
      ' style="left:' + node.x.toFixed(1) + 'px;top:' + node.y.toFixed(1) + 'px">' +
      '<span class="tribegraph-name">' + escapeHtml(label) + '</span>' +
      '</div>';
  }

  private digest(layout: TribeLayout, observer: Person | null): string {
    const sim = this.sim!;
    // Not just the shown nodes: the head line reports the *total* the subject
    // knows against the capped count on screen, and that total can grow
    // without any of the capped set changing.
    const parts: string[] = [String(sim.relationships.knownBy(layout.nodes[0]!.personId).length)];
    for (const node of layout.nodes) {
      const person = sim.peopleById.get(node.personId);
      const known = person && observer
        ? knowledgeOfPerson(observer, person, sim.relationships)
        : null;
      parts.push(
        node.personId + ':' + node.x.toFixed(0) + ',' + node.y.toFixed(0) +
        ':' + (person?.alive ? '1' : '0') +
        ':' + Math.round(node.subjectOpinion) +
        ':' + (known ? known.displayName : '')
      );
    }
    for (const edge of layout.edges) {
      parts.push('e' + edge.from + '-' + edge.to + ':' + Math.round(edge.opinion));
    }
    return parts.join('|');
  }

  private boxSize(): { width: number; height: number } {
    const step = 80;
    const width = Math.max(480, Math.min(1000,
      Math.round((window.innerWidth - 240) / step) * step));
    const height = Math.max(380, Math.min(760,
      Math.round((window.innerHeight - 160) / step) * step));
    return { width, height };
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
