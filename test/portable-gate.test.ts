import { portableWriteBlockers } from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import { requirePeerReadiness } from '../src/passport';

test('refuses a shared resident write while a peer is not verified ready', () => {
  const id = 'hf.cast.burak.stairwell';
  expect(portableWriteBlockers(id, 'commonstead').length).toBeGreaterThan(0);
  expect(() => requirePeerReadiness(id)).toThrow('saved history');
});
