---
name: fail-open-error-handling
description: Audit for fail-open bugs where exceptions grant privileges, default-allow on error, or auth/validation checks skipped. Use when code has try-catch-pass, empty catch blocks, or missing error checks on auth paths. CRITICAL DISTINCTION: Only flag if error grants access (fail-open). If error denies access, it's safe (fail-closed).
---

# Fail-Open Error Handling — Exception Security Audit

Detect exception handling that grants privileges on error instead of denying. CRITICAL: Fail-closed (deny by default) = safe. Fail-open (allow by default) = vulnerable.

## Core Doctrine: Error Handling Trust

| Code Pattern | Error Behavior | What Attacker Can Do | Real Consequence | Proper Fix |
|---|---|---|---|---|
| try { auth.check() } catch { allow } | Grants on error | Trigger exception, bypass auth | Attacker becomes authenticated | Deny on error (fail-closed) |
| try { validate() } catch { skip } | Allows invalid input | Trigger exception, bypass validation | Attacker sends malicious payload | Deny on error (fail-closed) |
| try { verify() } except pass | Silently swallows error | Trigger exception in verify, skip check | Attacker bypasses verification | Deny on error, log/alert (fail-closed) |
| if check_permission(): OK else: error | Denies on error | Exception in check → raises | Attacker cannot exploit | Safe (fail-closed) |
| if not authenticated: return 403 | Denies if missing | Missing auth header → 403 | Attacker forced to provide auth | Safe (fail-closed) |
| try { token.verify() } catch { return token } | Returns invalid token | Trigger verify exception, token accepted | Attacker reuses expired/invalid token | Deny on error, reject request (fail-closed) |
| try { db.query() } catch { return null } | Returns on error | DB connection error → null result | Attacker exploits null assumption | Safe if caller checks null |

## Operating Principles

1. **Fail-closed is safe.** Default = deny/reject. Only allow after successful check.
2. **Fail-open is vulnerable.** Default = allow. Only deny after failed check. One missing exception = exploited.
3. **Every exception path matters.** Try-finally means error still happens. Exception in catch block = nested error. Both can be exploited.
4. **Distinguish by consequence.** Does exception grant access? Deny access? Neither? Only flag if grants.
5. **Auth paths are critical.** If exception in login/permission check, always deny. Never allow by default.
6. **Logging + alerting.** Don't just catch and ignore. Log exception + alert ops team. Fail-closed + visibility.
7. **Test error paths.** Deliberately trigger exceptions. Does code grant access? Deny access?

## Phase 1: Detection Strategy

**What to look for:**

1. **Empty catch blocks**
   - Patterns: `catch { }`, `except: pass`, `catch(Exception e) { }`
   - Check: What happens on error? Does control flow continue (allowing operation)?

2. **Catch-then-allow pattern**
   - Patterns: `try { auth.check() } catch { return true }`, `try { verify() } except return OK`
   - HIGH risk: Error path grants access

3. **Try-except-pass on auth checks**
   - Patterns: `try { token.verify() } except: pass`
   - CRITICAL: Exception silently swallowed, invalid token accepted

4. **Missing error checks on auth/validation**
   - Patterns: `auth = checkAuth()` (no if statement), `verify()` with no error check
   - Check: Does code assume success? What if function throws/returns error?

5. **Default-allow pattern**
   - Patterns: `allowed = False; try { allowed = check() } catch { } if allowed { ... }`
   - Actually safe (init False, only True on success). But confusing.

6. **Missing return/raise on error**
   - Patterns: `if not valid: print("error")` then code continues
   - LOW risk if error path doesn't grant access, HIGH if it does

7. **Catch and re-allow**
   - Patterns: `try { load_config() } catch { use_default_config() }`
   - Check: Is default_config secure? Or does it weaken policy?

## Phase 2: Grep Leads

### JavaScript
Pattern: `catch\s*\([^)]*\)\s*\{[^}]*\}` (empty catch block)
Pattern: `catch\s*\([^)]*\)\s*\{[^}]*return\s+(true|false|OK)` (catch then return)
Pattern: `try\s*\{[^}]*auth[^}]*\}\s*catch` (auth in try, check what catch does)
Pattern: `\.then\(.*\)\.catch\s*\([^)]*\)\s*\{[^}]*\}` (promise catch, check if empty)

### Python
Pattern: `except:\s*pass|except\s+\w+:\s*pass` (catch all, swallow)
Pattern: `try:[^e]*except:[^r]*pass` (multiline: try-except-pass)
Pattern: `try:[^e]*except.*:\s*return\s+(True|OK)` (catch then return True)
Pattern: `try:[^e]*except\s+\w+:[^r]*(log|print)` (catch and log only, check if continues)

### Go
Pattern: `if\s+err\s*!=\s*nil\s*\{[^}]*\}` (error check — GOOD pattern)
Pattern: `if\s+err\s*!=\s*nil\s*\{\s*return\s*\}` (missing error handling)
Pattern: `if\s+err\s*!=\s*nil\s*\{\s*err\s*=\s*nil` (clearing error, bad)

### Java
Pattern: `catch\s*\([^)]*\)\s*\{[^}]*\}` (empty catch)
Pattern: `catch.*\{[^}]*return\s+(true|null|OK)` (catch then return)
Pattern: `throw new RuntimeException|catch.*throw.*new RuntimeException` (rethrowing)

### C#/.NET
Pattern: `catch\s*(\w+)?\s*\{[^}]*\}` (empty catch)
Pattern: `catch\s*\{[^}]*return\s+(true|null|OK)` (catch then return)
Pattern: `try\s*\{` (look for matching catch with empty body)

## Phase 3: Triage

| Issue Type | Severity | Consequence | Confidence |
|---|---|---|---|
| Empty catch on auth check | CRITICAL | Error grants access | 95% |
| try { token.verify() } except: pass | CRITICAL | Invalid token accepted | 95% |
| try { DB query } catch { return True } | CRITICAL | DB error grants access | 95% |
| catch { } on permission check | HIGH | Unclear if grants/denies | 80% |
| catch { return } with no role check | HIGH | Access granted regardless | 85% |
| Empty catch not on auth path | MEDIUM | Error handling weak | 70% |
| Missing error check (but fails safe) | LOW | Code assumes success | 60% |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is error handling needed?**
   - Some operations are read-only (safe to ignore error). Modification? MUST check errors.
   - If safe to ignore → no fix needed.

2. **Already protected?** Does code fail safely by default?
   - `allowed = False` (default); only True on success? Safe (fail-closed).
   - If protected → possibly LOW severity.

3. **Framework error handling?** Does framework provide default-deny?
   - Spring Security: default deny. Django: requires login decorator. Use framework.
   - If framework handles → use it.

4. **Explicit error check** (clearest, safest)
   - `if not verify(token): return 403`
   - `if check_auth() == False: return deny()`

5. **Retry + explicit deny** (if transient errors)
   - Retry N times, then fail-closed.
   - Don't retry auth (no point); fail immediately.

6. **Custom error context** (rare)
   - Log error, alert ops, then fail-closed.

## Phase 5: Record Format

```
ID: FAILOPEN-001
Title: Auth exception caught and silently swallowed
Severity: CRITICAL
Location: src/auth.js:42
Vector: try { verifyToken(token) } catch { pass } — exception swallows invalid token
Impact: Attacker sends invalid/expired token, auth check skipped, attacker authenticated
Evidence: except: pass on token verification
Confidence: 95%
Fix: Replace with: try { verify() } except { return 403 } (fail-closed)
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript (Vulnerable):**
```javascript
function authenticate(token) {
    try {
        const payload = jwt.verify(token, SECRET);
        return payload;
    } catch (err) {
        // DANGER: Empty catch, silently allows
    }
    return { user: 'anonymous' };  // Continues after error!
}

app.get('/api/protected', (req, res) => {
    const user = authenticate(req.headers.authorization);
    res.json({ data: user.data });  // DANGER: Anonymous allowed!
});
```

**JavaScript (Fixed):**
```javascript
function authenticate(token) {
    try {
        if (!token) throw new Error('No token');
        const payload = jwt.verify(token, SECRET);
        return payload;
    } catch (err) {
        throw new Error('Invalid token');  // Fail-closed: deny on error
    }
}

app.get('/api/protected', (req, res) => {
    try {
        const user = authenticate(req.headers.authorization);
        res.json({ data: user.data });
    } catch (err) {
        return res.status(403).json({ error: 'Unauthorized' });  // Safe: fails-closed
    }
});
```

**Python (Vulnerable):**
```python
def check_permission(user, resource):
    try:
        # Might raise exception if DB is down
        return db.query('SELECT allowed FROM perms WHERE user=? AND resource=?', user, resource)
    except:
        pass  # DANGER: Exception means deny, but code continues!

def update_resource(user, resource_id, data):
    if check_permission(user, resource_id):
        # If DB error, check_permission returns None, but code continues!
        db.update(resource_id, data)
```

**Python (Fixed):**
```python
def check_permission(user, resource):
    try:
        perm = db.query('SELECT allowed FROM perms WHERE user=? AND resource=?', user, resource)
        if not perm:
            raise PermissionError('Not allowed')
        return True
    except Exception as e:
        logger.error(f'Permission check failed: {e}')
        raise PermissionError('Permission denied')  # Fail-closed: always raise on error

def update_resource(user, resource_id, data):
    try:
        if check_permission(user, resource_id):  # Raises if error
            db.update(resource_id, data)
    except PermissionError:
        return {'error': 'Forbidden'}, 403  # Safe: fail-closed
```

**Java (Vulnerable):**
```java
public boolean verifyToken(String token) {
    try {
        Claims claims = Jwts.parser().setSigningKey(SECRET).parseClaimsJws(token).getBody();
        return true;
    } catch (JwtException e) {
        // DANGER: Empty catch, invalid token accepted
    }
    return true;  // DANGER: Always returns true!
}

@GetMapping("/api/protected")
public ResponseEntity getProtected(@RequestHeader String token) {
    if (verifyToken(token)) {  // DANGER: Always true due to empty catch
        return ResponseEntity.ok("data");
    }
    return ResponseEntity.status(403).build();
}
```

**Java (Fixed):**
```java
public boolean verifyToken(String token) {
    try {
        if (token == null) throw new JwtException("No token");
        Claims claims = Jwts.parser().setSigningKey(SECRET).parseClaimsJws(token).getBody();
        return true;
    } catch (JwtException e) {
        logger.error("Token verification failed: {}", e.getMessage());
        return false;  // Fail-closed: false on any error
    }
}

@GetMapping("/api/protected")
public ResponseEntity getProtected(@RequestHeader(required = false) String token) {
    if (verifyToken(token)) {
        return ResponseEntity.ok("data");
    }
    return ResponseEntity.status(403).json(Map.of("error", "Unauthorized"));  // Safe: fail-closed
}
```

## Phase 7: Verification Checklist

- [ ] Identify all try-catch/try-except blocks in auth paths
- [ ] For each catch block: Verify what happens on exception (grant? deny? log?)
- [ ] For each catch block: Does code allow operation to proceed after error?
- [ ] Test: Deliberately trigger exception (invalid token, DB down, permission denied)
- [ ] Verify: Exception path denies access, not grants
- [ ] Verify: No catch { } (empty catches) on auth checks
- [ ] Verify: No catch { return true } patterns
- [ ] Verify: Exceptions logged + alerted (not silent swallows)
- [ ] Verify: Default = deny (false, null, 403) not allow (true, ok, 200)
- [ ] Code review: Is every auth/validation function checked for errors?

## Quality Bar

1. No empty catch blocks on auth/validation checks
2. Exception path explicitly denies/rejects (not allows)
3. Default = deny (false, 403, exception raised)
4. All exceptions logged + alerted to ops
5. No catch { return true } or catch { continue } patterns
6. Auth endpoints fail-closed (error always rejected)
7. Error message generic (don't leak internals)
8. Retry logic doesn't apply to auth (fail-fast instead)
9. Test passes: Trigger exception, verify request denied
10. Code review: Every error path analyzed for consequence

## Example Triggers

- "fail-open vulnerability"
- "exception handling audit"
- "empty catch blocks"
- "auth error handling"
- "error grants access?"
- "fail-closed audit"
- "exception security"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 10 (Exception Handling)**. Key doctrine: Fail-closed is safe; fail-open is vulnerable. Only flag if exception grants access.
