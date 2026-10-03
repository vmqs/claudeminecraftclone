import { COULD_NOT_CONNECT, ConnectError, type GuestTransport, type HostTransport, type NetConnection } from './Transport';

/**
 * An in-memory transport (the original's MemoryConnection): host and guests in the same
 * JavaScript realm, used by the Node tests and by `?net=local` pages. Messages are queued and
 * delivered by flush() (tests call it between ticks), or on a microtask when `auto` is set.
 */
export class MemoryHub {
  private readonly hosts = new Map<string, MemoryHost>();
  private readonly queue: (() => void)[] = [];
  private scheduled = false;
  private nextPeer = 1;

  constructor(readonly auto = false) {}

  /** Delivers every queued message (and the ones they cause), in order. */
  flush(): number {
    let n = 0;
    while (this.queue.length > 0) {
      this.queue.shift()!();
      n++;
    }
    return n;
  }

  enqueue(fn: () => void): void {
    this.queue.push(fn);
    if (this.auto && !this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this.flush();
      });
    }
  }

  newPeerId(): string {
    return `mem-${this.nextPeer++}`;
  }

  register(code: string, host: MemoryHost): void {
    this.hosts.set(code, host);
  }

  unregister(code: string, host: MemoryHost): void {
    if (this.hosts.get(code) === host) this.hosts.delete(code);
  }

  find(code: string): MemoryHost | undefined {
    return this.hosts.get(code);
  }

  host(): MemoryHost {
    return new MemoryHost(this);
  }

  guest(): MemoryGuest {
    return new MemoryGuest(this);
  }
}

class MemoryConnection implements NetConnection {
  other: MemoryConnection | null = null;
  isOpen = true;
  onMessage: ((frame: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  /** Bytes sent so far (tests read it to check bandwidth). */
  bytesSent = 0;
  framesSent = 0;

  constructor(
    private readonly hub: MemoryHub,
    readonly peerId: string,
  ) {}

  get pendingSends(): number {
    return 0;
  }

  send(frame: Uint8Array): void {
    if (!this.isOpen) return;
    this.bytesSent += frame.length;
    this.framesSent++;
    const to = this.other;
    const copy = frame.slice();
    this.hub.enqueue(() => {
      if (to && to.isOpen) to.onMessage?.(copy);
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    const to = this.other;
    this.hub.enqueue(() => to?.closedByPeer('The other side closed the connection'));
  }

  closedByPeer(reason: string): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose?.(reason);
  }
}

export class MemoryHost implements HostTransport {
  onConnection: ((c: NetConnection) => void) | null = null;
  private code: string | null = null;
  readonly connections: NetConnection[] = [];

  constructor(private readonly hub: MemoryHub) {}

  start(code: string): Promise<void> {
    this.code = code;
    this.hub.register(code, this);
    return Promise.resolve();
  }

  /** A guest connected: returns the guest's end. */
  accept(): MemoryConnection {
    const id = this.hub.newPeerId();
    const hostEnd = new MemoryConnection(this.hub, id);
    const guestEnd = new MemoryConnection(this.hub, 'host');
    hostEnd.other = guestEnd;
    guestEnd.other = hostEnd;
    this.connections.push(hostEnd);
    this.onConnection?.(hostEnd);
    return guestEnd;
  }

  stop(): void {
    if (this.code) this.hub.unregister(this.code, this);
    for (const c of this.connections) c.close();
    this.connections.length = 0;
  }

  describe(): string {
    return 'memory';
  }
}

export class MemoryGuest implements GuestTransport {
  constructor(private readonly hub: MemoryHub) {}

  connect(code: string, _timeoutMs: number): Promise<NetConnection> {
    const host = this.hub.find(code);
    if (!host) return Promise.reject(new ConnectError(COULD_NOT_CONNECT));
    return Promise.resolve(host.accept());
  }

  cancel(): void {}
}
