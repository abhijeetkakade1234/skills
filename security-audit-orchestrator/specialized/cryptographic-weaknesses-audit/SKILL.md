---
name: cryptographic-weaknesses-audit
description: Audit for cryptographic failures (OWASP A02): weak hashes (MD5/SHA1) and ciphers (DES/3DES/RC4/ECB), plaintext/unsalted password storage vs argon2/bcrypt/scrypt/PBKDF2, insecure randomness (Math.random/rand for tokens/keys), IV/nonce reuse, unauthenticated encryption (CBC without MAC, no GCM/Poly1305), hardcoded/weak keys, weak TLS config, and disabled certificate validation. Use when reviewing encryption, password hashing, token generation, key management, or TLS setup. CRITICAL: Flag CRITICAL only when the weakness directly breaks confidentiality/integrity of sensitive data or authentication. A weak hash used for a non-security checksum (cache key, ETag, file dedup) = LOW. JWT signing algorithms are out of scope here — cross-reference jwt-cryptography-audit.
---

# Cryptographic Weaknesses Audit — OWASP A02 Cryptographic Failures

Detect broken cryptography: weak/deprecated algorithms, unsafe password storage, predictable randomness, IV/nonce reuse, encryption without integrity, hardcoded keys, and weak or unvalidated TLS — and rank each by whether it actually protects sensitive data or auth.

**Default workflow:** Detect weak primitives → triage by what they protect → drive to a vetted modern primitive (argon2id, AES-GCM/ChaCha20-Poly1305, CSPRNG, TLS 1.2+ with validation).

## Core Doctrine: Use Vetted Primitives, Never Roll Your Own

| Weakness | Attack | Real Consequence | Severity | Proper Fix (modern primitive) |
|---|---|---|---|---|
| MD5/SHA1 for passwords or signatures | Collision / rainbow-table / GPU cracking | Forged signature; passwords recovered en masse | CRITICAL | argon2id for passwords; SHA-256+/SHA-3 + HMAC for integrity |
| Plaintext / unsalted password storage | DB leak → instant credential reuse | Full account takeover across users | CRITICAL | argon2id/bcrypt/scrypt with per-user salt |
| DES / 3DES / RC4 cipher | Sweet32, biased keystream, brute force | Plaintext recovery of encrypted data | CRITICAL | AES-256-GCM or ChaCha20-Poly1305 |
| ECB mode | Identical blocks leak plaintext patterns | Structure/data inferred from ciphertext | HIGH | AES-GCM (AEAD), never ECB |
| Static/zero IV or nonce reuse (CTR/GCM) | Keystream XOR; GCM auth-key recovery | Plaintext leak; forgeable ciphertext | CRITICAL | Unique random IV/nonce per message |
| Math.random()/rand() for tokens/keys | Predict/replay PRNG state | Forge session tokens, reset links, keys | CRITICAL | CSPRNG: crypto.randomBytes / secrets / os.urandom |
| Hardcoded encryption key | Key in source/repo/binary | Anyone with code decrypts everything | CRITICAL | Key from KMS/secret manager; rotate |
| Unauthenticated encryption (CBC, no MAC) | Padding oracle, bit-flipping | Decrypt/tamper ciphertext without key | HIGH | AEAD (GCM/Poly1305) or Encrypt-then-MAC |
| Disabled TLS cert verification | MITM with attacker cert | Intercept/alter all traffic in transit | CRITICAL | Enable validation; pin where appropriate |
| Weak TLS version/cipher (SSLv3/TLS1.0, RC4) | Downgrade, BEAST/POODLE | Decrypt session traffic | HIGH | TLS 1.2+ with modern AEAD cipher suites |

## Operating Principles

1. **Use vetted libraries, never custom crypto.** Hand-rolled ciphers, MACs, and key schedules are almost always broken. Use the platform's audited crypto library.
2. **Passwords use a slow KDF.** argon2id (preferred), bcrypt, or scrypt — never MD5/SHA/plain. PBKDF2 (SHA-256, high iterations) only when nothing better is available.
3. **Encryption uses AEAD.** AES-256-GCM or ChaCha20-Poly1305 give confidentiality *and* integrity in one primitive. Avoid raw CBC/CTR without a MAC.
4. **Secrets come from a CSPRNG.** Anything unpredictable (tokens, keys, IVs, salts, reset codes) must use crypto.randomBytes / Python `secrets` / `os.urandom` / `crypto/rand` — never `Math.random`, `rand()`, or `math/rand`.
5. **IV/nonce: unique and random per message, never reused.** GCM/CTR catastrophically fail on nonce reuse under the same key. Generate fresh per encryption; store/transmit alongside ciphertext.
6. **Keys live in a KMS/secret manager, not source.** No keys in code, config committed to VCS, or container images. Inject at runtime; support rotation.
7. **Hash + integrity correctly.** SHA-256+/SHA-3 for hashing; HMAC (not bare hash) for message integrity. Constant-time comparison for secrets/MACs.
8. **TLS 1.2+ with validation on.** Never disable certificate verification "to make it work." Use modern cipher suites; reject deprecated protocol versions.

## Phase 1: Detection Strategy

**What to look for:**

1. **Weak hash for passwords or signatures**
   - Patterns: `md5(password)`, `sha1(...)`, MD5/SHA1 used to sign or verify data
   - Attack: GPU/rainbow-table cracking; hash collisions forge signatures
   - Fix: argon2id/bcrypt for passwords; SHA-256+/SHA-3 + HMAC for integrity

2. **Unsalted / plaintext password storage**
   - Patterns: password stored as-is, or a single fast hash with no per-user salt
   - Attack: DB dump → instant credential reuse and account takeover
   - Fix: KDF with unique salt (argon2id/bcrypt/scrypt) — salt is built into the hash output

3. **Weak / deprecated cipher**
   - Patterns: DES, 3DES, RC4, Blowfish for new data, export-grade ciphers
   - Attack: Sweet32 (64-bit block), RC4 keystream bias, brute force
   - Fix: AES-256-GCM or ChaCha20-Poly1305

4. **ECB mode or IV/nonce misuse**
   - Patterns: `aes-256-ecb`, `AES/ECB/`, hardcoded/zero IV, counter/nonce reused across messages
   - Attack: ECB leaks block patterns; nonce reuse breaks CTR keystream and GCM authentication
   - Fix: AEAD mode with a fresh random IV/nonce per message

5. **Insecure RNG for secrets**
   - Patterns: `Math.random()`, `rand()`, `random.random()`, `math/rand`, `new Random()` generating tokens/keys/IDs
   - Attack: Predict PRNG output → forge tokens, password-reset codes, session IDs
   - Fix: CSPRNG (`crypto.randomBytes`, `secrets`, `os.urandom`, `crypto/rand`, `RandomNumberGenerator`)

6. **Hardcoded / weak keys**
   - Patterns: key literals in source, default/empty keys, key derived from a guessable value
   - Attack: Key extraction from repo/binary decrypts all protected data
   - Fix: KMS/secret manager, runtime injection, rotation; derive from high-entropy material

7. **Unauthenticated encryption**
   - Patterns: CBC/CTR without an accompanying MAC; encrypt without integrity check
   - Attack: Padding-oracle decryption, bit-flipping tampering
   - Fix: AEAD (GCM/Poly1305), or Encrypt-then-MAC with HMAC verified in constant time

8. **TLS / certificate validation disabled**
   - Patterns: `rejectUnauthorized: false`, `verify=False`, `InsecureSkipVerify: true`, trust-all `TrustManager`, callback returning `true`, deprecated TLS versions
   - Attack: MITM presents any certificate; full traffic interception/alteration
   - Fix: Enable validation, enforce TLS 1.2+, restrict to modern cipher suites

## Phase 2: Grep Leads

### JavaScript/Node
Pattern: `crypto\.createHash\(['"](md5|sha1)['"]\)` (weak hash — check if used for passwords/signatures)
Pattern: `createCipheriv\(['"](des|des-ede3|rc4|aes-256-ecb|aes-128-ecb)` (weak cipher / ECB mode)
Pattern: `Math\.random\(\)` (insecure RNG — check if used for tokens/keys/IDs)
Pattern: `createCipheriv\([^,]+,\s*key\s*,\s*(Buffer\.alloc\(\d+\)|['"]0{16,}['"])` (static/zero IV)
Pattern: `rejectUnauthorized:\s*false` (TLS cert validation disabled)
Pattern: `(const|let|var)\s+\w*key\w*\s*=\s*['"][A-Za-z0-9+/=]{16,}['"]` (hardcoded key literal)

### Python
Pattern: `hashlib\.(md5|sha1)\(` (weak hash — check password/signature use)
Pattern: `(DES|DES3|ARC4)\.new\(|modes\.ECB\(|AES\.new\([^,]+,\s*AES\.MODE_ECB` (weak cipher / ECB)
Pattern: `random\.(random|randint|choice|getrandbits)\(` (insecure RNG for secrets — should be `secrets`/`os.urandom`)
Pattern: `verify\s*=\s*False` (requests TLS validation disabled)
Pattern: `ssl\._create_unverified_context\(|ssl\.CERT_NONE` (TLS verification disabled)
Pattern: `key\s*=\s*b?['"][^'"]{16,}['"]` (hardcoded key)

### Go
Pattern: `crypto/md5|crypto/sha1|crypto/des|crypto/rc4` (weak hash/cipher import)
Pattern: `cipher\.NewCBCEncrypter\(|des\.NewCipher\(` (weak cipher / unauthenticated CBC)
Pattern: `math/rand|rand\.(Intn|Int63|Read)\(` (insecure RNG — should be `crypto/rand`)
Pattern: `InsecureSkipVerify:\s*true` (TLS cert validation disabled)
Pattern: `iv\s*:?=\s*(make\(\[\]byte|\[\]byte\{0)` (static/zero IV with no rand.Read)

### Java
Pattern: `MessageDigest\.getInstance\("(MD5|SHA-1)"\)` (weak hash)
Pattern: `Cipher\.getInstance\("(DES|DESede|RC4|AES/ECB|AES/CBC/[^"]*NoPadding)` (weak cipher / ECB / unauthenticated CBC)
Pattern: `new Random\(\)` (insecure RNG — should be `SecureRandom`)
Pattern: `new IvParameterSpec\(new byte\[\s*\d+\s*\]\)` (zero IV)
Pattern: `checkClientTrusted|checkServerTrusted` with empty body / `return null` (trust-all TrustManager)
Pattern: `setHostnameVerifier\(.*ALLOW_ALL|HostnameVerifier.*return true` (hostname verification disabled)

### C#/.NET
Pattern: `(MD5|SHA1)(CryptoServiceProvider|Managed)|MD5\.Create\(|SHA1\.Create\(` (weak hash)
Pattern: `DESCryptoServiceProvider|TripleDESCryptoServiceProvider|RC2CryptoServiceProvider|CipherMode\.ECB` (weak cipher / ECB)
Pattern: `new Random\(` (insecure RNG for tokens — should be `RandomNumberGenerator`)
Pattern: `ServerCertificateValidationCallback\s*(\+?=|=>)\s*.*true` (TLS validation bypassed)
Pattern: `(string|byte\[\])\s+\w*[Kk]ey\s*=\s*("[^"]{16,}"|new byte\[\])` (hardcoded/empty key)

## Phase 3: Triage

| Issue | Protects Sensitive Data/Auth? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| MD5/SHA1 hashing of passwords | YES | CRITICAL | Yes (offline cracking on DB leak) | Medium |
| MD5/SHA1 as non-security checksum (cache key, ETag) | NO | LOW | No | N/A (acceptable) |
| Plaintext/unsalted password storage | YES | CRITICAL | Yes | Medium |
| DES/3DES/RC4 protecting sensitive data | YES | CRITICAL | Yes | Medium |
| ECB mode on sensitive data | YES | HIGH | Yes (pattern leak) | Low |
| Static IV / nonce reuse (GCM/CTR) | YES | CRITICAL | Yes | Low |
| Math.random()/rand() for session token or key | YES | CRITICAL | Yes (predictable) | Low |
| Math.random() for non-security UI jitter/animation | NO | LOW | No | N/A |
| Hardcoded encryption/signing key | YES | CRITICAL | Yes | Medium |
| CBC without MAC (unauthenticated) | YES | HIGH | Yes (padding oracle) | Medium |
| TLS cert validation disabled in production | YES | CRITICAL | Yes (MITM) | Low |
| Weak TLS version/cipher (TLS1.0, RC4) | YES | HIGH | Yes (downgrade) | Low |

## Phase 4: Ponytail Fix Ladder

1. **Use the platform's high-level crypto/secret API.**
   - Reach for the library's audited helpers (e.g., libsodium `crypto_secretbox`, `passlib`, Spring Security `PasswordEncoder`, `cryptography`'s Fernet) before touching low-level primitives.
   - If a vetted high-level API covers it → use it and stop.

2. **Switch to a modern primitive.**
   - Passwords → argon2id (or bcrypt/scrypt). Encryption → AES-256-GCM or ChaCha20-Poly1305. Randomness → CSPRNG. Hashing → SHA-256+/SHA-3.
   - Replace MD5/SHA1/DES/3DES/RC4/ECB and `Math.random` outright.

3. **Unique random IV/nonce + AEAD for integrity.**
   - Generate a fresh random IV/nonce per message from a CSPRNG; prepend it to the ciphertext. Use AEAD so tampering is detected.
   - If you must use CBC/CTR, add Encrypt-then-MAC (HMAC) verified in constant time.

4. **Keys from a KMS/secret manager.**
   - Move keys out of source into AWS KMS / GCP KMS / Vault / cloud secret manager; inject at runtime. Support rotation and per-environment keys.

5. **Enforce TLS 1.2+ with validation.**
   - Turn certificate and hostname verification back on; restrict to TLS 1.2/1.3 and modern AEAD cipher suites. Pin certificates for high-value clients where feasible.

6. **Never roll custom crypto.**
   - No bespoke ciphers, MACs, key derivation, or "lightly obfuscated" encoding. If no standard primitive fits, that is a design problem, not a reason to invent one.

## Phase 5: Record Format

```
ID: CRYPTO-001
Title: Passwords hashed with MD5 — no salt, GPU-crackable
Severity: CRITICAL
Location: services/auth.js:58
Vector: DB leak → offline rainbow-table/GPU cracking recovers plaintext passwords
Impact: Mass account takeover; credential reuse across other services
Evidence: crypto.createHash('md5').update(password).digest('hex')
Confidence: 98%
Fix: Replace with argon2id (argon2.hash) — per-user salt embedded in the encoded hash
```

## Phase 6: Vulnerable → Fixed Examples

### (a) Weak password hash → argon2id/bcrypt

**Node (Vulnerable):**
```javascript
// DANGER: MD5/SHA1, no salt — trivially cracked from a DB leak
const crypto = require('crypto');
function hashPassword(pw) {
    return crypto.createHash('md5').update(pw).digest('hex');
}
```

**Node (Fixed):**
```javascript
// GOOD: argon2id — slow, salted, memory-hard
const argon2 = require('argon2');
async function hashPassword(pw) {
    return argon2.hash(pw, { type: argon2.argon2id });
}
async function verifyPassword(hash, pw) {
    return argon2.verify(hash, pw); // constant-time, salt embedded in hash
}
```

**Python (Vulnerable):**
```python
# DANGER: SHA-1, no salt
import hashlib
def hash_password(pw: str) -> str:
    return hashlib.sha1(pw.encode()).hexdigest()
```

**Python (Fixed):**
```python
# GOOD: argon2id via argon2-cffi (or bcrypt)
from argon2 import PasswordHasher
ph = PasswordHasher()  # argon2id defaults
def hash_password(pw: str) -> str:
    return ph.hash(pw)  # salt generated and embedded automatically
def verify_password(stored: str, pw: str) -> bool:
    return ph.verify(stored, pw)
```

### (b) AES-ECB / static IV → AES-256-GCM with random IV

**Go (Vulnerable):**
```go
// DANGER: ECB-equivalent reuse + no integrity. Identical blocks leak; no auth.
import "crypto/aes"
func encrypt(key, plaintext []byte) ([]byte, error) {
    block, _ := aes.NewCipher(key)
    out := make([]byte, len(plaintext))
    for i := 0; i < len(plaintext); i += aes.BlockSize {
        block.Encrypt(out[i:], plaintext[i:]) // ECB pattern, no IV, no MAC
    }
    return out, nil
}
```

**Go (Fixed):**
```go
// GOOD: AES-256-GCM (AEAD) with a fresh random nonce per message
import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "io"
)
func encrypt(key, plaintext []byte) ([]byte, error) {
    block, err := aes.NewCipher(key) // key must be 32 bytes
    if err != nil {
        return nil, err
    }
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return nil, err
    }
    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil { // CSPRNG, unique per msg
        return nil, err
    }
    // nonce prepended; Seal appends the auth tag
    return gcm.Seal(nonce, nonce, plaintext, nil), nil
}
```

### (c) Insecure RNG token → CSPRNG

**Node (Vulnerable):**
```javascript
// DANGER: Math.random() is predictable — forgeable session/reset tokens
function makeToken() {
    return Math.random().toString(36).slice(2);
}
```

**Node (Fixed):**
```javascript
// GOOD: CSPRNG
const crypto = require('crypto');
function makeToken() {
    return crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
}
```

**Python (Vulnerable):**
```python
# DANGER: random module is a Mersenne-Twister PRNG, not for secrets
import random, string
def make_token():
    return ''.join(random.choice(string.ascii_letters) for _ in range(32))
```

**Python (Fixed):**
```python
# GOOD: secrets module is a CSPRNG
import secrets
def make_token():
    return secrets.token_urlsafe(32)
```

### (d) Disabled TLS verification → proper validation

**Python (Vulnerable):**
```python
# DANGER: verify=False disables cert validation — open to MITM
import requests
resp = requests.get("https://api.internal/payments", verify=False)
```

**Python (Fixed):**
```python
# GOOD: validation on; pin a custom CA bundle for internal endpoints if needed
import requests
resp = requests.get("https://api.internal/payments", verify="/etc/ssl/internal-ca.pem")
# Default verify=True validates against the system trust store
```

### (e) Hardcoded key → KMS/env-injected key

**Node (Vulnerable):**
```javascript
// DANGER: key committed in source — anyone with the repo decrypts everything
const KEY = Buffer.from('0123456789abcdef0123456789abcdef'); // hardcoded
```

**Node (Fixed):**
```javascript
// GOOD: key injected at runtime from a secret manager; fail closed if missing
const KEY = Buffer.from(process.env.DATA_ENC_KEY_HEX, 'hex'); // sourced from KMS/Vault
if (KEY.length !== 32) {
    throw new Error('DATA_ENC_KEY_HEX missing or wrong length — refusing to start');
}
```

## Phase 7: Verification Checklist

- [ ] No MD5 or SHA1 used for passwords, signatures, or any security decision
- [ ] Passwords stored with argon2id/bcrypt/scrypt (or PBKDF2-SHA256, high iterations) with per-user salt
- [ ] No DES/3DES/RC4/Blowfish/export ciphers protecting sensitive data
- [ ] No ECB mode on sensitive data
- [ ] Encryption uses AEAD (AES-GCM or ChaCha20-Poly1305); raw CBC/CTR has Encrypt-then-MAC
- [ ] IV/nonce is random, unique per message, and never reused under the same key
- [ ] All tokens/keys/salts/reset codes come from a CSPRNG (no Math.random/rand/math/rand/new Random)
- [ ] No hardcoded encryption/signing keys in source, config, or images; keys from KMS/secret manager
- [ ] Key rotation supported; app fails closed when key material is missing
- [ ] TLS certificate and hostname validation enabled everywhere (no rejectUnauthorized:false / verify=False / InsecureSkipVerify / trust-all)
- [ ] TLS restricted to 1.2+ with modern AEAD cipher suites; deprecated protocols rejected
- [ ] MAC/secret comparisons use constant-time functions
- [ ] Weak-hash usages confirmed to be non-security checksums (else flagged)

## Quality Bar

1. Every password store uses a slow, salted KDF (argon2id/bcrypt/scrypt)
2. No weak hash (MD5/SHA1) drives any authentication or signature decision
3. All symmetric encryption is AEAD with confidentiality + integrity
4. IV/nonce generation is random, unique, and CSPRNG-sourced per message
5. No nonce/IV reuse under a single key anywhere in the codebase
6. All security-relevant randomness uses a CSPRNG
7. No keys hardcoded; all sourced from a KMS/secret manager with rotation
8. TLS certificate validation is on in every client and environment
9. TLS protocol/cipher config restricted to 1.2+ with modern suites
10. Weak-hash findings correctly triaged: security use = HIGH/CRITICAL, plain checksum = LOW

## Example Triggers

- "weak crypto"
- "encryption audit"
- "password hashing"
- "MD5"
- "insecure random"
- "AES mode"
- "TLS validation"
- "cryptographic failure"

## Relationship to blueteam-defend

Extends **blueteam-defend — OWASP A02 Cryptographic Failures**. Core doctrine: use vetted modern primitives and never roll your own crypto; flag CRITICAL only when the weakness breaks confidentiality/integrity of sensitive data or auth. Cross-reference **jwt-cryptography-audit** for JWT signing/verification algorithm issues (`alg:none`, HS/RS confusion) and **secret-scanning** for hardcoded keys and credentials discovered in source.
