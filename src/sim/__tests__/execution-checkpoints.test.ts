import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';

describe('execution checkpoints', () => {
  it('continues each fork independently after JSON without consuming its parent', () => {
    const parent = new RNG('saved-streams');
    const streams = [parent, parent.fork(), parent.fork()];
    streams.forEach((stream, index) => {
      for (let i = 0; i < 137 * index; i++) stream.nextUint32();
    });
    const before = parent.getState();
    const checkpoints = streams.map(stream => stream.snapshot());
    const restored = checkpoints.map(checkpoint => RNG.fromSnapshot(JSON.parse(JSON.stringify(checkpoint))));
    expect(parent.getState()).toEqual(before);
    for (let i = 0; i < streams.length; i++) {
      const source = streams[i]!;
      const copy = restored[i]!;
      expect(copy).toBeInstanceOf(RNG);
      for (let draw = 0; draw < 512; draw++) expect(copy.nextUint32()).toBe(source.nextUint32());
      expect(copy.gaussian()).toBe(source.gaussian());
      const a = ['a', 'b', 'c', 'd'];
      const b = [...a];
      copy.shuffle(a);
      source.shuffle(b);
      expect(a).toEqual(b);
    }
    expect(checkpoints[0]!.words).toEqual(before);
    const checkpoint = parent.snapshot();
    const copy = RNG.fromSnapshot(checkpoint);
    (checkpoint.words as unknown as number[])[0] = 0;
    expect(copy.getState()).not.toEqual(checkpoint.words);
  });

  it('rejects corrupted RNG checkpoints, including the absorbing zero state', () => {
    const valid = new RNG(3).snapshot();
    for (const invalid of [undefined, null, [], {}, { ...valid, version: 2 },
      { ...valid, extra: true }, { version: 1, words: [0, 0, 0, 0] },
      { version: 1, words: [1, 2, 3] }, { version: 1, words: [1, 2, 3, -1] },
      { version: 1, words: [1, 2, 3, 2 ** 32] }, { version: 1, words: [1, 2, 3, 0.5] },
      { version: 1, words: [1, 2, 3, NaN] }, { version: 1, words: [1, , 3, 4] }, Object.create(valid)]) {
      expect(() => RNG.fromSnapshot(invalid)).toThrow(TypeError);
    }
    // One zero word is a valid state; only the four-word zero trap must be excluded.
    expect(RNG.fromSnapshot({ version: 1, words: [0, 1, 0, 0] }).nextUint32()).toBe(0);
  });

  it('restores a non-default calendar and continues across midnight and year boundaries', () => {
    const config = { ...DEFAULT_CONFIG.time, ticksPerDay: 7, daysPerSeason: 3, startDay: 10 };
    const source = new TimeManager(config);
    source.tick = 13;
    const snapshot = source.snapshot();
    const copy = TimeManager.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(copy).toBeInstanceOf(TimeManager);
    for (let i = 0; i < 100; i++) {
      expect(copy.snapshot()).toEqual(source.snapshot());
      expect([copy.day, copy.dayFraction, copy.season, copy.year, copy.daysPerYear,
        copy.daylight, copy.temperature, copy.growth, copy.dailyGrowth, copy.isNight, copy.label()])
        .toEqual([source.day, source.dayFraction, source.season, source.year, source.daysPerYear,
          source.daylight, source.temperature, source.growth, source.dailyGrowth, source.isNight, source.label()]);
      source.advance();
      copy.advance();
    }
    config.daysPerSeason = 9;
    snapshot.config.daysPerSeason = 8;
    expect(copy.daysPerYear).toBe(12);
  });

  it('rejects missing, unknown and unusable calendar state', () => {
    const valid = new TimeManager(DEFAULT_CONFIG.time).snapshot();
    for (const invalid of [undefined, null, [], {}, Object.create(valid),
      { ...valid, version: 2 }, { ...valid, tick: -1 }, { ...valid, tick: 0.5 },
      { ...valid, tick: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, extra: true },
      { ...valid, config: Object.create(valid.config) },
      ...Object.keys(valid.config).map(key => ({ ...valid, config: { ...valid.config, [key]: NaN } })),
      ...['ticksPerDay', 'daysPerSeason', 'maxTicksPerFrame', 'tickRate'].map(key =>
        ({ ...valid, config: { ...valid.config, [key]: 0 } })),
      { ...valid, config: { ...valid.config, startDay: -1 } },
      { ...valid, config: { ...valid.config, startDay: 0.5 } },
      { ...valid, config: { ...valid.config, daysPerSeason: Number.MAX_SAFE_INTEGER } },
      { ...valid, tick: Number.MAX_SAFE_INTEGER,
        config: { ...valid.config, startDay: Number.MAX_SAFE_INTEGER } },
      { ...valid, config: { ...valid.config, extra: 1 } }]) {
      expect(() => TimeManager.fromSnapshot(invalid)).toThrow(TypeError);
    }
  });
});
