---
name: sql-injection-deep-dive
description: >
  Deep-dive SQL injection audit across SQL/NoSQL/SQLite/PostgreSQL/MySQL. Detect string concatenation in queries, parameterization gaps, ORM misuse. Use when code builds queries dynamically. Extends blueteam-defend Layer 2 (Injection). Real payloads included for testing. Ponytail: Parameterized queries first → ORM safe methods → Escaping never.
---

# SQL Injection Deep-Dive — Eliminate Query String Concatenation

Operate as a SQL injection specialist: user input concatenated into a query string is a data-theft and auth-bypass vector, and in stacked-query engines it is RCE.

**Default workflow: detect concatenation/interpolation patterns → classify the injection vector → confirm exploitability → propose parameterized fix → verify with payloads + re-grep.**

## Core Doctrine — Parameterized Queries Always

The query structure must be fixed at author time; user input may only enter as a bound parameter. The driver, not the application, separates code from data.

| Vulnerable Pattern | Attack Input | Result | Severity If Parameterized | Proper Fix |
|---|---|---|---|---|
| `f"SELECT * FROM users WHERE id = {id}"` | id = `1 OR 1=1` | Returns all users | SAFE | Bind: `WHERE id = %s`, `(id,)` |
| `"... WHERE email = '" + email + "'"` | email = `' OR ''='` | Auth bypass | SAFE | Bind email as a parameter |
| `"... ORDER BY " + col` | col = `(SELECT ...)` | Blind/boolean injection | SAFE | Allowlist column names |
| `query % (name,)` used as escaping | name = `admin' --` | Auth bypass, comment-out | SAFE | Pass params to `execute()`, not `%` |
| `.find({"username": username})` (NoSQL) | username = `{"$ne": ""}` | Returns all docs | SAFE | Cast to string; reject objects |
| `db.collection.$where(js)` (NoSQL) | js = `'1==1'` | Full collection read + JS eval | SAFE | Never use `$where` on user input |
| `EXEC('SELECT ... ' + @p)` (stored proc) | `@p = '; DROP TABLE ...'` | Stacked query / RCE | SAFE | `sp_executesql` with params |
| `Model.objects.raw("... %s" % v)` (ORM) | `v = "x); DROP ..."` | Injection via raw() | SAFE | `raw(sql, [v])` or QuerySet API |

## Operating Principles

1. **Structure is code, input is data.** The SQL keywords, table/column names, and operators are fixed; everything from the user is a bound value.
2. **Never concatenate, interpolate, or format user input into a query string.** f-strings, `+`, `%`, `.format()`, `Sprintf`, template literals — all are injection sources.
3. **Parameterized queries are the default fix, not escaping.** Hand-rolled escaping is always wrong eventually (charset edge cases, second-order, numeric contexts).
4. **Identifiers can't be parameterized.** Table/column names in `ORDER BY`, `GROUP BY`, dynamic `FROM` must be validated against an allowlist, never bound.
5. **NoSQL injects too.** Operator injection (`$ne`, `$gt`, `$where`, `$regex`) bypasses filters when a request supplies an object where a scalar was expected.
6. **Distinguish by exploitability.** A concatenated query reachable only from a hardcoded constant is informational; one reachable from a request parameter is CRITICAL.
7. **Second-order matters.** Data stored safely but later concatenated into a query is still injectable. Trace stored values into query construction.
8. **ORMs are not automatically safe.** `raw()`, `extra()`, `whereRaw()`, `createQueryBuilder().where(string)`, and string-built `Sequelize.literal` reintroduce injection.

## Phase 1 — Detection Strategy

**Injection categories to look for:**

1. **WHERE-clause concatenation**
   - Patterns: `"SELECT ... WHERE x = " + input`, `f"... WHERE x = {input}"`, `query % (input,)` used as formatting
   - Attack: `1 OR 1=1`, `' OR ''='`, `admin' --`
   - Fix: Bind as parameter — `WHERE x = %s` / `?` / `$1` with a params array.

2. **ORDER BY / identifier injection**
   - Patterns: `"... ORDER BY " + col`, `f"... ORDER BY {col} {dir}"`, dynamic `FROM`/table name
   - Attack: `col = (CASE WHEN (...) THEN id ELSE name END)` for blind boolean/time injection
   - Fix: Allowlist — map request value to a known-good column; default on mismatch.

3. **LIKE / search injection**
   - Patterns: `"... WHERE name LIKE '%" + term + "%'"`
   - Attack: `term = ' UNION SELECT ...`, or wildcard/`\` abuse
   - Fix: Bind the term as a parameter and apply wildcards to the value: `LIKE %s`, `("%" + term + "%",)`.

4. **NoSQL operator injection**
   - Patterns: `.find({field: req.body.x})`, `.find({field: req.query.x})` where `x` may be an object
   - Attack: `?x[$ne]=` , JSON body `{"x": {"$gt": ""}}`, `$where`, `$regex`
   - Fix: Coerce to expected type (`String(x)`), reject non-scalars, disable `$where`.

5. **Stored procedure dynamic SQL**
   - Patterns: `EXEC('... ' + @p)`, `EXECUTE IMMEDIATE 'sql' || var`, `PREPARE` from concatenation
   - Attack: stacked queries, `; DROP TABLE`, comment truncation
   - Fix: `sp_executesql @sql, N'@p type', @p` (SQL Server); `EXECUTE ... USING` (Postgres) with params.

6. **ORM raw() / query-builder string escape hatches**
   - Patterns: `raw(`, `.extra(`, `whereRaw(`, `Sequelize.literal(`, `createQueryBuilder().where("..." + x)`
   - Attack: same as concatenation; the ORM does not parameterize string fragments
   - Fix: Use the typed/QuerySet API, or pass replacements/bindings to the raw method.

7. **Second-order injection**
   - Patterns: value read from DB/cache, then concatenated into a new query
   - Attack: store `admin'--` in a profile field; it injects when re-queried later
   - Fix: Parameterize the second query too; never trust stored data as trusted.

## Phase 2 — Grep Leads

### JavaScript / Node
Pattern: `\.query\(\s*['\"\`].*SELECT.*['\"\`]\s*\+` (string concat into query, BAD)
Pattern: `\.query\(\s*\`[^)]*\$\{` (template literal interpolation in query, BAD)
Pattern: `(sequelize|knex)\.(query|raw)\(` (raw SQL — verify bindings passed)
Pattern: `\.whereRaw\(|Sequelize\.literal\(` (ORM escape hatch — check for concatenation)
Pattern: `\.query\([^,]+,\s*\[` (parameterized: query text + values array, GOOD)
Pattern: `\.find\(\s*\{[^}]*req\.(body|query|params)` (NoSQL operator injection risk)

### Python
Pattern: `cursor\.execute\(\s*f['\"]` (f-string in execute, BAD)
Pattern: `cursor\.execute\(\s*['\"].*['\"]\s*%` (% formatting in execute, BAD)
Pattern: `cursor\.execute\(\s*['\"].*['\"]\s*\.format\(` (.format in execute, BAD)
Pattern: `cursor\.execute\(\s*['\"].*%s.*['\"]\s*,` (parameterized execute, GOOD)
Pattern: `\.raw\(|\.extra\(` (Django ORM raw/extra — verify params arg)
Pattern: `text\(\s*f['\"]|text\(\s*['\"].*\+` (SQLAlchemy text() with interpolation, BAD)

### Go
Pattern: `db\.(Query|Exec|QueryRow)\(\s*fmt\.Sprintf\(` (Sprintf into query, BAD)
Pattern: `db\.(Query|Exec|QueryRow)\(\s*['\"].*['\"]\s*\+` (string concat into query, BAD)
Pattern: `db\.(Query|Exec|QueryRow)\(\s*['\"][^'\"]*\$1` (placeholder + args, GOOD — Postgres)
Pattern: `db\.(Query|Exec|QueryRow)\(\s*['\"][^'\"]*\?` (placeholder + args, GOOD — MySQL/SQLite)

### Java / Spring
Pattern: `(createQuery|createNativeQuery|createStatement)\(.*['\"]\s*\+` (concat into query/Statement, BAD)
Pattern: `Statement\s+\w+\s*=|\.createStatement\(` (Statement instead of PreparedStatement — review)
Pattern: `PreparedStatement|\.setString\(|\.setLong\(` (parameterized, GOOD)
Pattern: `@Query\(.*\+|\.append\(.*request` (concat into JPQL/criteria, BAD)
Pattern: `jdbcTemplate\.(query|update)\([^,]+\+` (concat into JdbcTemplate, BAD)

### C# / .NET
Pattern: `new SqlCommand\(\s*['\"].*['\"]\s*\+` (concat into SqlCommand, BAD)
Pattern: `new SqlCommand\(\s*\$['\"]` (interpolated string command, BAD)
Pattern: `\.CommandText\s*=.*\+` (concat into CommandText, BAD)
Pattern: `\.Parameters\.Add(WithValue)?\(` (parameterized, GOOD)
Pattern: `FromSqlRaw\(|ExecuteSqlRaw\(` (EF Core raw — verify interpolation uses FromSqlInterpolated/params)

## Phase 3 — Triage

| Issue Type | Parameterized? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| User input concatenated into WHERE clause | NO | CRITICAL | Yes (auth bypass + data theft) | Low |
| User input in ORDER BY / table name | NO (cannot bind) | HIGH | Yes (blind boolean/time) | Low (allowlist) |
| LIKE/search term concatenated | NO | HIGH | Yes | Low |
| NoSQL field accepts request object (`$ne`/`$gt`) | N/A | HIGH | Yes (filter bypass) | Low (type coercion) |
| NoSQL `$where` with user input | N/A | CRITICAL | Yes (JS eval) | Medium |
| Stored proc dynamic SQL via EXEC(' '+@p) | NO | CRITICAL | Yes (stacked query) | Medium |
| ORM raw()/whereRaw() with concatenation | NO | CRITICAL | Yes | Low |
| Second-order: stored value re-queried | NO (2nd query) | HIGH | Yes | Medium |
| Query built with constants only | NO but no user input | INFO | No | N/A |
| Query already uses bound parameters | YES | SAFE | No | N/A |

## Phase 4 — Ponytail Fix Ladder

1. **YAGNI: Does the query need dynamic input at all?**
   - If the value is a fixed constant or enum, hardcode it. No input, no injection.
   - If the endpoint shouldn't accept this field → remove it.

2. **Parameterized queries (default).** Bind every user value.
   - `cursor.execute("... WHERE id = %s", (id,))`, `db.Query("... = $1", id)`, `cmd.Parameters.AddWithValue("@id", id)`.
   - This is the answer for ~90% of findings.

3. **ORM safe methods.** Prefer the typed/QuerySet/repository API over raw SQL.
   - Django `Model.objects.filter(...)`, Sequelize `Model.findOne({where:{...}})`, EF Core LINQ, Hibernate criteria.
   - If `raw()` is unavoidable, pass bindings: `raw(sql, [params])`.

4. **Query builder.** For dynamic-but-structured queries, use a builder that parameterizes.
   - Knex `.where({...})`, jOOQ, SQLAlchemy Core, Laravel Query Builder, TypeORM `.where("x = :x", {x})`.

5. **Allowlist for identifiers** (`ORDER BY`, `GROUP BY`, dynamic column/table).
   - Identifiers can't be bound. Map the request value to a known-good set; reject/default otherwise.
   - `col = {"name":"name","date":"created_at"}.get(req_col, "id")`, then validate sort direction against `{"asc","desc"}`.

6. **Stored procedures with parameters** (when SQL must live in the DB).
   - `sp_executesql` (SQL Server), `EXECUTE ... USING` (Postgres) — never `EXEC(' '+@var)`.

7. **Never: custom escaping.** Do not write `replace("'", "''")` or call `mysql_real_escape_string`-style helpers as the primary defense. They fail on charsets, numeric contexts, and second-order paths.

## Phase 5 — Record Format

```
ID: SQLI-001
Title: SQL injection in user search — email concatenated into WHERE clause
Severity: CRITICAL
Location: api/users.py:88
Vector: GET /api/users?email=' OR ''=' — input concatenated into query string
Impact: Authentication bypass + full users table exfiltration via UNION
Evidence: cursor.execute("SELECT * FROM users WHERE email = '" + email + "'")
Exploitable: Yes — reachable from unauthenticated request parameter
Confidence: 97%
Fix: cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

## Phase 6 — Vulnerable → Fixed Examples

**Python (psycopg2 / sqlite3) — Vulnerable:**
```python
# DANGER: f-string interpolation builds the query
def get_user(cursor, user_id):
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return cursor.fetchone()
```

**Python — Fixed:**
```python
# GOOD: value bound as a parameter (%s for psycopg2, ? for sqlite3)
def get_user(cursor, user_id):
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    return cursor.fetchone()
```

**JavaScript (node-postgres / mysql2) — Vulnerable:**
```javascript
// DANGER: template literal injects req input into SQL
app.get('/users', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT * FROM users WHERE email = '${req.query.email}'`);
    res.json(rows);
});
```

**JavaScript — Fixed:**
```javascript
// GOOD: $1 placeholder (pg) / ? (mysql2) with a values array
app.get('/users', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT * FROM users WHERE email = $1', [req.query.email]);
    res.json(rows);
});
```

**Go (database/sql) — Vulnerable:**
```go
// DANGER: Sprintf builds the query from user input
func GetUser(db *sql.DB, email string) (*sql.Row, error) {
    q := fmt.Sprintf("SELECT id, name FROM users WHERE email = '%s'", email)
    return db.QueryRow(q), nil
}
```

**Go — Fixed:**
```go
// GOOD: $1 placeholder (pq) or ? (MySQL/SQLite), value passed as an arg
func GetUser(db *sql.DB, email string) *sql.Row {
    return db.QueryRow("SELECT id, name FROM users WHERE email = $1", email)
}
```

**Java (PreparedStatement) — Vulnerable:**
```java
// DANGER: concatenation into a Statement
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(
    "SELECT * FROM users WHERE email = '" + email + "'");
```

**Java — Fixed:**
```java
// GOOD: PreparedStatement with a bound parameter
PreparedStatement ps = conn.prepareStatement(
    "SELECT * FROM users WHERE email = ?");
ps.setString(1, email);
ResultSet rs = ps.executeQuery();
```

**C# / .NET (parameterized SqlCommand) — Vulnerable:**
```csharp
// DANGER: interpolated/concatenated CommandText
var cmd = new SqlCommand(
    $"SELECT * FROM Users WHERE Email = '{email}'", conn);
var reader = cmd.ExecuteReader();
```

**C# / .NET — Fixed:**
```csharp
// GOOD: parameter object bound to the command
var cmd = new SqlCommand(
    "SELECT * FROM Users WHERE Email = @email", conn);
cmd.Parameters.AddWithValue("@email", email);
var reader = cmd.ExecuteReader();
```

**NoSQL (MongoDB) — Vulnerable:**
```javascript
// DANGER: req.body.username may be an object → operator injection
// e.g. {"username":{"$ne":null},"password":{"$ne":null}} bypasses login
const user = await User.findOne({
    username: req.body.username,
    password: req.body.password
});
```

**NoSQL (MongoDB) — Fixed:**
```javascript
// GOOD: coerce to string so operators can't be injected; never $where on input
const username = String(req.body.username);
const password = String(req.body.password);
const user = await User.findOne({ username });
if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
}
```

### Identifier allowlist (ORDER BY) — Vulnerable → Fixed

```python
# DANGER: column name concatenated — cannot be parameterized away
cursor.execute(f"SELECT * FROM posts ORDER BY {req_sort} {req_dir}")

# GOOD: allowlist maps request value to a known-good identifier
SORT_COLUMNS = {"name": "name", "date": "created_at", "id": "id"}
column = SORT_COLUMNS.get(req_sort, "id")
direction = "DESC" if req_dir.lower() == "desc" else "ASC"
cursor.execute(f"SELECT * FROM posts ORDER BY {column} {direction}")
```

## Phase 6b — Test Payloads

Use against suspected injection points; a fixed/parameterized query treats these as literal data and returns no rows / no error.

- **Auth bypass:** `' OR '1'='1`, `admin' --`, `' OR ''='`
- **Union-based exfiltration:** `' UNION SELECT 1, user(), 3; --`
- **Time-based blind:** `1' AND SLEEP(5); --` (MySQL), `1'; SELECT pg_sleep(5); --` (Postgres)
- **Boolean blind:** `' AND 1=1 --` vs `' AND 1=2 --` (compare responses)
- **Error-based:** `' AND extractvalue(1, concat(0x7e, (SELECT password FROM users LIMIT 1))); --`
- **Stacked query:** `; DROP TABLE users; --`
- **NoSQL operator:** `{"$ne": ""}`, `{"$gt": ""}`, `?username[$ne]=`, `{"$where": "1==1"}`

## Phase 7 — Verification Checklist

- [ ] Enumerate every query construction point (SELECT, INSERT, UPDATE, DELETE, and stored procs).
- [ ] For each: confirm user input enters only as a bound parameter, never via `+`, f-string, `%`, `.format`, `Sprintf`, or template literal.
- [ ] Re-grep the Phase 2 BAD patterns — they should return zero hits in changed code.
- [ ] Identifier contexts (`ORDER BY`, dynamic table/column) are allowlist-validated, not bound or concatenated.
- [ ] NoSQL fields coerce request values to expected scalar types; `$where` is not used on user input.
- [ ] ORM `raw()`/`whereRaw()`/`FromSqlRaw` calls pass bindings, not string-built SQL.
- [ ] Second-order paths checked: stored values are re-parameterized when reused in a query.
- [ ] Auth-bypass payloads (`' OR '1'='1`, `admin' --`) return no rows / are rejected.
- [ ] Time-based payload (`SLEEP(5)` / `pg_sleep(5)`) does not delay the response.
- [ ] Error/union payloads produce no DB error leakage and no extra columns/rows.
- [ ] Tests and build pass after the fix.

## Quality Bar

1. Every finding cites a real `file:line` with the vulnerable code quoted.
2. Severity, Fix Effort, and Confidence are rated per finding.
3. Exploitability is stated (reachable from a request vs constant-only).
4. At least 2 distinct query points checked per audited file/module.
5. Injection category classified (WHERE / ORDER BY / LIKE / NoSQL / stored proc / raw() / second-order).
6. Fixes are parameterized or allowlisted — never custom escaping.
7. Identifier injections fixed with an allowlist, not parameter binding.
8. NoSQL findings address operator injection, not just classic SQL.
9. Test payloads applied and result documented (rejected / no rows / no delay).
10. Re-grep confirms no remaining concatenation patterns; tests pass.

## Example Triggers

- "SQL injection"
- "database query vulnerability"
- "string concatenation in query"
- "injectable SQL"
- "NoSQL injection"
- "is this query parameterized?"
- "ORDER BY injection"
- "ORM raw query safety"
- "auth bypass via login query"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 2 (Injection)** with per-language grep patterns, real test payloads, and the parameterize-first Ponytail ladder. Core doctrine: query structure is code, user input is data — bind parameters, allowlist identifiers, and never rely on custom escaping. Only flag CRITICAL when the injection is reachable from untrusted input.
