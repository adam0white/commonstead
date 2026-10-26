export function prefillFeedbackChoice(note: string, previous: string, next: string): string {
  // Remove only the untouched choice, never an edited opening sentence.
  const rest =
    previous && note === previous
      ? ''
      : previous && note.startsWith(`${previous}\n\n`)
        ? note.slice(previous.length + 2)
        : note;
  return [next, rest].filter(Boolean).join('\n\n');
}
