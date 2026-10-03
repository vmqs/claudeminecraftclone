#!/usr/bin/env node
// Caps what trystero buffers for a peer before the game sees a message, and quiets the error it
// logged for every link closed on purpose (run on postinstall, and before dev and build;
// idempotent).
//
// trystero 0.25.4 reassembles every message in full, with no size limit, before handing it to the
// action's handler, and keeps messages for action types nobody registered forever. Any member of
// a room could fill another browser's memory that way. The patch makes its action wire layer:
//   - drop data for action types the page never created (the game creates all of its actions
//     right after joining, before any peer can connect);
//   - give up on a peer whose unfinished messages pass the limits in
//     `globalThis.__mc152TrysteroLimits` ({ maxMessageBytes, maxPeerBytes, maxOpenMessages,
//     onViolation(peerId) }, defaults below): its partial messages are freed, its further data is
//     ignored, and onViolation lets the game close the link.
// The script fails when the code it patches is not found, so an upgrade of trystero cannot drop
// the protection silently.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = '/* mc152-patch: buffer limits */';

const wireEdits = [
  {
    // Module-level helpers.
    find: 'const createActionWireManager = ({ getPeer, getPeerIds, canReceiveFromPeer, throwIfAborted }) => {',
    replace: `${MARK}
const mcDefaultLimits = { maxMessageBytes: 9 * 1024 * 1024, maxPeerBytes: 16 * 1024 * 1024, maxOpenMessages: 64 };
const mcLimits = () => globalThis.__mc152TrysteroLimits ?? mcDefaultLimits;
const createActionWireManager = ({ getPeer, getPeerIds, canReceiveFromPeer, throwIfAborted }) => {
	const mcBlocked = new Set();
	const mcOverLimit = (id, target, n) => {
		const l = mcLimits();
		target.bytes = (target.bytes ?? 0) + n;
		if (target.bytes > l.maxMessageBytes) return true;
		let total = 0;
		let open = 0;
		for (const byNonce of Object.values(pendingTransmissions[id] ?? {})) for (const t of Object.values(byNonce)) {
			total += t.bytes ?? 0;
			open++;
		}
		return total > l.maxPeerBytes || open > l.maxOpenMessages;
	};`,
  },
  {
    find: `	const handleData = (id, data) => {
		const buffer = new Uint8Array(data);`,
    replace: `	const handleData = (id, data) => {
		if (mcBlocked.has(id)) return;
		const buffer = new Uint8Array(data);`,
  },
  {
    find: `		if (!canReceiveFromPeer(id, Boolean(action?.options.receiveWhilePending))) return;`,
    replace: `		if (!canReceiveFromPeer(id, Boolean(action?.options.receiveWhilePending))) return;
		if (!action) return;`,
  },
  {
    find: `		const target = pendingTransmissions[id][type][nonce] ??= { chunks: [] };`,
    replace: `		const target = pendingTransmissions[id][type][nonce] ??= { chunks: [] };
		if (mcOverLimit(id, target, payload.byteLength)) {
			delete pendingTransmissions[id];
			mcBlocked.add(id);
			try {
				mcLimits().onViolation?.(id);
			} catch (err) {
				console.error(err);
			}
			return;
		}`,
  },
  {
    find: `		clearPeer: (id) => {
			delete pendingTransmissions[id];`,
    replace: `		clearPeer: (id) => {
			delete pendingTransmissions[id];
			mcBlocked.delete(id);`,
  },
];

// A link closed on purpose (a guest leaving) ends with an "User-Initiated Abort" error event,
// which trystero logged as an error; it is not one.
const roomEdits = [
  {
    find: `			error: (err) => {
				console.error(\`\${libName} peer error:\`, err);`,
    replace: `			error: (err) => {
				${MARK}
				if (/User-Initiated Abort|Close called/.test(String(err?.message ?? err))) console.debug(\`\${libName} peer closed:\`, err);
				else console.error(\`\${libName} peer error:\`, err);`,
  },
];

let patched = 0;
for (const [rel, edits] of [
  ['node_modules/@trystero-p2p/core/dist/action-wire.mjs', wireEdits],
  ['node_modules/@trystero-p2p/core/dist/room.mjs', roomEdits],
]) {
  const file = join(root, rel);
  if (!existsSync(file)) {
    console.log(`patch-trystero: ${rel} is not installed, nothing to patch`);
    continue;
  }
  let src = readFileSync(file, 'utf8');
  if (src.includes(MARK)) continue;
  for (const { find, replace } of edits) {
    const at = src.indexOf(find);
    if (at < 0 || src.indexOf(find, at + 1) >= 0) {
      console.error(`patch-trystero: the code to patch was not found in ${file}; check the trystero version (0.25.4 expected)`);
      process.exit(1);
    }
    src = src.replace(find, replace);
  }
  writeFileSync(file, src);
  patched++;
}
if (patched > 0) {
  // Vite's dependency cache may hold the unpatched modules.
  rmSync(join(root, 'node_modules/.vite'), { recursive: true, force: true });
  console.log(`patch-trystero: ${patched} file(s) patched (buffer limits, quiet closes)`);
}
