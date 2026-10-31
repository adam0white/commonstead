import type { State } from './sim.ts';

/** Scope: Commonstead's outward long-day assembly reading only. Small UI-owned observations
 * contain clock/site/progress numbers, never Persons, private capacity, history or future simulation.
 * Nothing here writes the world, inputs, saves, source publication or RNG. This is a conditional
 * continuation of observed physical work, not a planner, minimum-time bound or promise of assent.
 */
type Sample = { tick: number; progress: number; site: string };
export type AssemblyPace = { from: number; to: number; gained: number };
const siteOf = (s: State) => s.buildings.find((b) => b.kind === 'storehouse');
export class AssemblyObservation {
  private world: object | null = null;
  private samples: Sample[] = [];

  reset() {
    this.world = null;
    this.samples = [];
  }
  observe(world: object, s: State) {
    if (this.world !== world) {
      this.reset();
      this.world = world;
    }
    const site = siteOf(s);
    if (
      !s.settlement ||
      !site ||
      site.complete ||
      s.settlement.storm ||
      s.ended ||
      s.chapterPaused ||
      s.pauseRequested
    ) {
      this.samples = [];
      return;
    }
    const next = { tick: s.tick, progress: site.progress, site: `${site.id}:${site.x}:${site.y}` };
    const last = this.samples.at(-1);
    if (
      last &&
      (next.site !== last.site ||
        next.tick < last.tick ||
        next.tick - last.tick > 4 ||
        next.progress < last.progress ||
        (next.tick === last.tick && next.progress !== last.progress))
    )
      this.samples = [];
    else if (last?.tick === next.tick) return; // paused/repeated render is no new observation
    this.samples.push(next);
    this.samples = this.samples.filter((p) => p.tick >= next.tick - 60);
  }
  pace(world: object, s: State): AssemblyPace | null {
    const first = this.samples[0],
      last = this.samples.at(-1),
      site = siteOf(s);
    if (
      world !== this.world ||
      !first ||
      !last ||
      last.tick !== s.tick ||
      !site ||
      last.progress !== site.progress ||
      last.site !== `${site.id}:${site.x}:${site.y}` ||
      last.tick - first.tick < 30 ||
      last.progress <= first.progress
    )
      return null;
    return { from: first.tick, to: last.tick, gained: last.progress - first.progress };
  }
}
const amount = (n: number) => Math.floor(n * 10) / 10;
const duration = (seconds: number) => `${Math.ceil(seconds / 10) * 10} game seconds`;

/** Read only after complete public steps on a fresh current host or replay-validated current import.
 * Provenance supplies complete, untrimmed history; row shape cannot detect a deleted receipt.
 */
export function deliveryReading(s: State): string[] {
  if (!s.settlement || s.ended) return [];
  const unavailable = ['Recent delivery information is unavailable.'];
  const t = s.tick;
  if (!Number.isSafeInteger(t) || t < 0 || !Array.isArray(s.story?.work)) return unavailable;
  let wood = 0,
    stone = 0;
  for (const item of s.story.work as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return unavailable;
    const row = item as Record<string, unknown>;
    if (typeof row.actor !== 'string' || typeof row.kind !== 'string' || typeof row.target !== 'string')
      return unavailable;
    if (row.kind !== 'delivery') continue;
    if (!Number.isSafeInteger(row.at) || (row.at as number) < 1 || (row.at as number) > t) return unavailable;
    if ((row.target !== 'wood' && row.target !== 'stone') || (row.at as number) <= Math.max(0, t - 60))
      continue;
    if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0) return unavailable;
    if (row.target === 'wood') wood += row.amount;
    else stone += row.amount;
    if (!Number.isFinite(wood) || !Number.isFinite(stone)) return unavailable;
  }
  if (!Number.isFinite(amount(wood)) || !Number.isFinite(amount(stone))) return unavailable;
  if (t === 0) return ['No game time has passed.'];
  const n = Math.min(t, 60);
  const window = `${n} game second${n === 1 ? '' : 's'}`;
  const fact =
    wood === 0 && stone === 0
      ? `No boards or ballast bags reached the shared store in the last ${window}.`
      : `In the last ${window}, residents delivered ${amount(wood)} boards and ${amount(stone)} ballast bags to the shared store. Amounts are rounded down to one decimal place.`;
  return [
    fact,
    'This records past deliveries. Supplies may have been spent since delivery. Future delivery times are unknown.',
  ];
}

export function goalForecast(s: State, pace: AssemblyPace | null): string[] {
  const w = s.settlement;
  if (!w) return [];
  const site = siteOf(s);
  const assembly = site
    ? `Assembly is ${Math.floor(site.progress * 100)}% complete. The site's 180 boards and 120 ballast bags have already been spent.`
    : '';
  if (w.storm)
    return [
      s.won
        ? 'The storehouse was finished at the 20:00 storm check. The supplies stayed dry.'
        : 'The storehouse was unfinished at 20:00. The supplies got soaked; later assembly cannot change that result.',
      site?.complete
        ? s.won
          ? 'The storehouse is finished now.'
          : 'The storehouse is finished now, after the storm check.'
        : site
          ? `${assembly} ${s.ended ? 'The day has ended.' : 'Assembly can still continue until tomorrow at 08:00.'}`
          : `There is no storehouse site. ${s.ended ? 'The day has ended.' : 'The day continues until tomorrow at 08:00.'}`,
    ];
  if (s.ended || s.tick >= 900)
    return [
      'The deadline has passed. A storm result is not available in this state. No completion forecast is available.',
    ];
  if (site?.complete)
    return [
      'The storehouse is finished. The storm check is still ahead at 20:00; no more assembly is needed.',
    ];
  const clock = `${900 - s.tick} game seconds remain until the storm check at 20:00.`;
  if (!site) {
    const loads = Object.values(w.actors).reduce(
      (n, a) => {
        if (a.carried?.resource === 'wood') n.wood += a.carried.amount;
        if (a.carried?.resource === 'stone') n.stone += a.carried.amount;
        return n;
      },
      { wood: 0, stone: 0 },
    );
    const wood = Math.max(0, 180 - s.resources.wood),
      stone = Math.max(0, 120 - s.resources.stone);
    return [
      clock,
      `The shared store holds ${amount(s.resources.wood)} boards and ${amount(s.resources.stone)} ballast bags. The site needs ${Math.ceil(wood)} more boards and ${Math.ceil(stone)} more ballast bags in the store.`,
      `${amount(loads.wood)} boards and ${amount(loads.stone)} ballast bags are still being carried. These are outside the store. After those loads arrive, ${Math.ceil(Math.max(0, wood - loads.wood))} more boards and ${Math.ceil(Math.max(0, stone - loads.stone))} more ballast bags would still be needed.`,
      wood || stone
        ? `Next: ${loads.wood || loads.stone ? 'return the carried materials to the workshop hub and collect any remaining shortage' : 'collect the missing boards and ballast bags and deliver them to the workshop hub'}. Completion time is unknown: collection, delivery, travel and assembly are still ahead.`
        : 'Next: select available builders, choose Storehouse and tap open ground. Completion time is unknown until assembly is underway and recent work has been observed.',
    ];
  }
  const active = Object.values(w.actors).some(
    (a) =>
      a.running?.purpose === 'job' && a.running.job?.kind === 'build' && a.running.job.target === site.id,
  );
  const next =
    'To add builders, select people, choose Move / add builders, then tap the unfinished storehouse. Each person may choose other work or a break.';
  if (s.chapterPaused || s.pauseRequested)
    return [
      clock,
      assembly,
      'The day is paused or stopping at action boundaries. Resume before observing a new assembly pace.',
      next,
    ];
  if (!active)
    return [
      clock,
      assembly,
      'Assembly is not underway now. There is no current assembly pace to extend.',
      next,
    ];
  if (!pace || pace.to !== s.tick || pace.to - pace.from < 30 || pace.to - pace.from > 60 || pace.gained <= 0)
    return [
      clock,
      assembly,
      'Completion time is unknown. Watch at least 30 game seconds of assembly here; the reading uses only the most recent 30–60 game seconds with observed progress.',
      next,
    ];
  const remaining = ((1 - site.progress) * (pace.to - pace.from)) / pace.gained;
  const rounded = Math.ceil(remaining / 10) * 10;
  const room = 900 - s.tick;
  const timing =
    rounded < room - 10
      ? 'That pace would finish before the storm check.'
      : rounded > room + 10
        ? 'That pace would not finish before the storm check.'
        : 'That estimate is close to the storm check, with little room for a change of pace.';
  return [
    clock,
    assembly,
    `At the pace observed over the last ${pace.to - pace.from} game seconds, assembly would need about ${duration(remaining)} more. ${timing}`,
    'This estimate holds only if people keep choosing assembly and the observed pace continues. It includes the progress made by all builders during that window. It does not predict choices, breaks or future travel. The site already has its materials.',
    next,
  ];
}
