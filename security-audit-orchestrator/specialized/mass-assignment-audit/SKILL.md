---
name: mass-assignment-audit
description: Audit for mass assignment (BOPLA) where attacker adds unexpected fields to requests. Detects Model.update(req.body) patterns that bind all fields without allowlist. Use when code has ORM .fill(), .assign(), Object.assign(), or direct attribute setting from user input. Extends blueteam-defend Layer 1 (Broken Access Control).
---

# Mass Assignment Audit — ORM Field Binding Vulnerability

Detect mass assignment vulnerabilities where attacker adds unexpected fields (role, is_admin, price, owner_id) to requests and ORM/app blindly updates all fields without allowlisting.

## Core Doctrine: What Code Trusts

| Code Pattern | What Attacker Can Do | Real Consequence | Proper Fix |
|---|---|---|---|
| User.update(req.body) | Add role, is_admin, price fields | Become admin, change pricing | Allowlist: only ['name', 'email'] |
| Model.fill(req.body) | Add any field from request | Modify any column | Use fillable/guarded + validation |
| Object.assign(user, req.body) | Merge all request keys into user | Override permissions, timestamps | Manual field assignment only |
| Direct property assignment | Set any property from request | Bypass validation, change owner_id | Validate each field individually |
| Unguarded ORM model | No protection against mass assign | Attacker controls all fields | Define guarded or fillable whitelist |
| PATCH with req.body | Update multiple fields at once | Update sensitive fields | Only allow specific fields per endpoint |

## Operating Principles

1. **Never trust request body.** Attacker can add any field. Code must explicitly allow which fields are updatable.
2. **Whitelist, don't blacklist.** Good: `only(['name', 'email'])`. Bad: `except(['password'])` (attacker finds new sensitive field).
3. **ORM protection: use fillable/guarded.** Laravel/Eloquent: `fillable = ['name', 'email']`. Mongoose: Schema.set('toObject'). Spring Data: @JsonProperty(access = READ_ONLY).
4. **Allowlist per endpoint.** POST /users: allow ['name', 'email']. PATCH /admin: allow ['role', 'permissions']. Different endpoints = different allowlists.
5. **Validate each field.** Even if allowlisted, validate type, length, format. String field? No numbers. Email field? No /admin strings.
6. **Test by adding unexpected fields.** Send request with role=admin, is_paid=true, owner_id=999. If fields change, it's mass assignment.

## Phase 1: Detection Strategy

**What to look for:**

1. **ORM mass assignment without allowlist**
   - Patterns: `.update(req.body)`, `.fill(req.body)`, `.assign(req.body)`, `.updateAttributes(req.body)`
   - Check if allowlist/whitelist exists (fillable, guarded, permitted_attributes)

2. **Direct property assignment from request**
   - Patterns: `user.role = req.body.role`, `Object.assign(user, req.body)`, `user.update(**request.json())`
   - Check if each field is validated/approved

3. **Sensitive fields without protection**
   - Patterns: `is_admin`, `role`, `owner_id`, `price`, `created_at`, `updated_at`, `deleted_at`
   - Check if these fields are in any allowlist

4. **Unguarded ORM models**
   - Patterns: Model defined without fillable/guarded/permitted_attributes
   - Check if model has mass-assignment protection

5. **PATCH/PUT without field validation**
   - Patterns: `app.patch('/users/:id', (req, res) => { User.update(req.body) })`
   - Check if all fields in req.body are validated individually

## Phase 2: Grep Leads

### JavaScript (Express + Mongoose/Sequelize)
Pattern: `\.update\(req\.body\)|\.fill\(req\.body\)`
Pattern: `\.assign\(.*req\.body\)|Object\.assign\(.*req\.body\)`
Pattern: `const\s+\w+\s*=\s*req\.body` (direct assignment from request)
Pattern: `for\s*\(\s*const.*in\s+req\.body` (iterating request body)

### Python (Django/SQLAlchemy)
Pattern: `**request\.json\(\)|**request\.form`
Pattern: `\.update\(\*\*request\.json\(\)\)`
Pattern: `setattr\(.*request\.json` (dynamic attribute setting)
Pattern: `__all__|permitted_attributes` (look for allowlist)

### Ruby (Rails)
Pattern: `\.update\(params\)|\.update_attributes\(params\)`
Pattern: `strong_parameters|permit\(` (Rails protection)
Pattern: `attr_accessible|protected` (old Rails protection)
Pattern: `allow_all_parameters` (anti-pattern)

### Java (Spring Data/Hibernate)
Pattern: `@JsonProperty|@Column|@JsonIgnore` (field protection decorators)
Pattern: `repo\.save\(entity\)|mapper\.map\(` (check if validates)
Pattern: `BeanUtils\.copyProperties|MapStruct` (check mapper config)

### PHP (Laravel)
Pattern: `$model->fill\(\$request->all\(\)\)|fillable\s*=`
Pattern: `guarded\s*=|protected\s+\$guarded`
Pattern: `$model->update\(\$request->all\(\)\)`

### C# (.NET)
Pattern: `JsonConvert\.DeserializeObject|JsonSerializer\.Deserialize`
Pattern: `[JsonIgnore]|[JsonProperty]` (protection attributes)
Pattern: `AutoMapper|MapTo\(`

## Phase 3: Triage

| Finding Type | Severity | Confidence | Fix Effort |
|---|---|---|---|
| Role/is_admin updatable via mass assign | CRITICAL | 95% | Low |
| owner_id/user_id updatable via mass assign | CRITICAL | 95% | Low |
| Price/discount updatable via mass assign | CRITICAL | 95% | Low |
| Unguarded ORM model exists | HIGH | 90% | Low |
| Timestamp fields updatable (created_at, updated_at) | HIGH | 90% | Low |
| PATCH endpoint with no field allowlist | HIGH | 85% | Medium |
| Custom fields updatable via mass assign | MEDIUM | 80% | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Should field be updatable at all?**
   - role? No — only admin can set. owner_id? No — auto-set to logged-in user. created_at? No — DB auto-sets.
   - If field shouldn't be updatable → remove it.

2. **Already protected?** Does ORM have fillable/guarded/protected config?
   - Rails: strong_parameters with `.permit()`. Laravel: `$fillable = ['name']`. Mongoose: Schema config. Django: forms validation.
   - If protection exists → use it.

3. **Framework validation?** Can framework's allowlist protect this?
   - Spring: `@JsonProperty(access = JsonProperty.Access.READ_ONLY)`. Django: Form fields. Pydantic: field validators.
   - Use framework feature.

4. **Manual field assignment** (most explicit, safest)
   - Only assign specific fields: `user.name = req.body.name; user.email = req.body.email;`
   - Skip req.body['role'], req.body['is_admin'], etc.

5. **Allowlist/whitelist** (if must use mass assign)
   - Define exactly which fields are updatable: `const allowed = ['name', 'email']; Object.assign(user, pick(req.body, allowed))`
   - Defend in depth: also validate each field.

6. **Custom validator** (rare, if framework doesn't support)
   - Check type, length, format for each field before assigning.

## Phase 5: Record Format

```
ID: MASS-001
Title: Role field updatable via mass assignment in PATCH /users/:id
Severity: CRITICAL
Location: controllers/UserController.js:45
Vector: Attacker sends PATCH /users/123 with role=admin in request body
Impact: Attacker becomes admin, gains all privileges
Evidence: User.update(req.body) with no allowlist
Confidence: 95%
Fix: Define fillable = ['name', 'email'] only. Validate all input fields.
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript (Vulnerable):**
```javascript
app.patch('/users/:id', (req, res) => {
    const user = User.findById(req.params.id);
    user.update(req.body);  // DANGER: role, is_admin, etc. can be set
    res.json(user);
});
```

**JavaScript (Fixed):**
```javascript
app.patch('/users/:id', (req, res) => {
    const user = User.findById(req.params.id);
    const allowed = { name: req.body.name, email: req.body.email };
    user.update(allowed);  // Only these fields updatable
    res.json(user);
});
```

**Python Django (Vulnerable):**
```python
def update_user(request, user_id):
    user = User.objects.get(id=user_id)
    for key, value in request.POST.items():
        setattr(user, key, value)  # DANGER: Any field can be set
    user.save()
    return JsonResponse({'status': 'ok'})
```

**Python Django (Fixed):**
```python
def update_user(request, user_id):
    user = User.objects.get(id=user_id)
    allowed_fields = {'name', 'email', 'bio'}
    for key in allowed_fields:
        if key in request.POST:
            setattr(user, key, request.POST[key])
    user.save()
    return JsonResponse({'status': 'ok'})
```

**Ruby Rails (Vulnerable):**
```ruby
def update
    user = User.find(params[:id])
    user.update(params[:user])  # DANGER: No protection
end
```

**Ruby Rails (Fixed):**
```ruby
def update
    user = User.find(params[:id])
    user.update(user_params)  # Strong parameters enforce whitelist
end

private
def user_params
    params.require(:user).permit(:name, :email, :bio)
end
```

**Java Spring (Vulnerable):**
```java
@PutMapping("/users/{id}")
public User updateUser(@PathVariable Long id, @RequestBody User req) {
    User user = userRepository.findById(id).orElseThrow();
    BeanUtils.copyProperties(req, user);  // DANGER: All fields copied
    return userRepository.save(user);
}
```

**Java Spring (Fixed):**
```java
@PutMapping("/users/{id}")
public User updateUser(@PathVariable Long id, @RequestBody UserDTO req) {
    User user = userRepository.findById(id).orElseThrow();
    user.setName(req.getName());
    user.setEmail(req.getEmail());
    // role, is_admin NOT set from request
    return userRepository.save(user);
}
```

## Phase 7: Verification Checklist

- [ ] Identify all .update(), .fill(), .assign() calls on models
- [ ] For each: verify allowlist/whitelist exists (fillable, guarded, permitted_attributes)
- [ ] For sensitive fields (role, is_admin, owner_id, price): verify they're NOT in allowlist
- [ ] Test by sending unexpected fields in request; verify they're NOT saved
- [ ] Test with role=admin, is_paid=true, owner_id=999 in request; verify not updated
- [ ] Review PATCH/PUT endpoints; verify field-by-field assignment or tight allowlist
- [ ] Check ORM model definitions; verify fillable/guarded configured
- [ ] Run mass-assignment test: iterate request.body with malicious fields
- [ ] Verify timestamps (created_at, updated_at, deleted_at) NOT updatable by user

## Quality Bar

1. No ORM .update(req.body) without allowlist
2. Sensitive fields (role, is_admin, owner_id, price) NOT in allowlist
3. All PATCH/PUT endpoints validate input fields
4. Allowlist applied at model level (fillable/guarded) or request level (strong parameters)
5. Each sensitive field has access control check (admin only, owner only, etc.)
6. Test shows unexpected fields in request are ignored
7. Timestamps auto-managed (not updatable by user)
8. No direct property assignment from untrusted input
9. Framework mass-assignment protection in place
10. Regular audit of allowed fields across all endpoints

## Example Triggers

- "mass assignment"
- "can I change my role via API?"
- "ORM update vulnerability"
- "field binding audit"
- "parameter pollution"
- "unexpected fields in request"
- "BOPLA"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 1 (Broken Access Control)**. Blueteam-defend covers high-level authz; mass-assignment-audit provides specific patterns for ORM field binding vulnerabilities and language-specific protections.
