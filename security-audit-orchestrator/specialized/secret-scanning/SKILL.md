---
name: secret-scanning
description: Detect exposed secrets (private keys, DB passwords, JWT tokens, API credentials). Distinguish PUBLIC client-side config (Firebase/Google keys) from TRUE SECRETS (private keys, OAuth secrets, database passwords). Check Google/issuer audit logs - no alerts = safe. Extends blueteam-defend Layer 11 (Secrets).
---

# Secret Scanning — Credential Exposure Detection

Audit for exposed credentials that could grant unauthorized access to systems, databases, services, or APIs. Distinguish between PUBLIC client-side configuration (safe if committed) and TRUE SECRETS (dangerous if committed).

## Core Doctrine: What Code Trusts

| Trust Pattern | What Attacker Can Do | Real Consequence | Proper Fix |
|---|---|---|---|
| Private key in code | Sign/decrypt any message | Impersonate service, decrypt data | Rotate immediately, never commit |
| DB password in code | Connect to database | Read/modify all data | Use secret manager, env vars only |
| Firebase API key in code | Make API calls | Logs visible in Google Cloud (LOW risk if rotated) | Monitor Google audit logs |
| JWT secret in code | Forge auth tokens | Become any user | Rotate, use secret manager |
| OAuth client secret in code | Impersonate app to users | Steal tokens, phishing | Rotate, revoke old secret |
| AWS/API key in code | Access all AWS/API resources | Full account compromise | Rotate, use IAM roles |
| Public API key in code | Make calls on behalf of user | Usage quota burned, DoS | Low risk if key rate-limited |

## Operating Principles

1. **Never commit secrets.** Secrets belong in secret managers (HashiCorp Vault, AWS Secrets Manager, GitHub Secrets), never .env or code.
2. **Public config ≠ secret.** Firebase API keys, Google Analytics keys are PUBLIC (visible in browser anyway). Committing them is LOW risk if issuer alerts on abuse.
3. **Check audit logs.** If Google hasn't alerted, Firebase key was never abused. If AWS hasn't alerted, no API calls were made on your account. No alerts = safe.
4. **Distinguish by issuer.** For each credential type, check if issuer offers abuse alerts (Firebase does, GitHub does). If issuer doesn't alert, it's likely safe.
5. **Rotate on suspicion.** If key committed, rotate immediately. If no alerts from issuer, low risk; if alerts exist, CRITICAL.
6. **Environment strategy.** .env in .gitignore (ALWAYS). .env.example safe to commit (no real secrets). .env NEVER committed.
7. **True secrets scoped.** Private keys, DB passwords, OAuth secrets, API keys with elevated permissions = CRITICAL if leaked. Public keys, client-side config = LOW.

## Phase 1: Detection Strategy

**What to look for:**

1. **Private keys** — PEM-formatted private keys, RSA/EC private keys, SSH keys
   - Patterns: `-----BEGIN PRIVATE KEY-----`, `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`
   - High confidence indicator of TRUE SECRET

2. **Database credentials** — Connection strings with passwords
   - Patterns: `postgres://user:PASSWORD@host`, `mysql://root:PASSWORD@`, `mongodb://user:PASSWORD@`
   - HIGH severity if in public repo

3. **JWT secrets** — Short strings used as HMAC secrets
   - Context: `jwt.sign(..., secret)`, `verify(token, secret)` where secret is hardcoded
   - HIGH severity (used to forge tokens)

4. **OAuth/API credentials** — Client secrets, tokens with long expiry
   - Patterns: OAuth client_secret, refresh_token, API keys with high privilege
   - CRITICAL if used for backend-to-backend auth

5. **Cloud credentials** — AWS, Google Cloud, Azure keys
   - Patterns: AKIA... (AWS access key), service account JSON with private_key
   - CRITICAL if has resource access

6. **Public config (LOW risk)** — Firebase keys, Google Analytics, Stripe public keys
   - Patterns: Found in network traffic anyway, visible in APK/frontend code
   - LOW risk if key was never rotated and issuer has abuse alerts

## Phase 2: Grep Leads

### JavaScript/Node.js
Pattern: `process\.env\.[A-Z_]*(SECRET|PASSWORD|KEY|TOKEN)`
Pattern: `-----BEGIN.*PRIVATE.*KEY-----`
Pattern: `client_secret\s*[:=]\s*`

### Python
Pattern: `os\.getenv\(['\"][^'\"]*SECRET`
Pattern: `SECRET_KEY\s*=\s*['\"]`
Pattern: `-----BEGIN.*PRIVATE.*KEY-----`

### Go
Pattern: `const\s+\w*(Secret|Password|Key)\s*=\s*['\"]`
Pattern: `var\s+\w*(Secret|Password|Key)\s*[^=]*=\s*['\"]`
Pattern: `os\.Getenv.*SECRET`

### Java/Spring
Pattern: `final String\s+\w*(SECRET|PASSWORD|KEY)\s*=\s*['\"]`
Pattern: `BasicAWSCredentials\(`
Pattern: `@Value.*SECRET`

### C#/.NET
Pattern: `const string\s+\w*(Secret|Password|Key)\s*=\s*['\"]`
Pattern: `BasicAWSCredentials\(`
Pattern: `\"JwtSecret\"\s*:\s*['\"]`

## Phase 3: Triage

| Secret Type | Severity | Confidence | Fix Effort |
|---|---|---|---|
| Private key (RSA/EC) | CRITICAL | 100% | Medium |
| DB password in code | CRITICAL | 100% | Low |
| OAuth client secret | CRITICAL | 100% | Low |
| JWT HMAC secret | CRITICAL | 100% | Low |
| AWS/GCP/Azure key | CRITICAL | 100% | Low |
| Firebase API key | LOW | 80% | Low |
| Stripe public key | LOW | 80% | Low |
| Google Analytics key | LOW | 80% | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is credential really needed in code?** (IAM role instead of AWS key? Use IAM role)
2. **Already handled?** (Secret manager already deployed? Use it)
3. **Stdlib/framework?** (Spring Cloud Config, Django, dotenv? Use framework)
4. **Dedicated secret manager?** (Vault, AWS Secrets Manager, GitHub Secrets? Use it)
5. **Environment variables** (.env never committed, .env.example safe)
6. **Custom secret management** (KMS + custom logic, very rare)

## Phase 5: Record Format

```
ID: SECRET-001
Title: Hardcoded JWT Secret in index.js
Severity: CRITICAL
Location: src/auth/index.js:42
Vector: Attacker reads source code, forges JWT tokens
Impact: Becomes any user, bypasses all auth
Evidence: const SECRET = 'my-hardcoded-secret-key-do-not-share'
Confidence: 100%
Fix: Move to .env, use process.env.JWT_SECRET at runtime
```

## Phase 6: Vulnerable → Fixed Examples

**JavaScript (Vulnerable):**
```javascript
const jwt = require('jsonwebtoken');
const SECRET = 'my-super-secret-key-123';

app.post('/login', (req, res) => {
    const token = jwt.sign({ user: req.body.user }, SECRET);
    res.json({ token });
});
```

**JavaScript (Fixed):**
```javascript
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET not set');

app.post('/login', (req, res) => {
    const token = jwt.sign({ user: req.body.user }, SECRET);
    res.json({ token });
});
```

**Python (Vulnerable):**
```python
import psycopg2
DATABASE_URL = "postgresql://admin:hardcoded_password_123@db.example.com/mydb"
conn = psycopg2.connect(DATABASE_URL)
```

**Python (Fixed):**
```python
import psycopg2, os
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError('DATABASE_URL not set')
conn = psycopg2.connect(DATABASE_URL)
```

## Phase 7: Verification Checklist

- [ ] Grep for all secret patterns (Phase 2)
- [ ] Identify each secret type (private key, DB password, API key)
- [ ] Check git history for secret commits: `git log --all --oneline | grep -i secret`
- [ ] Check issuer audit logs (Google Cloud, AWS CloudTrail, GitHub audit log)
- [ ] If exposed >7 days: CRITICAL. If rotated <24h: HIGH → LOW
- [ ] Verify .env in .gitignore
- [ ] Verify .env.example safe to commit
- [ ] Verify environment loading at startup
- [ ] Verify secret manager deployed
- [ ] Rotate all exposed secrets
- [ ] Re-scan after fixes

## Quality Bar

1. No private keys, DB passwords, OAuth secrets, JWT HMAC secrets in code
2. All credentials loaded from environment at runtime
3. .env in .gitignore; .env.example safe to commit
4. Public config only if issuer provides abuse alerts
5. Audit logs checked (no suspicious activity)
6. Secrets rotated if exposed >24 hours
7. Secret manager in place
8. No secrets in logs or error messages
9. Credentials scoped to minimum permissions
10. Regular rotation schedule (quarterly minimum)

## Example Triggers

- "security audit"
- "check for exposed credentials"
- "scan for secrets"
- "find hardcoded passwords"
- "JWT secret exposed?"
- "API key leak?"
- "check .env files"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 11**. Key distinction: PUBLIC config (Firebase keys) ≠ TRUE SECRETS (private keys). Only flag as CRITICAL if issuer doesn't provide abuse monitoring.
