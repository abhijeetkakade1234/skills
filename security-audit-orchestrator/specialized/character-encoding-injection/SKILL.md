---
name: character-encoding-injection
description: Audit for character encoding vulnerabilities: emoji/Unicode attacks causing SQL injection, buffer overflow, truncation, Unicode normalization bypasses. Use when code takes user text, has string concatenation in queries, or byte-length limits. Extends blueteam-defend Layer 2 (Injection).
---

# Character Encoding Injection — Unicode & Emoji Audit

Detect attacks using multi-byte characters (emoji, Unicode) to bypass filters, cause SQL injection, overflow buffers, or truncate strings.

## Core Doctrine: Character ≠ Byte

| Assumption | Reality | Attack Vector | Real Consequence | Proper Fix |
|---|---|---|---|---|
| 1 character = 1 byte | Emoji = 1 char, 4 bytes | Byte-length limit bypassed | Emoji breaks DB storage | Validate UTF-8 byte length, not char count |
| Filter "'" → safe | Emoji after quote → regex fails | Filter bypassed, SQL injection | Quote filter ineffective | Never filter, always parameterize |
| UTF-8 byte truncation safe | Emoji truncated mid-sequence | Invalid UTF-8 sequence | Error, XSS, injection | Truncate at char boundary, not byte |
| Normalization always same | é = e + ´ (combining) | Two forms bypass filter | Unicode normalization bypass | Normalize before filter (NFC) |
| Uppercase = lowercase | ß → SS in Turkish | Unicode case-folding edge case | Turkish I problem (i ≠ ı) | Use locale-aware case-folding |
| String concat safe | "SELECT * FROM users WHERE id=" + emoji | Injection via emoji | SQL injection | Never concatenate; use parameterized queries |
| HTML entity encoding enough | Emoji in entity: &#128565; | Emoji decoded, XSS | XSS via emoji | Escape both HTML and JavaScript contexts |
| Byte limit = safety | Name = "ABC🔥" → DB stores "ABC" (truncated) | Stored differently than displayed | Truncation mismatch, auth bypass | Validate before storing, truncate at char boundary |

## Operating Principles

1. **Character ≠ byte.** Emoji (U+1F525) = 1 character but 4 bytes in UTF-8. Never count bytes as characters.
2. **Never filter; parameterize.** Emoji can bypass any filter regex. Use parameterized queries instead.
3. **Truncate at character boundary.** Emoji mid-UTF-8 sequence = invalid. Always truncate at char, not byte.
4. **Normalize Unicode.** NFC (composed) vs NFD (decomposed): é can be both. Normalize before filter.
5. **Case-fold with locale.** ß in German = SS, but in Turkish different. Use locale-aware folding or ASCII-only checks.
6. **Concatenation = injection.** Never build queries/HTML via concat + emoji. Always use framework escaping/parameterized.
7. **Test boundary cases.** Emoji at string end, after quote, in middle of word. Do filters break?

## Phase 1: Detection Strategy

**What to look for:**

1. **String concatenation in queries** (with user input)
   - Patterns: `"SELECT * FROM ... WHERE id=" + user_input`, f-string with user data in SQL
   - CRITICAL: Emoji can bypass quote escaping

2. **Character count validation** (instead of byte length)
   - Patterns: `if (name.length > 50)`, `len(name) < 100`
   - Bug: Emoji = 1 char but 4 bytes; attacker bypasses limit

3. **Filter bypasses with emoji**
   - Patterns: Regex filter for '<', '>', '&', or quotes
   - Bug: Emoji after filtered char can bypass regex

4. **String truncation without boundary check**
   - Patterns: `name[0:100]` (Python slice), `.substring(100)` (JS)
   - Bug: If emoji at byte 99-102, truncation creates invalid UTF-8

5. **Case-folding on user input**
   - Patterns: `.toLowerCase()`, `.toUpperCase()`, without locale
   - Bug: Turkish ı/i problem, ß not mapped to SS

6. **Emoji in URLs/paths**
   - Patterns: `/users/🔥`, URL encoded emoji
   - Bug: URL encoding/decoding differences, path traversal

7. **Emoji in HTML/JavaScript**
   - Patterns: `document.write(user_emoji)`, rendering user text with emoji
   - Bug: Emoji not HTML-entity-encoded, could XSS

## Phase 2: Grep Leads

### JavaScript/Node.js
Pattern: `\+\s*user_input|template.*user|f\`.*\$\{.*user` (concatenation)
Pattern: `\.length\s*[<>=]|\.substring\(` (length check without byte validation)
Pattern: `\.toLowerCase\(\)|\.toUpperCase\(\)` (case-fold, check for emoji handling)
Pattern: `SQL\s*=\s*['\"]SELECT.*\+` (SQL concatenation)

### Python
Pattern: `f['\"].*\{.*\}['\"].*sql|query.*\+.*user|format\(.*sql` (SQL interpolation)
Pattern: `len\(.*\)\s*[<>=]|str\[:\d+\]` (char length, not byte)
Pattern: `\.lower\(\)|\.upper\(\)` (case-fold)
Pattern: `encode\(|decode\(` (encoding calls, check for safety)

### Go
Pattern: `fmt\.Sprintf.*sql|sql\s*:=.*\+` (SQL building)
Pattern: `len\(.*\)\s*[<>=]` (length check on string)
Pattern: `strings\.ToLower|strings\.ToUpper` (case-fold)

### Java
Pattern: `\+.*sql|String\.format.*sql|PreparedStatement` (check for concat vs parameterized)
Pattern: `\.length\(\)\s*[<>=]` (length check)
Pattern: `\.toLowerCase\(\)|\.toUpperCase\(\)` (case-fold)

### C#/.NET
Pattern: `\+.*sql|String\.Format.*sql|@\"SELECT.*{\" (SQL building)
Pattern: `\.Length\s*[<>=]` (length check)
Pattern: `\.ToLower\(\)|\.ToUpper\(\)` (case-fold)

### PHP
Pattern: `\$sql\s*=.*\.|mysqli_query\(\$.*\$user|sprintf.*sql` (SQL building)
Pattern: `strlen\(.*\)\s*[<>=]|substr\(` (byte length, not char count)

## Phase 3: Triage

| Issue Type | Severity | Confidence | Fix Effort |
|---|---|---|---|
| SQL concat with emoji input | CRITICAL | 95% | Medium (parameterize) |
| Character length validation instead of byte | HIGH | 85% | Low (validate byte length) |
| No truncation boundary check | HIGH | 80% | Low (truncate at char boundary) |
| Emoji filter bypass possible | HIGH | 80% | Low (use parameterization) |
| No Unicode normalization | MEDIUM | 70% | Medium (add NFC normalization) |
| Case-fold without locale | MEDIUM | 65% | Low (use locale-aware or ASCII-only) |
| Emoji in URL without encoding | MEDIUM | 70% | Low (use URL encoder) |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is string concatenation really necessary?**
   - SQL? Use parameterized query (never concat).
   - URL? Use URL encoder.
   - HTML? Use HTML encoder.
   - (If concat needed → very rare; stop here)

2. **Already parameterized?** Does framework use parameterized queries?
   - Prisma, Django ORM, SQLAlchemy, Spring JPA? Use them.
   - If parameterized → safe (emoji doesn't matter).

3. **Framework escaping?** Does framework have URL/HTML encoder?
   - urllib.quote (Python), encodeURIComponent (JS), HtmlEncoder (.NET)
   - Use framework encoder.

4. **Byte-length validation** (safer than char count)
   - Validate: `len(name.encode('utf-8')) <= 100`
   - Check byte length, not character count.

5. **Unicode normalization** (if filtering needed)
   - Before filter: `unicodedata.normalize('NFC', text)`
   - Reduces filter bypasses.

6. **Truncate at character boundary** (if must truncate)
   - Don't slice bytes; decode, slice chars, re-encode.

## Phase 5: Record Format

```
ID: ENCODING-001
Title: SQL injection via emoji in name field
Severity: CRITICAL
Location: src/user/create.py:45
Vector: name = "Bob'); DROP TABLE users; --🔥" → SQL injection
Impact: Attacker executes arbitrary SQL, deletes tables
Evidence: query = f"INSERT INTO users (name) VALUES ('{name}')"
Confidence: 95%
Fix: Use parameterized query: execute("INSERT INTO users (name) VALUES (?)", [name])
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript (Vulnerable):**
```javascript
function createUser(name) {
    const query = `INSERT INTO users (name) VALUES ('${name}')`;  // DANGER: Emoji + quote can inject
    db.query(query);
}

// Attacker: name = "Bob'); DROP TABLE users; --🔥"
// Query becomes: INSERT INTO users (name) VALUES ('Bob'); DROP TABLE users; --🔥')
```

**JavaScript (Fixed):**
```javascript
function createUser(name) {
    const query = 'INSERT INTO users (name) VALUES (?)';
    db.query(query, [name]);  // Safe: name parameterized, emoji doesn't matter
}
```

**Python (Vulnerable):**
```python
def save_name(name):
    if len(name) > 50:  # DANGER: Emoji = 1 char, 4 bytes
        return "Name too long"
    # Attacker: name = "A" * 12 + "🔥" * 13 = 25 chars, 80 bytes → exceeds DB limit
    
    query = f"INSERT INTO users (name) VALUES ('{name}')"  # DANGER: Emoji injection
    db.execute(query)
```

**Python (Fixed):**
```python
def save_name(name):
    if len(name.encode('utf-8')) > 50:  # Safe: byte length validation
        return "Name too long"
    
    query = "INSERT INTO users (name) VALUES (%s)"
    db.execute(query, (name,))  # Safe: parameterized

# Or if storing emoji, validate:
import unicodedata
normalized = unicodedata.normalize('NFC', name)  # Normalize before storing
```

**Java (Vulnerable):**
```java
public void createUser(String name) {
    if (name.length() > 50) {  // DANGER: Emoji = 1 char, multiple bytes
        throw new IllegalArgumentException("Name too long");
    }
    
    String query = "INSERT INTO users (name) VALUES ('" + name + "')";  // DANGER: Injection
    db.execute(query);
}
```

**Java (Fixed):**
```java
public void createUser(String name) {
    byte[] bytes = name.getBytes(StandardCharsets.UTF_8);
    if (bytes.length > 50) {  // Safe: byte length
        throw new IllegalArgumentException("Name too long");
    }
    
    String query = "INSERT INTO users (name) VALUES (?)";
    try (PreparedStatement stmt = db.prepareStatement(query)) {
        stmt.setString(1, name);  // Safe: parameterized
        stmt.execute();
    }
}
```

**Go (Vulnerable):**
```go
func createUser(name string) {
    if len(name) > 50 {  // DANGER: len counts runes, not bytes in Go
        log.Fatal("Name too long")
    }
    
    query := fmt.Sprintf("INSERT INTO users (name) VALUES ('%s')", name)  // DANGER: Injection
    db.Exec(query)
}
```

**Go (Fixed):**
```go
func createUser(name string) {
    if len([]byte(name)) > 50 {  // Safe: byte length
        log.Fatal("Name too long")
    }
    
    query := "INSERT INTO users (name) VALUES ($1)"
    db.Exec(query, name)  // Safe: parameterized
}
```

## Phase 7: Verification Checklist

- [ ] Identify all string concatenation in SQL queries (Phase 2)
- [ ] For each: Convert to parameterized query
- [ ] Identify all length validations (if char count, convert to byte length)
- [ ] For each: Verify byte-length check: `len(name.encode('utf-8'))`
- [ ] Identify all string truncations (substring, slice)
- [ ] For each: Verify truncation at character boundary (not mid-emoji)
- [ ] Identify all emoji/Unicode input fields
- [ ] Test: Send emoji in name, verify it's stored/displayed correctly
- [ ] Test: Send "'; DROP TABLE;" after emoji, verify no injection
- [ ] Test: Send emoji at string boundary, verify no truncation issues
- [ ] Test: Send combining characters (é as e + combining acute), verify filter doesn't bypass

## Quality Bar

1. No SQL concatenation with user input (all parameterized)
2. No character count validation (all byte-length validated)
3. String truncation only at character boundaries
4. Emoji input tested (not assumed invalid)
5. URL/HTML encoding used for non-SQL contexts
6. Unicode normalization applied if filtering
7. No implicit encoding/decoding issues
8. Byte length limits enforced before storage
9. Test passes: Emoji in all input fields, no truncation/injection
10. Code review: All user input paths validated for encoding

## Example Triggers

- "emoji vulnerability"
- "Unicode injection"
- "character encoding attack"
- "emoji SQL injection"
- "string truncation bug"
- "Unicode normalization"
- "emoji in URLs"
- "multi-byte character handling"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 2 (Injection)**. Key distinction: Emoji/Unicode can bypass traditional quote-based filters. Only safe solution is parameterization.
