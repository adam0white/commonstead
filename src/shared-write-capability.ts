import { requirePeerReadiness } from './passport';

/** Use the released SDK peer gate before any shared producer writes. Unknown peers refuse. */
export function requireSharedWriteCapability(castId: string): void {
  requirePeerReadiness(castId);
}
