import { publicUtterances } from './public-exchanges';
import type { Account } from './settlement';
import { REPLIES } from './settlement-scenes';
import type { State } from './sim.ts';
import { STORY_CHOICES } from './story-content';
// Only outward HF narration and recorded authored exchanges. Never a private memory DTO.
export function publicTranscript(s: State, id: string) {
  const v = s.villagers.find((v) => v.id === id);
  if (!v) return [];
  const lines: {
    source: string;
    clock: string;
    kind: string;
    text: string;
    actor?: string;
    status?: string;
  }[] = [...(s.story?.sources ?? []), ...(s.story?.events ?? [])]
    .filter((e) => e.actor === id)
    .map((e) => ({
      source: e.id,
      clock: `game tick ${e.at}`,
      kind: e.choice,
      text: e.says,
      actor: e.actor,
      status: 'completed',
    }));
  // CS-R11: project delivered lines and completed receipts, never a pending request.
  for (const a of s.story?.attempts ?? [])
    if (
      a.actor === id &&
      a.deliveredAt !== undefined &&
      a.choice !== 'read-card' &&
      a.choice !== 'advance-card'
    )
      lines.push({
        source: `${a.id}:player`,
        actor: id,
        status: a.status,
        clock: `game tick ${a.deliveredAt}`,
        kind: 'player line',
        text: STORY_CHOICES[a.choice].line,
      });
  for (const a of s.settlement?.replyScenes?.[id]?.attempts ?? [])
    if (a.deliveredAt !== undefined)
      lines.push({
        source: `${a.id}:player`,
        actor: id,
        status: a.status,
        clock: `game tick ${a.deliveredAt}`,
        kind: 'player line',
        text: REPLIES[a.branch].line,
      });
  for (const r of s.story?.firstResults ?? [])
    if (r.actor === id && !lines.some((e) => e.source === r.id))
      lines.push({
        source: r.id,
        actor: id,
        status: 'completed',
        clock: `game tick ${r.at}`,
        kind: 'first reply',
        text: r.says,
      });
  for (const [i, d] of v.person.trace.entries()) {
    const text = d.suggestion?.says || d.narration;
    if (text)
      lines.push({
        source: `decision:${v.person.id}:${i}`,
        clock: `resident time ${d.at.toFixed(3)} minutes`,
        kind: 'public decision',
        text,
      });
  }
  for (const [i, a] of (s.settlement?.accounts ?? []).entries())
    if (a.speaker === v.name || a.listener === v.name)
      lines.push({
        source: `account:${i}:${a.at}`,
        clock: `game tick ${a.at}`,
        kind: publicAccountView(a).kind,
        text: a.text,
      });
  for (const utterance of publicUtterances(s, id))
    lines.push({
      source: utterance.source,
      clock: `game tick ${utterance.at}`,
      kind: 'completed public speech',
      text: utterance.text,
      actor: id,
      status: 'completed',
    });
  return lines;
}

// A host absence row is not evidence that either resident said these words.
export function publicAccountView(a: Account) {
  return {
    kind:
      a.text === 'No outward supply account was recorded.'
        ? 'no outward account'
        : `${a.speaker} to ${a.listener}`,
    text: a.text,
  };
}
