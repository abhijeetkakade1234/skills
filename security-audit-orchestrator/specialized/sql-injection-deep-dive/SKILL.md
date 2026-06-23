---
name: sql-injection-deep-dive
description: >
  Deep-dive SQL injection audit across SQL/NoSQL/SQLite/PostgreSQL/MySQL. Detect string concatenation in queries, parameterization gaps, ORM misuse. Use when code builds queries dynamically. Extends blueteam-defend Layer 2 (Injection). Real payloads included for testing. Ponytail: Parameterized queries first → ORM safe methods → Escaping never.
---

# SQL Injection Deep-Dive — Eliminate Query String Concatenation

Operate as a SQL injection specialist. String concatenation in queries = RCE.

**Default workflow: detect concatenation patterns → classify injection vector → propose parameterized fix → verify.**

## Core Doctrine — Parameterized Queries Always

| Vulnerable Pattern | Attack | Result |
| --- | --- | --- |
| `f"SELECT * FROM users WHERE id = {id}"` | id = `1 OR 1=1` | Returns all users |
| `"SELECT * FROM users WHERE email = '" + email + "'"` | email = `' OR ''='` | Bypasses auth |
| `.find({"username": username})` | username = `{"$ne": ""}` (NoSQL) | Returns all docs |
| `query % (username,)` no params | username = `admin' --` | Auth bypass |

## Operating Principles

- Never concatenate user input into queries.
- Always use parameterized queries (prepared statements).
- ORM safe methods prevent injection.
- Test with real payloads: `' OR '1'='1`, `; DROP TABLE users; --`, time-based blind.

## Phase 1 — Detect String Concatenation

Search for: f-strings, + concatenation, % formatting in queries.
Patterns: `f"SELECT`, `query +`, `query %`, `.query("SELECT`, `db.query(f`

## Phase 2 — Grep Leads

JS: `db.query("SELECT.*" +`, `db.query(f"SELECT`, `model.raw(string)`
Python: `query = f"SELECT`, `query % (`, `cursor.execute(query_string)`
Go: `rows, _ := db.Query("SELECT.*" +`, `fmt.Sprintf("SELECT`
SQL: Any query built outside of prepared statement library

## Phase 3 — Triage

- CRITICAL: User input in WHERE clause = data theft + auth bypass
- HIGH: User input in ORDER BY = blind injection possible
- MEDIUM: Less exploitable injection points
- Fix Effort: Low (parameterize), Medium (refactor ORM calls)

## Phase 4 — Ponytail Ladder

1. Query really need dynamic input? → Hardcode if possible
2. Already using parameterized queries? → Verify everywhere
3. ORM safe method available? → Model.find(), ORM.query()
4. Framework provides query builder? → Use query builder (Laravel Query Builder, Knex.js)
5. Can parameterize in one line? → Yes: cursor.execute(sql, [param])
6. Never: custom escaping

## Phase 5 — Record Format

ID, Title (e.g., "SQL injection in user search"), Severity/Fix Effort/Confidence, Location (file:line), Vector (how to inject), Impact (data theft/auth bypass), Proposed Fix

## Phase 6 — Test Payloads

Union-based: `' UNION SELECT 1, user(), 3; --`
Time-based blind: `1' AND SLEEP(5); --`
Error-based: `' AND extractvalue(1, concat(0x7e, (SELECT password FROM users))); --`

Example fix (Python vulnerable → fixed):
```
Before: cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
After:  cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

## Phase 7 — Verify

- Test with payload: `' OR '1'='1` should be rejected/escaped
- Re-grep concatenation patterns (should find none)
- Run tests/build
- Check all query points (SELECT, INSERT, UPDATE, DELETE)

## Quality Bar

- Real file:line + vulnerable code quote
- Severity, Fix Effort, Confidence rated
- At least 2 query points checked
- Payloads tested
- Fixes parameterized, not escaped
- Tests passing

## Example Triggers

- "SQL injection"
- "database query vulnerability"
- "string concatenation in query"
- "injectable SQL"

## Relationship to blueteam-defend

sql-injection-deep-dive extends Layer 2 (Injection) with real payloads and per-language grep patterns.
