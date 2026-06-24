# Container & Kubernetes — Vulnerable → Fixed Examples

Reference companion to the skill's Phase 6. Full per-language vulnerable→fixed code & YAML pairs for the container/Kubernetes security audit.

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
