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
import { knowledgeOfPerson, opinionTone } from '../sim/social/Knowledge.ts';
import { RANK_LABEL, RANK_ROW, type BandRank } from '../sim/social/Rank.ts';
import {
  layOutTribe, tribeMembers, type TribeLayout, type TribeNode,
} from './TribeGraphLayout.ts';
import { panelBox } from './PanelBox.ts';
import { t, onLanguageChange } from '../i18n/i18n.ts';

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
  private viewportEl: HTMLElement | null = null;
  private canvasEl: HTMLElement | null = null;
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private fitted = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pointerStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private pinchStartGap = 0;
  private pinchStartZoom = 1;
  private pinchStartPan = { x: 0, y: 0 };
  private dragMoved = false;
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
  /**
   * Whether people from other bands are drawn as well as the subject's own.
   *
   * Off by default since the owner's note of 2026-09-23 — *"members of other
   * tribes are shown in the tribe visualizer"* — because a panel called the
   * tribe graph that opens on a crowd of neighbours reads as the wrong picture.
   * Kept as a switch rather than removed: who in the band has friends or
   * enemies across the border is exactly what the coming conflict turns on.
   * Survives closing the panel, so a player who wants them on says so once.
   */
  private showOthers = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tribegraph';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      if (this.dragMoved) {
        this.dragMoved = false;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('[data-close]')) {
        this.close();
        return;
      }
      if (target.closest('[data-others]')) {
        this.showOthers = !this.showOthers;
        // A different membership is a different graph; easing into it from
        // the old arrangement would drag the survivors across the screen.
        this.settled = null;
        this.fitted = false;
        this.signature = '';
        this.render();
        return;
      }
      if (target === this.root) this.close();
    });

    // Gestures change only the canvas transform. Rebuilding the graph while
    // the pointer is over a name would detach it and make touch exploration
    // frustrating on the small-screen view.
    this.root.addEventListener('pointerdown', event => {
      if (!this.viewportEl?.contains(event.target as Node)) return;
      this.viewportEl.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.pointerStart = { x: event.clientX, y: event.clientY };
        this.panStart = { x: this.panX, y: this.panY };
        this.dragMoved = false;
        this.viewportEl.classList.add('is-panning');
      } else if (this.pointers.size === 2) {
        this.dragMoved = true;
        this.pinchStartGap = this.pointerGap();
        this.pinchStartZoom = this.zoom;
        this.pinchStartPan = { x: this.panX, y: this.panY };
      }
      event.preventDefault();
    });
    this.root.addEventListener('pointermove', event => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        const gap = this.pointerGap();
        if (this.pinchStartGap > 0 && gap > 0) {
          const points = [...this.pointers.values()];
          this.zoomAt((points[0]!.x + points[1]!.x) / 2,
            (points[0]!.y + points[1]!.y) / 2, gap / this.pinchStartGap,
            this.pinchStartZoom, this.pinchStartPan);
        }
        this.dragMoved = true;
      } else {
        const dx = event.clientX - this.pointerStart.x;
        const dy = event.clientY - this.pointerStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.dragMoved = true;
        this.panX = this.panStart.x + dx;
        this.panY = this.panStart.y + dy;
        this.applyTransform();
      }
      event.preventDefault();
    });
    const endPointer = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 1) {
        const remaining = [...this.pointers.values()][0]!;
        this.pointerStart = { x: remaining.x, y: remaining.y };
        this.panStart = { x: this.panX, y: this.panY };
        this.pinchStartGap = 0;
      } else if (this.pointers.size === 0) {
        this.pinchStartGap = 0;
      }
      if (this.pointers.size === 0) this.viewportEl?.classList.remove('is-panning');
    };
    this.root.addEventListener('pointerup', endPointer);
    this.root.addEventListener('pointercancel', endPointer);
    this.root.addEventListener('wheel', event => {
      if (!this.viewportEl?.contains(event.target as Node)) return;
      event.preventDefault();
      this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    // The digest says nothing about language, so a switch would leave the old
    // words up until something else changed.
    onLanguageChange(() => {
      this.signature = '';
      this.root.innerHTML = '';
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
    this.panX = this.panY = 0;
    this.zoom = 1;
    this.fitted = false;
    this.pointers.clear();
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
    this.viewportEl = null;
    this.canvasEl = null;
    this.pointers.clear();
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
        '<button class="tribegraph-close" data-close="1">' + t('close') + '</button></div>' +
        '<div class="tribegraph-veil">' +
        t('You would have to know them better to say who they answer to, or who they cannot stand.') +
        '</div>' +
        '</div>';
      return;
    }

    const viewport = this.boxSize();
    if (this.viewportEl) {
      this.viewportEl.style.width = viewport.width + 'px';
      this.viewportEl.style.height = viewport.height + 'px';
    }
    // Keep layout coordinates on the same 1000×760 reference box at every
    // screen size. `panelBox` describes the visible window; using its mobile
    // width for layout compressed a whole tribe into a narrow strip.
    const box = { width: 1000, height: 760 };
    // The sticky set and the layout must be given the *same* membership, or the
    // ranks handed in cover a different set of people from the ones drawn —
    // `tribeMembers` exists for that reason and now takes who is already on
    // screen, so the marginal acquaintance stops flickering in and out.
    const sticky = this.settled ? new Set(this.settled.keys()) : null;
    const include = this.includer(subject);
    const ranks = sim.ranksAround(subject,
      tribeMembers(subject.id, sim.relationships, sticky, include));
    const layout = layOutTribe(
      subject.id, sim.relationships, box.width, box.height, ranks, this.settled, include);
    this.settled = layout.settled;

    const digest = this.digest(layout, observer);
    if (digest === this.signature && this.root.childElementCount > 0) return;
    this.signature = digest;

    const edges = layout.edges.map(edge => {
      const from = layout.nodes.find(n => n.personId === edge.from);
      const to = layout.nodes.find(n => n.personId === edge.to);
      if (!from || !to) return '';
      const width = Math.min(3.4, 0.6 + Math.abs(edge.opinion) / 30);
      return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) +
        '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) +
        '" class="tribegraph-edge is-' + opinionTone(edge.opinion) +
        '" stroke-width="' + width.toFixed(1) + '" />';
    }).join('');

    const nodes = layout.nodes.map(node => this.nodeHtml(node, sim, observer)).join('');
    const rows = rowsHtml(layout);

    const shown = layout.nodes.length - 1;
    const { living: total, dead, elsewhere } = this.countKnown(subject);
    this.root.innerHTML =
      '<div class="tribegraph-card">' +
      '<div class="tribegraph-head">' +
        '<b>' + escapeHtml(name) + '</b>' +
        '<span class="tribegraph-sub">' +
          (total > shown
            ? t('the {n} strongest of {total} they know', { n: shown, total })
            : shown === 1
              ? t('{n} person they know', { n: 1 })
              : t('{n} people they know', { n: shown })) +
          (dead > 0 ? t(', and {n} dead', { n: dead }) : '') +
          (elsewhere > 0 ? ' · ' + t('{n} from other bands hidden', { n: elsewhere }) : '') +
        '</span>' +
        // Why the picture is suddenly in rows. A view that changes shape
        // without saying what changed it reads as a bug, and the cause here is
        // something the player can act on: somebody in the band had an idea.
        (layout.ranked
          ? '<span class="tribegraph-sub tribegraph-why">' +
            t('in ranks: this band divides its labour') + '</span>'
          : '') +
        '<button class="tribegraph-toggle' + (this.showOthers ? ' is-on' : '') +
          '" data-others="1">' + (this.showOthers ? t('own band only') : t('other bands too')) +
          '</button>' +
        '<button class="tribegraph-close" data-close="1">' + t('close') + '</button>' +
      '</div>' +
      '<div class="tribegraph-viewport" style="width:' + viewport.width +
        'px;height:' + viewport.height + 'px">' +
      '<div class="tribegraph-canvas" style="width:' + layout.width +
        'px;height:' + layout.height + 'px">' +
        '<svg class="tribegraph-edges" width="' + layout.width + '" height="' +
          layout.height + '">' + edges + '</svg>' +
        rows +
        nodes +
      '</div>' +
      '</div></div>';
    this.viewportEl = this.root.querySelector('.tribegraph-viewport');
    this.canvasEl = this.root.querySelector('.tribegraph-canvas');
    if (!this.fitted) this.fitToView(layout, viewport);
    this.applyTransform();
  }

  /**
   * Who the graph may draw: the living, and — unless the switch is on — only
   * those who live in the subject's own band.
   */
  private includer(subject: Person): (id: number) => boolean {
    const sim = this.sim!;
    const home = sim.bandIdOf(subject);
    return id => {
      const person = sim.peopleById.get(id);
      if (!person?.alive) return false;
      return this.showOthers || sim.bandIdOf(person) === home;
    };
  }

  /**
   * Everybody the subject has feelings about, split three ways: the living the
   * graph may draw, the dead, and the living it is hiding because they belong
   * to another band. The last is said in the head line so the switch is never
   * a mystery — a graph that silently drops half somebody's friends reads as
   * the friends having gone.
   */
  private countKnown(subject: Person): { living: number; dead: number; elsewhere: number } {
    const sim = this.sim!;
    const include = this.includer(subject);
    let living = 0;
    let dead = 0;
    let elsewhere = 0;
    for (const tie of sim.relationships.knownBy(subject.id)) {
      const person = sim.peopleById.get(tie.subjectId);
      if (!person?.alive) dead++;
      else if (include(tie.subjectId)) living++;
      else elsewhere++;
    }
    return { living, dead, elsewhere };
  }

  private nodeHtml(node: TribeNode, sim: Simulation, observer: Person | null): string {
    const person = sim.peopleById.get(node.personId);
    if (!person) return '';
    const known = observer
      ? knowledgeOfPerson(observer, person, sim.relationships)
      : { displayName: person.name };
    const label = known.displayName + (person.alive ? '' : ' †');
    return '<div class="tribegraph-node' +
      (node.isSubject ? ' is-subject' : ' is-' + opinionTone(node.subjectOpinion)) +
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
    // Both counts, since 13c: somebody dying changes the head line's "and N
    // dead" without necessarily changing anything else on screen.
    const subject = sim.peopleById.get(layout.nodes[0]!.personId)!;
    const counts = this.countKnown(subject);
    const parts: string[] = [
      counts.living + '/' + counts.dead + '/' + counts.elsewhere,
      this.showOthers ? 'all' : 'own',
    ];
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

  private fitToView(layout: TribeLayout, viewport: { width: number; height: number }): void {
    this.fitted = true;
    const whole = Math.min(1.1, viewport.width / layout.width, viewport.height / layout.height);
    // Keep names readable on a phone; open on the selected person and let the
    // player pan to the rest of a wide tribe.
    this.zoom = Math.max(0.85, whole);
    const subject = layout.nodes.find(node => node.isSubject);
    this.panX = viewport.width / 2 - (subject?.x ?? layout.width / 2) * this.zoom;
    this.panY = viewport.height / 2 - (subject?.y ?? layout.height / 2) * this.zoom;
  }

  private pointerGap(): number {
    const points = [...this.pointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
  }

  private zoomAt(
    clientX: number, clientY: number, factor: number,
    fromZoom = this.zoom, fromPan = { x: this.panX, y: this.panY }
  ): void {
    if (!this.viewportEl) return;
    const rect = this.viewportEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const worldX = (x - fromPan.x) / fromZoom;
    const worldY = (y - fromPan.y) / fromZoom;
    this.zoom = Math.max(0.35, Math.min(2.5, fromZoom * factor));
    this.panX = x - worldX * this.zoom;
    this.panY = y - worldY * this.zoom;
    this.applyTransform();
  }

  private applyTransform(): void {
    if (!this.canvasEl) return;
    this.canvasEl.style.transform = 'translate(' + this.panX.toFixed(1) + 'px,' +
      this.panY.toFixed(1) + 'px) scale(' + this.zoom.toFixed(3) + ')';
    this.canvasEl.dataset.zoom = this.zoom.toFixed(3);
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
      '<span class="tribegraph-rowlabel">' + escapeHtml(t(RANK_LABEL[rank])) + '</span>' +
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
