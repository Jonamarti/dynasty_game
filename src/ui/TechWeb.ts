/**
 * A map of one person's mind.
 *
 * The visualiser for M6b's synthesis layer, and equally the instrument for
 * telling whether it works. The project already values this pairing: `npm run
 * why` and the HUD render the *same* `lastScores` table two ways, and a score
 * table that looks wrong in play is the one the tools print. This is that idea
 * applied to knowledge — the web draws the same `TECH` table and the same
 * `Notice` that `KnowledgeSystem.tryConceive` decides on, so a picture that
 * looks wrong is a simulation that is wrong.
 *
 * ## What it shows, and what it refuses to
 *
 * One person's knowledge, routed through `social/Knowledge.ts` like everything
 * else. A map of somebody's mind is the single easiest way to hand the player
 * the god's-eye view the whole design is built to withhold, so opening it on a
 * stranger gets you the veil and nothing else.
 *
 * ## Why the hover text matters more than the picture
 *
 * Hovering a node answers *why not*: which ingredients of each spark are
 * satisfied and which are missing. That is the standing "if the simulation
 * refuses, the UI says why" rule applied to discovery, and it is what makes the
 * web teach the player how the world works rather than merely decorate it. The
 * words come from `describeIngredient` in the simulation, beside the predicate
 * that tests them, so the panel cannot drift into describing a spark that no
 * longer exists.
 *
 * DOM nodes over an inline `<svg>` of edges, rather than a canvas, following
 * `RadialMenu`'s reasoning: hit-testing, hover states, focus and text layout are
 * free here and fiddly on a canvas, and this is not the part of the project
 * worth spending frame budget on.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { TECH, TECH_EFFECTS, prerequisitesMet, type Tech } from '../sim/knowledge/Tech.ts';
import {
  describeIngredient, sparkStatus, STAGE_LABELS, type Notice, type Spark,
} from '../sim/knowledge/Synthesis.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { knowledgeOfPerson } from '../sim/social/Knowledge.ts';
import { layOutWeb, DOMAIN_COLORS, type WebLayout } from './TechWebLayout.ts';

/** How a node stands with respect to the person whose web this is. */
type NodeState = 'proven' | 'working' | 'conceivable' | 'understood' | 'unknown';

const STATE_NOTE: Record<NodeState, string> = {
  proven: 'Known, and theirs to teach.',
  working: 'An idea they are working on.',
  conceivable: 'Could occur to them right now.',
  understood: 'They could understand it. Nothing has suggested it.',
  unknown: 'Out of reach: something it rests on is missing.',
};

/** Wheel notches multiply zoom by this, in or out. */
const ZOOM_STEP = 1.12;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
/** Below this, nodes collapse to unlabelled chips — see the `.is-far` CSS. */
const CHIP_ZOOM = 0.55;
/** Pixels of mouse movement before a press counts as a pan rather than a click. */
const DRAG_THRESHOLD = 4;

export class TechWebOverlay {
  private root: HTMLElement;
  /**
   * The whole web's arrangement. Computed once, ever — unlike the rest of
   * this panel's state it does not depend on which subject the panel is open
   * on, or on how big the window is, because there is no box it has to fit
   * into any more. See `layOutWeb`'s own comment.
   */
  private layout: WebLayout | null = null;
  private subject: Person | null = null;
  private sim: Simulation | null = null;
  private focused: Tech | null = null;

  // --- Pan and zoom ----------------------------------------------------
  // The fix for the box the layout used to be squeezed into: the arrangement
  // is laid out at its natural size and the player moves a viewport over it,
  // the same relationship the game's own camera has to the world.
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  /** True once `fitToView` has run for the subject currently open. */
  private fitted = false;
  private dragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private viewportEl: HTMLElement | null = null;
  private canvasEl: HTMLElement | null = null;

  /**
   * A digest of everything currently on screen, so a redraw only happens when
   * something actually changed.
   *
   * Not an optimisation — a correctness fix. `update` runs every frame, and
   * rebuilding `innerHTML` sixty times a second detaches whatever node the
   * cursor is over before a hover can land on it. The panel was unusable and
   * Playwright said so in as many words: "element was detached from the DOM,
   * retrying", a hundred times over. Panning and zooming go through
   * `applyTransform` instead, which touches only a `style.transform` and
   * never rebuilds anything, for exactly the same reason.
   */
  private signature = '';

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'techweb';
    this.root.hidden = true;
    container.appendChild(this.root);

    // One delegated listener dispatching on `data-*`, the same shape the HUD
    // panel uses. The alternative is rebinding a handler per node on every
    // render, which is how a panel comes to leak listeners.
    this.root.addEventListener('mouseover', event => {
      const node = (event.target as HTMLElement).closest('[data-tech]');
      if (!node) return;
      this.focus(node.getAttribute('data-tech') as Tech);
    });
    this.root.addEventListener('click', event => {
      // A drag that happened to end over a node or the backdrop is a pan, not
      // a click on either of them — `mousedown` armed this and `mouseup`
      // below leaves it set for exactly this one event.
      if (this.dragMoved) {
        this.dragMoved = false;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('[data-close]')) {
        this.close();
        return;
      }
      const node = target.closest('[data-tech]');
      if (node) {
        this.focus(node.getAttribute('data-tech') as Tech);
        return;
      }
      // A click on the backdrop itself dismisses; a click inside the card does
      // not, or reading the detail pane would close the thing you were reading.
      if (target === this.root) this.close();
    });

    // Panning: a plain mouse drag over the viewport. `mousemove`/`mouseup` are
    // on `window` rather than the viewport so a drag that leaves the panel
    // before releasing the button still ends cleanly.
    this.root.addEventListener('mousedown', event => {
      if (event.button !== 0 || !this.viewportEl?.contains(event.target as Node)) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
      this.viewportEl.classList.add('is-panning');
    });
    window.addEventListener('mousemove', event => {
      if (!this.dragging) return;
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) this.dragMoved = true;
      this.panX = this.panStartX + dx;
      this.panY = this.panStartY + dy;
      this.applyTransform();
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.viewportEl?.classList.remove('is-panning');
    });

    // Zooming: the wheel, centred on the cursor so the technology under it
    // stays under it rather than the view recentring on the middle of the box.
    this.root.addEventListener('wheel', event => {
      if (!this.viewportEl?.contains(event.target as Node)) return;
      event.preventDefault();
      this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    }, { passive: false });

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

  /** Opens on a person, or closes if it is already open. */
  toggle(sim: Simulation, subject: Person | null): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    if (!subject) return;
    this.sim = sim;
    this.subject = subject;
    this.focused = null;
    this.fitted = false;
    this.signature = '';
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.subject = null;
    this.sim = null;
    this.focused = null;
    this.viewportEl = null;
    this.canvasEl = null;
    this.signature = '';
  }

  /**
   * Redraws while open, so a breakthrough shows up without reopening the panel.
   *
   * Cheap because the layout is cached: only the node classes and the detail
   * pane are rebuilt, and the arrangement — the expensive part — is computed
   * once, ever.
   */
  update(sim: Simulation): void {
    if (!this.isOpen) return;
    if (!this.subject || !this.subject.alive) {
      this.close();
      return;
    }
    this.sim = sim;
    this.render();
  }

  private focus(tech: Tech): void {
    if (this.focused === tech) return;
    this.focused = tech;
    this.render();
  }

  /** Sets the view so the whole web fits in the box, centred. Runs once per open. */
  private fitToView(layout: WebLayout, box: { width: number; height: number }): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(1.1, box.width / layout.width, box.height / layout.height));
    this.panX = (box.width - layout.width * this.zoom) / 2;
    this.panY = (box.height - layout.height * this.zoom) / 2;
    this.fitted = true;
  }

  /** Zooms about a screen point, keeping whatever is under it in place. */
  private zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!this.viewportEl) return;
    const rect = this.viewportEl.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - this.panX) / this.zoom;
    const worldY = (localY - this.panY) / this.zoom;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    this.panX = localX - worldX * this.zoom;
    this.panY = localY - worldY * this.zoom;
    this.applyTransform();
  }

  /**
   * Writes the current pan and zoom to the DOM without touching anything else.
   *
   * The whole reason panning and zooming are cheap: a wheel notch or a mouse
   * move only ever calls this, never `render`, so sixty small transform
   * updates a second cost nothing and never risk detaching a hovered node.
   */
  private applyTransform(): void {
    if (!this.canvasEl) return;
    this.canvasEl.style.transform =
      'translate(' + this.panX.toFixed(1) + 'px,' + this.panY.toFixed(1) + 'px) ' +
      'scale(' + this.zoom.toFixed(3) + ')';
    this.canvasEl.classList.toggle('is-far', this.zoom < CHIP_ZOOM);
  }

  /**
   * Everything that would change the picture, as one string.
   *
   * Cheap: ten nodes, a handful of fields each, once a frame. Deliberately
   * includes the *notice* — what the subject is holding, feeling and standing
   * on — because that is what moves a node between "could occur to them right
   * now" and "nothing has suggested it", and a web that did not notice somebody
   * putting a hide down would be quietly lying.
   */
  private digest(subject: Person, notice: Notice): string {
    // The records are in the digest because a stone cut on the far side of the
    // island changes what this panel says about a node, and a panel that
    // redraws only on its subject's own changes would go on showing the old
    // reading until something else happened to them. Pan and zoom are
    // deliberately absent: they go through `applyTransform`, not a rebuild,
    // and including them here would mean every wheel notch fought this method
    // for the right to touch the DOM.
    const parts = [subject.id, this.focused ?? '-',
      this.sim ? [...this.sim.recordedTech].sort().join(',') : ''];
    for (const tech of Object.keys(TECH) as Tech[]) {
      const idea = subject.ideaFor(tech);
      parts.push(tech + ':' + this.stateOf(subject, tech, notice) +
        ':' + (subject.techLevel.get(tech) ?? 0) +
        // `proof` and `trials` belong here as much as insight does: while a
        // design is on the bench they are the only things moving, so leaving
        // them out would freeze the pane on the one stage that has a bar the
        // player is watching.
        ':' + (idea
          ? idea.stage + Math.round(idea.insight * 100) + idea.failedTests +
            '/' + Math.round(idea.proof * 100) + '/' + idea.trials
          : '-'));
    }
    return parts.join('|');
  }

  private render(): void {
    const sim = this.sim;
    const subject = this.subject;
    if (!sim || !subject) return;

    const observer = sim.player;
    const known = observer
      ? knowledgeOfPerson(observer, subject, sim.relationships)
      : null;
    const name = known ? known.displayName : subject.name;

    // Gated exactly like the Self tab. What somebody has worked out is as
    // private as what they are good at, and a map of it more so.
    if (observer && known && !known.knowsCharacter) {
      this.signature = 'veiled:' + subject.id;
      this.viewportEl = null;
      this.canvasEl = null;
      if (this.root.childElementCount > 0 &&
          this.root.firstElementChild?.querySelector('.techweb-veil')) return;
      this.root.innerHTML =
        '<div class="techweb-card">' +
        '<div class="techweb-head"><b>' + escapeHtml(name) + '</b>' +
        '<button class="techweb-close" data-close="1">close</button></div>' +
        '<div class="techweb-veil">What somebody has worked out for themselves, ' +
        'you learn by knowing them. Spend time with them first.</div>' +
        '</div>';
      return;
    }

    const box = this.boxSize();
    this.layout ??= layOutWeb();
    const layout = this.layout;
    const notice = sim.noticeOf(subject);

    const digest = this.digest(subject, notice);
    const rebuild = digest !== this.signature || this.root.childElementCount === 0;
    this.signature = digest;
    if (!this.fitted) this.fitToView(layout, box);
    if (!rebuild) {
      // Still worth doing on an otherwise-quiet frame: the window can be
      // resized while the panel is open, and the viewport box needs to track
      // it even though nothing about the web itself changed.
      if (this.viewportEl) {
        this.viewportEl.style.width = box.width + 'px';
        this.viewportEl.style.height = box.height + 'px';
      }
      this.applyTransform();
      return;
    }

    const edges = layout.edges.map(edge => {
      const from = layout.nodes.find(n => n.tech === edge.from)!;
      const to = layout.nodes.find(n => n.tech === edge.to)!;
      const lit = subject.knownTech.has(edge.from) && subject.knownTech.has(edge.to);
      return '<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) +
        '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) +
        '" class="techweb-edge is-' + edge.kind + (lit ? ' is-lit' : '') + '" />';
    }).join('');

    const nodes = layout.nodes.map(node => {
      const state = this.stateOf(subject, node.tech, notice);
      const def = TECH[node.tech];
      const idea = subject.ideaFor(node.tech);
      const level = subject.techLevel.get(node.tech) ?? 0;
      const colour = DOMAIN_COLORS[node.domain];

      // A technology out of reach shows as an unlabelled dark node, so the
      // *shape* of what is unknown is visible without its content being given
      // away. Naming everything would turn the web into a walkthrough.
      const label = state === 'unknown' ? '' : escapeHtml(def.label);
      const pips = state === 'proven' && def.maxRefinement > 0
        ? '<i class="techweb-pips">' + '●'.repeat(level) +
          '○'.repeat(Math.max(0, def.maxRefinement - level)) + '</i>'
        : '';
      const ring = idea && state === 'working'
        ? '<i class="techweb-ring" style="--insight:' +
          Math.round(idea.insight * 100) + '%"></i>'
        : '';

      // A scroll on anything this person does not know that is written down
      // somewhere. The second reading the web gains from phase 4, and the one
      // that turns it from a map of a mind into a map of what a mind could
      // *recover*: a ghosted node with a scroll on it is a technology nobody
      // here understands and somebody, once, cut into a stone.
      const written = !subject.knownTech.has(node.tech) && sim.recordedTech.has(node.tech)
        ? '<i class="techweb-scroll" title="written down somewhere">\u{1FAA8}</i>'
        : '';

      return '<button class="techweb-node is-' + state +
        (this.focused === node.tech ? ' is-focused' : '') +
        '" data-tech="' + node.tech + '"' +
        ' style="left:' + node.x.toFixed(1) + 'px;top:' + node.y.toFixed(1) +
        'px;--domain:' + colour + '">' +
        ring + written +
        '<span class="techweb-name">' + label + '</span>' + pips +
        '</button>';
    }).join('');

    const counts = layout.nodes.reduce((tally, node) => {
      tally[this.stateOf(subject, node.tech, notice)]++;
      return tally;
    }, { proven: 0, working: 0, conceivable: 0, understood: 0, unknown: 0 } as
      Record<NodeState, number>);

    this.root.innerHTML =
      '<div class="techweb-card">' +
      '<div class="techweb-head">' +
        '<b>' + escapeHtml(name) + '</b>' +
        '<span class="techweb-sub">' + counts.proven + ' known &middot; ' +
          counts.working + ' in hand &middot; ' + counts.conceivable +
          ' within reach &middot; ' + counts.unknown + ' out of sight' +
          ' &middot; drag to pan, wheel to zoom</span>' +
        '<button class="techweb-close" data-close="1">close</button>' +
      '</div>' +
      '<div class="techweb-body">' +
        '<div class="techweb-viewport" style="width:' + box.width +
          'px;height:' + box.height + 'px">' +
          '<div class="techweb-canvas" style="width:' + layout.width +
            'px;height:' + layout.height + 'px">' +
            '<svg class="techweb-edges" width="' + layout.width + '" height="' +
              layout.height + '">' + edges + '</svg>' +
            nodes +
          '</div>' +
        '</div>' +
        '<div class="techweb-detail">' + this.detail(subject, notice) + '</div>' +
      '</div>' +
      '</div>';

    this.viewportEl = this.root.querySelector('.techweb-viewport');
    this.canvasEl = this.root.querySelector('.techweb-canvas');
    this.applyTransform();
  }

  /** How one node stands, in the five states the plan names. */
  private stateOf(subject: Person, tech: Tech, notice: Notice): NodeState {
    if (subject.knownTech.has(tech)) return 'proven';
    if (subject.ideaFor(tech)) return 'working';
    if (!prerequisitesMet(tech, subject.knownTech)) return 'unknown';
    const anyFires = TECH[tech].sparks.some(
      spark => sparkStatus(spark, notice).missing.length === 0);
    return anyFires ? 'conceivable' : 'understood';
  }

  /**
   * The pane that answers "why not".
   *
   * The whole reason this panel is worth building. A tree that shows you a
   * locked node and nothing else is a list of things you cannot have; a node
   * that tells you it wants you to be cold while holding a hide is the game
   * teaching you how it works.
   */
  private detail(subject: Person, notice: Notice): string {
    if (!this.focused) {
      return '<div class="techweb-hint">Hover a node. Lit is known, ringed is ' +
        'being worked on, outlined could occur to them today, faint is ' +
        'understandable but unsuggested, and dark is out of reach.</div>';
    }

    const tech = this.focused;
    const def = TECH[tech];
    const state = this.stateOf(subject, tech, notice);
    const idea = subject.ideaFor(tech);

    // An unreachable node keeps its secrets, minus the one thing worth saying:
    // what it is waiting for.
    if (state === 'unknown') {
      const missing = def.requires.filter(required => !subject.knownTech.has(required));
      return '<div class="techweb-title">Something out of reach</div>' +
        '<div class="techweb-note">It rests on ' +
        missing.map(required =>
          subject.knownTech.has(required)
            ? escapeHtml(TECH[required].label)
            : (prerequisitesMet(required, subject.knownTech)
                ? escapeHtml(TECH[required].label.toLowerCase())
                : 'something else again')
        ).join(' and ') + ', which they do not have.</div>';
    }

    const rows: string[] = [];
    rows.push('<div class="techweb-title">' + escapeHtml(def.label) + '</div>');
    rows.push('<div class="techweb-note">' + escapeHtml(def.description) + '</div>');
    rows.push('<div class="techweb-effect">' +
      escapeHtml(TECH_EFFECTS[tech].summary) + '</div>');
    rows.push('<div class="techweb-state">' + STATE_NOTE[state] + '</div>');

    // An idea survives being proven — it stays on the person to be refined, and
    // only retires at its ceiling — so everything below has to ask what stage it
    // is at rather than merely whether it exists.
    //
    // It did not, and the owner reported the consequence: cordage proven and
    // built, and this pane still saying "Needs 3 thatch to build one" underneath
    // it. The insight bar was as stale, reading the refinement progress that
    // `prove` had just reset to zero under a heading that said "where it has got
    // to", and the failed-trial count was history presented as news.
    if (idea && idea.stage !== 'proven') {
      rows.push('<div class="techweb-section">Where it has got to</div>');
      rows.push('<div class="techweb-note">' +
        escapeHtml(STAGE_LABELS[idea.stage]) + '</div>');
      rows.push('<div class="techweb-note"><i>' + escapeHtml(idea.story) + '</i></div>');

      if (idea.stage === 'prototyped') {
        // On the bench and being tried. Insight is no longer what stands between
        // this and knowing it — trials are — so show those instead of a bar that
        // would sit still for days while something was actually happening.
        rows.push('<div class="techweb-bar is-proof"><i style="width:' +
          Math.round(idea.proof * 100) + '%"></i></div>');
        rows.push('<div class="techweb-note">One has been built. ' +
          (idea.trials === 0
            ? 'It has not been tried yet.'
            : idea.trials + (idea.trials === 1 ? ' try' : ' tries') + ' so far.') +
          '</div>');
      } else {
        rows.push('<div class="techweb-bar"><i style="width:' +
          Math.round(idea.insight * 100) + '%"></i></div>');
        // What building one would cost, and whether they can. Only worth saying
        // while there is still a first one to build.
        const short = Object.entries(def.prototype)
          .filter(([itemId, count]) => subject.inventory.count(itemId) < count);
        rows.push('<div class="techweb-note">Needs ' +
          Object.entries(def.prototype).map(([itemId, count]) =>
            count + ' ' + escapeHtml((ITEMS[itemId]?.label ?? itemId).toLowerCase())
          ).join(', ') + ' to build one' +
          (short.length === 0 ? ', and they have them.' : '.') + '</div>');
      }

      if (idea.failedTests > 0) {
        rows.push('<div class="techweb-note">' + idea.failedTests +
          (idea.failedTests === 1 ? ' try' : ' tries') +
          ' that did not work</div>');
      }
    }

    if (state !== 'proven') {
      rows.push('<div class="techweb-section">What would suggest it</div>');
      for (const spark of def.sparks) rows.push(this.sparkRow(spark, notice));
    }

    return rows.join('');
  }

  /** One route in, with each ingredient marked present or missing. */
  private sparkRow(spark: Spark, notice: Notice): string {
    const status = sparkStatus(spark, notice);
    const label = (kind: 'tech' | 'item', id: string) =>
      kind === 'tech' ? TECH[id as Tech].label : (ITEMS[id]?.label ?? id);
    const parts = spark.needs.map(ingredient => {
      const met = !status.missing.includes(ingredient);
      return '<span class="techweb-ing' + (met ? ' is-met' : '') + '">' +
        (met ? '✓ ' : '✗ ') +
        escapeHtml(describeIngredient(ingredient, label)) + '</span>';
    }).join('');
    return '<div class="techweb-spark' +
      (status.missing.length === 0 ? ' is-ready' : '') + '">' + parts + '</div>';
  }

  /**
   * The box the web is laid out inside.
   *
   * Rounded to a step so that dragging a window edge does not recompute the
   * arrangement on every pixel — and so that the whole picture does not
   * rearrange itself under the player's cursor while they are reading it.
   */
  private boxSize(): { width: number; height: number } {
    const step = 80;
    const width = Math.max(520, Math.min(1080,
      Math.round((window.innerWidth - 420) / step) * step));
    const height = Math.max(380, Math.min(720,
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
