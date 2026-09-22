import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = JSON.parse(fs.readFileSync(new URL('../docs/sv_complete_item.workflow.json', import.meta.url), 'utf8'));
const verifyCode = workflow.nodes.find((node) => node.name === 'Verify owner and item').parameters.jsCode;
const verify = new Function('$', '$input', verifyCode);

function runRenewal(fields, auth = {}) {
  const identity = {
    valid: true,
    telegram_id: '123',
    item_id: 'safe-001',
    action: 'renew',
    renewal_days: 14,
    ...auth,
  };
  const row = {
    Id: 7,
    public_id: 'safe-001',
    owner_telegram_id: '123',
    status: 'available',
    expires_at: '2020-01-01T00:00:00.000Z',
    renewal_count: 0,
    favorite_count: 0,
    interest_count: 0,
    contact_attempt_count: 0,
    title: 'Silla',
    ...fields,
  };
  return verify(
    () => ({ first: () => ({ json: identity }) }),
    { all: () => [{ json: row }] },
  )[0].json;
}

test('first renewal is unconditional and starts from now', () => {
  const before = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const result = runRenewal({});
  const after = Date.now() + 14 * 24 * 60 * 60 * 1000;
  assert.equal(result.valid, true);
  assert.equal(result.status, 'available');
  assert.equal(result.renewal_count, 1);
  assert.ok(Date.parse(result.expires_at) >= before);
  assert.ok(Date.parse(result.expires_at) <= after);
});

test('an expired reserved item can be renewed', () => {
  const result = runRenewal({
    status: 'reserved',
    reservation_expires_at: '2999-01-01T00:00:00.000Z',
  });
  assert.equal(result.valid, true);
  assert.equal(result.status, 'available');
  assert.equal(result.renewal_count, 1);
});

test('second renewal requires any recorded interest signal', () => {
  assert.equal(runRenewal({ renewal_count: 1 }).error, 'renewal_interest_required');
  for (const signal of ['favorite_count', 'interest_count', 'contact_attempt_count']) {
    const result = runRenewal({ renewal_count: 1, [signal]: 1 });
    assert.equal(result.valid, true, signal);
    assert.equal(result.renewal_count, 2, signal);
  }
});

test('third renewal, active item and non-owner are rejected', () => {
  assert.equal(runRenewal({ renewal_count: 2, favorite_count: 1 }).error, 'renewal_limit_reached');
  assert.equal(runRenewal({ expires_at: '2999-01-01T00:00:00.000Z' }).error, 'item_not_expired');
  assert.equal(runRenewal({}, { telegram_id: '999' }).error, 'not_owner');
});
