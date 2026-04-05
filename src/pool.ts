/** Generic object pool to avoid GC churn. */
export class Pool<T> {
  private available: T[] = [];

  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
  ) {}

  get(): T {
    const obj =
      this.available.length > 0 ? this.available.pop()! : this.factory();
    this.reset(obj);
    return obj;
  }

  release(obj: T) {
    this.available.push(obj);
  }
}
