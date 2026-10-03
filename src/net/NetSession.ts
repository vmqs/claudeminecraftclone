import { MemoryHub } from './transport/MemoryTransport';
import type { GuestTransport, HostTransport } from './transport/Transport';
import { type SignallingStrategy, TrysteroGuest, TrysteroHost, type TrysteroOptions } from './transport/TrysteroTransport';

/**
 * Which transport the page uses, from its URL:
 * - default: WebRTC with public signalling (Nostr, then BitTorrent trackers);
 * - `?relay=ws://localhost:4401` (repeatable or comma separated): a self-hosted trystero
 *   WebSocket relay as the only signalling route (local tests, private setups);
 * - `?signal=nostr,torrent`: choose the public routes;
 * - `?net=memory`: host and guest in the same page (dev only).
 */
export function transportOptions(search: string = typeof location === 'undefined' ? '' : location.search): TrysteroOptions & { memory: boolean } {
  const q = new URLSearchParams(search);
  const relayUrls = q
    .getAll('relay')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => /^wss?:\/\//.test(v));
  const strategies = (q.get('signal') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is SignallingStrategy => v === 'nostr' || v === 'torrent');
  return { relayUrls, strategies: strategies.length > 0 ? strategies : undefined, memory: q.get('net') === 'memory' };
}

let memoryHub: MemoryHub | null = null;

function hub(): MemoryHub {
  memoryHub ??= new MemoryHub(true);
  return memoryHub;
}

export function makeHostTransport(): HostTransport {
  const o = transportOptions();
  return o.memory ? hub().host() : new TrysteroHost(o);
}

export function makeGuestTransport(): GuestTransport {
  const o = transportOptions();
  return o.memory ? hub().guest() : new TrysteroGuest(o);
}

/** How long a guest looks for the host before "Could not connect to the host". */
export const CONNECT_TIMEOUT_MS = 30000;
