---
name: mobile-app-security-audit
description: Audit iOS and Android apps against OWASP MASVS / Mobile Top 10 — insecure local data storage, hardcoded secrets/keys, weak transport security & missing certificate pinning, exported/leaky components & intents, insecure deep links / URL schemes, improper platform usage (WebView, keyboard cache, backups, logging), and weak client-side auth/biometric handling. Use when reviewing a mobile binary or source, AndroidManifest/Info.plist, Keychain/Keystore usage, network config, deep-link handlers, or WebView setup. CRITICAL: the mobile binary is fully attacker-controlled (rooted/jailbroken, decompiled). Flag CRITICAL when sensitive data is exposed/extractable or a component lets another app take a privileged action. A client-side-only check that the backend re-validates = LOW (backend-is-truth).
---

# Mobile App Security Audit — OWASP MASVS / Mobile Top 10

Audit iOS/Android apps assuming the device is hostile: secrets get extracted from prefs, components get invoked by malware, traffic gets MITM'd, and binaries get decompiled. The only real boundary is the backend.

**Default workflow:** Detect (Phase 1) → Grep per-platform (Phase 2) → Triage by data sensitivity + backend re-validation (Phase 3) → Fix Ladder (Phase 4) → Record (Phase 5) → Vulnerable→Fixed (Phase 6) → Verify (Phase 7).

## Core Doctrine: The Device Is Hostile, Backend Is Truth

| Weakness | What Attacker Can Do (rooted device / another app / MITM) | Real Consequence | Severity | Proper Fix |
|---|---|---|---|---|
| Tokens/secrets in SharedPreferences / UserDefaults / plaintext file | Root device, read `/data/data/<pkg>/shared_prefs/*.xml` or app sandbox plist | Session token, PII extracted | CRITICAL (data extractable) | Keychain / Keystore / EncryptedSharedPreferences |
| Hardcoded API key / keystore / signing secret in code | Decompile APK/IPA, grep strings | Backend API abused, paid services drained | CRITICAL (key in binary) | Move secret server-side; rotate; per-user tokens |
| No TLS / `cleartextTraffic` / no cert pinning | MITM on hostile Wi-Fi, proxy, read+rewrite traffic | Credentials sniffed, responses tampered | CRITICAL (MITM) | TLS 1.2+, Network Security Config / ATS, pin for sensitive apps |
| Exported Activity/Service/Receiver/Provider with no permission | Malicious app sends Intent / queries Provider | Privileged action triggered, internal data read | CRITICAL (another app acts) | `exported=false` or signature-level permission |
| Implicit Intent carrying sensitive data | Another app registers matching filter, intercepts | Data leaked to attacker app | HIGH (data leak) | Explicit Intent / `setPackage()`; don't put secrets in extras |
| Unverified deep link / universal link → auth or action | Craft `myapp://transfer?to=...`, send via link/QR | Unauthenticated state change | CRITICAL if action; HIGH if data | Authorize action server-side; verify host/assetlinks |
| WebView `javascriptEnabled` + `addJavascriptInterface` / file access | Load untrusted page → JS calls native bridge | RCE-equivalent / local file theft | CRITICAL (bridge to untrusted) | No bridge to untrusted content; `setAllowFileAccess(false)` |
| Sensitive data in logs / screenshots / keyboard cache / backups | `adb logcat`, `adb backup`, OS snapshot, IME cache | Token/PAN/PII recovered off-device | HIGH (off-device leak) | No secret logging in release; `allowBackup=false`; secure flag |
| Client-side-only auth / root-jailbreak check as sole control | Patch binary, hook with Frida, bypass check | Paywall/gate bypassed | LOW if backend re-validates; HIGH if sole gate | Backend enforces; client check is UX/defense-in-depth only |
| Weak biometric / local-auth bypass (result-only, no key gating) | Hook the boolean callback, return success | Local auth defeated | HIGH | Gate a Keychain/Keystore key on biometric, not a bool |

## Operating Principles

1. **Assume the device is hostile.** Rooted/jailbroken, binary decompiled, runtime hooked (Frida/objection). Anything on-device is readable and patchable.
2. **Store secrets in Keychain/Keystore, not prefs.** Minimize what lives on-device at all — the safest secret is the one you never stored.
3. **Backend is truth.** Client-side checks (paywall, role, root detection) are UX and defense-in-depth, never the security boundary. The server re-validates every privileged action.
4. **TLS + pinning for sensitive apps.** Default network trust is bypassable on a controlled device; pin to your CA/leaf for high-value flows.
5. **Export the minimum.** Every exported component is attack surface. Default to `exported=false`; protect required exports with signature-level permissions.
6. **Validate & authorize deep-link actions server-side.** A deep link is untrusted input from any app or web page. Verify host ownership (assetlinks/AASA) and authorize the action on the backend.
7. **Harden WebView.** No JavaScript bridge to untrusted content, no file/content access, no mixed content; treat loaded HTML as attacker-controlled.
8. **Never log secrets; strip in release.** Tokens, keys, PII must not reach logcat/NSLog/crash reports. Disable verbose logging in release builds.

## Phase 1: Detection Strategy

**What to look for:**

1. **Insecure local data storage**
   - Patterns: `SharedPreferences` / `UserDefaults` holding tokens, `SQLiteDatabase` / Core Data with plaintext PII, `MODE_WORLD_READABLE`, files in external storage
   - Attack: Root/jailbreak → read app sandbox; `adb backup`; pull DB and prefs files
   - Fix: EncryptedSharedPreferences / Keystore (Android), Keychain (iOS); minimize stored data

2. **Hardcoded secrets / keys**
   - Patterns: API keys, AWS/GCP creds, keystore passwords, signing/HMAC keys, private keys in source or `strings.xml` / `Info.plist`
   - Attack: `apktool`/`jadx`/`class-dump`, `strings` on binary, grep resources
   - Fix: Secret lives server-side; client gets short-lived per-user tokens; rotate exposed keys

3. **Transport security & cert pinning**
   - Patterns: `http://` endpoints, `usesCleartextTraffic`, `NSAllowsArbitraryLoads`, trust-all `TrustManager`/`HostnameVerifier`, disabled `URLSession` validation, no pinning
   - Attack: MITM proxy (mitmproxy/Burp) with attacker CA installed on rooted device
   - Fix: TLS 1.2+, Network Security Config / ATS, certificate or public-key pinning for sensitive flows

4. **Exported / leaky components**
   - Patterns: `android:exported="true"` without `android:permission`, implicit Intents with extras, content providers with `grantUriPermissions`, broadcast of sensitive data
   - Attack: Malicious app sends crafted Intent / queries Provider / receives broadcast
   - Fix: `exported=false`, signature-level permission, explicit Intents, validate caller

5. **Insecure deep links / URL schemes**
   - Patterns: `intent-filter` with `android:scheme`, iOS `CFBundleURLSchemes`, `application(_:open:)`, link triggers auth/transfer/state change without server check
   - Attack: Craft `myapp://...` or `https://host/...` link, deliver via web/QR/another app
   - Fix: Verify host (App Links `assetlinks.json` / Universal Links AASA), authorize the action server-side, never trust link parameters

6. **WebView / platform misuse**
   - Patterns: `setJavaScriptEnabled(true)` + `addJavascriptInterface`, `setAllowFileAccess(true)`, `loadUrl` of untrusted/remote content, `UIWebView`, missing `WKWebView` config, keyboard cache on secret fields
   - Attack: Loaded page (or MITM'd HTTP) invokes native bridge or reads `file://`
   - Fix: No bridge to untrusted origins, disable file/content access, use `WKWebView`, `secureTextEntry` for secrets

7. **Logging / leakage / backups / screenshots**
   - Patterns: `Log.d/e`/`print`/`NSLog` of tokens/PII, `android:allowBackup="true"`, no `FLAG_SECURE`, sensitive fields without `secureTextEntry`/`importantForAutofill`
   - Attack: `adb logcat`, `adb backup`, OS task-switcher snapshot, IME/keyboard cache
   - Fix: Strip sensitive logs in release, `allowBackup=false` (or exclude), `FLAG_SECURE`, disable cache on secret inputs

8. **Client-side auth & root/jailbreak detection as sole control**
   - Patterns: paywall/role/feature gate decided only on-device, root/jailbreak check that blocks but backend doesn't re-check, biometric returning a plain boolean
   - Attack: Patch binary, Frida-hook the check, return `true`
   - Fix: Backend enforces entitlement on every request; gate a Keystore/Keychain key on biometric, not a bool

## Phase 2: Grep Leads

### Android — Java/Kotlin
Pattern: `getSharedPreferences\(|PreferenceManager\.getDefaultSharedPreferences` (check what's stored; tokens = bad)
Pattern: `MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE` (world-accessible prefs/files, BAD)
Pattern: `SQLiteDatabase|rawQuery\(|Room` (verify no plaintext secrets/PII at rest)
Pattern: `(api[_-]?key|secret|password|token|private[_-]?key)\s*=\s*"` (hardcoded secret, BAD)
Pattern: `setJavaScriptEnabled\(true\)` (WebView JS — check content trust)
Pattern: `addJavascriptInterface\(` (native bridge — CRITICAL if untrusted content)
Pattern: `setAllowFileAccess\(true\)|setAllowFileAccessFromFileURLs\(true\)|setAllowUniversalAccessFromFileURLs\(true\)` (WebView file access, BAD)
Pattern: `Log\.(d|e|v|i|w)\(.*(token|password|secret|auth|card|ssn)` (secret in logs, BAD)
Pattern: `checkServerTrusted\([^)]*\)\s*\{\s*\}|return\s+new\s+X509Certificate\[\]\{\}` (trust-all TrustManager, BAD)
Pattern: `HostnameVerifier|verify\([^)]*\)\s*\{\s*return\s+true` (trust-all hostname verifier, BAD)
Pattern: `SSLContext\.getInstance|setHostnameVerifier\(.*ALLOW_ALL` (disabled TLS validation, BAD)

### Android — AndroidManifest.xml
Pattern: `android:exported="true"` (exported component — confirm `android:permission` present)
Pattern: `<(activity|service|receiver|provider)[^>]*>` near `<intent-filter>` (implicitly exported pre-API-31, audit)
Pattern: `android:usesCleartextTraffic="true"` (cleartext HTTP allowed, BAD)
Pattern: `android:allowBackup="true"` (adb backup extracts data, BAD for sensitive apps)
Pattern: `android:scheme="` inside `<intent-filter>` (deep link — verify autoVerify + server authz)
Pattern: `android:networkSecurityConfig=` (MISSING = no pinning/cleartext policy; present = inspect XML)
Pattern: `<data android:host=` with `android:autoVerify="true"` (App Links — confirm assetlinks.json)

### iOS — Swift/Obj-C
Pattern: `UserDefaults\.standard|NSUserDefaults` (secret storage here = BAD; should be Keychain)
Pattern: `kSecAttrAccessible(Always|AfterFirstUnlock)\b` (weak Keychain class — prefer WhenUnlockedThisDeviceOnly)
Pattern: `SecItemAdd|SecItemCopyMatching` (Keychain usage — verify accessibility class)
Pattern: `(apiKey|secret|password|token|privateKey)\s*=\s*"` (hardcoded secret, BAD)
Pattern: `UIWebView` (deprecated, insecure — should be WKWebView)
Pattern: `WKUserContentController|add\(.*name:` (JS message handler — check content trust)
Pattern: `print\(|NSLog\(|os_log` with token/password/PII (secret in logs, BAD)
Pattern: `func application\(_ app.*open url` / `application\(_:open:options:\)` (URL scheme / deep-link handler — audit authz)
Pattern: `URLSession.*didReceive challenge|completionHandler\(\.useCredential|serverTrust` (custom trust — verify not trust-all)

### iOS — Info.plist
Pattern: `NSAllowsArbitraryLoads</key>\s*<true/>` (ATS disabled globally, BAD)
Pattern: `NSExceptionAllowsInsecureHTTPLoads</key>\s*<true/>` (per-domain cleartext exception, audit)
Pattern: `CFBundleURLSchemes` (custom URL scheme registered — audit handler authz)
Pattern: `NSAppTransportSecurity` (present = inspect for weakened exceptions)
Pattern: `NSFaceIDUsageDescription` (biometric in use — verify key-gated, not boolean)

## Phase 3: Triage

| Issue | Backend re-validates / data sensitive? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| Session token in SharedPreferences/UserDefaults | Sensitive | CRITICAL | Yes (root/backup) | Medium |
| Non-sensitive flag (theme) in prefs | Not sensitive | INFO | No | N/A |
| Hardcoded backend API key in binary | Sensitive | CRITICAL | Yes (decompile) | Medium |
| Hardcoded 3rd-party public/client ID | Public by design | LOW | No | N/A |
| Cleartext HTTP / `usesCleartextTraffic` to API | Sensitive | CRITICAL | Yes (MITM) | Low–Medium |
| Trust-all TrustManager / ATS disabled | Sensitive | CRITICAL | Yes (MITM) | Low |
| No cert pinning (TLS otherwise valid) | High-value app | MEDIUM | Conditional | Medium |
| Exported component triggers privileged action | n/a (another app acts) | CRITICAL | Yes | Low |
| Implicit Intent leaks data to any app | n/a | HIGH | Yes | Low |
| Deep link triggers action w/o server authz | Backend does NOT re-check | CRITICAL | Yes | Medium |
| Deep link triggers action, backend re-checks | Backend re-validates | LOW | No | N/A |
| WebView `addJavascriptInterface` + untrusted content | n/a | CRITICAL | Yes | Medium |
| Token/PII in release logs | Sensitive | HIGH | Yes (logcat) | Low |
| `allowBackup=true` on sensitive app | Sensitive | HIGH | Yes (adb backup) | Low |
| Paywall/role gated only on client, backend enforces | Backend re-validates | LOW | No | N/A |
| Paywall/feature gated only on client, no backend check | Backend does NOT enforce | HIGH | Yes (patch/Frida) | Medium |
| Root/jailbreak check is sole gate | Backend does NOT enforce | HIGH | Yes (hook) | Medium |

## Phase 4: Ponytail Fix Ladder

1. **Don't store it on device (YAGNI).** The strongest protection is not persisting the secret/data at all. Fetch on demand, keep in memory, discard on background. If it doesn't need to be on-device, remove it.

2. **Use platform secure storage.** Keychain (iOS, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), Android Keystore-backed keys, or `EncryptedSharedPreferences`/`MasterKey`. Never plain prefs/UserDefaults/files for secrets.

3. **Enforce on the backend (treat client as untrusted).** Every privileged action (purchase, transfer, role, feature) is authorized server-side per request. Client checks are UX/defense-in-depth only.

4. **TLS + cert pinning + Network Security Config / ATS.** TLS 1.2+ everywhere, no cleartext, ATS on (iOS), Network Security Config with pinned public keys (Android) for sensitive flows.

5. **Restrict component export & validate deep-link actions server-side.** `exported=false` or signature permission; explicit Intents; verify App Links/Universal Links host ownership; authorize the deep-linked action on the backend.

6. **Harden WebView & strip logs/backups in release.** No JS bridge to untrusted content, disable file/content access, `WKWebView` over `UIWebView`; remove sensitive logging, `allowBackup=false`, `FLAG_SECURE` on sensitive screens.

## Phase 5: Record Format

```
ID: MOB-001
Title: Session token stored in SharedPreferences — extractable on rooted device
Platform: Android
Severity: CRITICAL
MASVS: MASVS-STORAGE-1
Location: app/src/main/java/com/acme/AuthStore.kt:31
Vector: Root device or `adb backup`, read /data/data/com.acme/shared_prefs/auth.xml
Impact: Valid session token exfiltrated → full account takeover
Evidence: prefs.edit().putString("access_token", token).apply()  // plaintext
Confidence: 95%
Fix: Store in EncryptedSharedPreferences (MasterKey, AES256-GCM) or Keystore; set allowBackup=false
```

## Phase 6: Vulnerable → Fixed Examples

### (a) Token storage

**Android (Vulnerable) — plaintext prefs:**
```kotlin
// DANGER: readable on rooted device / adb backup
val prefs = getSharedPreferences("auth", MODE_PRIVATE)
prefs.edit().putString("access_token", token).apply()
```

**Android (Fixed) — EncryptedSharedPreferences:**
```kotlin
// GOOD: Keystore-backed encryption at rest
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
val secure = EncryptedSharedPreferences.create(
    context, "auth",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
secure.edit().putString("access_token", token).apply()
```

**iOS (Vulnerable) — UserDefaults:**
```swift
// DANGER: plist in app sandbox, captured by backups
UserDefaults.standard.set(token, forKey: "access_token")
```

**iOS (Fixed) — Keychain, device-only:**
```swift
// GOOD: Keychain, not synced, not in backups, unlocked-only
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "access_token",
    kSecValueData as String: Data(token.utf8),
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
]
SecItemDelete(query as CFDictionary)
SecItemAdd(query as CFDictionary, nil)
```

### (b) Transport security & pinning

**Android (Vulnerable) — cleartext + trust-all:**
```xml
<!-- DANGER: AndroidManifest.xml -->
<application android:usesCleartextTraffic="true">
```
```kotlin
// DANGER: trusts any certificate → MITM
val tm = object : X509TrustManager {
    override fun checkServerTrusted(c: Array<X509Certificate>, t: String) {}
    override fun checkClientTrusted(c: Array<X509Certificate>, t: String) {}
    override fun getAcceptedIssuers() = arrayOf<X509Certificate>()
}
```

**Android (Fixed) — Network Security Config with pin:**
```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false"/>
  <domain-config>
    <domain includeSubdomains="true">api.acme.com</domain>
    <pin-set>
      <pin digest="SHA-256">k3aX...base64-spki-hash...=</pin>
      <pin digest="SHA-256">backupPinJ8...=</pin>
    </pin-set>
  </domain-config>
</network-security-config>
```
```xml
<!-- AndroidManifest.xml -->
<application android:networkSecurityConfig="@xml/network_security_config"
             android:usesCleartextTraffic="false">
```

**iOS (Vulnerable) — ATS disabled:**
```xml
<!-- DANGER: Info.plist -->
<key>NSAppTransportSecurity</key>
<dict><key>NSAllowsArbitraryLoads</key><true/></dict>
```

**iOS (Fixed) — ATS on + public-key pinning:**
```swift
// GOOD: validate server trust against pinned SPKI hash
func urlSession(_ s: URLSession, didReceive c: URLAuthenticationChallenge,
               completionHandler h: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard let trust = c.protectionSpace.serverTrust,
          let key = SecTrustCopyKey(trust),
          pinnedSPKIHashes.contains(sha256(key)) else {
        h(.cancelAuthenticationChallenge, nil); return        // reject on mismatch
    }
    h(.useCredential, URLCredential(trust: trust))
}
```
(Leave `NSAppTransportSecurity` absent/strict in Info.plist so ATS enforces TLS 1.2+.)

### (c) Exported component without permission

**Android (Vulnerable):**
```xml
<!-- DANGER: any app can start this and trigger a transfer -->
<activity android:name=".TransferActivity" android:exported="true">
  <intent-filter><action android:name="com.acme.TRANSFER"/></intent-filter>
</activity>
```

**Android (Fixed) — not exported, or signature-gated:**
```xml
<!-- GOOD: internal only -->
<activity android:name=".TransferActivity" android:exported="false"/>

<!-- OR, if it must be callable, require a signature-level permission -->
<permission android:name="com.acme.permission.TRANSFER"
            android:protectionLevel="signature"/>
<activity android:name=".TransferActivity" android:exported="true"
          android:permission="com.acme.permission.TRANSFER"/>
```

### (d) Deep link triggering an action without auth

**Android (Vulnerable):**
```kotlin
// DANGER: myapp://transfer?to=X&amt=Y executes with no server-side authz
val to = intent.data?.getQueryParameter("to")
val amt = intent.data?.getQueryParameter("amt")
api.transfer(to, amt)   // trusts the link
```

**Fixed — authorize server-side, verify host:**
```kotlin
// GOOD: link only navigates; the action is authorized on the backend
//  - App Link verified via assetlinks.json (android:autoVerify="true")
//  - Backend re-checks session + entitlement + idempotency before moving money
val to = intent.data?.getQueryParameter("to") ?: return
showTransferConfirmation(to)            // requires authed user + explicit confirm
// server: POST /transfer validates session, ownership, limits, CSRF/idempotency key
```

### (e) WebView with JS bridge and file access

**Android (Vulnerable):**
```kotlin
// DANGER: untrusted page can call native + read local files
webView.settings.javaScriptEnabled = true
webView.settings.allowFileAccess = true
webView.addJavascriptInterface(NativeBridge(), "Android")
webView.loadUrl(remoteUntrustedUrl)
```

**Android (Fixed) — hardened:**
```kotlin
// GOOD: no bridge to untrusted content, no file access, https only
webView.settings.apply {
    javaScriptEnabled = false            // enable only for trusted first-party HTML
    allowFileAccess = false
    allowFileAccessFromFileURLs = false
    allowUniversalAccessFromFileURLs = false
    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
}
// Only addJavascriptInterface for content YOU fully control and serve over TLS.
webView.loadUrl("https://app.acme.com/trusted")
```

## Phase 7: Verification Checklist

- [ ] No secrets/tokens/PII in SharedPreferences, UserDefaults, plain files, or unencrypted SQLite/Core Data
- [ ] Secrets stored in Keychain (device-only class) / Android Keystore / EncryptedSharedPreferences
- [ ] No hardcoded API keys, signing keys, or passwords in source, resources, or the decompiled binary
- [ ] TLS 1.2+ enforced; cert/public-key pinning present for sensitive flows
- [ ] No cleartext traffic (`usesCleartextTraffic=false`, ATS on, no trust-all TrustManager/HostnameVerifier)
- [ ] Components not needlessly exported; required exports use signature-level permissions; Intents explicit
- [ ] Deep-link / universal-link host ownership verified (assetlinks.json / AASA); actions authorized server-side
- [ ] WebView hardened: no JS bridge to untrusted content, file/content access disabled, `WKWebView` over `UIWebView`, no mixed content
- [ ] `android:allowBackup="false"` (or backup rules exclude secrets); `FLAG_SECURE` on sensitive screens
- [ ] No sensitive data in release logs (logcat/NSLog); verbose logging disabled in release
- [ ] Root/jailbreak detection and client paywall/role checks are NOT the sole control — backend re-validates every privileged request
- [ ] Biometric/local auth gates a Keychain/Keystore key (not a plain boolean callback); keyboard cache/autofill disabled on secret fields

## Quality Bar

1. Every stored secret lives in Keychain/Keystore/EncryptedSharedPreferences, never plain prefs/files
2. No hardcoded keys or credentials survive decompilation
3. All sensitive traffic is TLS 1.2+; cleartext and trust-all are absent
4. Sensitive/high-value apps pin certificates or public keys
5. No component is exported beyond what's required; exports are permission-protected
6. Deep-link/universal-link hosts are verified and actions authorized on the backend
7. WebViews never bridge native code or local files to untrusted content
8. No tokens/PII reach release logs, backups, screenshots, or keyboard cache
9. Client-side auth/root checks are defense-in-depth only; the backend is the boundary
10. Findings are triaged by data sensitivity + backend re-validation: extractable secret or another-app privileged action = CRITICAL; client-only check the backend re-validates = LOW

## Example Triggers

- "mobile security"
- "Android security"
- "iOS security"
- "insecure storage"
- "certificate pinning"
- "exported component"
- "deep link security"
- "MASVS"

## Relationship to blueteam-defend

Extends the **backend-is-truth** doctrine to mobile clients: the binary is fully attacker-controlled (rooted/jailbroken, decompiled, hooked), so client-side enforcement is never the boundary — the backend re-validates every privileged action. Maps to **OWASP MASVS** (Storage, Crypto, Network, Platform, Resilience) and the **OWASP Mobile Top 10** (insecure data storage, insecure communication, insecure authentication, improper platform usage, extraneous functionality). Only flag CRITICAL when data is extractable/exposed or a component lets another app take a privileged action.
