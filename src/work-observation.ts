import { nextTask, personStatus, residentName } from './display.ts';

/** Presentation only. Observe host break clocks and visible task transitions.
 * No Person fields, recovery estimates, simulation writes or saved state.
 * History covers this open play view; loading a run does not invent earlier observations.
 */
type Worker = {
  id: string;
  name: string;
  status: string;
  task: string;
  recoveryUntil: number;
  order: { target: string } | null;
};
type Site = { id: string; kind: string };
export class WorkObservation {
  private breaks = new Map<string, { until: number; task: string }>();
  private outcomes = new Map<string, string>();

  observe(tick: number, people: readonly Worker[], buildings: readonly Site[]) {
    for (const v of people) {
      const prior = this.breaks.get(v.id);
      if (prior && (v.recoveryUntil !== prior.until || tick >= prior.until)) {
        const clock = `${Math.floor(tick / 60)}:${String(tick % 60).padStart(2, '0')}`;
        this.outcomes.set(
          v.id,
          tick >= prior.until
            ? `At ${clock}, ${residentName(v)} finished ${prior.task === 'resting' ? 'resting' : prior.task === 'drinking' ? 'drinking' : 'eating and drinking'}. Afterward, ${residentName(v)} ${this.current(v, buildings)}`
            : `${residentName(v)}'s ${prior.task === 'resting' ? 'rest' : 'meal or drink'} ended before the planned end.`,
        );
        this.breaks.delete(v.id);
      }
      if (v.recoveryUntil > tick) {
        this.breaks.set(v.id, { until: v.recoveryUntil, task: v.task });
      }
    }
  }

  private current(v: Worker, buildings: readonly Site[]): string {
    if (v.order && ['working', 'working under protest', 'moving'].includes(v.status)) {
      const task = nextTask(v.order.target, buildings);
      return v.status === 'moving'
        ? `is on the way to ${task}.`
        : `is working, ${task}${v.status === 'working under protest' ? ' under protest' : ''}.`;
    }
    return personStatus(v.status, buildings, residentName(v));
  }

  line(v: Worker, tick: number, buildings: readonly Site[]): string {
    const remaining =
      v.recoveryUntil > tick ? ` ${v.recoveryUntil - tick} seconds remain in this break.` : '';
    return `Now: ${residentName(v)} ${this.current(v, buildings)}${remaining}${this.outcomes.has(v.id) ? ` ${this.outcomes.get(v.id)}` : ''}`;
  }
}
