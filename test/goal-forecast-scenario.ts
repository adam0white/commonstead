import { apply, createGame, type State, step } from '../src/sim.ts';

// One fixed public long-day schedule. Requests use ordinary HF decisions; no Person or RNG edits.
export function forecastDay() {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  const crew = s.villagers.slice(0, 4).map((v) => v.id);
  for (const [i, id] of crew.entries())
    apply(s, { kind: 'order', ids: [id], target: i < 2 ? 'wood' : 'stone' });
  return { s, crew, yielding: null as string | null };
}
export function advanceForecastDay(run: ReturnType<typeof forecastDay>) {
  const { s, crew } = run;
  const w = s.settlement;
  if (!w) throw new Error('Expected a long settlement day.');
  if (!s.buildings.some((b) => b.kind === 'storehouse')) {
    if (
      w.dispute &&
      (!run.yielding || (s.tick % 20 === 0 && w.actors[run.yielding]?.job?.kind !== 'yield'))
    ) {
      run.yielding = w.dispute[0];
      apply(s, { kind: 'settlement', ids: [run.yielding], action: 'yield' });
    }
    if (run.yielding && !w.dispute && !w.actors[run.yielding]?.job) {
      apply(s, {
        kind: 'order',
        ids: [run.yielding],
        target: crew.indexOf(run.yielding) < 2 ? 'wood' : 'stone',
      });
      run.yielding = null;
    }
    if (s.resources.wood >= 180 && s.resources.stone >= 120) {
      const builders = s.villagers
        .map((v) => v.id)
        .filter((id) => {
          const a = w.actors[id];
          return !!a && !a.running && !a.carried && a.map === 'yard';
        });
      apply(s, { kind: 'build', ids: builders, building: 'storehouse', x: 650, y: 500 });
    }
  }
  step(s);
}
export const storehouse = (s: State) => s.buildings.find((b) => b.kind === 'storehouse');
