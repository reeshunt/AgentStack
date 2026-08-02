/**
 * Minimal async-iterable queue used to feed streaming-input mode: the Agent
 * SDK's `prompt` accepts an AsyncIterable<SDKUserMessage>, and this lets the
 * session stay open across multiple user turns instead of one-shot prompts.
 */
export class PushQueue<T> implements AsyncIterable<T> {
  private buffered: T[] = []
  private waiting: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const waiter = this.waiting.shift()
    if (waiter) {
      waiter({ value: item, done: false })
    } else {
      this.buffered.push(item)
    }
  }

  close(): void {
    this.closed = true
    while (this.waiting.length) {
      this.waiting.shift()?.({ value: undefined as never, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffered.length) {
          return Promise.resolve({ value: this.buffered.shift() as T, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as never, done: true })
        }
        return new Promise((resolve) => this.waiting.push(resolve))
      }
    }
  }
}
