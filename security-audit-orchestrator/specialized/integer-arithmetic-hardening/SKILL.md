---
name: integer-arithmetic-hardening
description: Audit integer overflow, underflow, type confusion, precision loss, truncation in arithmetic operations. Use when code has balances, counters, prices, percentages, or financial calculations. Extends blueteam-defend Layer 5b (Numeric Vulnerabilities) & Layer 2 (Injection).
---

# Integer Arithmetic Hardening — Numeric Safety Audit

Detect arithmetic bugs: overflow (256 + 1 = 0 in u8), underflow (0 - 1 = MAX in unsigned), type confusion (int vs uint), precision loss (float rounding), truncation (large → small type).

## Core Doctrine: Numeric Assumptions

| Operation | Assumption | What Actually Happens | Real Consequence | Proper Fix |
|---|---|---|---|---|
| balance += amount | balance grows | balance wraps at max int (overflow) | User balance = 0 (loses money) | Use checked arithmetic or SafeMath |
| balance -= amount | balance shrinks | balance wraps below 0 (underflow) | User balance = MAX_INT (gains money) | Use checked arithmetic, bounds check |
| price * quantity | product fits in int64 | product overflows, wraps negative | User pays negative amount (refunded) | Use bigint, checked multiply |
| (long / 100) | division truncates | precision lost, user charged less | User underpays for service | Use fixed-point or multiply first |
| byte + byte | stays in byte | wraps at 256 (overflow) | Computation wrong, crypto broken | Cast to larger type before arithmetic |
| balance in wei | fits in uint256 | overflow at 2^256 (rare but possible) | Balance math breaks at ~10^77 ETH | Validate amount < MAX_UINT |

## Operating Principles

1. **Numbers have limits.** u8 max = 255. u32 max = 4.3B. u64 max = 18.4E. Every type has a boundary.
2. **Overflow wraps.** In most languages, 255 + 1 = 0 (if u8). No exception thrown, silently wraps.
3. **Underflow wraps too.** 0 - 1 = 255 (in u8). Attacker can trick math to reverse direction.
4. **Type confusion matters.** int (signed) vs uint (unsigned). Mixing causes implicit casts, sign bit issues.
5. **Precision loss is silent.** Float division truncates. Rounding error accumulates. Attacker exploits via many small operations.
6. **Use language protection.** Rust: checked_add, checked_sub (panic on overflow). Python: arbitrary precision. Go: no overflow protection (manual checks needed). JavaScript: BigInt for large numbers.
7. **Test boundary cases.** What if amount = MAX_INT? What if balance = 0 and we subtract? What if price * quantity overflows?

## Phase 1: Detection Strategy

**What to look for:**

1. **Unchecked arithmetic** — `a + b`, `a * b`, `a - b` without bounds checking
   - High risk: financial amounts, balances, prices
   - Medium risk: counters, pagination, array indices
   - Check if overflow/underflow possible

2. **Type confusion** — Mixing int/uint, implicit casts
   - Patterns: `int balance; uint amount;` or upcasting small type to large
   - Check if attacker can make balance negative via underflow

3. **Precision loss** — Integer division, float rounding
   - Patterns: `balance / 100` (truncates remainder), `float(balance) / float(total)`
   - Check if attacker can exploit via many small rounding errors

4. **Off-by-one errors** — `i < array.length` vs `i <= array.length`, `[0...n)` vs `[0...n]`
   - Can read past array bounds (out-of-bounds read)

5. **Signed/unsigned confusion** — Checking `if (balance > 0)` when balance is signed int
   - If balance is negative, `balance > 0` is false, but `-5 > 0` could pass unsigned check

6. **Cast to smaller type** — `(byte)(large_int)`, losing data
   - `large_int = 300; byte b = (byte)large_int;  // b = 44 (overflow)`

## Phase 2: Grep Leads

### Rust (Most Protection)
Pattern: `\+|-|\*|/` in arithmetic context (check for checked_add/checked_mul)
Pattern: `as\s+u8|as\s+i32` (explicit casts — check if safe)
Pattern: `parse::<i32>|parse::<u64>` (check for error handling)

### Go (No Overflow Protection)
Pattern: `\+=|-=|\*=|/=` (all unchecked)
Pattern: `uint\s+\w+\s*:=` (unsigned arithmetic, check for wrapping)
Pattern: `balance\s*:=\s*amount` (verify bounds check after)

### Python (Arbitrary Precision)
Pattern: `int\(.*\)\s*\*|float\(.*\)\s*/` (precision loss in float division)
Pattern: `/\s*[0-9]+` (integer division, check if intentional)
Pattern: `>>|<<` (bit shifts, can overflow in some contexts)

### JavaScript (No Native Protection; Unsafe Before BigInt)
Pattern: `\w+\s*\+=\s*\w+` (arithmetic without bounds check)
Pattern: `Number\.MAX_SAFE_INTEGER` (if code checks this, it's aware of limits)
Pattern: `Math\.floor\(.*\/.*\)` (integer division, precision loss)

### Java (Overflow Wraps Silently)
Pattern: `int\s+\w+\s*=.*[+*-]|long\s+\w+\s*=` (unchecked arithmetic)
Pattern: `Math\.addExact|Math\.multiplyExact` (safe arithmetic functions)
Pattern: `\w+\.intValue\(\)` (cast from large type, check for loss)

### C/C++ (Most Dangerous)
Pattern: `uint\s+\w+\s*=.*[+*]|int\s+\w+\s*=` (unchecked arithmetic)
Pattern: `\(unsigned char\)\|(\(int\))` (casts that truncate)
Pattern: `<<|>>` (bit shifts, check for overflow in rotates)

## Phase 3: Triage

| Issue Type | Severity | Confidence | Fix Effort |
|---|---|---|---|
| Balance arithmetic without overflow check | CRITICAL | 95% | Medium |
| Price * quantity overflow possible | CRITICAL | 95% | Medium |
| Underflow via balance -= untrusted amount | CRITICAL | 95% | Medium |
| Type confusion int/uint in payment code | CRITICAL | 90% | Medium |
| Integer division precision loss in financial calc | HIGH | 85% | Low |
| Off-by-one in array access | HIGH | 80% | Low |
| Unchecked cast to smaller type | MEDIUM | 75% | Medium |
| Counter increment without bounds | MEDIUM | 70% | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is arithmetic really necessary?**
   - Do we need to add balances? Yes. Do we need to multiply untrusted inputs? No — use fixed amount.
   - If not needed → remove operation.

2. **Already protected?** Does framework/library provide safe arithmetic?
   - Rust: checked_add, checked_mul. Python: arbitrary precision. Java: Math.addExact. Solidity: SafeMath.
   - Use framework protection first.

3. **Stdlib safe arithmetic?**
   - SafeMath library for language. Use it.

4. **Bounds check before operation** (explicit validation)
   - If `amount > MAX_INT - balance`, error. Only then `balance += amount`.
   - Manual but explicit.

5. **Larger type to prevent overflow** (upcast)
   - Use i64 instead of i32, u128 instead of u64. Trade space for safety.

6. **BigInt/arbitrary precision** (if available)
   - Python int, JavaScript BigInt. Slower but safe.

## Phase 5: Record Format

```
ID: ARITH-001
Title: Balance overflow in wallet.transfer()
Severity: CRITICAL
Location: src/wallet.sol:42
Vector: Attacker sends amount = MAX_UINT; balance overflows to 0
Impact: User loses all balance (balance set to 0 via overflow)
Evidence: balance += amount (no overflow check)
Confidence: 95%
Fix: Use SafeMath.add() or require(balance + amount > balance)
```

## Phase 6: Vulnerable → Fixed Examples

**Solidity (Vulnerable):**
```solidity
pragma solidity ^0.7.0;
contract Wallet {
    uint256 public balance;
    
    function deposit(uint256 amount) public {
        balance += amount;  // DANGER: Overflow not checked
    }
}
```

**Solidity (Fixed):**
```solidity
pragma solidity ^0.8.0;  // Checked arithmetic by default
contract Wallet {
    uint256 public balance;
    
    function deposit(uint256 amount) public {
        balance += amount;  // Safe: Solidity 0.8+ auto-reverts on overflow
    }
}

// Or in older versions:
import "SafeMath.sol";
function deposit(uint256 amount) public {
    balance = balance.add(amount);  // SafeMath checks
}
```

**Go (Vulnerable):**
```go
func (w *Wallet) Transfer(amount uint64) error {
    if w.balance >= amount {
        w.balance -= amount  // DANGER: No check for negative
        return nil
    }
    return errors.New("insufficient balance")
}
```

**Go (Fixed):**
```go
func (w *Wallet) Transfer(amount uint64) error {
    // Check: Does subtraction cause underflow?
    if amount > w.balance {
        return errors.New("insufficient balance")
    }
    w.balance -= amount  // Safe: balance > amount, no underflow
    return nil
}
```

**JavaScript (Vulnerable):**
```javascript
function calculateTotal(price, quantity) {
    return price * quantity;  // DANGER: Overflow for large numbers
}
```

**JavaScript (Fixed):**
```javascript
function calculateTotal(price, quantity) {
    // BigInt for large numbers
    const p = BigInt(price);
    const q = BigInt(quantity);
    return p * q;  // Safe: arbitrary precision
}
```

**Java (Vulnerable):**
```java
public long add(long a, long b) {
    return a + b;  // DANGER: Overflow wraps silently
}
```

**Java (Fixed):**
```java
public long add(long a, long b) {
    try {
        return Math.addExact(a, b);  // Safe: throws on overflow
    } catch (ArithmeticException e) {
        throw new IllegalArgumentException("Overflow: " + a + " + " + b);
    }
}
```

## Phase 7: Verification Checklist

- [ ] Identify all arithmetic operations (+, -, *, /) in financial/sensitive code
- [ ] For each: determine if overflow/underflow possible
- [ ] Test with boundary values: 0, MAX_INT, -1, amount = balance + 1
- [ ] Verify overflow checks exist or safe type used
- [ ] For division: check if precision loss is acceptable
- [ ] For type casts: verify no data loss (cast to larger type, not smaller)
- [ ] Test: Can attacker make balance negative? balance = 0?
- [ ] Verify counters have max bounds (if used for array index)
- [ ] Code review: Are assumptions about number ranges documented?
- [ ] Fuzz test: Random inputs to arithmetic functions, check for wraps/crashes

## Quality Bar

1. No unchecked arithmetic on balances or prices
2. Overflow/underflow checked before operations
3. Balance can never go negative (underflow protected)
4. Price * quantity never overflows (tested with large numbers)
5. Type confusion avoided (consistent int/uint usage)
6. Division truncation acceptable or prevented
7. Casts only to larger types (never truncate to smaller)
8. Boundary values tested (0, MAX_INT, -1)
9. Framework safe-math library used where available
10. Financial calculations audit-ready (clear, documented)

## Example Triggers

- "balance calculation"
- "overflow vulnerability"
- "price calculation"
- "integer arithmetic"
- "financial math audit"
- "boundary testing"
- "underflow prevention"
- "SafeMath"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 5b (Numeric Vulnerabilities) & Layer 2 (Injection)**. Blueteam-defend covers high-level injection; integer-arithmetic-hardening provides specific patterns for numeric boundary conditions and language-specific safe arithmetic.
