---
name: memory-resource-leaks
description: Audit for resource exhaustion: file handle leaks, DB connection leaks, goroutine/thread leaks, listener leaks, unclosed streams across Python, Go, Rust, C/C++, JavaScript, Java, C#. Use when code opens files, connections, or spawns threads without closing. Extends blueteam-defend Layer 6 (DoS & Resource Limits).
---

# Memory & Resource Leaks — Lifecycle Management Audit

Detect resources that are opened but never closed: file handles, database connections, HTTP connections, goroutines/threads, event listeners, timers, sockets. Each resource must be released to prevent exhaustion DoS.

## Core Doctrine: Resource Lifecycle

| Resource Type | What Happens If Not Closed | Real Consequence | Proper Fix |
|---|---|---|---|
| File handle | Process runs out of FDs, can't open new files | App crashes, cannot log, read, or serve | Always close in finally/defer/context manager |
| DB connection | Connection pool exhausted, new requests timeout | App cannot query DB, cascading failures | Use connection pool, close in finally |
| HTTP connection | Keep-alive queue fills, server rejects new requests | DoS vulnerability, legitimate users blocked | Close response body, set timeout |
| Goroutine/Thread | Memory grows, CPU context-switching overhead | App crashes or becomes unresponsive | Ensure all spawned goroutines exit |
| Event listener | Memory leak, listeners fire even after unsubscribe | Unexpected behavior, memory bloat | Unsubscribe or destroy listeners |
| Timer/Interval | Timer keeps firing, consumes CPU/memory | Runaway loops, high CPU usage | Always clear timer/interval |
| Socket | FD limit reached, cannot accept new connections | Service unavailable, DoS | Close socket in error path + happy path |
| Stream | Buffer fills, memory exhausts, process crashes | App crash, backpressure not handled | Pipe streams, implement backpressure |

## Operating Principles

1. **Every resource needs exit.** File opened? Must close. Connection created? Must release. Goroutine spawned? Must exit cleanly.
2. **Cleanup in error path too.** Try-finally, defer, context managers ensure cleanup even if exception thrown.
3. **Language idioms matter.** Go: defer. Python: with/context manager. JavaScript: finally. Java: try-with-resources. C#: using/Dispose. C/C++: RAII.
4. **Pools are safer than bare resources.** Connection pool (with max size) safer than creating new DB connection per request.
5. **Timeouts prevent hangs.** Long-lived resource? Set timeout. Prevents resource held indefinitely.
6. **Monitor resource usage.** ulimit -n (FDs), netstat (connections), ps (threads), memory profiler (goroutines).
7. **Test for leaks.** Repeatedly create/destroy resource; check system metrics. If FDs or memory grow = leak.

## Phase 1: Detection Strategy

**What to look for:**

1. **Unclosed file handles** — Open file but no close in finally/defer
   - Patterns: `open()`, `fopen()`, `std::ifstream`, `FileStream`, `Files.open()`
   - Check if close is called in error path

2. **Unclosed database connections** — Connect but no cleanup
   - Patterns: `db.connect()`, `psycopg2.connect()`, `sql.Open()`, `getConnection()`, `pymongo.MongoClient()`
   - Check if connection/cursor released in finally

3. **Unclosed HTTP responses** — Fetch/request but don't drain response body
   - Patterns: `fetch()`, `requests.get()`, `http.Get()`, `HttpClient.GetAsync()`, `client.request()`
   - Must close/drain response body even if not reading

4. **Goroutine/thread leaks** — Spawn goroutine/thread but no cleanup
   - Patterns: `go func()`, `new Thread()`, `thread()`, `threading.Thread()`, `QThread`
   - Check if all goroutines exit or are tracked

5. **Event listener leaks** — Attach listener but never remove
   - Patterns: `addEventListener`, `.on()`, `.subscribe()`, `observer.attach()`, `event.listen()`
   - Check if listeners removed on cleanup

6. **Unclosed streams** — Create stream but don't close
   - Patterns: `Stream.open()`, `fs.createReadStream()`, `open()`
   - Check for piping, backpressure, end events

7. **Running timers/intervals** — setInterval/setTimeout without cleanup
   - Patterns: `setInterval()`, `setTimeout()`, `timer.start()`, `Timer()`, `schedule.every()`
   - Must clear/stop timer

## Phase 2: Grep Leads

### Go
Pattern: `defer\s+` (should appear after resource create)
Pattern: `\w+\.Close\(\)` (explicit close calls)
Pattern: `go\s+func\(\)` (goroutine spawn — check if exits)
Pattern: `make\(chan\s+` (channel create — ensure all goroutines exit)

### Python
Pattern: `with\s+\w+\.open\(|with\s+open\(`
Pattern: `open\(['\"]` (must be in with statement)
Pattern: `\.connect\(\)` (connection without context manager)
Pattern: `finally:` (should have cleanup code)

### JavaScript/Node.js
Pattern: `fs\.open\(|fs\.createReadStream\(`
Pattern: `\.on\(['\"]close` (listener attach — must remove)
Pattern: `setInterval\(|setTimeout\(` (timers — check clearInterval/clearTimeout)
Pattern: `addEventListener\(` (must have removeEventListener)
Pattern: `\.close\(\)` or `\.destroy\(\)` (should appear in finally)

### Java/Spring
Pattern: `try\s*\(\s*.*\s*\)` (try-with-resources, Java 7+)
Pattern: `new.*Connection\(|getConnection\(` (must be in try-with-resources)
Pattern: `\.close\(\)` (should be in finally or try-with-resources)
Pattern: `new Thread\(|\.start\(\)` (thread spawn — check cleanup)

### C#/.NET
Pattern: `using\s*\(\s*\w+\s*=` (using statement ensures disposal)
Pattern: `IDisposable|Dispose\(\)` (should implement for resources)
Pattern: `new.*Stream\(|new.*Connection\(` (must be in using statement)
Pattern: `new Thread\(|\.Start\(\)` (must call .Join or track)

### C/C++
Pattern: `malloc\(|new\s+|fopen\(` (resource allocation)
Pattern: `free\(|delete|fclose\(` (must match allocation)
Pattern: `RAII|destructor|~` (C++ pattern for cleanup)

## Phase 3: Triage

| Issue Type | Severity | Confidence | Fix Effort |
|---|---|---|---|
| Unclosed file handle per request | HIGH | 90% | Low |
| DB connection leak in loop | CRITICAL | 95% | Low |
| Goroutine leak per request | CRITICAL | 95% | Low |
| Event listener leak | MEDIUM | 85% | Low |
| Unclosed HTTP response body | MEDIUM | 85% | Low |
| Stream without backpressure | HIGH | 80% | Medium |
| Timer never cleared | MEDIUM | 90% | Low |
| Thread not joined | HIGH | 85% | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: Is resource really needed?** (Open file? Only if necessary. Spawn goroutine? Only if parallel work needed)
2. **Already managed?** (Framework manages lifecycle? Connection pool already configured? Use it)
3. **Language idiom?** (Go: defer. Python: with. Java: try-with-resources. C#: using. JavaScript: finally)
4. **Pool/manager?** (Use connection pool, goroutine pool, thread pool)
5. **Manual cleanup** (Explicit close in finally + error handler)
6. **Custom resource manager** (Wrapper class with automatic cleanup, rare)

## Phase 5: Record Format

```
ID: RESOURCE-001
Title: Unclosed file handle in process_upload()
Severity: HIGH
Location: src/upload.py:45
Vector: Per-request file leak; 1000 requests = 1000 open FDs
Impact: FD limit reached, app cannot open files, crashes
Evidence: f = open(file_path); read data; no close in error path
Confidence: 95%
Fix: Use 'with open()' context manager (Python idiom)
```

## Phase 6: Vulnerable → Fixed Examples

**Go (Vulnerable):**
```go
func processFile(filename string) {
    file, _ := os.Open(filename)  // No error check
    data := ioutil.ReadAll(file)
    // Missing: file.Close()
    return data
}
```

**Go (Fixed):**
```go
func processFile(filename string) ([]byte, error) {
    file, err := os.Open(filename)
    if err != nil {
        return nil, err
    }
    defer file.Close()  // Guaranteed to run
    
    return ioutil.ReadAll(file)
}
```

**Python (Vulnerable):**
```python
def save_file(data, path):
    f = open(path, 'w')
    f.write(data)
    # Missing: f.close() — handle open forever if exception
```

**Python (Fixed):**
```python
def save_file(data, path):
    with open(path, 'w') as f:
        f.write(data)
    # Guaranteed to close even if exception
```

**JavaScript (Vulnerable):**
```javascript
function processFile(filename) {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => {
        process.stdout.write(chunk);
    });
    // Missing: stream.on('end'), stream.on('error')
}
```

**JavaScript (Fixed):**
```javascript
function processFile(filename) {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => {
        process.stdout.write(chunk);
    });
    stream.on('end', () => {
        console.log('Stream closed');
    });
    stream.on('error', (err) => {
        console.error('Stream error:', err);
        stream.destroy();
    });
}
```

**Java (Vulnerable):**
```java
public void saveFile(String path, String data) throws IOException {
    FileWriter writer = new FileWriter(path);  // No close!
    writer.write(data);
}
```

**Java (Fixed):**
```java
public void saveFile(String path, String data) throws IOException {
    try (FileWriter writer = new FileWriter(path)) {
        writer.write(data);
    }  // Try-with-resources auto-closes
}
```

## Phase 7: Verification Checklist

- [ ] Identify all resource-creation calls (open, connect, spawn, create)
- [ ] For each: verify cleanup in finally/defer/with/using/try-with-resources
- [ ] For error paths: verify cleanup happens even on exception
- [ ] Check for goroutine/thread leaks: `go func()` and `new Thread()` — verify all exit
- [ ] Verify event listeners removed: `.on()` should have matching `.off()` or `.unsubscribe()`
- [ ] Check timers cleared: `setInterval` should have `clearInterval`
- [ ] Monitor system resources under load: `ulimit -n` (FD limit), `netstat` (connections), memory profiler (goroutines)
- [ ] Load test: repeatedly create/destroy resources; verify no growth in system metrics
- [ ] Profile for leaks: Use language profiler (pprof for Go, tracemalloc for Python, DevTools for Node.js)

## Quality Bar

1. Every resource-creating call has matching cleanup (close/release/destroy)
2. Cleanup happens in error path (finally, defer, context manager, try-with-resources, using)
3. No goroutine/thread spawns without tracking or guarantees to exit
4. Event listeners removed when no longer needed
5. All timers/intervals cleared on cleanup
6. No unclosed streams; backpressure handled
7. Connection pooling used (not per-request connections)
8. Long-lived resources have timeouts
9. System profiler shows no FD/memory/thread growth under load
10. Load test passes with 1000+ concurrent operations

## Example Triggers

- "resource leak"
- "file handle leak"
- "connection pool exhausted"
- "goroutine leak"
- "memory bloat"
- "FD limit reached"
- "app crashes under load"
- "cleanup audit"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 6 (DoS & Resource Limits)**. Blueteam-defend covers high-level DoS risks; memory-resource-leaks provides language-specific patterns to detect resource cleanup failures.
