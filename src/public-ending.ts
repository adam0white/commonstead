import { publicUtterances } from './public-exchanges';
import { closingCommand } from './public-voice-content';
import type { Command, State } from './sim';
import { storyClosing } from './story-records';

// Narrator facts never become utterances merely because an ending displays them.
export function publicEnding(s: State, id: string) {
  return {
    narration: storyClosing(s, id),
    spoken: publicUtterances(s, id),
    earlier: [...(s.story?.sources ?? []), ...(s.story?.events ?? []), ...(s.story?.firstResults ?? [])]
      .filter((e) => e.actor === id)
      .map((e) => ({ source: e.id, at: e.at, text: e.says })),
  };
}
export function continueAndAskClosing(current: () => State, id: string, issue: (c: Command) => void) {
  issue({ kind: 'continue-workshop' });
  // The continuation is real even if the subsequent live invitation refuses.
  issue(closingCommand(current(), id));
}
