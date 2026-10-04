/**
 * trystero's action wire layer with this project's patch (scripts/patch-trystero.mjs): what a
 * peer can make the browser buffer before the game sees a message is limited, data for action
 * types the page never created is dropped, and a peer over the limits is reported and ignored.
 * Run: node scripts/run-node-test.mjs tests/nettransport.test.ts
 */
// The internal module (not in the package's exports): reached by path, as the patch edits it.
import { createActionWireManager } from '../node_modules/@trystero-p2p/core/dist/action-wire.mjs';
import { check, report } from './harness';

const CHUNK_PAYLOAD = 16 * 1024 - 36;

/** One wire chunk: 32-byte type, 2-byte nonce, tag (1 last, 4 binary), progress, payload. */
function chunk(type: string, nonce: number, payload: Uint8Array, last: boolean): ArrayBuffer {
  const b = new Uint8Array(36 + payload.length);
  b.set(new TextEncoder().encode(type), 0);
  b[32] = nonce >> 8;
  b[33] = nonce & 255;
  b[34] = (last ? 1 : 0) | 4;
  b[35] = last ? 255 : 1;
  b.set(payload, 36);
  return b.buffer;
}

const violations: string[] = [];
globalThis.__mc152TrysteroLimits = { maxMessageBytes: 80 * 1024, maxPeerBytes: 256 * 1024, maxOpenMessages: 16, onViolation: (id: string) => violations.push(id) };

const wire = createActionWireManager({
  getPeer: () => undefined,
  getPeerIds: () => [],
  canReceiveFromPeer: () => true,
  throwIfAborted: () => undefined,
});
const got: { peer: string; bytes: number }[] = [];
const mc = wire.makeInternalAction('mc');
mc.onMessage((payload: Uint8Array, peer: string) => got.push({ peer, bytes: payload.length }));

// A normal message in two chunks arrives whole.
wire.handleData('good', chunk('mc', 1, new Uint8Array(CHUNK_PAYLOAD), false));
wire.handleData('good', chunk('mc', 1, new Uint8Array(100), true));
check('message within the limits delivered', got.length === 1 && got[0].bytes === CHUNK_PAYLOAD + 100, JSON.stringify(got));

// A message for an action type nobody created is dropped, not kept for later.
wire.handleData('good', chunk('spam', 1, new Uint8Array(10), true));
let late = 0;
wire.makeInternalAction('spam').onMessage(() => late++);
check('unknown action type dropped', late === 0);

// One message larger than maxMessageBytes: the peer is reported and ignored from then on.
for (let i = 0; i < 6; i++) wire.handleData('big', chunk('mc', 7, new Uint8Array(CHUNK_PAYLOAD), false));
check('oversized message reported', violations.includes('big'), violations.join(','));
wire.handleData('big', chunk('mc', 8, new Uint8Array(10), true));
check('peer over the limits ignored', !got.some((g) => g.peer === 'big'));
wire.clearPeer('big');
wire.handleData('big', chunk('mc', 9, new Uint8Array(10), true));
check('a peer that reconnects starts clean', got.some((g) => g.peer === 'big'));

// Many unfinished small messages: over maxOpenMessages.
for (let n = 0; n < 20; n++) wire.handleData('many', chunk('mc', n, new Uint8Array(1000), false));
check('too many unfinished messages reported', violations.includes('many'));

// Unfinished messages over maxPeerBytes in total (each under maxMessageBytes).
for (let n = 0; n < 5; n++) for (let i = 0; i < 4; i++) wire.handleData('wide', chunk('mc', n, new Uint8Array(CHUNK_PAYLOAD), false));
check('too much unfinished data reported', violations.includes('wide'));
check('honest peer unaffected', !violations.includes('good'));

report();
