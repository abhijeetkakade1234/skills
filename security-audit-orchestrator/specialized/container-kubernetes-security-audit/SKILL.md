---
name: container-kubernetes-security-audit
description: Audit container and Kubernetes security: Dockerfile hardening (root user, :latest tag, secrets baked into layers, bloated attack surface), container runtime (privileged, --cap-add, host mounts, docker.sock exposure), and Kubernetes workloads/cluster (privileged or root pods, missing securityContext, hostPath, hostNetwork/hostPID, over-permissive RBAC, missing NetworkPolicy, secrets in env or plaintext manifests, no resource limits, no admission control). Use when reviewing Dockerfiles, docker-compose, Kubernetes manifests, Helm charts, or cluster RBAC. CRITICAL: Only flag CRITICAL if the issue grants container escape, cluster-admin, or secret exposure. Defense-in-depth gaps with compensating controls (e.g., no NetworkPolicy but cluster is single-tenant and air-gapped) = lower severity.
---

# Container & Kubernetes Security Auditing — Image, Runtime & Cluster Hardening

Detect misconfigurations that let a compromised container escape to the host, escalate to cluster-admin, or exfiltrate secrets: root/privileged containers, dangerous host mounts, over-permissive RBAC, flat networks, and plaintext secrets.

**Default workflow:** enumerate artifacts (Dockerfile → compose → K8s/Helm → RBAC → NetworkPolicy) → detect → triage by blast radius (escape/cluster-admin/exfil) → fix via the ladder → verify.

## Core Doctrine: Assume-Breach Container Hardening

| Misconfiguration | What Attacker Can Do | Real Consequence | Severity | Proper Fix |
|---|---|---|---|---|
| Container runs as root (no `USER`, `runAsUser: 0`) | Full root inside container; abuse mounted host paths | Host file tampering, easier escape | HIGH | `runAsNonRoot: true`, `USER 10001`, drop caps |
| `privileged: true` | Disables isolation; access all devices, mount host FS | Full container escape → host root | CRITICAL (escape) | Remove privileged; grant only needed caps |
| `hostPath` mount of `/` or `docker.sock` | Mount host root or talk to Docker daemon | Read/write host, launch privileged container → host root | CRITICAL (escape) | Remove mount; use named volumes / CSI |
| `hostNetwork: true` / `hostPID: true` | Share host network/PID namespace | Sniff/spoof traffic, see & signal host processes | CRITICAL (escape/lateral) | Remove host namespaces; use pod networking |
| `allowPrivilegeEscalation: true` / no `drop: ALL` caps | Gain new privileges via setuid; keep `CAP_SYS_ADMIN` etc. | Privilege escalation inside container | HIGH | `allowPrivilegeEscalation: false`, `drop: ["ALL"]` |
| RBAC `cluster-admin` binding or `verbs: ["*"]`/`resources: ["*"]` | Any API action cluster-wide | Read all secrets, create privileged pods → cluster takeover | CRITICAL (cluster-admin) | Scoped Role, named verbs/resources |
| No NetworkPolicy (flat network) | Reach any pod/service in cluster | Lateral movement, pivot to DBs/internal APIs | HIGH (lower if single-tenant) | Default-deny + explicit allow |
| Secret in env var or committed manifest | Read `env`, `git log`, or `kubectl get pod -o yaml` | Credential/token exfiltration | CRITICAL (exfil) | External secret manager; `secretKeyRef`; encrypt at rest |
| `:latest` / unpinned image tag | Pull mutable/unknown image | Supply-chain swap, unreproducible builds | MEDIUM | Pin by digest `image@sha256:...`; sign |
| No `resources.limits` | Consume all CPU/memory on node | Noisy-neighbor DoS, node eviction | MEDIUM | Set `requests` and `limits`; LimitRange |

## Operating Principles

1. **Least privilege by default.** Containers run non-root (`runAsNonRoot: true`), drop ALL capabilities, mount root filesystem read-only (`readOnlyRootFilesystem: true`), and add back only what is provably needed.
2. **No privileged, no host mounts, no docker.sock.** `privileged: true`, `hostPath` of sensitive paths, and `/var/run/docker.sock` are escape primitives — treat any as critical unless explicitly justified and gated.
3. **Pin images by digest.** Use `image@sha256:...`, not `:latest` or floating tags. Pin base images too; rebuild deliberately, not implicitly.
4. **Secrets via a secret manager, not env or manifests.** Use external secret stores (Vault, cloud secret managers, External Secrets Operator) or K8s Secrets with `secretKeyRef`; never bake into images or env, and enable encryption-at-rest.
5. **RBAC least privilege — no wildcards.** No `cluster-admin` for workloads; name explicit `verbs` and `resources`. Prefer namespaced `Role`/`RoleBinding` over cluster-scoped.
6. **Default-deny NetworkPolicy.** Start with deny-all ingress/egress per namespace, then add explicit allows. A flat network turns one compromise into lateral movement.
7. **Set resource limits and enforce admission control.** Every pod has `requests`/`limits`; enforce baselines with Pod Security Standards, OPA Gatekeeper, or Kyverno so bad pods are rejected at admission, not caught later.
8. **Scan images for CVEs and misconfigs in CI.** Run Trivy/Grype on images, hadolint on Dockerfiles, Checkov/kubescape on manifests, kube-bench on the cluster. Fail builds on critical findings.

## Phase 1: Detection Strategy

**What to look for:**

1. **Root & privileged containers**
   - Patterns: missing `USER` in Dockerfile, `runAsUser: 0`, missing `runAsNonRoot`, `privileged: true`, `securityContext.privileged`
   - Attack: Run as root inside container, then leverage privileged mode or mounts to reach the host
   - Fix: `USER` non-root in image; `runAsNonRoot: true`, `runAsUser` >0; never `privileged`

2. **Dangerous host mounts & namespaces**
   - Patterns: `hostPath` (especially `/`, `/etc`, `/var/run/docker.sock`), `hostNetwork: true`, `hostPID: true`, `hostIPC: true`, compose `network_mode: host`, `-v /var/run/docker.sock`
   - Attack: Mount host filesystem or socket, share host namespaces → escape and host control
   - Fix: Remove host mounts/namespaces; use CSI volumes and pod networking

3. **Capability & privilege-escalation settings**
   - Patterns: `cap_add` / `capabilities.add` (`SYS_ADMIN`, `NET_ADMIN`, `SYS_PTRACE`), missing `drop: ["ALL"]`, `allowPrivilegeEscalation: true`, missing seccomp profile
   - Attack: Use dangerous caps or setuid binaries to escalate within/outside the container
   - Fix: `drop: ["ALL"]`, add only needed caps, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`

4. **RBAC over-permission**
   - Patterns: `ClusterRoleBinding` to `cluster-admin`, `verbs: ["*"]`, `resources: ["*"]`, `apiGroups: ["*"]`, ServiceAccount bound to broad roles, `secrets` get/list at cluster scope
   - Attack: A compromised pod's ServiceAccount token reads all secrets or creates privileged pods → cluster takeover
   - Fix: Namespaced `Role` with explicit verbs/resources; dedicated least-privilege ServiceAccounts

5. **Missing network policy (flat network)**
   - Patterns: no `kind: NetworkPolicy` in namespace, no default-deny, all pods reach all services
   - Attack: Lateral movement from a single compromised pod to databases and internal APIs
   - Fix: Default-deny ingress/egress, then explicit allow rules by label

6. **Secret handling**
   - Patterns: secrets in `env`, hardcoded values in manifests/Helm `values.yaml`, `ENV`/`ARG` creds in Dockerfile, secrets committed to git, `Secret` data not encrypted at rest
   - Attack: Read tokens/passwords from env, image layers, or repo history
   - Fix: External secret manager or `secretKeyRef`; encryption-at-rest; rotate exposed secrets

7. **Image provenance & pinning**
   - Patterns: `FROM .*:latest`, untagged/floating tags, `ADD http://...` of remote artifacts, unsigned images, fat base images (full OS)
   - Attack: Supply-chain image swap, unverified remote content, large CVE surface
   - Fix: Pin by digest, minimal/distroless base, sign (cosign), verify at admission

8. **Resource limits & admission control**
   - Patterns: missing `resources.requests`/`limits`, no `LimitRange`/`ResourceQuota`, no Pod Security Standards label, no Gatekeeper/Kyverno policies
   - Attack: Noisy-neighbor DoS; bad pods admitted with no guardrails
   - Fix: Set limits, apply `pod-security.kubernetes.io/enforce: restricted`, deploy admission policies

## Phase 2: Grep Leads

### Dockerfile (hadolint)
Pattern: `^FROM\s+.*:latest|^FROM\s+\S+$` (unpinned/latest base image — pin by digest)
Pattern: `^USER\s+root|^USER\s+0\b` (explicit root — should be non-root UID)
Pattern: missing any `^USER ` directive entirely (defaults to root, BAD)
Pattern: `^ARG\s+.*(PASSWORD|TOKEN|SECRET|KEY)|^ENV\s+.*(PASSWORD|TOKEN|SECRET|KEY)` (secrets baked into layers)
Pattern: `^ADD\s+https?://` (remote ADD — use COPY of verified artifact or curl+checksum)
Pattern: `apt-get install` without `--no-install-recommends` (bloated attack surface)
Pattern: `curl .* \| (sh|bash)` (unverified pipe-to-shell in build)

### docker-compose / docker run
Pattern: `privileged:\s*true|--privileged` (full escape primitive — CRITICAL)
Pattern: `/var/run/docker\.sock` (docker.sock mount — daemon takeover → host root)
Pattern: `cap_add:|--cap-add` (especially `SYS_ADMIN`, `NET_ADMIN`, `SYS_PTRACE`)
Pattern: `network_mode:\s*host|--network[= ]host` (host network namespace)
Pattern: `pid:\s*host|--pid[= ]host` (host PID namespace)
Pattern: `volumes:\s*\n\s*-\s*/:|-v\s+/:` (host root mount)

### Kubernetes YAML (kubescape, Checkov, kube-bench)
Pattern: `privileged:\s*true` (privileged container — CRITICAL escape)
Pattern: `runAsUser:\s*0|runAsNonRoot:\s*false` (running as root)
Pattern: missing `runAsNonRoot:\s*true` in `securityContext` (no non-root enforcement)
Pattern: `hostPath:` (host filesystem mount — check the path)
Pattern: `hostNetwork:\s*true|hostPID:\s*true|hostIPC:\s*true` (host namespaces)
Pattern: `allowPrivilegeEscalation:\s*true` (or missing `false`)
Pattern: missing `securityContext:` block on container/pod entirely
Pattern: `kind:\s*ClusterRoleBinding` referencing `name:\s*cluster-admin`
Pattern: `verbs:\s*\[\s*"\*"\s*\]|resources:\s*\[\s*"\*"\s*\]|apiGroups:\s*\[\s*"\*"\s*\]` (wildcard RBAC)
Pattern: `env:` ... `name:.*(PASSWORD|TOKEN|SECRET)` with literal `value:` (plaintext secret in env)
Pattern: `valueFrom:` ... `secretKeyRef:` (better — verify Secret is encrypted at rest)
Pattern: missing `resources:\s*\n\s*limits:` (no resource limits — DoS)
Pattern: absence of any `kind:\s*NetworkPolicy` in the namespace (flat network)
Pattern: missing `capabilities:\s*\n\s*drop:\s*\[\s*"ALL"\s*\]` (caps not dropped)
Pattern: missing `seccompProfile:` (no seccomp confinement)

### Helm values.yaml
Pattern: `securityContext:\s*\{\}|securityContext:\s*$` (empty/unset — inherits insecure defaults)
Pattern: `image:\s*\n\s*tag:\s*latest|pullPolicy:\s*Always` (unpinned image)
Pattern: hardcoded credentials in `values.yaml` (`password:`, `apiKey:`, `token:`)
Pattern: `rbac:\s*\n\s*create:\s*true` with broad role templates — review rendered RBAC

### CI / scanners to run
- **hadolint** — Dockerfile linting (root user, latest tag, missing flags)
- **Trivy** / **Grype** — image & filesystem CVE + secret scanning; also K8s manifest misconfig
- **Checkov** — IaC/K8s/Helm misconfiguration policy
- **kubescape** — NSA/CISA & MITRE ATT&CK framework scanning of manifests and live cluster
- **kube-bench** — CIS Kubernetes Benchmark against a running cluster
- **cosign** — image signing/verification in CI
- **Kyverno / OPA Gatekeeper** — admission-time policy enforcement (not a scanner, the runtime gate)

## Phase 3: Triage

| Issue | Grants escape / cluster-admin / exfil? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| `privileged: true` pod | Escape (host root) | CRITICAL | Yes | Low |
| `hostPath` mount of `/` or docker.sock | Escape | CRITICAL | Yes | Low |
| `hostNetwork`/`hostPID: true` | Escape / lateral | CRITICAL | Yes | Low |
| ClusterRoleBinding → cluster-admin (workload SA) | Cluster-admin | CRITICAL | Yes | Medium |
| RBAC wildcard verbs/resources on secrets | Cluster-admin / exfil | CRITICAL | Yes | Medium |
| Secret in env / committed manifest | Exfil | CRITICAL | Yes | Low (rotate first) |
| Container runs as root (no escape path) | None (defense gap) | HIGH | Partial | Low |
| Missing `drop: ALL` / `allowPrivilegeEscalation` | None directly | HIGH | Partial | Low |
| No NetworkPolicy, multi-tenant cluster | Lateral | HIGH | Yes | Medium |
| No NetworkPolicy, single-tenant/air-gapped | Lateral (mitigated) | LOW | No | Medium |
| `:latest` image tag | Supply-chain | MEDIUM | Conditional | Low |
| No resource limits | DoS | MEDIUM | Yes | Low |

## Phase 4: Ponytail Fix Ladder

1. **YAGNI: drop the dangerous setting entirely.**
   - Does it *really* need `privileged`, `hostPath`, docker.sock, `hostNetwork`, or `cluster-admin`? Usually no.
   - If unjustified → remove it. This is the single highest-leverage fix.

2. **Set a restrictive `securityContext`.**
   - `runAsNonRoot: true`, `runAsUser`/`runAsGroup` >0, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`, `seccompProfile.type: RuntimeDefault`.
   - Apply at pod and container level; add back only specific caps if proven necessary.

3. **Least-privilege RBAC.**
   - Replace `cluster-admin` and wildcards with a namespaced `Role` naming explicit `verbs` and `resources`.
   - Dedicated ServiceAccount per workload; disable token automount where unused.

4. **Default-deny NetworkPolicy + external secrets.**
   - Add a deny-all `NetworkPolicy` per namespace, then explicit allow rules by pod label.
   - Move secrets to an external manager (Vault / cloud secret manager / External Secrets Operator) or `secretKeyRef`; enable etcd encryption-at-rest; rotate anything previously exposed.

5. **Enforce via admission control.**
   - Apply Pod Security Standards (`pod-security.kubernetes.io/enforce: restricted`).
   - Add OPA Gatekeeper or Kyverno policies to reject privileged/hostPath/root pods at admission so regressions can't be deployed.

6. **Image scanning & signing in CI.**
   - hadolint + Trivy/Grype + Checkov in the pipeline; fail on critical CVEs/secrets/misconfigs.
   - Sign images with cosign; verify signatures and digests at admission.

## Phase 5: Record Format

```
ID: K8S-001
Title: Privileged pod with hostPath mount of / — container escape to host root
Severity: CRITICAL
Location: deploy/app/deployment.yaml:38 (securityContext.privileged), :52 (volumes.hostPath)
Vector: Compromised container mounts host / and uses privileged mode to chroot/write host files
Impact: Full node compromise; pivot to other workloads and kubelet credentials
Evidence: securityContext.privileged: true; volumes[0].hostPath.path: "/"
Confidence: 98%
Fix: Remove privileged + hostPath; runAsNonRoot, drop ALL caps; use named volume
```

```
ID: CON-001
Title: Dockerfile runs as root with :latest base and baked-in token
Severity: CRITICAL
Location: Dockerfile:1 (FROM node:latest), :8 (ENV NPM_TOKEN=...), no USER
Vector: Image inspection (docker history) leaks token; root container widens escape surface
Impact: Credential exfiltration; unreproducible, unverifiable supply chain
Evidence: FROM node:latest; ENV NPM_TOKEN=ghp_...; no USER directive
Confidence: 95%
Fix: Pin base by digest, use build secret mount, add non-root USER, distroless runtime
```

## Phase 6: Vulnerable → Fixed Examples

**(a) Dockerfile — root + :latest + baked secret (Vulnerable):**
```dockerfile
# DANGER: latest tag, secret in layer, runs as root
FROM node:latest
ENV NPM_TOKEN=ghp_realsecrettoken
COPY . /app
WORKDIR /app
RUN npm install
CMD ["node", "server.js"]   # runs as root (UID 0)
```

**(a) Dockerfile (Fixed):**
```dockerfile
# GOOD: pinned digest, build-time secret (not persisted), non-root, minimal runtime
FROM node:20.11.1-bookworm-slim@sha256:6e6b1e6f... AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci --no-optional
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12@sha256:abc123...
WORKDIR /app
COPY --from=build /app /app
USER 10001                  # non-root
CMD ["server.js"]
```

**(b) Pod — privileged, no securityContext (Vulnerable):**
```yaml
# DANGER: privileged, root, escalation allowed, all caps
apiVersion: v1
kind: Pod
metadata: { name: app }
spec:
  containers:
    - name: app
      image: myorg/app:latest
      securityContext:
        privileged: true
```

**(b) Pod (Fixed — hardened securityContext):**
```yaml
# GOOD: non-root, no privilege escalation, all caps dropped, read-only FS, seccomp
apiVersion: v1
kind: Pod
metadata: { name: app }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: app
      image: myorg/app@sha256:abc123...
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      resources:
        requests: { cpu: "100m", memory: "128Mi" }
        limits:   { cpu: "500m", memory: "256Mi" }
```

**(c) RBAC — cluster-admin binding (Vulnerable):**
```yaml
# DANGER: workload ServiceAccount gets full cluster control
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: app-admin }
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
subjects:
  - kind: ServiceAccount
    name: app
    namespace: prod
```

**(c) RBAC (Fixed — scoped Role/RoleBinding):**
```yaml
# GOOD: namespaced, explicit verbs/resources, no wildcards
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: app-reader, namespace: prod }
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: app-reader-binding, namespace: prod }
roleRef:
  kind: Role
  name: app-reader
  apiGroup: rbac.authorization.k8s.io
subjects:
  - kind: ServiceAccount
    name: app
    namespace: prod
```

**(d) Secret in env (Vulnerable):**
```yaml
# DANGER: plaintext secret in manifest + exposed via env / kubectl get -o yaml
env:
  - name: DB_PASSWORD
    value: "S3cr3tP@ss"
```

**(d) Secret (Fixed — secretKeyRef + encryption note):**
```yaml
# GOOD: reference a Secret object (ideally synced from an external manager)
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: password
# Note: enable etcd encryption-at-rest (EncryptionConfiguration) so the Secret
# is not stored plaintext; prefer External Secrets Operator / Vault for rotation.
```

**(e) Missing NetworkPolicy (Vulnerable):**
```yaml
# DANGER: no NetworkPolicy — every pod can reach every other pod/service
# (flat network; one compromise = cluster-wide lateral movement)
```

**(e) NetworkPolicy (Fixed — default-deny + explicit allow):**
```yaml
# GOOD: default-deny all ingress/egress in the namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: prod }
spec:
  podSelector: {}
  policyTypes: ["Ingress", "Egress"]
---
# Then explicitly allow api -> db on 5432 only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-api-to-db, namespace: prod }
spec:
  podSelector:
    matchLabels: { app: db }
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: api }
      ports:
        - protocol: TCP
          port: 5432
```

## Phase 7: Verification Checklist

- [ ] No container runs as root: `USER` non-root in image; `runAsNonRoot: true`, `runAsUser` >0
- [ ] No `privileged: true` anywhere (compose, run, or pod spec)
- [ ] No `/var/run/docker.sock` mount and no `hostPath` of sensitive paths (`/`, `/etc`, `/var`)
- [ ] No `hostNetwork`, `hostPID`, `hostIPC`, or compose `network_mode: host`
- [ ] All containers `drop: ["ALL"]` capabilities and add back only what's needed
- [ ] `allowPrivilegeEscalation: false` and `seccompProfile: RuntimeDefault` set
- [ ] `readOnlyRootFilesystem: true` where the workload allows it
- [ ] RBAC has no `cluster-admin` for workloads and no `*` verbs/resources/apiGroups
- [ ] Default-deny NetworkPolicy exists per namespace, with explicit allow rules
- [ ] No secrets in env `value:`, manifests, Helm values, or image layers; `secretKeyRef`/external manager used
- [ ] Encryption-at-rest enabled for etcd Secrets; exposed secrets rotated
- [ ] All images pinned by digest (no `:latest`) and scanned (Trivy/Grype) in CI
- [ ] Every pod sets `resources.requests` and `resources.limits`
- [ ] Admission control enforced: Pod Security Standards `restricted` and/or Kyverno/Gatekeeper policies
- [ ] hadolint, Checkov, and kube-bench run clean (or findings triaged) in the pipeline

## Quality Bar

1. Every container runs as a non-root user with no privilege escalation
2. No privileged containers, docker.sock mounts, or sensitive hostPath mounts
3. No host namespaces (network/PID/IPC) shared with the node
4. All capabilities dropped by default; seccomp profile applied
5. RBAC is least-privilege — no cluster-admin for workloads, no wildcards
6. Default-deny NetworkPolicy in place; lateral movement is contained
7. Secrets never in env/manifests/images; sourced from a manager and encrypted at rest
8. Images pinned by digest, scanned for CVEs, and ideally signed/verified
9. Resource requests and limits set on every workload
10. Admission control rejects non-compliant pods before they run

## Example Triggers

- "container security"
- "kubernetes security"
- "k8s hardening"
- "dockerfile security"
- "pod security"
- "RBAC audit"
- "privileged container"
- "network policy"

## Relationship to blueteam-defend

Extends **blueteam-defend's Security Misconfiguration / deployment layer**. Core doctrine: assume the container is breached and ask what it can reach — host, cluster, or secrets. Only flag CRITICAL when a setting grants container escape, cluster-admin, or secret exposure; defense-in-depth gaps with real compensating controls drop to HIGH or lower.
