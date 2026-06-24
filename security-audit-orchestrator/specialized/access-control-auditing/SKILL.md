---
name: access-control-auditing
description: Audit for broken access control: IDOR (Insecure Direct Object Reference), BOLA (Broken Object-Level Access Control), BFLA (Broken Function-Level Access Control). Use when testing user data access, role checks, resource ownership. CRITICAL: Only flag CRITICAL if vulnerability is exploitable. If backend enforces checks, frontend exposure = LOW severity (cosmetic).
---

# Access Control Auditing — IDOR/BOLA/BFLA Detection

Detect missing authorization checks: IDOR (direct object reference without owner check), BOLA (function works but wrong user accesses), BFLA (function hidden from some users but accessible).

## Core Doctrine: Backend-is-Truth Access Control

| Vulnerability | What Attacker Can Do | Real Consequence | Severity If Backend Validates | Proper Fix |
|---|---|---|---|---|
| IDOR: GET /posts/999 | Change ID to 123 | Read user123's private post | LOW (backend checks owner) | Backend verifies req.user.id == post.owner_id |
| BOLA: PATCH /posts/999 | Change 999 to 123 | Modify user123's post | CRITICAL (no backend check) | Backend checks owner before update |
| BFLA: /admin hidden UI | Frontend hides admin menu | Attacker calls /api/admin directly | LOW (backend checks role) | Backend middleware: if (!admin) 403 |
| User can see others' data | GET /users/123/profile | Read any user's profile | CRITICAL (no access check) | Backend: if user != 123 && !admin: 403 |
| Price field editable | PATCH /orders/123 {price: 0} | Attacker sets price to 0 | CRITICAL (no validation) | Backend: only allow certain fields |
| Timestamp editable | PATCH /posts {created_at: 2020} | Fake post date | HIGH (no validation) | Backend: auto-set timestamps |
| Role field updatable | PATCH /users/me {role: admin} | Become admin | CRITICAL | Backend: never allow role from request |
| Resource owner bypass | GET /files/123 | Read file from other user | CRITICAL | Backend: verify ownership before accessing |

## Operating Principles

1. **Backend is truth, not frontend.** Frontend can hide UI; backend must enforce authorization.
2. **Every endpoint needs access check.** User_id in URL? Verify it matches logged-in user. Admin endpoint? Check role.
3. **Never trust the client.** Attacker can modify IDs, add fields, bypass JavaScript. Backend must verify.
4. **Distinguish by exploitability.** Frontend hides admin UI + backend validates = LOW. Frontend hides nothing = CRITICAL.
5. **Test all CRUD operations.** Create/Read/Update/Delete. Does each check authorization?
6. **Check resource ownership.** If resource has owner_id, verify owner_id == current_user.id before allowing operation.
7. **Verify role-based access.** Admin? Editor? Viewer? Check role on every protected endpoint.
8. **Object-level vs function-level.** IDOR = accessing wrong object. BFLA = accessing function without permission.

## Phase 1: Detection Strategy

**What to look for:**

1. **Insecure Direct Object Reference (IDOR)**
   - Patterns: `/posts/:id`, `/users/:id`, `/files/:id` without owner check
   - Attack: Change ID in URL, access other user's resource
   - Fix: Backend verifies owner_id or access_control_list

2. **Broken Object-Level Access Control (BOLA)**
   - Patterns: PATCH/PUT endpoint updates resource without checking ownership
   - Attack: Modify another user's post, change their email
   - Fix: Backend checks `if owner_id != current_user.id: 403`

3. **Broken Function-Level Access Control (BFLA)**
   - Patterns: `/admin`, `/api/admin/users` accessible without role check
   - Attack: Call admin API directly
   - Fix: Backend middleware: `if !user.role.includes('admin'): 403`

4. **Privilege escalation via parameter**
   - Patterns: `?role=admin`, `{role: 'admin'}`, `?access_level=5`
   - Attack: Attacker sets their own role/access level
   - Fix: Backend never reads role from request; use session/token

5. **Permission checks missing on write operations**
   - Patterns: POST/PUT/DELETE without authorization
   - Attack: Delete other user's data
   - Fix: Check ownership/role before write

6. **Timestamp/audit-field manipulation**
   - Patterns: `created_at`, `updated_at`, `deleted_at` in request body
   - Attack: Fake post creation date
   - Fix: Backend auto-sets timestamps, ignores request values

7. **Resource enumeration**
   - Patterns: GET /users, GET /posts lists all resources
   - Attack: Enumerate all users/posts
   - Fix: Only show resources user has access to (filter by owner/role)

## Phase 2: Grep Leads

### JavaScript/Express
Pattern: `req\.params\.\w+` (ID from URL)
Pattern: `User\.findById\(req\.params|Post\.findById` (check if owner verified after)
Pattern: `if\s*\(\s*.*\.owner_id|if.*===.*req\.user\.id` (ownership check, GOOD)
Pattern: `req\.body\.role|req\.body\.is_admin` (role from request, BAD)
Pattern: `app\.\(get|post|put|delete\)\(['\"]\/admin` (admin endpoint, check authorization)

### Python/Django
Pattern: `User\.objects\.get\(id=request\.GET` (IDOR pattern)
Pattern: `if.*obj\.owner.*!=.*request\.user` (ownership check, GOOD)
Pattern: `if.*request\.user\.is_staff|if.*request\.user\.groups\.filter` (role check, GOOD)
Pattern: `role.*=.*request\.POST|role.*=.*request\.data` (role from request, BAD)

### Go
Pattern: `user.*:=.*mux\.Vars\(r\)\[` (get ID from URL)
Pattern: `if.*post\.UserID.*!=.*userID` (ownership check, GOOD)
Pattern: `if.*!isAdmin\(|if.*user\.Role.*!=.*"admin"` (role check, GOOD)

### Java/Spring
Pattern: `@PathVariable.*id|@GetMapping.*{id}` (ID from URL)
Pattern: `if.*!Objects\.equals\(owner|if.*!post\.getOwner` (ownership check, GOOD)
Pattern: `@PreAuthorize|hasRole` (role check, GOOD)
Pattern: `@RequestBody.*role|setRole\(request\.getParameter` (role from request, BAD)

### C#/.NET
Pattern: `\[HttpGet\(".*{id}"\)|Route.*{id}` (ID from URL)
Pattern: `if.*post\.OwnerId.*!=.*userId` (ownership check, GOOD)
Pattern: `\[Authorize\(Roles|User\.IsInRole` (role check, GOOD)

## Phase 3: Triage

| Issue Type | Backend Validates? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| IDOR: Can change user_id in URL | YES | LOW | No | N/A (already safe) |
| IDOR: Can change user_id in URL | NO | CRITICAL | Yes | Medium |
| BFLA: Admin UI hidden | YES | LOW | No | N/A (frontend cosmetic) |
| BFLA: Admin API accessible | NO | CRITICAL | Yes | Low |
| BOLA: Can modify other user's post | NO | CRITICAL | Yes | Medium |
| Can read other user's profile | YES | LOW | No | N/A (backend filters) |
| Can read other user's profile | NO | CRITICAL | Yes | Low |
| Role updatable via request | NO | CRITICAL | Yes | Low |
| Timestamp editable | NO | MEDIUM | Partial | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Does endpoint really need this access?**
   - Public profile? Allow any user. Private profile? Only owner. Admin endpoint? Only admin.
   - If endpoint shouldn't exist → remove it.

2. **Already protected?** Does framework provide authorization?
   - Spring Security: @PreAuthorize. Django: @login_required, permission_required. Use framework.
   - If protected → use existing.

3. **Middleware/decorator?** Apply auth check at handler entry
   - Check user_id or role once, before any data access.
   - Framework middleware/decorator recommended.

4. **Manual backend check** (explicit, clear)
   - For each endpoint: verify user_id (if reading own data) or role (if admin action)
   - Most explicit: `if post.owner_id != request.user.id: return 403`

5. **Access control list (ACL)** (if complex permissions)
   - Store explicit permissions: who can read/write/delete what
   - For many-to-many access patterns.

6. **Row-level security (RLS)** (database-level, rare)
   - Database enforces access control via row security policies.
   - Solves enumeration + access in one place.

## Phase 5: Record Format

```
ID: ACCESS-001
Title: IDOR in GET /api/posts/:id — no owner check
Severity: CRITICAL
Location: routes/posts.js:42
Vector: Attacker changes ID to 123, reads other user's private post
Impact: User data exposed (post content, private information)
Evidence: Post.findById(id) with no owner verification
Confidence: 95%
Fix: Backend: if (post.owner_id !== req.user.id) return 403
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript Express (Vulnerable):**
```javascript
// DANGER: No owner check
app.get('/api/posts/:id', (req, res) => {
    const post = Post.findById(req.params.id);
    res.json(post);  // Attacker can change ID to read anyone's post
});
```

**JavaScript Express (Fixed):**
```javascript
// GOOD: Owner check
app.get('/api/posts/:id', requireAuth, (req, res) => {
    const post = Post.findById(req.params.id);
    if (post.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(post);
});
```

**Python Django (Vulnerable):**
```python
# DANGER: No owner check
def get_post(request, post_id):
    post = Post.objects.get(id=post_id)
    return JsonResponse({'post': post.title})
```

**Python Django (Fixed):**
```python
# GOOD: Owner check
@login_required
def get_post(request, post_id):
    post = Post.objects.get(id=post_id)
    if post.owner_id != request.user.id and not request.user.is_staff:
        return JsonResponse({'error': 'Forbidden'}, status=403)
    return JsonResponse({'post': post.title})
```

**Go (Vulnerable):**
```go
// DANGER: No owner check
func GetPost(w http.ResponseWriter, r *http.Request) {
    id := mux.Vars(r)["id"]
    post := db.GetPost(id)
    json.NewEncoder(w).Encode(post)  // Attacker can change ID
}
```

**Go (Fixed):**
```go
// GOOD: Owner check
func GetPost(w http.ResponseWriter, r *http.Request) {
    userID := r.Context().Value("user_id").(string)
    id := mux.Vars(r)["id"]
    post := db.GetPost(id)
    if post.OwnerID != userID && !isAdmin(userID) {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }
    json.NewEncoder(w).Encode(post)
}
```

**Java Spring (Vulnerable):**
```java
// DANGER: No owner check
@GetMapping("/api/posts/{id}")
public Post getPost(@PathVariable Long id) {
    return postRepository.findById(id).orElse(null);
}
```

**Java Spring (Fixed):**
```java
// GOOD: Owner check + authorization
@GetMapping("/api/posts/{id}")
public ResponseEntity<?> getPost(@PathVariable Long id, @AuthenticationPrincipal User user) {
    Post post = postRepository.findById(id).orElse(null);
    if (post == null) return ResponseEntity.notFound().build();
    
    if (!post.getOwnerId().equals(user.getId()) && !user.isAdmin()) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    return ResponseEntity.ok(post);
}
```

## Phase 7: Verification Checklist

- [ ] List all endpoints that read/modify user data (/posts/:id, /users/:id, etc.)
- [ ] For each endpoint: identify if resource has owner (post.owner_id, file.user_id, etc.)
- [ ] For each: code review backend, verify owner check exists
- [ ] Test by changing ID in URL: Can you access other user's data?
- [ ] Test by changing role in request: Can you escalate to admin?
- [ ] Test by calling admin endpoint without admin role: Does it reject?
- [ ] Test by modifying other user's resource: Does backend allow?
- [ ] Verify all write operations (POST/PUT/DELETE) have authorization checks
- [ ] Verify timestamps (created_at, updated_at) not editable by user
- [ ] Verify role/permission changes require admin (not user request)

## Quality Bar

1. Every endpoint that accesses user data checks owner/role
2. No IDOR (direct object reference without owner check)
3. No BOLA (object write without ownership check)
4. No BFLA (function accessible without authorization)
5. User_id never from request; always from authenticated session/token
6. Role never from request; always from session/token
7. Admin endpoints protected with role middleware
8. Read operations filtered by owner (not all resources returned)
9. Write operations verify ownership before modification
10. Test passes: Attacker cannot access/modify other user's data

## Example Triggers

- "access control"
- "IDOR vulnerability"
- "can I access other user's data?"
- "role-based access control"
- "permission audit"
- "authorization check"
- "BOLA"
- "BFLA"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 1 (Broken Access Control)**. Core doctrine: Backend is truth; frontend is cosmetic. Only flag CRITICAL if backend fails to validate.
