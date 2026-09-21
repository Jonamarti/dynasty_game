/**
 * A map of somebody's ties, drawn as a sociogram rather than a list.
 *
 * The Ties tab already lists this in words, sorted by strength; this is the
 * same data laid out so the *shape* of a social circle is visible at a
 * glance — who is central, who is off to one side, and which two people the
 * subject knows cannot stand each other.
 *
 * **M9.5 phase 4e: it becomes a pyramid once the band has a shape.** When the
 * subject's band has the idea of `division_of_labour` the same sociogram is
 * drawn in rows — chief, heads of houses, the band, the children, and below
 * them anyone from elsewhere or cast out — with the rows named down the side
 * so the picture states what it is claiming. Until then it draws exactly as
 * it always did. Neither the rows nor the row a person is in is decided here:
 * `Simulation.ranksAround` answers both, off the same terms that decide
 * whether an order is obeyed.
 *
 * Gated on `knowsTies`, the same threshold `Hud.tabTies` uses for its own
 * "who they know" section — a plainer bar than the family tree's, because
 * unlike a family this can name people the subject actively dislikes, which
 * is a sharper thing to hand over than who their parents are.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { RANK_LABEL, RANK_ROW, type BandRank } from '../sim/social/Rank.ts';
import {
  layOutTribe, tribeMembers, type TribeLayout, type TribeNode,
} from './TribeGraphLayout.ts';
import { panelBox } from './PanelBox.ts';

/**
 * How coarsely the redraw digest reads a position and an opinion.
 *
 * Four pixels is under a tenth of a node's width, and five points is a
 * twentieth of the opinion scale — both far below what anybody can see, and
 * both far above the drift that made the panel rebuild itself every frame.
 */
const DIGEST_PIXELS = 4;
const DIGEST_OPINION = 5;

const quantise = (value: number, step: number): number => Math.round(value / step) * step;

export class TribeGraphOverlay {
  private root: HTMLElement;
  private subject: Person | null = null;
  private sim: Simulation | null = null;
  private signature = '';
  /**
   * Where the layout left everybody last frame, so the next one can carry on
   * from it rather than re-deriving the whole picture.
   *
   * M9.6 phase 2a, and the owner's note that the graph changes shape very fast.
   * Cleared whenever the panel opens or the subject changes — a new subject is
   * a different graph, and easing into it from somebody else's arrangement
   * would be worse than starting clean.
   */
  private settled: Map<number, { x: number; y: number }> | null = null;

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
    this.settled = null;
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.subject = null;
    this.sim = null;
    this.signature = '';
    this.settled = null;
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
    // The sticky set and the layout must be given the *same* membership, or the
    // ranks handed in cover a different set of people from the ones drawn —
    // `tribeMembers` exists for that reason and now takes who is already on
    // screen, so the marginal acquaintance stops flickering in and out.
    const sticky = this.settled ? new Set(this.settled.keys()) : null;
    const ranks = sim.ranksAround(subject, tribeMembers(subject.id, sim.relationships, sticky));
    const layout = layOutTribe(
      subject.id, sim.relationships, box.width, box.height, ranks, this.settled);
    this.settled = layout.settled;

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
    const rows = rowsHtml(layout);

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
        // Why the picture is suddenly in rows. A view that changes shape
        // without saying what changed it reads as a bug, and the cause here is
        // something the player can act on: somebody in the band had an idea.
        (layout.ranked
          ? '<span class="tribegraph-sub tribegraph-why">in ranks: this band ' +
            'divides its labour</span>'
          : '') +
        '<button class="tribegraph-close" data-close="1">close</button>' +
      '</div>' +
      '<div class="tribegraph-canvas" style="width:' + layout.width +
        'px;height:' + layout.height + 'px">' +
        '<svg class="tribegraph-edges" width="' + layout.width + '" height="' +
          layout.height + '">' + edges + '</svg>' +
        rows +
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
      (!person.alive ? ' is-dead' : '') +
      (node.rank ? ' is-' + node.rank : '') + '"' +
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
      // The rank belongs in the digest even though `y` is already here,
      // because the rank is drawn as well as positioned: it names the row and
      // rings the chief's node. A chief deposed the same day a head is raised
      // leaves the row *count* unchanged and every `y` where it was, and
      // without this the panel would go on calling the wrong person chief.
      // `layout.ranked` is in the digest below for the same reason.
      //
      // Positions and opinions are both *quantised* here, and that is M9.6
      // phase 2c rather than an optimisation. This digest decides whether to
      // rebuild the DOM, and rebuilding it is what detaches whatever the cursor
      // is hovering — the very problem it was written to prevent. At
      // full precision it was rebuilding on a single pixel of drift and on a
      // tenth of a point of familiarity, which is to say constantly. A node
      // that has moved less than a few pixels has not moved as far as the
      // player is concerned.
      parts.push(
        node.personId + ':' + quantise(node.x, DIGEST_PIXELS) +
        ',' + quantise(node.y, DIGEST_PIXELS) +
        ':' + (person?.alive ? '1' : '0') +
        ':' + quantise(node.subjectOpinion, DIGEST_OPINION) +
        ':' + (node.rank ?? '-') +
        ':' + (known ? known.displayName : '')
      );
    }
    for (const edge of layout.edges) {
      parts.push('e' + edge.from + '-' + edge.to + ':' + quantise(edge.opinion, DIGEST_OPINION));
    }
    parts.push(layout.ranked ? 'ranked' : 'flat');
    return parts.join('|');
  }

  /** See `PanelBox.ts` — shared, because all three of these panels had it wrong. */
  private boxSize(): { width: number; height: number } {
    return panelBox(240, 1000, 760);
  }
}

/**
 * The named bands the pyramid is drawn on, one per rung that has anybody on it.
 *
 * Drawn from the laid-out positions rather than from `RANK_ROW` directly: the
 * layout closes up empty rungs, so the only honest source for where a row
 * *is* on screen is where its people ended up. Every node in a row shares a
 * `y` exactly — `lockY` pins it and `fitInto` scales both axes by one
 * factor — so one node's position answers for the row.
 *
 * Emitted before the nodes so the nodes paint over it; a label the cursor
 * could catch instead of a person would break the hover rule in `AGENTS.md`,
 * which is why these are `pointer-events: none` in the stylesheet.
 */
function rowsHtml(layout: TribeLayout): string {
  if (!layout.ranked) return '';

  const rowY = new Map<BandRank, number>();
  for (const node of layout.nodes) {
    if (node.rank && !rowY.has(node.rank)) rowY.set(node.rank, node.y);
  }
  const rows = [...rowY.entries()].sort((a, b) => RANK_ROW[a[0]] - RANK_ROW[b[0]]);
  if (rows.length === 0) return '';

  // One row means no gap to measure, so fall back to the whole canvas.
  const gap = rows.length > 1 ? Math.abs(rows[1]![1] - rows[0]![1]) : layout.height;

  return rows.map(([rank, y], index) => {
    const top = index === 0 ? 0 : y - gap / 2;
    const bottom = index === rows.length - 1 ? layout.height : y + gap / 2;
    return '<div class="tribegraph-row is-' + rank + '"' +
      ' style="top:' + top.toFixed(1) + 'px;height:' +
      Math.max(0, bottom - top).toFixed(1) + 'px">' +
      '<span class="tribegraph-rowlabel">' + escapeHtml(RANK_LABEL[rank]) + '</span>' +
      '</div>';
  }).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
