export type SaveState = { localRevision: number; savedRevision: number };
export function acknowledge(state: SaveState, sequence: number): SaveState {
  return sequence > state.localRevision || sequence < state.savedRevision ? state : { ...state, savedRevision: sequence };
}

/** One writer per loaded canvas. DB revisions never stand in for local edit sequences. */
export class SaveCoordinator<T> {
  state: SaveState = { localRevision: 0, savedRevision: 0 };
  private running: Promise<void> | undefined;
  error: unknown;
  constructor(public value: T, private storageRevision: number,
    private readonly save: (snapshot: T, expectedRevision: number) => Promise<number>,
    private readonly changed: () => void = () => {}) {}
  get dirty() { return this.state.localRevision !== this.state.savedRevision; }
  edit(value: T) { this.value = value; this.state = { ...this.state, localRevision: this.state.localRevision + 1 }; this.changed(); }
  retry(): Promise<void> {
    if (String(this.error).includes('REVISION_CONFLICT')) return Promise.reject(this.error);
    this.error = undefined;
    return this.flush();
  }
  flush(): Promise<void> {
    if (this.error) return Promise.reject(this.error);
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async drain() {
    while (this.dirty) {
      const sequence = this.state.localRevision, snapshot = this.value;
      try {
        this.storageRevision = await this.save(snapshot, this.storageRevision);
        this.state = acknowledge(this.state, sequence);
        this.changed();
      } catch (error) { this.error = error; this.changed(); throw error; }
    }
  }
}
