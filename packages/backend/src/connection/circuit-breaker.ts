// ---------------------------------------------------------------------------
// Circuit breaker: closed → open (after N failures) → half-open → closed
// ---------------------------------------------------------------------------

export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private lastFailure = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 30_000,
  ) {}

  get isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure >= this.cooldownMs) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  get currentState(): BreakerState {
    // Trigger half-open check
    if (this.state === 'open' && Date.now() - this.lastFailure >= this.cooldownMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailure = 0;
  }
}
