import { publicExchangeOffer, publicUtterances } from './public-exchanges';
import { publicCommands } from './public-voice-content';
import { validateYieldReturn } from './settlement.ts';
import type { Command, State } from './sim.ts';
import { STORY_CHOICES, type StoryChoice } from './story-content.ts';
import { activeStory, storyClock, storyReason } from './story-records.ts';

/** Ordinary resident actions. Stable controls retain keyboard focus across ticks. */
export function updateStoryControls(
  host: HTMLElement,
  s: State,
  selected: string[],
  issue: (c: Command) => void,
) {
  const id = selected.length === 1 ? selected[0] : undefined;
  const rows: { id: string; line: string; why: string; command: Command }[] = [];
  if (s.villagers)
    for (const [index, row] of publicCommands(s, selected).entries()) {
      let why = '';
      try {
        publicExchangeOffer(s, row.command);
      } catch (e) {
        why = e instanceof Error ? e.message : 'Unavailable';
      }
      rows.push({ id: `public-${row.command.topic}-${index}`, line: row.line, why, command: row.command });
    }
  if (id) {
    if (s.settlement) {
      let why = '';
      try {
        validateYieldReturn(s, [id]);
      } catch (e) {
        why = e instanceof Error ? e.message : 'Unavailable';
      }
      rows.push({
        id: 'yield-return',
        line: 'Yield, then request earlier work',
        why,
        command: { kind: 'yield-return', ids: [id] },
      });
    }
    for (const [choice, d] of Object.entries(STORY_CHOICES)) {
      if (d.actor !== id) continue;
      // The settlement reply panel owns first answers; second answers use their exact result here.
      if (s.settlement && d.group === 'first') continue;
      if (d.group === 'first' && s.story?.firstResults.some((e) => e.actor === id)) continue;
      if (d.group === 'collaboration' && s.villagers.find((v) => v.id === id)?.discovery !== 1) continue;
      if (d.group === 'second') {
        const first = s.story?.firstResults?.find((e) => e.actor === id && e.branch === d.prior);
        if (!first || s.story?.events.some((e) => e.predecessors.includes(first.id))) continue;
      }
      if (d.group === 'dai' && s.story?.events.some((e) => e.actor === id && e.choice.startsWith('dai-')))
        continue;
      if (
        d.group === 'card' &&
        s.story?.events.some((e) => e.actor === id && e.choice.startsWith('nora-card-'))
      )
        continue;
      if (d.group === 'dai' && !s.story?.sources.some((e) => e.actor === id)) continue;
      if (d.group === 'prepare' && !s.story?.sources.some((e) => e.actor === id)) continue;
      if (d.group === 'card' && !s.story?.reads.some((e) => e.actor === id)) continue;
      if (
        ['advance', 'pack'].includes(d.group) &&
        !s.settlement?.storm &&
        !s.story?.storm &&
        !s.buildings.some((b) => b.kind !== 'town' && b.complete)
      )
        continue;
      if (
        ['advance', 'pack'].includes(d.group) &&
        !s.story?.objects.some((o) => o.kind === d.object && !o.unfinished)
      )
        continue;
      rows.push({
        id: choice,
        line:
          choice === 'pack-telescope' &&
          s.settlement?.completed.some((e) => e.actor === id && e.scene === 'telescope')
            ? 'Pack the telescope after tonight’s observation.'
            : `${d.line}${d.paper ? ` · ${d.paper} sheet on first start; paid retry keeps its sheet.` : ''}`,
        why: storyReason(s, id, choice as StoryChoice),
        command: { kind: 'story-act', ids: [id], choice: choice as StoryChoice },
      });
    }
    if (id === 'v1' && s.story?.objects.some((o) => o.kind === 'card' && !o.unfinished))
      rows.push({
        id: 'read-card',
        line: 'Show Nora Dai’s inspection card',
        why: storyReason(s, id, 'read-card'),
        command: { kind: 'story-act', ids: [id], choice: 'read-card' },
      });
  }
  if (s.settlement?.storm && selected.length)
    rows.push({
      id: 'evening-roof',
      line: 'Let the selected people rest under the roof.',
      why: '',
      command: { kind: 'long-roof-break-return', ids: [...selected] },
    });
  if (s.settlement?.storm || s.continuedWorkshop)
    for (const [action, line] of [
      ['continue', 'Continue tonight.'],
      ['close', 'End my evening here.'],
      ['keep-playing', 'Keep playing'],
    ] as const) {
      if ((action === 'keep-playing') !== !!s.story?.close) continue;
      rows.push({
        id: `evening-${action}`,
        line: s.morningWorkshop
          ? action === 'close'
            ? 'End my morning here.'
            : 'Continue the morning task.'
          : line,
        why: '',
        command: { kind: 'evening', action },
      });
    }
  let panel = host.querySelector<HTMLElement>('#story-actions');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'story-actions';
    host.append(panel);
  }
  const key = rows.map((r) => r.id).join('|');
  if (panel.dataset.key !== key) {
    panel.dataset.key = key;
    panel.replaceChildren();
    if (rows.length) {
      const heading = document.createElement('h2');
      heading.textContent = s.settlement?.storm ? 'What to finish tonight' : 'Replies and unfinished work';
      panel.append(heading);
    }
    for (const row of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.story = row.id;
      b.textContent = row.line;
      b.className = 'wide';
      const p = document.createElement('p');
      p.dataset.reason = row.id;
      p.className = 'small';
      panel.append(b, p);
    }
    const status = document.createElement('div');
    status.id = 'story-status';
    panel.append(status);
  }
  for (const row of rows) {
    const b = panel.querySelector<HTMLButtonElement>(`[data-story="${row.id}"]`)!;
    // Keep the focused node while updating its current selection/command owner.
    b.onclick = () => issue(row.command);
    b.textContent = row.line;
    b.disabled = !!row.why;
    panel.querySelector<HTMLElement>(`[data-reason="${row.id}"]`)!.textContent = row.why;
  }
  const status = panel.querySelector('#story-status')!;
  const lines: string[] = [];
  if (id) {
    const a = activeStory(s, id) ?? s.story?.attempts.findLast((a) => a.actor === id);
    if (a)
      lines.push(
        `${storyClock(s, a.requestedAt)} · ${a.status}. ${a.reason ?? (a.status === 'completed' ? 'This act finished.' : 'The result is not known until this act finishes.')}`,
      );
    for (const e of s.story?.events.filter((e) => e.actor === id) ?? [])
      lines.push(`Earlier, at ${storyClock(s, e.at)}: ${e.says}`);
    const card = s.story?.objects.find((o) => o.kind === 'card' && !o.unfinished);
    if (card) lines.push(`Dai’s inspection card, version ${card.version}: ${card.text}`);
    const y = s.yieldReturn?.findLast((a) => a.actor === id);
    if (y)
      lines.push(
        `Yield and earlier work: ${y.stage}. ${y.reason ?? 'The physical yield has not completed. Later work is unknown.'}`,
      );
  }
  if (id) {
    const a = s.story?.publicExchanges?.findLast((a) => a.command.ids.includes(id));
    if (a)
      lines.push(
        `Public invitation: ${a.status}. ${a.reason ?? 'An invitation is not a completed utterance.'}`,
      );
    for (const u of publicUtterances(s, id)) lines.push(`Spoken at ${storyClock(s, u.at)}: ${u.text}`);
  }
  if (status.textContent !== lines.join('\n')) status.textContent = lines.join('\n');
}
