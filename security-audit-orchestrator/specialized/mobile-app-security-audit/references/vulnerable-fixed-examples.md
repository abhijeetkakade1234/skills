# Mobile App Security — Vulnerable → Fixed Examples

Reference companion to the mobile-app-security-audit skill's **Phase 6**. Full Android + iOS vulnerable→fixed code, plist, and XML pairs.

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
