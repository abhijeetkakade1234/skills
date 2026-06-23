---
name: frontend-validation-bypass
description: Audit for client-side-only validation without backend re-validation. Use when frontend hides features via disabled buttons, conditional rendering, hidden form fields without backend checks. CRITICAL LESSON: Only flag as HIGH/CRITICAL if backend fails to re-validate. If backend validates, frontend cosmetics = LOW severity (UX issue).
---

# Frontend Validation Bypass — Backend-is-Truth Audit

Detect business logic enforced only in frontend without backend re-validation. IMPORTANT: Backend is truth; frontend is cosmetic hint. A bug exists only if backend fails.

## Core Doctrine: Frontend vs Backend Trust

| Code Pattern | Frontend Hides | Backend Validates? | Severity | Real Risk | Proper Fix |
|---|---|---|---|---|---|
| Disabled button in frontend | Action hidden from UI | YES (re-checks) | LOW | UX issue; backend blocks | Frontend hides, backend enforces |
| Hidden form field | Input not visible | YES (re-checks) | LOW | UX issue; backend rejects | Redundant frontend hiding |
| JS validation only | No server-side check | NO | CRITICAL | Attacker bypasses, full exploit | Add backend validation |
| Role check in frontend | Admin UI hidden | NO | CRITICAL | Attacker accesses admin API | Add backend authz check |
| Conditional rendering | Feature disabled | YES (backend blocks) | LOW | Frontend = cosmetic | Backend is truth |
| Client-side auth token | Token expires in JS | NO | CRITICAL | Attacker replays expired token | Backend validates expiry |
| Emoji filter in JS | Invalid chars removed | YES (backend also filters) | LOW | Redundant; backend safe | Both layers OK |

## Operating Principles

1. **Backend is truth.** Frontend validation is optional, merely UX. Backend MUST re-validate all input.
2. **Never assume frontend works.** Attacker will bypass JS, disable buttons, or craft API calls directly.
3. **Double-layer approach.** Frontend: hide invalid UI for users. Backend: reject invalid requests for everyone.
4. **Only HIGH if backend fails.** If backend re-validates, frontend missing validation = LOW (cosmetic). If backend trusts frontend = CRITICAL (exploitable).
5. **Test by bypassing frontend.** Disable JavaScript, use curl/Postman to send requests directly. If backend accepts = vulnerability.
6. **Verify backend validation explicitly.** Don't assume it happens. Code review: Does endpoint re-check permissions? Re-validate input?
7. **Example flows.** Disabled button? Check if backend enforces. Hidden admin field? Check if backend checks role. Email validation in JS? Check if backend re-validates.

## Phase 1: Detection Strategy

**What to look for:**

1. **Frontend permission checks only**
   - Patterns: `if (user.role === 'admin') { <AdminUI> }`, conditional rendering based on user role
   - Check: Does backend verify role before allowing action?

2. **Disabled buttons without backend enforcement**
   - Patterns: `<button disabled={!user.canEdit}>`, `ng-disabled="!auth.isEditor"`
   - Check: Can attacker call API directly even without button?

3. **Hidden form fields**
   - Patterns: `<input type="hidden" value={userId}>`, data attributes used for JS logic
   - Check: Does backend verify user_id matches logged-in user?

4. **Frontend validation only**
   - Patterns: `if (email.includes('@')) { submit(); }`, length checks in JavaScript
   - Check: Does backend also validate format/length?

5. **Client-side token checks**
   - Patterns: `if (token.exp > Date.now()) { makeRequest(); }` in JavaScript
   - Check: Does backend verify token signature and expiry?

6. **Conditional routing/navigation**
   - Patterns: `if (!loggedIn) { redirect('/login'); }` in frontend only
   - Check: Does backend also check auth headers?

7. **Feature flags in frontend**
   - Patterns: `if (betaFeatureEnabled) { <BetaUI> }` from localStorage/sessionStorage
   - Check: Does backend also check flag before allowing operation?

## Phase 2: Grep Leads

### JavaScript/React
Pattern: `if\s*\(\s*\w+\.role|if\s*\(.*isAdmin|if\s*\(.*canEdit` (permission checks)
Pattern: `disabled=\{[^}]*\}|ng-disabled=` (disabled elements)
Pattern: `type=["']hidden` (hidden form fields)
Pattern: `push\(['\"]/admin|redirect\(['\"]/login` (conditional routing)
Pattern: `localStorage\.|sessionStorage\.` (client-side state, verify backend checks)

### React/Redux/Vue
Pattern: `connect\(mapStateToProps|useSelector.*role|computed:.*admin` (state-based checks)
Pattern: `<Route.*render=.*role|v-if=` (conditional rendering)
Pattern: `if\s*\(\s*state\..*canEdit\s*\)` (frontend permission check)

### Angular
Pattern: `*ngIf=.*role|*ngIf=.*isAdmin` (conditional rendering)
Pattern: `ng-disabled=` (disabled based on frontend state)
Pattern: `this\.authService\.hasRole` (frontend service check, verify backend)

### Backend Validation Patterns (Search for these to VERIFY backend does validate)
Pattern: `req\.user\.role|auth\.verify\(|authz\.check|canAccess\(|hasPermission\(`
Pattern: `JWT\.verify\(|token\.verify\(|validateToken\(` (token validation)
Pattern: `if\s*\(\s*!.*authorized\s*\)\s*\{.*deny|401|403` (deny unauthorized)
Pattern: `user_id\s*=\s*req\.user\.id` (use logged-in user, not from request)

## Phase 3: Triage

| Finding Type | Has Backend Validation? | Severity | Confidence | Fix Effort |
|---|---|---|---|---|
| Admin UI hidden, backend checks role | YES | LOW | 90% | No fix needed; frontend = UX |
| Admin action disabled, backend enforces | YES | LOW | 90% | No fix needed; frontend = cosmetic |
| Permission check only in frontend JS | NO | CRITICAL | 95% | High | Add backend authz check |
| Hidden user_id field, backend trusts it | NO | CRITICAL | 95% | High | Backend must verify owner |
| Email validation in JS only | NO | HIGH | 85% | Low | Add backend validation |
| Role check frontend only | NO | CRITICAL | 95% | High | Add backend role check |
| Disabled button, API works anyway | UNKNOWN | MEDIUM | 70% | Low | Test API directly |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is frontend validation needed?**
   - If backend validates, frontend validation = cosmetic UX improvement. If backend doesn't → must add.
   - If backend solid → frontend optional.

2. **Already validated backend?** Does backend re-check?
   - Review backend code for permission/validation logic.
   - If backend validates → severity drops to LOW.

3. **Framework validation?** Does framework have built-in auth check?
   - Spring Security, Express middleware, Django decorators?
   - Use framework authorization.

4. **Manual backend check** (most explicit)
   - For each endpoint: verify logged-in user. If role required, check role. If user_id in request, verify it's current user.
   - Code review: Every endpoint that modifies state should check permissions.

5. **Frontend validation + backend check** (defense in depth)
   - Frontend: hide UI for better UX. Backend: enforce rules.
   - Both layers together.

## Phase 5: Record Format

```
ID: FRONTEND-001
Title: Admin panel accessible via API without role check
Severity: CRITICAL
Location: backend/routes/admin.js:42
Vector: Frontend hides admin UI; backend API doesn't check role
Impact: Attacker calls /api/admin/users directly, bypasses frontend UI
Evidence: Frontend: if (user.role === 'admin'). Backend: no role check in GET /api/admin/users
Confidence: 95%
Fix: Add backend middleware: if (!req.user.role.includes('admin')) res.status(403).send()
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript Frontend + Node Backend (Vulnerable):**
```javascript
// Frontend: Admin UI conditional (cosmetic)
{user.role === 'admin' && <AdminPanel />}

// Backend: NO ROLE CHECK!
app.get('/api/admin/users', (req, res) => {
    const users = User.findAll();
    res.json(users);  // DANGER: No role verification!
});
```

**JavaScript Frontend + Node Backend (Fixed):**
```javascript
// Frontend: Admin UI conditional (UX)
{user.role === 'admin' && <AdminPanel />}

// Backend: VERIFY ROLE!
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = User.findAll();
    res.json(users);  // Safe: requireAdmin middleware checks role
});

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}
```

**Python Frontend + Django Backend (Vulnerable):**
```python
# Frontend: Vue hides edit button
# <button v-if="post.canEdit">Edit</button>

# Backend: NO CHECK!
def update_post(request, post_id):
    post = Post.objects.get(id=post_id)
    post.title = request.POST['title']
    post.save()  # DANGER: No owner verification!
    return JsonResponse({'status': 'ok'})
```

**Python Frontend + Django Backend (Fixed):**
```python
# Frontend: Vue hides edit button
# <button v-if="post.canEdit">Edit</button>

# Backend: VERIFY OWNER!
@require_http_methods(["POST"])
def update_post(request, post_id):
    post = Post.objects.get(id=post_id)
    if post.author != request.user:  # Check owner!
        return JsonResponse({'error': 'Forbidden'}, status=403)
    post.title = request.POST['title']
    post.save()
    return JsonResponse({'status': 'ok'})
```

**React Frontend + Express Backend (Vulnerable):**
```javascript
// Frontend: Conditional rendering
const Checkout = ({ user }) => {
    if (user.accountStatus !== 'premium') {
        return <div>Upgrade to premium</div>;
    }
    return <CheckoutForm />;
};

// Backend: NO CHECK!
app.post('/api/checkout', (req, res) => {
    // DANGER: No verification of user.accountStatus
    const order = Order.create(req.body);
    res.json({ order });
});
```

**React Frontend + Express Backend (Fixed):**
```javascript
// Frontend: Conditional rendering (UX)
const Checkout = ({ user }) => {
    if (user.accountStatus !== 'premium') {
        return <div>Upgrade to premium</div>;
    }
    return <CheckoutForm />;
};

// Backend: VERIFY STATUS!
app.post('/api/checkout', requireAuth, (req, res) => {
    if (req.user.accountStatus !== 'premium') {
        return res.status(403).json({ error: 'Premium required' });
    }
    const order = Order.create(req.body);
    res.json({ order });
});
```

## Phase 7: Verification Checklist

- [ ] Identify all frontend permission/validation checks (if statements, conditional rendering)
- [ ] For each: code review backend endpoint, verify role/permission check exists
- [ ] Test by bypassing frontend: use curl/Postman to call API without JS
- [ ] Test: Disable button, does API still work? (Should reject if no backend check)
- [ ] Test: Send invalid data (bad email, role=admin), does backend reject? (Should reject)
- [ ] Verify: User_id from request vs logged-in user. Never trust request (use req.user.id)
- [ ] Verify: Token validation. Backend must verify expiry, signature, scopes
- [ ] Verify: Feature flags checked backend (if user can disable via DevTools, backend should validate)
- [ ] Check middleware: Is auth check applied to all protected endpoints?
- [ ] Load test: Can attacker bypass via race condition or timing issue?

## Quality Bar

1. Every frontend permission check has matching backend validation
2. Backend never trusts user_id or role from request body
3. Backend re-validates token expiry, signature, and scopes
4. Disabled buttons have backend enforcement (request rejected if not allowed)
5. Hidden form fields verified backend (user_id matches logged-in user)
6. Frontend validation for UX only; backend is source of truth
7. All endpoints that modify state check authorization
8. Middleware applied to all protected routes
9. Test passes when JavaScript disabled (backend enforces)
10. Role/permission changes reflected immediately (not cached in frontend)

## Example Triggers

- "frontend validation"
- "can I bypass frontend?"
- "permission check only in frontend?"
- "disabled button"
- "hidden field vulnerability"
- "API works without UI button?"
- "backend-is-truth audit"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 1 (Broken Access Control) & Layer 3 (Injection)**. Key doctrine: Backend is truth; frontend is cosmetic. Only flag if backend fails to validate.
