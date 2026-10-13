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
 *
 * ## The colour of a line
 *
 * Since the owner's note of 2026-09-23 every kinship line is also drawn in the
 * colour of what the two people at its ends think of each other — green,
 * yellow or red, by `opinionTone`, the same rule the tribe graph uses — so a
 * son who cannot stand his father is visible on the tree. Only where the
 * player could have learned it: a line is coloured when the player knows the
 * ties of somebody at either end (`knowsTies`, the tribe graph's own gate), and
 * stays the plain grey of an unknown otherwise. Being your relative is not the
 * same as being somebody whose feelings you can read.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { knowledgeOfPerson, opinionTone } from '../sim/social/Knowledge.ts';
import { layOutFamily, type FamilyLayout, type FamilyNode } from './FamilyTreeLayout.ts';
import { panelBox } from './PanelBox.ts';
import { t, onLanguageChange } from '../i18n/i18n.ts';

export class FamilyTreeOverlay {
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

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'familytree';
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
      if (target === this.root) this.close();
    });

    // Keep movement in a transform. Rebuilding the canvas on every gesture
    // would detach the node under a finger and make a long family impossible
    // to inspect on a touch screen.
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
    this.viewportEl = null;
    this.canvasEl = null;
    this.pointers.clear();
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
        '<button class="familytree-close" data-close="1">' + t('close') + '</button></div>' +
        '<div class="familytree-veil">' +
        t('You do not know their family until you know them. Spend time with them first.') + '</div>' +
        '</div>';
      return;
    }

    const box = this.boxSize();
    const layout = layOutFamily(subject, sim.peopleById, box.width, box.height);
    if (this.viewportEl) {
      this.viewportEl.style.width = box.width + 'px';
      this.viewportEl.style.height = box.height + 'px';
    }

    const digest = this.digest(subject, layout, observer);
    if (digest === this.signature && this.root.childElementCount > 0) return;
    this.signature = digest;

    const edges = layout.edges.map(edge => {
      const from = layout.nodes.find(n => n.personId === edge.from);
      const to = layout.nodes.find(n => n.personId === edge.to);
      if (!from || !to) return '';
      const tone = this.edgeTone(edge.from, edge.to, observer);
      return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) +
        '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) +
        '" class="familytree-edge is-' + edge.kind + (tone ? ' is-' + tone : '') + '" />';
    }).join('');

    const nodes = layout.nodes.map(node => this.nodeHtml(node, sim, observer)).join('');

    this.root.innerHTML =
      '<div class="familytree-card">' +
      '<div class="familytree-head">' +
        '<b>' + escapeHtml(name) + '</b>' +
        '<span class="familytree-sub">' + (layout.nodes.length === 1
          ? t('{n} person on the tree', { n: 1 })
          : t('{n} people on the tree', { n: layout.nodes.length })) + '</span>' +
        '<button class="familytree-close" data-close="1">' + t('close') + '</button>' +
      '</div>' +
      '<div class="familytree-viewport" style="width:' + box.width + 'px;height:' +
        box.height + 'px">' +
        '<div class="familytree-canvas" style="width:' + layout.width +
          'px;height:' + layout.height + 'px">' +
          '<svg class="familytree-edges" width="' + layout.width + '" height="' +
            layout.height + '">' + edges + '</svg>' + nodes +
        '</div>' +
      '</div>' +
      '</div>';

    this.viewportEl = this.root.querySelector('.familytree-viewport');
    this.canvasEl = this.root.querySelector('.familytree-canvas');
    if (!this.fitted) this.fitToView(layout, box, subject);
    this.applyTransform();
  }

  private fitToView(layout: FamilyLayout, box: { width: number; height: number }, subject: Person): void {
    this.fitted = true;
    const whole = Math.min(1.1, box.width / layout.width, box.height / layout.height);
    // Preserve legible labels on narrow screens; show the subject's branch and
    // let the player pan to the rest instead of shrinking the entire family.
    this.zoom = Math.max(0.85, whole);
    const subjectNode = layout.nodes.find(node => node.personId === subject.id);
    const focusX = subjectNode?.x ?? layout.width / 2;
    const focusY = subjectNode?.y ?? layout.height / 2;
    this.panX = box.width / 2 - focusX * this.zoom;
    this.panY = box.height / 2 - focusY * this.zoom;
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

  /**
   * The colour of the line between two relatives, or null to leave it grey:
   * nobody at either end whose ties the player knows, or two people with no
   * opinion of each other at all (a grandchild born after a death).
   */
  private edgeTone(a: number, b: number, observer: Person | null): string | null {
    const sim = this.sim!;
    if (observer) {
      const readable = (id: number): boolean => {
        const person = sim.peopleById.get(id);
        return !!person && knowledgeOfPerson(observer, person, sim.relationships).knowsTies;
      };
      if (!readable(a) && !readable(b)) return null;
    }
    const opinion = sim.relationships.mutualOpinion(a, b);
    return opinion === null ? null : opinionTone(opinion);
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
    // The colour of every line, since the lines are drawn in what the two ends
    // think of each other and that can change with nobody moving at all.
    for (const edge of layout.edges) {
      parts.push('e' + edge.from + '-' + edge.to + ':' +
        (this.edgeTone(edge.from, edge.to, observer) ?? '-'));
    }
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
