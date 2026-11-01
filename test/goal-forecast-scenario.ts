// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { apply, createGame, type State, step } from '../src/sim.ts';

// One fixed public long-day schedule. Requests use ordinary HF decisions; no Person or RNG edits.
export function forecastDay() {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  const crew = s.villagers.slice(0, 4).map((v) => v.id);
  for (const [i, id] of crew.entries())
    apply(s, { kind: 'order', ids: [id], target: i < crew.length / 2 ? 'wood' : 'stone' });
  return { s, crew, yielding: null as string | null, yielded: new Set<string>() };
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
      run.yielded.add(run.yielding);
      apply(s, { kind: 'settlement', ids: [run.yielding], action: 'yield' });
    }
    // A later dispute can begin before an earlier yielding resident finishes.
    // Retain each displaced request until that resident reaches a real free boundary.
    for (const id of run.yielded) {
      const a = w.actors[id];
      if (w.dispute?.includes(id) || a?.job || a?.carried || (a?.running && a.running.purpose !== 'body'))
        continue;
      apply(s, { kind: 'order', ids: [id], target: crew.indexOf(id) < crew.length / 2 ? 'wood' : 'stone' });
      run.yielded.delete(id);
      if (run.yielding === id) run.yielding = null;
    }
    if (s.resources.wood >= 180 && s.resources.stone >= 120) {
      const builders = s.villagers
        .map((v) => v.id)
        .filter((id) => {
          const a = w.actors[id];
          return !!a && (!a.running || a.running.purpose === 'body') && !a.carried && a.map === 'yard';
        });
      apply(s, { kind: 'build', ids: builders, building: 'storehouse', x: 650, y: 500 });
    }
  }
  const before = s.tick;
  step(s);
  if (s.tick <= before) throw new Error(`Forecast day stopped at tick ${s.tick}.`);
}
export const storehouse = (s: State) => s.buildings.find((b) => b.kind === 'storehouse');
