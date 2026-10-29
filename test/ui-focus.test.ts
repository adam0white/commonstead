import { afterEach, expect, test, vi } from 'vitest';
import { ModalFocus } from '../src/ui-focus.ts';

// Minimal DOM event surface; this proves focus ownership, not browser rendering.
class Element {
  inert = false;
  hidden = false;
  isConnected = true;
  children: Element[] = [];
  listeners = new Map<string, (e: unknown) => void>();
  focus() {
    doc.activeElement = this;
  }
  closest() {
    return null;
  }
  getClientRects() {
    return [{}];
  }
  contains(e: unknown) {
    return this === e || this.children.includes(e as Element);
  }
  querySelectorAll() {
    return this.children;
  }
  querySelector() {
    return this.children[0] ?? null;
  }
  addEventListener(k: string, f: (e: unknown) => void) {
    this.listeners.set(k, f);
  }
  removeEventListener(k: string) {
    this.listeners.delete(k);
  }
}
const doc: { activeElement: Element | null } = { activeElement: null };
afterEach(() => vi.unstubAllGlobals());
test('modal focus owner restores opener and isolates background across replacement', () => {
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', doc);
  const root = new Element(),
    game = new Element(),
    opener = new Element(),
    dialog = new Element(),
    first = new Element(),
    last = new Element();
  dialog.children = [first, last];
  root.children = [game, dialog];
  opener.focus();
  const owner = new ModalFocus(root as unknown as HTMLElement);
  owner.open(dialog as unknown as HTMLElement, opener as unknown as HTMLElement);
  expect(game.inert).toBe(true);
  expect(doc.activeElement).toBe(first);
  last.focus();
  let prevented = false;
  dialog.listeners.get('keydown')!({
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  expect(prevented).toBe(true);
  expect(doc.activeElement).toBe(first);
  const replacement = new Element(),
    next = new Element();
  replacement.children = [next];
  owner.replace(replacement as unknown as HTMLElement);
  expect(game.inert).toBe(true);
  expect(doc.activeElement).toBe(next);
  owner.close();
  expect(game.inert).toBe(false);
  expect(doc.activeElement).toBe(opener);
});
