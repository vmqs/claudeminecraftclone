/** A tiny assertion helper for the Node-run checks in tests/. */
let passed = 0;
const failures: string[] = [];

export function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
}

/** Prints the result and sets the exit code. */
export function report(): void {
  for (const f of failures) console.log('FAIL ' + f);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}
