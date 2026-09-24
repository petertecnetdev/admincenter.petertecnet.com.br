import assert from 'node:assert/strict';
import { createLatestAsyncGuard } from '../src/utils/latestAsync.js';

const guard = createLatestAsyncGuard();
const first = guard.begin();
const second = guard.begin();

assert.equal(first.signal.aborted, true);
assert.equal(first.isCurrent(), false);
assert.equal(second.isCurrent(), true);

second.cancel();
assert.equal(second.signal.aborted, true);
assert.equal(second.isCurrent(), false);

console.log('latest async guard: ok');
