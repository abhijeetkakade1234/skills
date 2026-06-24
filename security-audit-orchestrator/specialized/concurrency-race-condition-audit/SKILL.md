---
name: concurrency-race-condition-audit
description: Audit for concurrency and race-condition security bugs: TOCTOU (time-of-check-to-time-of-use), non-atomic check-then-act, double-spend/double-redeem, lost updates, missing DB transactions/row locks, idempotency gaps, and data races in shared mutable state. Use when reviewing money movement, balance/quota checks, coupon/gift-card redemption, inventory, get-or-create logic, file existence checks, or shared counters/maps. CRITICAL: Only flag CRITICAL if the race causes real loss — money, security bypass, or data corruption. A benign race (e.g. duplicate log line, idempotent overwrite with same value) = LOW.
---

# Concurrency & Race-Condition Auditing — TOCTOU / Double-Spend / Lost Update Detection

Detect non-atomic check-then-act: a value is read, a decision is made, then an action is taken — and a parallel request slips in between the check and the use. The fix is almost always to make the check and the act a single atomic operation at the database.

**Default workflow:** Find every read-decide-write sequence on shared state → ask "what happens if two requests run this at the exact same time?" → make it atomic (conditional UPDATE / unique constraint / SELECT FOR UPDATE) → prove it with concurrent requests.

## Core Doctrine: Check and Act Must Be Atomic

| Race | What Attacker Does (parallel/repeat requests) | Real Consequence | Severity | Proper Fix |
|---|---|---|---|---|
| Balance check-then-debit | Fires N parallel withdrawals; all read same balance before any debit | Double-spend; account goes negative; money minted | CRITICAL | `UPDATE accounts SET balance=balance-? WHERE id=? AND balance>=?` (atomic, check rows affected) |
| Coupon / gift-card redeem twice | Submits same redeem request 5× concurrently | Discount/credit applied multiple times | CRITICAL | Unique constraint on (coupon, user) + conditional `UPDATE ... WHERE redeemed=false` |
| "Get-or-create" duplicate | Two parallel requests both find no row, both insert | Duplicate users/orders/rows; broken invariants | HIGH | `INSERT ... ON CONFLICT DO NOTHING` + unique constraint, then SELECT |
| Inventory oversell | Buys last item from many sessions at once | Sells more units than exist; negative stock | CRITICAL | `UPDATE inventory SET qty=qty-1 WHERE sku=? AND qty>=1` (rows affected = success) |
| Limit/quota bypass via parallel requests | Sends 100 requests before counter increments | Bypasses rate limit / free-tier cap / vote-once | HIGH | Atomic increment with `WHERE count < limit`, or unique constraint per (user, action) |
| File TOCTOU (check exists then open) | Swaps path for symlink between `access()` and `open()` | Privilege escalation; arbitrary file read/write | CRITICAL | Open directly and handle error; use `O_NOFOLLOW`/`O_EXCL`; never re-resolve path |
| Session/token reuse race | Redeems one-time token in two requests simultaneously | Replay; auth bypass; double-issued session | HIGH | Atomic `UPDATE tokens SET used=true WHERE token=? AND used=false` (act on rows affected) |
| Read-modify-write lost update | Two edits load same record, both save; last write wins | Silent data loss; overwritten field | MEDIUM | Optimistic lock (version column) or `UPDATE ... SET x=x+? `, not read-then-overwrite |

## Operating Principles

1. **Check and act must be atomic.** `if (balance >= amount) { debit() }` is two operations. Between them, another request runs. Collapse them into one statement the database executes atomically.
2. **Prefer DB-level atomicity over app-level locks.** A single `UPDATE ... WHERE` (conditional update), a unique constraint, or `INSERT ON CONFLICT` is correct across processes and machines. App-level mutexes only protect one process.
3. **Use transactions with the correct isolation.** Multi-step writes (debit A, credit B) belong in one transaction. Read-modify-write that must see a consistent snapshot needs `REPEATABLE READ` or `SERIALIZABLE`, or explicit row locks — `READ COMMITTED` does not prevent lost updates.
4. **Idempotency keys for money operations.** Any external/payment/charge endpoint must accept a client-supplied idempotency key, persisted with a unique constraint, so a retried or duplicated request produces exactly one effect.
5. **Optimistic vs pessimistic locking — pick deliberately.** Optimistic (version column, `WHERE version=?`, retry on mismatch) for low contention. Pessimistic (`SELECT ... FOR UPDATE`) for high contention or when retries are costly.
6. **Never trust the client to not send parallel requests.** Double-clicks, retries, malicious scripts, and load balancers all produce concurrent duplicates. Assume every request can arrive N times simultaneously.
7. **Distributed locks need fencing tokens.** A Redis/Zookeeper lock can be held by a paused process whose lease expired; without a monotonically increasing fencing token checked at the resource, two holders can both write.
8. **Test by firing concurrent requests.** A race that "can't happen" in single-threaded testing reproduces instantly under `ab -c 50`, a goroutine fan-out, or `go test -race`. Prove the fix, don't reason about it.

## Phase 1: Detection Strategy

**What to look for:**

1. **Check-then-act on balance/quota/stock**
   - Patterns: `if (balance >= amount)` then a separate `save`/`UPDATE`; `if (stock > 0)` then decrement; `if (count < limit)` then increment
   - Attack: Fire parallel requests so all read the pre-decrement value before any write lands
   - Fix: Single conditional `UPDATE ... SET x = x - ? WHERE id = ? AND x >= ?`; treat 0 rows affected as failure

2. **Non-atomic get-or-create**
   - Patterns: `SELECT ... if none: INSERT`; `find_or_create`, `get_or_create`, `findOrCreate` not backed by a unique constraint
   - Attack: Two requests both miss the SELECT, both INSERT → duplicate rows
   - Fix: Unique constraint + `INSERT ... ON CONFLICT DO NOTHING` (Postgres) / `INSERT IGNORE` (MySQL), then read back

3. **Missing transaction around multi-step writes**
   - Patterns: debit one row, credit another, write a ledger entry — as separate statements with no `BEGIN`/`COMMIT`
   - Attack: Crash or concurrent interleave leaves half-applied state (money debited, never credited)
   - Fix: Wrap all related writes in one transaction; choose isolation that prevents the interleave

4. **Missing row lock / SELECT FOR UPDATE**
   - Patterns: `SELECT balance` then later `UPDATE balance = <computed>` inside a transaction but without `FOR UPDATE`
   - Attack: Two transactions read the same row, both compute from the stale value, lost update
   - Fix: `SELECT ... FOR UPDATE` to lock the row, or do the arithmetic in the UPDATE itself

5. **No idempotency key on payments/charges**
   - Patterns: `POST /charge`, `POST /transfer`, `POST /orders` with no dedup key; retries create duplicate charges
   - Attack: Client retry (timeout) or double-submit charges the card twice
   - Fix: Require `Idempotency-Key`; store with unique constraint; return the prior result on replay

6. **File / path TOCTOU**
   - Patterns: `access()`/`stat()`/`exists()` then `open()`/`unlink()`; check-then-create temp files; `os.path.exists` then `open`
   - Attack: Swap the path for a symlink between check and use to read/write a privileged file
   - Fix: Open directly with `O_EXCL`/`O_NOFOLLOW` and handle the error; never check-then-open by path

7. **Shared mutable state without synchronization**
   - Patterns: a map/slice/counter mutated from multiple goroutines/threads with no mutex; `count++` from concurrent handlers
   - Attack: Concurrent writes corrupt the structure, lose increments, or panic (Go map concurrent write)
   - Fix: `sync.Mutex`/`sync.RWMutex`, `sync.Map`, `atomic.AddInt64`; in JVM use `AtomicLong`/`ConcurrentHashMap`

## Phase 2: Grep Leads

### JavaScript/Node
Pattern: `if\s*\(\s*\w*[bB]alance\s*[>=]=` (balance check before a separate save → check-then-act)
Pattern: `\.findOne\(.*\).*\n.*\.(create|insert|save)\(` (get-or-create without unique constraint)
Pattern: `findOrCreate|upsert\(` (verify backed by a unique index, not SELECT-then-INSERT)
Pattern: `await .*\.save\(\)` (read-modify-write — is it `x = x - n` in app code then saved? lost-update risk)
Pattern: `POST.*(charge|transfer|pay|order)` (money op — check for idempotency key)
Pattern: `SELECT FOR UPDATE|\.transaction\(|BEGIN` (presence is GOOD; absence around multi-write is the flag)

### Python (Django / SQLAlchemy)
Pattern: `get_or_create\(|\.filter\(.*\)\.first\(\)` (race-prone get-or-create; needs unique constraint or `get_or_create` inside atomic)
Pattern: `if .*\.balance >= ` (check-then-act; should be `F('balance') - amount` update with a guard)
Pattern: `\.update\(.*=F\(` (Django F() expression — GOOD, atomic; flag the cases NOT using it)
Pattern: `select_for_update\(\)` (GOOD; absence in a read-modify-write transaction is the flag)
Pattern: `with transaction\.atomic|session\.begin` (transaction boundary — verify it wraps all related writes)
Pattern: `os\.path\.exists\(.*\).*\n.*open\(` (file TOCTOU)

### Go (goroutines, sync, channels)
Pattern: `go func\(` (goroutine — does it touch shared state? needs sync)
Pattern: `map\[.*\].*=` inside concurrent code without `mu.Lock` (concurrent map write → panic / corruption)
Pattern: `\w+\+\+|\w+ = \w+ \+ ` on a shared var (unsynchronized counter → use `atomic.AddInt64`)
Pattern: `sync\.Mutex|sync\.RWMutex|sync\.Map|atomic\.` (synchronization present — GOOD)
Pattern: `Begin\(\)|Tx\b|FOR UPDATE` (transaction / row lock; absence around balance math is the flag)

### Java/Spring
Pattern: `if\s*\(.*getBalance\(\)\s*[>=]` (check-then-act on balance)
Pattern: `@Transactional` (verify it wraps multi-step writes; check isolation/propagation)
Pattern: `findById\(.*\).*\n.*save\(` (read-modify-write; needs `@Version` optimistic lock or `FOR UPDATE`)
Pattern: `@Version` (optimistic-lock version column — GOOD)
Pattern: `synchronized|AtomicLong|AtomicInteger|ConcurrentHashMap` (in-process sync — GOOD, but does not span instances)
Pattern: `findOrCreate|saveIfAbsent` (verify unique constraint exists)

### C#/.NET
Pattern: `if\s*\(.*Balance\s*[>=]` (check-then-act on balance)
Pattern: `SaveChanges\(\)` after a read-modify-write (EF Core — needs `[ConcurrencyCheck]`/`RowVersion`)
Pattern: `\[ConcurrencyCheck\]|RowVersion|byte\[\] .*RowVersion` (optimistic concurrency token — GOOD)
Pattern: `BeginTransaction|TransactionScope|IsolationLevel` (transaction boundary — verify isolation)
Pattern: `lock\s*\(|Interlocked\.|ConcurrentDictionary` (in-process sync — GOOD, single instance only)

## Phase 3: Triage

| Issue | Atomic / Locked? | Severity | Exploitable via parallel requests? | Fix Effort |
|---|---|---|---|---|
| Balance check then separate debit | NO | CRITICAL | Yes (double-spend) | Low (one conditional UPDATE) |
| Balance debit via `UPDATE ... WHERE balance>=?` | YES | LOW | No | N/A (already safe) |
| Coupon redeem, no unique constraint | NO | CRITICAL | Yes (multi-redeem) | Low (add unique index) |
| Get-or-create, no unique constraint | NO | HIGH | Yes (duplicate rows) | Low–Medium |
| Inventory decrement without guard | NO | CRITICAL | Yes (oversell) | Low |
| Quota counter, read-then-increment | NO | HIGH | Yes (limit bypass) | Low–Medium |
| Multi-step write, no transaction | NO | HIGH | Partial (crash/interleave) | Medium |
| Read-modify-write, no version/lock | NO | MEDIUM | Yes (lost update) | Medium |
| Payment endpoint, no idempotency key | NO | HIGH | Yes (double charge on retry) | Medium |
| File exists-check then open | NO | CRITICAL (if privileged) | Yes (symlink swap) | Low |
| Shared map mutated, no mutex (Go) | NO | HIGH (corruption/panic) | Yes (concurrent write) | Low |
| Duplicate that is idempotent (same value overwrite) | N/A | LOW | Yes but harmless | N/A |

## Phase 4: Ponytail Fix Ladder

Climb only as high as the problem requires. Lower rungs are simpler, more correct, and cheaper to operate. Reach for a distributed lock last.

1. **Make it atomic at the DB.** A single conditional UPDATE or a unique constraint solves most races outright.
   - `UPDATE accounts SET balance = balance - :amt WHERE id = :id AND balance >= :amt` — check rows affected; 0 = insufficient funds.
   - Unique constraint on `(coupon_id, user_id)` makes a second redeem fail with a constraint violation.
   - `INSERT ... ON CONFLICT DO NOTHING` makes get-or-create safe. **Stop here if it works.**

2. **Wrap in a transaction with the right isolation.** When multiple rows must change together (debit + credit + ledger).
   - One `BEGIN ... COMMIT`; choose `REPEATABLE READ`/`SERIALIZABLE` if read-modify-write must see a stable snapshot.
   - Be ready to retry on serialization failures (Postgres `40001`).

3. **Optimistic locking (version column).** For low-contention read-modify-write where conflicts are rare.
   - Add `version`; `UPDATE ... SET data=:d, version=version+1 WHERE id=:id AND version=:v`; if 0 rows, reload and retry.
   - No locks held; cheapest under low contention.

4. **Pessimistic lock (SELECT FOR UPDATE).** For high contention or when retry is expensive/visible to the user.
   - `SELECT ... FOR UPDATE` inside a transaction locks the row until commit; subsequent readers block.
   - Use `FOR UPDATE SKIP LOCKED` for queue-style work distribution.

5. **Idempotency key for external/money operations.** For payments, charges, transfers, and any retried POST.
   - Client sends `Idempotency-Key`; persist `(key)` unique; on replay, return the stored result instead of re-executing.
   - Combine with rung 1 so the underlying write is also atomic.

6. **Distributed lock with fencing token (last resort).** Only when no DB atomicity is possible (cross-service, external resource).
   - Acquire lock (Redis Redlock / Zookeeper); obtain a monotonically increasing fencing token; the protected resource rejects any write with a stale token.
   - Expensive, failure-prone, needs lease/timeout handling. Prefer rungs 1–5 whenever the state lives in a database.

## Phase 5: Record Format

```
ID: RACE-001
Title: Double-spend in POST /api/withdraw — balance checked then debited non-atomically
Severity: CRITICAL
Location: services/wallet.js:88
Vector: Attacker fires 20 parallel withdraw requests; all read balance=100 before any debit commits, each passes the >= check, all 20 debits apply → balance = -1900
Impact: Money minted; account drained beyond balance; direct financial loss
Evidence: const acct = await Account.findById(id); if (acct.balance >= amount) { acct.balance -= amount; await acct.save(); }
Confidence: 95%
Fix: UPDATE accounts SET balance = balance - :amt WHERE id = :id AND balance >= :amt; treat affectedRows === 0 as insufficient funds
Repro: ab -n 20 -c 20 -p body.json -T application/json http://host/api/withdraw → final balance < 0
```

## Phase 6: Vulnerable → Fixed Examples

### (a) Balance check-then-debit double-spend

**Node (Vulnerable):**
```javascript
// DANGER: read, check, write — three steps, not atomic
app.post('/api/withdraw', async (req, res) => {
    const acct = await Account.findById(req.body.id);
    if (acct.balance >= req.body.amount) {          // parallel requests all pass here
        acct.balance -= req.body.amount;
        await acct.save();                           // last write wins → double-spend
        return res.json({ ok: true });
    }
    res.status(400).json({ error: 'insufficient' });
});
```

**Node (Fixed — atomic conditional UPDATE):**
```javascript
// GOOD: the check and the debit are one atomic statement
app.post('/api/withdraw', async (req, res) => {
    const result = await db.query(
        `UPDATE accounts SET balance = balance - $1
         WHERE id = $2 AND balance >= $1`,
        [req.body.amount, req.body.id]
    );
    if (result.rowCount === 0) {                      // 0 rows = guard failed
        return res.status(400).json({ error: 'insufficient' });
    }
    res.json({ ok: true });
});
```

**Python Django (Vulnerable → Fixed):**
```python
# DANGER: check-then-act
acct = Account.objects.get(id=acct_id)
if acct.balance >= amount:
    acct.balance -= amount
    acct.save()                                       # lost update under concurrency

# GOOD: atomic UPDATE with F() and a guard
updated = Account.objects.filter(id=acct_id, balance__gte=amount) \
                         .update(balance=F('balance') - amount)
if updated == 0:                                      # 0 rows = insufficient funds
    raise InsufficientFunds()
```

### (b) Coupon double-redeem

**Vulnerable:**
```python
# DANGER: two parallel redeems both see redeemed=False
c = Coupon.objects.get(code=code)
if not c.redeemed:
    apply_discount(user, c)
    c.redeemed = True
    c.save()                                          # both requests credit the user
```

**Fixed — conditional update + unique constraint:**
```python
# GOOD: atomic flip; only one request wins the row
updated = Coupon.objects.filter(code=code, redeemed=False).update(
    redeemed=True, redeemed_by=user.id)
if updated == 1:                                      # exactly one winner
    apply_discount(user, c)
# DB also enforces: UNIQUE(coupon_id, user_id) on redemptions table
```
```sql
-- Backstop: a second redeem violates the constraint and aborts
ALTER TABLE coupon_redemptions ADD CONSTRAINT uq_coupon_user UNIQUE (coupon_id, user_id);
```

### (c) Get-or-create race

**Vulnerable:**
```javascript
// DANGER: both requests miss the SELECT, both INSERT → duplicate users
let user = await User.findOne({ email });
if (!user) user = await User.create({ email });
```

**Fixed — INSERT ... ON CONFLICT (Postgres):**
```sql
-- requires UNIQUE(email)
INSERT INTO users (email) VALUES ($1)
ON CONFLICT (email) DO NOTHING;
SELECT * FROM users WHERE email = $1;   -- always returns the single canonical row
```

### (d) Go shared map data race

**Vulnerable:**
```go
// DANGER: concurrent map writes from goroutines → panic / corruption
var cache = map[string]int{}
func handle(key string) {
    go func() { cache[key]++ }()   // fatal error: concurrent map writes
}
```

**Fixed — sync.Mutex (or sync.Map):**
```go
var (
    mu    sync.Mutex
    cache = map[string]int{}
)
func handle(key string) {
    mu.Lock()
    cache[key]++
    mu.Unlock()
}
// Alternative for a pure counter: atomic.AddInt64(&counter, 1)
// Verify with: go test -race ./...
```

### (e) Money op idempotency key

**Vulnerable:**
```javascript
// DANGER: client retry / double-submit charges the card twice
app.post('/api/charge', async (req, res) => {
    const charge = await stripe.charges.create({ amount: req.body.amount, ... });
    res.json(charge);
});
```

**Fixed — idempotency key persisted with a unique constraint:**
```javascript
app.post('/api/charge', async (req, res) => {
    const key = req.header('Idempotency-Key');
    try {
        // UNIQUE(idempotency_key) — second insert with same key throws
        await db.query('INSERT INTO charge_keys(key) VALUES($1)', [key]);
    } catch (e) {
        const prior = await db.query('SELECT result FROM charge_keys WHERE key=$1', [key]);
        return res.json(prior.rows[0].result);   // replay returns the original result
    }
    const charge = await stripe.charges.create(
        { amount: req.body.amount, ... }, { idempotencyKey: key });  // also pass downstream
    await db.query('UPDATE charge_keys SET result=$1 WHERE key=$2', [charge, key]);
    res.json(charge);
});
```

## Phase 7: Verification Checklist

- [ ] Fire N concurrent identical requests (`ab -c 50`, k6, goroutine fan-out); confirm exactly one effect / one row / one debit
- [ ] Every balance/stock/quota mutation is a single conditional UPDATE; code checks rows affected and fails on 0
- [ ] Unique constraint exists for every "must happen once" pair (coupon+user, idempotency key, get-or-create key)
- [ ] Multi-step writes (debit + credit + ledger) are wrapped in one transaction
- [ ] Transaction isolation prevents lost updates (REPEATABLE READ/SERIALIZABLE, or SELECT FOR UPDATE on the row)
- [ ] Read-modify-write uses an optimistic version column or a pessimistic row lock — never read-then-blind-overwrite
- [ ] Payment/charge/transfer endpoints require an idempotency key and dedup on it
- [ ] Idempotency key is also forwarded to the downstream payment provider
- [ ] Go: `go test -race ./...` passes; no `fatal error: concurrent map writes`
- [ ] Shared counters/maps use a mutex, sync.Map, or atomic ops (no plain `++` across goroutines/threads)
- [ ] File operations open directly (O_EXCL/O_NOFOLLOW) instead of exists-check-then-open by path
- [ ] Load test confirms no double-spend, no oversell, and no negative balance/stock under concurrency

## Quality Bar

1. Every check-then-act on shared state is collapsed into a single atomic DB operation
2. No double-spend: parallel debits cannot drive a balance below zero
3. No double-redeem: a coupon/gift-card/one-time token applies exactly once under concurrency
4. No duplicate get-or-create rows: backed by a unique constraint and upsert
5. No oversell: inventory decrement is guarded (`WHERE qty >= 1`) and checks rows affected
6. Multi-step money movement is transactional and crash-consistent
7. Lost updates prevented via version column or row lock, not last-write-wins
8. Money/external operations are idempotent via a persisted, unique idempotency key
9. Shared in-memory state is synchronized; `-race`/thread-sanitizer is clean
10. The fix is proven by a concurrent-load repro, not by reasoning alone

## Example Triggers

- "race condition"
- "TOCTOU"
- "double spend"
- "concurrency bug"
- "lost update"
- "idempotency"
- "double submit"
- "atomic transaction"

## Relationship to blueteam-defend

Sits in the **insecure-design / business-logic layer** of **blueteam-defend** (the logic flaws no input-validation control catches). Core doctrine: **check and act must be atomic** — push the invariant into the database via a conditional UPDATE, a unique constraint, a row lock, or an idempotency key, rather than enforcing it in non-atomic application code. Only flag CRITICAL when the race causes real loss (money, security bypass, data corruption); a benign or idempotent race is LOW.
