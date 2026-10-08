/** Read-only Brain.think transition counters used only by the profile-step marked run. */
export interface DecisionPerson {
  id: number | string;
  alive?: boolean;
  action: string;
  isPlayer?: boolean;
  order?: string | null;
  targetX?: number | null;
  targetY?: number | null;
  targetNodeId?: number | null;
  targetPersonId?: number | null;
  targetSubjectId?: number | null;
  targetBuildingId?: number | null;
  targetTreeId?: number | null;
  targetAnimalId?: number | null;
  targetInscriptionId?: number | null;
  targetPileId?: number | null;
  targetCorpseId?: number | null;
  targetItemId?: string | null;
  targetRecipe?: string | null;
  targetTech?: string | null;
  draftPenId?: number | null;
}

export interface DecisionSnapshot {
  id: number | string;
  action: string;
  isPlayer: boolean;
  order: string | null;
  target: string;
}

const TARGET_FIELDS = [
  'targetNodeId', 'targetPersonId', 'targetSubjectId', 'targetBuildingId',
  'targetTreeId', 'targetAnimalId', 'targetInscriptionId', 'targetPileId',
  'targetCorpseId', 'targetItemId', 'targetRecipe', 'targetTech', 'draftPenId',
] as const;

/** Entity identity wins over position, so a moving target does not look new every think. */
export function snapshotDecision(person: DecisionPerson): DecisionSnapshot {
  const namedTargets = TARGET_FIELDS.flatMap(field => {
    const value = person[field];
    return value === null || value === undefined ? [] : [[field, value] as const];
  });
  const target = namedTargets.length
    ? JSON.stringify(namedTargets)
    : JSON.stringify([person.targetX ?? null, person.targetY ?? null]);
  return {
    id: person.id,
    action: person.action,
    isPlayer: person.isPlayer === true,
    order: person.order ?? null,
    target,
  };
}

interface Counts {
  thinkCalls: number;
  actionChanges: number;
  retargets: number;
  starts: number;
  nullChoices: number;
}

const emptyCounts = (): Counts => ({ thinkCalls: 0, actionChanges: 0, retargets: 0, starts: 0, nullChoices: 0 });

const addCounts = (into: Counts, row: Counts): void => {
  into.thinkCalls += row.thinkCalls;
  into.actionChanges += row.actionChanges;
  into.retargets += row.retargets;
  into.starts += row.starts;
  into.nullChoices += row.nullChoices;
};

/** Counts only transitions within think; finish/start and changes during execute are outside this measure. */
export class DecisionObserver {
  private readonly counts = new Map<number | string, Counts>();
  private readonly aliveTicks = new Map<number | string, number>();
  private readonly autonomousTicks = new Map<number | string, number>();
  private readonly dailyCounts = new Map<number, Map<number | string, Counts>>();
  private personTicks = 0;
  private autonomousPersonTicks = 0;

  constructor(private readonly ticksPerDay: number) {
    if (!Number.isFinite(ticksPerDay) || ticksPerDay <= 0) throw new Error('ticksPerDay must be positive');
  }

  /** Call once per simulated tick with the living roster before advancing it. */
  observeExposure(people: Iterable<DecisionPerson>): void {
    for (const person of people) {
      if (person.alive === false) continue;
      this.personTicks++;
      this.aliveTicks.set(person.id, (this.aliveTicks.get(person.id) ?? 0) + 1);
      if (person.isPlayer || person.order != null) continue;
      this.autonomousPersonTicks++;
      this.autonomousTicks.set(person.id, (this.autonomousTicks.get(person.id) ?? 0) + 1);
    }
  }

  observe(before: DecisionSnapshot, after: DecisionSnapshot, day: number, chosen?: unknown): void {
    const row = this.counts.get(before.id) ?? emptyCounts();
    row.thinkCalls++;
    if (chosen === null) row.nullChoices++;
    const changedAction = before.action !== after.action;
    if (before.action === 'idle' && after.action !== 'idle') row.starts++;

    // The player reads a score table and orders are deliberate; neither is an
    // autonomous NPC reorientation. Idle-to-action starts are reported apart.
    const autonomous = !before.isPlayer && !after.isPlayer && before.order === null && after.order === null;
    if (autonomous && before.action !== 'idle' && changedAction) row.actionChanges++;
    else if (autonomous && before.action !== 'idle' && !changedAction && before.target !== after.target) row.retargets++;
    this.counts.set(before.id, row);

    let daily = this.dailyCounts.get(day);
    if (!daily) this.dailyCounts.set(day, daily = new Map());
    const dailyRow = daily.get(before.id) ?? emptyCounts();
    addCounts(dailyRow, {
      thinkCalls: 1,
      actionChanges: autonomous && before.action !== 'idle' && changedAction ? 1 : 0,
      retargets: autonomous && before.action !== 'idle' && !changedAction && before.target !== after.target ? 1 : 0,
      starts: before.action === 'idle' && after.action !== 'idle' ? 1 : 0,
      nullChoices: chosen === null ? 1 : 0,
    });
    daily.set(before.id, dailyRow);
  }

  report() {
    const personDays = this.personTicks / this.ticksPerDay;
    const autonomousPersonDays = this.autonomousPersonTicks / this.ticksPerDay;
    const totals = [...this.counts.values()].reduce((sum, row) => {
      addCounts(sum, row);
      return sum;
    }, emptyCounts());
    const allRate = (value: number) => personDays === 0 ? 0 : value / personDays;
    const autonomousRate = (value: number) => autonomousPersonDays === 0 ? 0 : value / autonomousPersonDays;
    const perPerson = [...new Set([...this.aliveTicks.keys(), ...this.counts.keys()])].map(id => {
      const days = (this.aliveTicks.get(id) ?? 0) / this.ticksPerDay;
      const npcDays = (this.autonomousTicks.get(id) ?? 0) / this.ticksPerDay;
      const row = this.counts.get(id) ?? emptyCounts();
      return {
        id, personDays: days, autonomousPersonDays: npcDays, ...row,
        actionChangesPerAutonomousPersonDay: npcDays === 0 ? 0 : row.actionChanges / npcDays,
        retargetsPerAutonomousPersonDay: npcDays === 0 ? 0 : row.retargets / npcDays,
        reorientationsPerAutonomousPersonDay: npcDays === 0 ? 0 : (row.actionChanges + row.retargets) / npcDays,
        startsPerPersonDay: days === 0 ? 0 : row.starts / days,
      };
    });
    const perDay = [...this.dailyCounts.entries()].sort(([a], [b]) => a - b).map(([day, people]) => {
      const dayTotals = [...people.values()].reduce((sum, row) => {
        addCounts(sum, row);
        return sum;
      }, emptyCounts());
      return {
        day,
        ...dayTotals,
        perPerson: [...people.entries()].map(([id, row]) => ({ id, ...row })),
      };
    });
    return {
      scope: 'Brain.think transitions only; finish/start and ActionSystem.execute changes are outside this count.',
      ticksPerDay: this.ticksPerDay,
      personDays,
      autonomousPersonDays,
      ...totals,
      reorientations: totals.actionChanges + totals.retargets,
      actionChangesPerPersonDay: allRate(totals.actionChanges),
      retargetsPerPersonDay: allRate(totals.retargets),
      reorientationsPerPersonDay: allRate(totals.actionChanges + totals.retargets),
      startsPerPersonDay: allRate(totals.starts),
      actionChangesPerAutonomousPersonDay: autonomousRate(totals.actionChanges),
      retargetsPerAutonomousPersonDay: autonomousRate(totals.retargets),
      reorientationsPerAutonomousPersonDay: autonomousRate(totals.actionChanges + totals.retargets),
      perPerson,
      perDay,
    };
  }
}