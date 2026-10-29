// One modal owns keyboard focus and temporary inert state; no gameplay/input semantics.
export class ModalFocus {
  private modal: HTMLElement | null = null;
  private opener: HTMLElement | null = null;
  private prior = new Map<HTMLElement, boolean>();
  constructor(private root: HTMLElement) {}
  private controls() {
    return Array.from(
      this.modal?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((e) => !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0);
  }
  private key = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const nodes = this.controls(),
      first = nodes[0],
      last = nodes.at(-1);
    if (!first) {
      e.preventDefault();
      this.modal?.focus();
      return;
    }
    if (e.shiftKey && (document.activeElement === first || !this.modal?.contains(document.activeElement))) {
      e.preventDefault();
      last?.focus();
    } else if (
      !e.shiftKey &&
      (document.activeElement === last || !this.modal?.contains(document.activeElement))
    ) {
      e.preventDefault();
      first.focus();
    }
  };
  open(modal: HTMLElement, opener: HTMLElement | null) {
    if (this.modal) {
      this.replace(modal);
      return;
    }
    this.opener = opener;
    for (const child of Array.from(this.root.children))
      if (child !== modal && child instanceof HTMLElement) {
        this.prior.set(child, child.inert);
        child.inert = true;
      }
    this.modal = modal;
    modal.addEventListener('keydown', this.key);
    this.controls()[0]?.focus({ preventScroll: true });
  }
  replace(modal: HTMLElement) {
    this.modal?.removeEventListener('keydown', this.key);
    this.modal = modal;
    modal.addEventListener('keydown', this.key);
    this.controls()[0]?.focus({ preventScroll: true });
  }
  close() {
    this.modal?.removeEventListener('keydown', this.key);
    this.modal = null;
    for (const [node, inert] of this.prior) node.inert = inert;
    this.prior.clear();
    const target = this.opener?.isConnected
      ? this.opener
      : this.root.querySelector<HTMLElement>('#menu,#new,#end-title');
    this.opener = null;
    target?.focus({ preventScroll: true });
  }
}
