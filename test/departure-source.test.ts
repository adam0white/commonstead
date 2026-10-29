import { expect, test } from 'vitest';
import { prepareDeparture } from '../src/departure-source';
import { archiveCommunity } from '../src/hf4';
import { PRESSURE } from '../src/pressure';
import { apply, createGame, exportRun, step } from '../src/sim';

// Local custody is not permission to publish a portable copy to another receiver.
test('local departure retains complete source, physical stock and public portable calendar', async () => {
  const s = createGame(42, undefined, undefined, PRESSURE);
  step(s);
  apply(s, { kind: 'pause-chapter' });
  const native = exportRun(s);
  const candidate = await prepareDeparture(s, 'v1', {
    runId: 'actual-local-control',
    source: { game: 'commonstead', build: 'mechanism-control', engine: '4.6.0', rules: 'commonstead-4' },
    heads: [],
    sources: [],
  });
  expect(candidate.native).toEqual(native);
  expect(candidate.stock).toEqual(s.resources);
  expect(candidate.portable.castId).toBe(s.villagers[0]!.person.id);
  expect(candidate.publication.supported).toBe(false);
  expect(candidate.calendar).toBeDefined();
  expect(candidate.calendar).toEqual(
    archiveCommunity(s.villagers[0]!.person).initial.spec.definitions.calendar,
  );
});
