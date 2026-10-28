import { expect, test } from 'vitest';
import { createFileSession } from '../src/file-session.ts';
import { readPerson, tick } from '../src/hf4.ts';
import { PRESSURE } from '../src/pressure.ts';
import { createGame, exportRun, step } from '../src/sim.ts';
import { WorkObservation } from '../src/work-observation.ts';

test('cloned file views retain inspected body readings without authority to advance the Run', async () => {
  const source = createGame(418, undefined, undefined, PRESSURE);
  step(source);
  const session = createFileSession();
  await session.select(new File([JSON.stringify(exportRun(source))], 'pressure.json'));
  const view = session.state()!;
  const resident = view.villagers[0]!;
  const observation = new WorkObservation();
  expect(() => observation.summary(view, resident)).not.toThrow();
  const expected = readPerson(source.villagers[0]!.person);
  expect(readPerson(resident.person)).toEqual(expected);
  const before = session.snapshot();
  const reading = readPerson(resident.person) as { body: { perceived: { fatigue: number } } };
  reading.body.perceived.fatigue = 1;
  expect(readPerson(resident.person)).toEqual(expected);
  expect(() => tick(resident.person, resident.person.now + 1)).toThrow('Detached resident view');
  expect(session.snapshot()).toEqual(before);
  session.resume();
  session.advance(1);
  const continued = session.state()!;
  expect(() => observation.summary(continued, continued.villagers[0]!)).not.toThrow();
});
