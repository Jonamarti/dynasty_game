/**
 * Herds that drift, graze and bolt.
 *
 * The point of this system is that game is no longer something you walk up to.
 * A deer notices you, runs faster than you can, and takes the rest of its herd
 * with it — so hunting becomes a matter of approach and timing rather than of
 * standing next to a bush for twenty-four ticks. It is also the first thing the
 * `track` skill has ever done: tracking shrinks the radius at which an animal
 * notices you, which is the whole difference between a stalk and a stampede.
 *
 * Movement goes through the shared `moveToward` rather than a second steerer,
 * so animals and people agree about what walkable means. Two implementations of
 * that would drift, and the first symptom would be deer standing in lakes.
 */
import { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { moveToward } from './MovementSystem.ts';
import { telemetry } from '../core/Telemetry.ts';
import type { IdSpace } from '../core/IdSpace.ts';
import { techPower, stealthFactor } from '../knowledge/Tech.ts';
import { WORTH_GRAZING, STUBBLE } from '../core/Grass.ts';

/** Ticks an animal keeps running after it stops seeing what spooked it. */
const ALARM_TICKS = 90;

/** How far a bolting animal aims for at full stamina. A real loss. */
const FLIGHT_DISTANCE = 16;

/** Stamina spent per move tick of bolting, and regained per move tick grazing. */
const STAMINA_DRAIN = 0.055;
const STAMINA_RECOVERY = 0.006;

/**
 * Bearings tried when bolting, in radians off "directly away".
 *
 * Straight back first, then widening. A cornered animal breaks sideways along
 * the obstacle rather than pressing into it, which is both what animals do and
 * what greedy steering needs in order to get anywhere at all.
 */
const FLIGHT_BEARINGS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];

/** How far from the herd's centre an animal will drift before coming back. */
const HERD_SPREAD = 3.5;

/** How near a tamed animal keeps to the person it follows. */
const HEEL_DISTANCE = 2.5;

/**
 * Animals move on a stagger, like people think on one.
 *
 * Wildlife is the largest population in the world and the least interesting per
 * tick. Moving a fifth of them each step costs a fifth as much and is
 * indistinguishable at the speeds anything actually travels.
 */
const MOVE_INTERVAL = 5;

/**
 * Feeding, M15 phase 23c. Per *move* (every `MOVE_INTERVAL` ticks, 48 a day).
 * Sized so one animal wants about a tenth of a tile's height a day: a herd of
 * five crops a good tile in a day or two and moves on, and the grass has to
 * come back before it returns.
 */
const HUNGER_PER_MOVE = 0.004;
const BITE = 0.03;
/** Fullness one bite gives. */
const FED_PER_BITE = 0.06;
/** Health lost per move once it has nothing left: weeks to starve a deer. */
const STARVE_PER_MOVE = 0.02;
/** How far a hungry animal looks for a better tile. */
const FORAGE_RADIUS = 7;
/**
 * Winter slows the body down. Without this a ten-day winter with the grass
 * dead is a certain extinction every year, which is not what a deer does.
 */
const COLD_METABOLISM = 0.3;

/**
 * Hunters, M15 phase 23e. A hunter below `HUNT_BELOW` goes after the nearest
 * prey; a pack that has just eaten lies up. One kill feeds the pack for about
 * a week (`FED_PER_MEAT`), which is what keeps two packs from eating the
 * island: roughly five deer a year each.
 */
const HUNT_BELOW = 0.6;
const FED_PER_MEAT = 1 / 16;
const PREDATOR_HUNGER_PER_MOVE = 0.0018;
const HUNT_RANGE = 16;
/** A hunter this hungry, and with no prey in reach, turns to people (23f). */
const DESPERATE_BELOW = 0.22;
/** How far a hungry hunter sees a lone person: by day, and by night. */
const PERSON_RANGE_DAY = 9;
const PERSON_RANGE_NIGHT = 14;
/** Keep out of a fire's circle, and of the camp's. */
export const FIRE_AVOID = 7;
/** How near a bear has to be walked in on before it strikes. */
const BEAR_SURPRISE = 2.8;
/** The chance a bite lands on a move within reach, and the pause after one. */
const BITE_CHANCE = 0.35;
const BITE_PAUSE: Record<string, number> = { wolf: 60, bear: 160, lynx: 80 };
/** Pack-mates (wolves) within this of each other count towards boldness. */
const PACK_RADIUS = 6;

/**
 * `dog`, M15 phase 23g. A tamed wolf this close to its owner is a dog at their
 * heel: it hears a stranger `DOG_SIGHT` further for them (at full technology),
 * and a hunter will not pick off somebody it is standing beside.
 */
export const DOG_HEARING = 8;
export const DOG_SIGHT = 0.5;
/** Extra hunt bonus a wolf at the heel gives, at full `dog` technology. */
const DOG_HUNT = 0.25;
/** How long an animal holds a grudge, in ticks: six days. */
const GRUDGE_TICKS = 1440;
/** How much further a deer sees the hunter who once cornered it. */
const GRUDGE_NOTICE = 1.5;

/** Births happen in this season only. */
const BIRTH_SEASON = 'spring';
/** Grass capacity (summed over the range, in tile-heights) one animal needs. */
const GRASS_PER_ANIMAL = 14;
/** Never more than this multiple of the founding herd size, whatever the grass. */
const HERD_CEILING = 2.5;
/** Radius of the range whose grass sets a herd's ceiling. */
const RANGE_RADIUS = 8;

export interface WildlifeContext {
  ids?: IdSpace;
  world: World;
  rng: RNG;
  tick: number;
  peopleHash: SpatialHash<Person>;
  /**
   * Everybody, by id, so a tamed animal can find the one person it follows.
   *
   * By id rather than through `peopleHash`, because "where is this particular
   * person?" is not a proximity question and the hash would have to be searched
   * at map range to answer it — which is exactly the kind of scan `AGENTS.md`
   * forbids. Optional so that the tests which build a context by hand keep
   * compiling; without it a tamed animal simply grazes.
   */
  peopleById?: Map<number, Person>;
  /** The day's growth curve, 0-1 (`TimeManager.dailyGrowth`): slows hunger in the cold. */
  dailyGrowth?: number;
  /** Called when an animal starves, so the world can take it out. */
  onStarved?: (animal: Animal) => void;
  /** Where the other animals are: a hunter's prey, and a herd's fear of hunters. */
  animalHash?: SpatialHash<Animal>;
  /** The hunters' dice, M15 phase 23e: kills and bites. Falls back to `rng`. */
  ecologyRng?: RNG;
  isNight?: boolean;
  /** Whether a fire burns within a radius of a point; hunters keep out of it. */
  litNear?: (x: number, y: number, radius: number) => boolean;
  /** Called when a hunter kills an animal, so the world can take it out. */
  onPredated?: (prey: Animal) => void;
  /** Called when a hunter's bite lands on a person. */
  onBite?: (animal: Animal, person: Person) => void;
}

export class WildlifeSystem {
  /** Young owed to each herd, carried between days: births are fractions of an animal. */
  private readonly owed = new Map<number, number>();

  /**
   * The day's births, M15 phase 23d. Proportional to the herd's size and to how
   * well fed it is, spring only, and capped by the grass round its centre —
   * **not** by a constant, which is the point: a poor range holds fewer. A
   * herd of one cannot breed, and a hunted-out herd stays hunted out until
   * something enters at the edge (23h). No dice: the owed fraction accrues the
   * way `workHerds` accrues a pen's young, so a world's births are a function of
   * its grass.
   */
  daily(animals: Animal[], ctx: WildlifeContext & { season: string }): Animal[] {
    const born: Animal[] = [];
    if (ctx.season !== BIRTH_SEASON) return born;
    const herds = new Map<number, Animal[]>();
    for (const a of animals) {
      if (!a.alive) continue;
      const list = herds.get(a.herdId);
      if (list) list.push(a); else herds.set(a.herdId, [a]);
    }
    for (const [herdId, members] of herds) {
      if (members.length < 2) continue;
      const lead = members[0]!;
      const fed = members.reduce((sum, m) => sum + m.fed, 0) / members.length;
      const cx = members.reduce((sum, m) => sum + m.x, 0) / members.length;
      const cy = members.reduce((sum, m) => sum + m.y, 0) / members.length;
      // A pack's ceiling is its own founding size, not the grass: what feeds
      // a wolf is how many deer there are, and that is already in `fed`.
      const ceiling = lead.def.predator
        ? lead.def.herdSize * 1.5
        : Math.min(lead.def.herdSize * HERD_CEILING, rangeGrass(ctx.world, cx, cy) / GRASS_PER_ANIMAL);
      if (members.length >= ceiling) {
        this.owed.set(herdId, 0);
        continue;
      }
      const owed = (this.owed.get(herdId) ?? 0) + members.length * lead.def.fecundity * fed * fed;
      const whole = Math.floor(owed);
      this.owed.set(herdId, owed - whole);
      let size = members.length;
      for (let i = 0; i < whole && size < ceiling; i++) {
        const mother = members[(ctx.tick + i) % members.length]!;
        const spot = ctx.world.findWalkableNear(Math.round(mother.x), Math.round(mother.y), 3);
        if (!spot) continue;
        const calf = new Animal(lead.species, spot.x, spot.y, herdId, ctx.rng, ctx.ids);
        calf.fed = 0.8;
        born.push(calf);
        size++;
        telemetry.count('animal_born');
      }
    }
    return born;
  }

  update(animals: Animal[], ctx: WildlifeContext): void {
    if (animals.length === 0) return;

    // Herd centroids, recomputed once per step rather than per animal: this is
    // the only O(n) pass here, and doing it per animal would make it O(n²).
    const centroids = new Map<number, { x: number; y: number; n: number }>();
    for (const animal of animals) {
      if (!animal.alive) continue;
      const c = centroids.get(animal.herdId);
      if (c) {
        c.x += animal.x;
        c.y += animal.y;
        c.n++;
      } else {
        centroids.set(animal.herdId, { x: animal.x, y: animal.y, n: 1 });
      }
    }
    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }

    for (const animal of animals) {
      if (!animal.alive) continue;
      if ((ctx.tick + animal.id) % MOVE_INTERVAL !== 0) continue;

      if (animal.def.predator) {
        this.prowl(animal, centroids.get(animal.herdId), ctx, animals);
        continue;
      }

      const threat = this.threatNear(animal, ctx) ?? this.hunterNear(animal, ctx);
      if (threat) this.alarm(animal, threat, ctx, animals);

      if (animal.alarmedUntil > ctx.tick) this.bolt(animal, ctx);
      else if (animal.tamedBy !== null && this.heel(animal, ctx)) continue;
      else this.graze(animal, centroids.get(animal.herdId), ctx);
    }
  }

  /**
   * The nearest person close enough to have been noticed.
   *
   * `track` is what shrinks this. A skilled tracker gets close; a novice
   * blunders into the treeline and watches the herd leave.
   */
  private threatNear(animal: Animal, ctx: WildlifeContext): Person | null {
    return ctx.peopleHash.findNearest(
      animal.x, animal.y, animal.def.awareness,
      // M8.1, and the halfway stage that makes taming possible at all.
      //
      // An animal does not bolt from somebody it has taken food from, which is
      // what `fedBy` is for — and without it the second meal could never be
      // delivered, because the beast would run the moment the same person came
      // back. Its owner is covered by the same test once `tamedBy` is set, and
      // no longer bolting is most of what being tamed *is* from the animal's
      // side; everything else follows from it.
      person => person.alive && !animal.fedBy.has(person.id) &&
        person.distanceTo(animal) <= noticeRadius(animal, person)
    );
  }

  /** The nearest hunter that takes this species and is near enough to be noticed. */
  private hunterNear(animal: Animal, ctx: WildlifeContext): Animal | null {
    return ctx.animalHash?.findNearest(
      animal.x, animal.y, animal.def.awareness * 0.8,
      other => other.alive && other.def.predator && other.def.prey.includes(animal.species)
    ) ?? null;
  }

  /** Spooks an animal and everything in its herd standing nearby. */
  private alarm(
    animal: Animal,
    threat: { x: number; y: number },
    ctx: WildlifeContext,
    animals: Animal[]
  ): void {
    const wasCalm = animal.alarmedUntil <= ctx.tick;
    this.setFlight(animal, threat.x, threat.y, ctx);

    if (!wasCalm) return;
    telemetry.count('animal_alarmed');

    // A herd bolts together. One deer running while its neighbours graze is
    // both wrong to look at and removes the cost of a failed stalk.
    for (const other of animals) {
      if (other.herdId !== animal.herdId || other.id === animal.id) continue;
      if (!other.alive) continue;
      if (Math.hypot(other.x - animal.x, other.y - animal.y) > 9) continue;
      this.setFlight(other, threat.x, threat.y, ctx);
    }
  }

  /**
   * Points an animal away from a threat, onto ground it can actually reach.
   *
   * Straight away from the danger first, then progressively wider bearings.
   * The straight line alone is not enough: a herd driven against a shoreline
   * has nothing walkable directly behind it, and an animal that finds no flight
   * point at all used to stay flagged alarmed for the full ninety ticks while
   * standing perfectly still next to the hunter. Over a long run that is most
   * of the map's wildlife, pinned along the coast and no longer fleeing
   * anything.
   */
  private setFlight(animal: Animal, fromX: number, fromY: number, ctx: WildlifeContext): void {
    const dx = animal.x - fromX;
    const dy = animal.y - fromY;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const away = Math.atan2(dy / length, dx / length);

    // A winded animal does not run as far. This is the whole of persistence
    // hunting: each bolt is shorter than the last, so a hunter who keeps the
    // pressure on eventually closes.
    const reach = FLIGHT_DISTANCE * (0.2 + 0.8 * animal.stamina);
    for (const distance of [reach, reach * 0.7, reach * 0.45, reach * 0.25]) {
      for (const spread of FLIGHT_BEARINGS) {
        const angle = away + spread;
        const tx = animal.x + Math.cos(angle) * distance;
        const ty = animal.y + Math.sin(angle) * distance;
        // Sideways is only an escape if it is not *toward* the threat.
        if (Math.hypot(tx - fromX, ty - fromY) <= length) continue;
        if (!ctx.world.isWalkable(tx, ty)) continue;
        animal.alarmedUntil = ctx.tick + ALARM_TICKS;
        animal.fleeX = tx;
        animal.fleeY = ty;
        return;
      }
    }

    // Genuinely cornered. Better to graze than to stand rigid for ninety ticks
    // pretending to run.
    animal.alarmedUntil = 0;
    animal.fleeX = null;
    animal.fleeY = null;
  }

  private bolt(animal: Animal, ctx: WildlifeContext): void {
    if (animal.fleeX === null || animal.fleeY === null) {
      // Nowhere to go. Settling is the honest outcome; staying "alarmed" while
      // motionless is a state nothing can get out of.
      animal.alarmedUntil = 0;
      return;
    }
    animal.lastRunAt = ctx.tick;
    animal.stamina = Math.max(0, animal.stamina - STAMINA_DRAIN);
    // A spent animal is barely quicker than the person behind it.
    const speed = animal.def.fleeSpeed * (0.45 + 0.55 * animal.stamina);
    const moved = moveToward(
      animal, animal.fleeX, animal.fleeY, speed * MOVE_INTERVAL, ctx.world, ctx.rng
    );
    // Arrived, or cornered. Either way the run is over and it settles.
    if (moved < 0.01 || Math.hypot(animal.fleeX - animal.x, animal.fleeY - animal.y) < 1) {
      animal.alarmedUntil = 0;
      animal.fleeX = null;
      animal.fleeY = null;
    }
  }

  /** Wanders around the herd's centre, coming back when it strays too far. */
  /**
   * A tamed animal keeping up with the person it follows.
   *
   * Returns false — and falls back to grazing — when its person is dead or off
   * the map, which is the whole of what happens to a dog whose owner dies:
   * nothing dramatic, it simply goes back to being an animal near a herd. It
   * keeps `tamedBy` set, so whoever inherits the camp inherits a beast that
   * still will not run from them.
   *
   * Note what this does *not* draw: an `RNG`. `graze` takes two draws per move
   * and this takes none, so a world with a tamed animal in it does diverge from
   * one without — which is correct and unavoidable, and is confined to worlds
   * where somebody has actually worked `taming` out.
   */
  private heel(animal: Animal, ctx: WildlifeContext): boolean {
    const owner = ctx.peopleById?.get(animal.tamedBy!);
    if (!owner || !owner.alive) return false;
    animal.alarmedUntil = 0;
    animal.stamina = Math.min(1, animal.stamina + STAMINA_RECOVERY);
    // Only closes the gap when there is one. An animal that walked to its
    // owner's exact tile would stand inside them, and a companion that never
    // strays reads as a sprite glued on rather than as an animal.
    if (Math.hypot(animal.x - owner.x, animal.y - owner.y) <= HEEL_DISTANCE) return true;
    moveToward(
      animal, owner.x, owner.y,
      animal.def.speed * MOVE_INTERVAL * 0.5, ctx.world, ctx.rng
    );
    return true;
  }

  /**
   * A hunter's move, M15 phases 23e and 23f. In order of what it wants:
   * leave the firelight; if it is hungry, chase the nearest prey it takes; if
   * it is desperate and nothing is in reach, close on somebody alone (a child
   * first, an adult only for a pack, a bear only if it was walked in on);
   * otherwise lie up near its pack. Eating happens at the kill and feeds the
   * pack, so the herd's fed level and not a grass tile is what a hunter needs.
   */
  private prowl(
    animal: Animal,
    centre: { x: number; y: number } | undefined,
    ctx: WildlifeContext,
    animals: Animal[]
  ): void {
    const dice = ctx.ecologyRng ?? ctx.rng;
    animal.stamina = Math.min(1, animal.stamina + STAMINA_RECOVERY);
    const metabolism = COLD_METABOLISM + (1 - COLD_METABOLISM) * (ctx.dailyGrowth ?? 1);
    animal.fed = Math.max(0, animal.fed - PREDATOR_HUNGER_PER_MOVE * metabolism);
    if (animal.fed <= 0) {
      animal.health -= STARVE_PER_MOVE * metabolism;
      if (animal.health <= 0) {
        animal.alive = false;
        telemetry.count('animal_starved');
        ctx.onStarved?.(animal);
        return;
      }
    }

    // A bear walked in on strikes whatever its belly says; a pause after a
    // bite is the victim's chance to get away.
    if (animal.alarmedUntil > ctx.tick) return;
    const lit = ctx.litNear;

    if (lit?.(animal.x, animal.y, FIRE_AVOID)) {
      // Back out of the circle: the nearest bearing, at the nearest distance,
      // that is walkable and dark.
      for (const reach of [5, 9, 13]) {
        for (let a = 0; a < 8; a++) {
          const angle = a * Math.PI / 4;
          const tx = animal.x + Math.cos(angle) * reach;
          const ty = animal.y + Math.sin(angle) * reach;
          if (!ctx.world.isWalkable(tx, ty) || lit(tx, ty, FIRE_AVOID)) continue;
          moveToward(animal, tx, ty, animal.def.speed * MOVE_INTERVAL, ctx.world, dice);
          telemetry.count('predator_kept_off_by_fire');
          return;
        }
      }
      return;
    }

    // M15 phase 23g: a hunter that was turned on remembers whose hunt it was.
    // It goes for that person, whatever its belly says, while the grudge lasts.
    const grudge = grudgeOf(animal, ctx.tick);
    if (grudge !== null) {
      const foe = ctx.peopleById?.get(grudge);
      if (foe && foe.alive && Math.hypot(animal.x - foe.x, animal.y - foe.y) <= PERSON_RANGE_DAY &&
          !lit?.(foe.x, foe.y, FIRE_AVOID) && !guardedByDog(foe, ctx.animalHash) &&
          ctx.world.sameRegion(animal.x, animal.y, foe.x, foe.y)) {
        telemetry.count('animal_grudge_pursuit');
        this.pounce(animal, foe, ctx, dice);
        return;
      }
    }

    if (animal.species === 'bear') {
      const walkedIn = ctx.peopleHash.findNearest(animal.x, animal.y, BEAR_SURPRISE,
        person => person.alive && !(lit?.(person.x, person.y, FIRE_AVOID)));
      if (walkedIn) {
        this.pounce(animal, walkedIn, ctx, dice);
        return;
      }
    }

    if (animal.fed < HUNT_BELOW) {
      const prey = ctx.animalHash?.findNearest(animal.x, animal.y, HUNT_RANGE,
        other => other.alive && !other.def.predator && animal.def.prey.includes(other.species) &&
          !(lit?.(other.x, other.y, FIRE_AVOID)));
      if (prey) {
        this.chase(animal, prey, ctx, dice, animals);
        return;
      }
      if (animal.fed < DESPERATE_BELOW) {
        const target = this.victimFor(animal, ctx, animals);
        if (target) {
          this.pounce(animal, target, ctx, dice);
          return;
        }
      }
    }

    // Lying up: stay with the pack, drifting.
    if (!centre) return;
    const away = Math.hypot(animal.x - centre.x, animal.y - centre.y);
    const tx = away > HERD_SPREAD ? centre.x : animal.x + dice.range(-2, 2);
    const ty = away > HERD_SPREAD ? centre.y : animal.y + dice.range(-2, 2);
    moveToward(animal, tx, ty, animal.def.speed * MOVE_INTERVAL * 0.35, ctx.world, dice);
  }

  /** One move of a chase, and the kill if it is close enough and the dice allow. */
  private chase(animal: Animal, prey: Animal, ctx: WildlifeContext, dice: RNG, animals: Animal[]): void {
    // The quarry knows it is hunted: bolt now, so stamina drains.
    if (prey.alarmedUntil <= ctx.tick) this.alarm(prey, animal, ctx, animals);
    animal.lastRunAt = ctx.tick;
    moveToward(animal, prey.x, prey.y, animal.def.fleeSpeed * MOVE_INTERVAL, ctx.world, dice);
    if (Math.hypot(animal.x - prey.x, animal.y - prey.y) > 1.6) return;

    // Presentation observes the attempt, including a miss; it must not depend
    // on the success draw below.
    animal.lastAttackAt = ctx.tick;
    const mates = packMates(animal, animals);
    const chance = Math.min(0.9, 0.08 + 0.45 * (1 - prey.stamina) + 0.07 * Math.min(3, mates) +
      (1 - prey.def.evasion) * 0.15);
    if (!dice.chance(chance)) {
      prey.stamina = Math.max(0, prey.stamina - 0.1);
      return;
    }
    prey.alive = false;
    prey.health = 0;
    telemetry.count('prey_killed_by_predator');
    telemetry.count('prey_killed_by_' + animal.species);
    ctx.onPredated?.(prey);
    // The kill feeds the pack, all of it that is close.
    const meal = prey.def.meat * FED_PER_MEAT;
    for (const mate of animals) {
      if (!mate.alive || mate.herdId !== animal.herdId) continue;
      if (Math.hypot(mate.x - animal.x, mate.y - animal.y) <= PACK_RADIUS) {
        mate.fed = Math.min(1, mate.fed + meal);
        mate.lastMealAt = ctx.tick;
      }
    }
  }

  /**
   * Who a desperate hunter would go for, M15 phase 23f. A child alone, any time;
   * an adult alone only for a pack of three or more (a bold pack), or for a
   * bear; never anyone inside a fire's circle. Night widens the range: that is
   * when they come, and what the fire and the watch are for.
   */
  private victimFor(animal: Animal, ctx: WildlifeContext, animals: Animal[]): Person | null {
    const range = ctx.isNight ? PERSON_RANGE_NIGHT : PERSON_RANGE_DAY;
    const bold = animal.species === 'bear' || packMates(animal, animals) >= 2;
    return ctx.peopleHash.findNearest(animal.x, animal.y, range, person => {
      if (!person.alive || ctx.litNear?.(person.x, person.y, FIRE_AVOID)) return false;
      // The dog barks first: a hunter does not close on somebody whose wolf
      // is at their side, and keeps off.
      if (guardedByDog(person, ctx.animalHash)) return false;
      if (!ctx.world.sameRegion(animal.x, animal.y, person.x, person.y)) return false;
      const company = ctx.peopleHash.queryRadius(person.x, person.y, 4)
        .filter(other => other.alive && other.id !== person.id && !other.isChild).length;
      if (person.isChild) return company === 0;
      return bold && company === 0;
    });
  }

  /** Closing on a person and, within reach, a bite. */
  private pounce(animal: Animal, person: Person, ctx: WildlifeContext, dice: RNG): void {
    animal.lastRunAt = ctx.tick;
    moveToward(animal, person.x, person.y, animal.def.fleeSpeed * MOVE_INTERVAL, ctx.world, dice);
    if (Math.hypot(animal.x - person.x, animal.y - person.y) > 1.5) return;
    animal.lastAttackAt = ctx.tick;
    if (!dice.chance(BITE_CHANCE)) return;
    telemetry.count('animal_bit_person');
    telemetry.count('animal_bit_person_' + animal.species);
    if (ctx.isNight) telemetry.count('animal_bit_person_at_night');
    ctx.onBite?.(animal, person);
    animal.alarmedUntil = ctx.tick + (BITE_PAUSE[animal.species] ?? 60);
    animal.fleeX = null;
    animal.fleeY = null;
  }

  private graze(
    animal: Animal,
    centre: { x: number; y: number } | undefined,
    ctx: WildlifeContext
  ): void {
    animal.alarmedUntil = 0;
    animal.stamina = Math.min(1, animal.stamina + STAMINA_RECOVERY);

    // M15 phase 23c: eat what is under the feet, and go hungry slowly.
    const standing = ctx.world.grassAt(animal.x, animal.y);
    if (standing > STUBBLE + BITE) {
      const taken = ctx.world.graze(animal.x, animal.y, BITE);
      if (taken > 0) animal.lastMealAt = ctx.tick;
      animal.fed = Math.min(1, animal.fed + (taken / BITE) * FED_PER_BITE);
    }
    const metabolism = COLD_METABOLISM + (1 - COLD_METABOLISM) * (ctx.dailyGrowth ?? 1);
    animal.fed = Math.max(0, animal.fed - HUNGER_PER_MOVE * metabolism);
    if (animal.fed <= 0) {
      animal.health -= STARVE_PER_MOVE * metabolism;
      if (animal.health <= 0) {
        animal.alive = false;
        telemetry.count('animal_starved');
        ctx.onStarved?.(animal);
        return;
      }
    }

    // Poor ground here: look for better, and keep the herd's company only
    // loosely while doing it. The herd's centre follows its members.
    if (standing < WORTH_GRAZING) {
      const better = bestGrass(ctx.world, animal.x, animal.y, FORAGE_RADIUS);
      if (better) {
        moveToward(animal, better.x + 0.5, better.y + 0.5, animal.def.speed * MOVE_INTERVAL * 0.6, ctx.world, ctx.rng);
        return;
      }
    }
    if (!centre) return;

    const away = Math.hypot(animal.x - centre.x, animal.y - centre.y);
    // On good ground a feeding animal mostly stays put: grazing is standing.
    if (away <= HERD_SPREAD && standing >= WORTH_GRAZING && animal.fed < 0.9) return;
    const tx = away > HERD_SPREAD
      ? centre.x
      : animal.x + ctx.rng.range(-2, 2);
    const ty = away > HERD_SPREAD
      ? centre.y
      : animal.y + ctx.rng.range(-2, 2);

    moveToward(animal, tx, ty, animal.def.speed * MOVE_INTERVAL * 0.35, ctx.world, ctx.rng);
  }
}

/** Pack-mates of a hunter within `PACK_RADIUS`, not counting itself. */
function packMates(animal: Animal, animals: Animal[]): number {
  let n = 0;
  for (const other of animals) {
    if (other === animal || !other.alive || other.herdId !== animal.herdId) continue;
    if (Math.hypot(other.x - animal.x, other.y - animal.y) <= PACK_RADIUS) n++;
  }
  return n;
}

/**
 * The best walkable tile within `radius`: tall grass, nearer preferred. A box
 * scan of the grass layer, bounded by the radius; there are no entities here.
 */
function bestGrass(world: World, x: number, y: number, radius: number): { x: number; y: number } | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best: { x: number; y: number } | null = null;
  let bestScore = WORTH_GRAZING;
  for (let ty = Math.max(0, cy - radius); ty <= Math.min(world.height - 1, cy + radius); ty++) {
    for (let tx = Math.max(0, cx - radius); tx <= Math.min(world.width - 1, cx + radius); tx++) {
      const i = ty * world.width + tx;
      if (world.walkable[i] !== 1) continue;
      const score = world.grass[i]! - Math.hypot(tx - cx, ty - cy) * 0.025;
      if (score > bestScore) { bestScore = score; best = { x: tx, y: ty }; }
    }
  }
  return best;
}

/** The sum of the grass capacity round a point: what a herd's range can carry. */
function rangeGrass(world: World, x: number, y: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let total = 0;
  for (let ty = Math.max(0, cy - RANGE_RADIUS); ty <= Math.min(world.height - 1, cy + RANGE_RADIUS); ty++) {
    for (let tx = Math.max(0, cx - RANGE_RADIUS); tx <= Math.min(world.width - 1, cx + RANGE_RADIUS); tx++) {
      total += world.grassCap[ty * world.width + tx]!;
    }
  }
  return total;
}

/**
 * How close this person can get before this animal notices them.
 *
 * Two terms, and they are different things on purpose. The `track` skill is
 * practice — at skill 0 an animal notices you at its full awareness, at 100 you
 * halve it. `stealthFactor` is knowledge: someone who has been taught to read a
 * trail also knows how to approach one, and shrinks it again.
 */
export function noticeRadius(animal: Animal, person: Person): number {
  const practice = 1 - (person.skills.track / 100) * 0.5;
  // M15 phase 23g: it knows your face. The stag that turned on you once sees
  // you coming from further off for a few days, which is what makes a second
  // hunt of the same herd harder than the first.
  const remembered = grudgeOf(animal, 0, true) === person.id ? GRUDGE_NOTICE : 1;
  return animal.def.awareness * practice * stealthFactor(person) * remembered;
}

/**
 * Who this animal holds a grudge against, M15 phase 23g: the reader `hurtBy`
 * has waited for. Forgotten after `GRUDGE_TICKS`. Pass `anyTime` from a place
 * with no clock to hand (`noticeRadius`), which trusts the field as it stands:
 * it is cleared the next time the animal's own move reads it with a tick.
 */
export function grudgeOf(animal: Animal, tick: number, anyTime = false): number | null {
  if (animal.hurtBy === null) return null;
  if (!anyTime && tick - animal.hurtAt > GRUDGE_TICKS) {
    animal.hurtBy = null;
    return null;
  }
  return animal.hurtBy;
}

/** Records that `person` put this animal in a corner, so it remembers. */
export function rememberHurt(animal: Animal, person: Person, tick: number): void {
  animal.hurtBy = person.id;
  animal.hurtAt = tick;
}

/** Whether a tamed wolf of this person's is at their heel and they know `dog`. */
export function guardedByDog(person: Person, hash: SpatialHash<Animal> | undefined): boolean {
  if (!hash || techPower(person, 'dog') <= 0) return false;
  return hash.findNearest(person.x, person.y, DOG_HEARING,
    a => a.alive && a.tamedBy === person.id && a.species === 'wolf') !== null;
}

/**
 * How much better a hunt goes for somebody with a tamed animal at their side.
 *
 * M8.1's `taming`, and the second half of what a dog is for — the first being
 * that it stops running away from you. A companion works the ground ahead and
 * holds what it finds, which is worth more than any weapon in the game and is
 * meant to be: it costs a season of feeding an animal you could have eaten.
 *
 * Counted per hunter rather than per animal, and capped at one, so a band that
 * tames six wolves is a band with six wolves and not a band that cannot miss.
 */
export function companionBonus(person: Person, animals: Iterable<Animal>): number {
  for (const animal of animals) {
    if (!animal.alive || animal.tamedBy !== person.id) continue;
    if (person.distanceTo(animal) > COMPANION_RANGE) continue;
    const dog = animal.species === 'wolf' ? DOG_HUNT * techPower(person, 'dog') : 0;
    return 1 + 0.35 * techPower(person, 'taming') + dog;
  }
  return 1;
}

/** How close a companion has to be to be hunting with you rather than near you. */
const COMPANION_RANGE = 8;
