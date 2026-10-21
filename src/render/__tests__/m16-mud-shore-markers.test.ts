import { describe, expect, it, afterEach } from 'vitest';
import { createWaterLakeSimulation } from '../../../tools/waterFishFixture.ts';
import { canDigBankMud } from '../../sim/core/Earth.ts';
import { availableActions } from '../../sim/ai/ActionCatalog.ts';
import { language, setLanguage } from '../../i18n/i18n.ts';
import { mudBankMarkerTiles } from '../TerrainMarkers.ts';

afterEach(() => setLanguage('en'));

describe('m16-mud-shore-markers', () => {
  it('marks exactly the walkable tiles beside fresh water where mud is diggable', () => {
    const sim = createWaterLakeSimulation('m16-mud-shore-markers', { world: { clayBanks: 0 } });
    const expected = new Set(sim.world.freshShore
      .filter(tile => canDigBankMud(sim.world, tile.x, tile.y))
      .map(tile => `${tile.x},${tile.y}`));
    const actual = new Set(mudBankMarkerTiles(sim.world).map(tile => `${tile.x},${tile.y}`));
    expect(actual).toEqual(expected);
  });

  it('keeps the dig mud option visible and explains a dry tile in English and Spanish', () => {
    const sim = createWaterLakeSimulation('m16-mud-marker-menu', { world: { clayBanks: 0 } });
    const person = sim.livingPeople()[0]!;
    person.inventory.add('sticks', 1);
    const dry = sim.world.freshShore.find(tile => !canDigBankMud(sim.world, tile.x, tile.y)) ??
      sim.world.shoreTiles.find(tile => !canDigBankMud(sim.world, tile.x, tile.y));
    expect(dry).toBeDefined();
    const getOption = () => availableActions(person, { kind: 'ground', ...dry! },
      { world: sim.world, nearWater: false }).find(option => option.id === 'dig_mud');
    const english = getOption();
    expect(english?.enabled).toBe(false);
    expect(english?.reason).toBe('there is no freshwater mud bank there');
    setLanguage('es');
    expect(language()).toBe('es');
    expect(getOption()?.reason).toBe('no hay una orilla de barro de agua dulce allí');
  });
});
