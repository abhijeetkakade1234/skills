---
name: iam-privilege-escalation-audit
description: Audit cloud IAM for privilege-escalation paths — overly permissive policies that let a low-privilege identity become admin across AWS, GCP, and Azure (plus Kubernetes RBAC at a high level). Covers wildcard actions/resources (Action/Resource "*"), iam:PassRole + service abuse (Lambda/EC2/Glue/CloudFormation), policy/version manipulation (CreatePolicyVersion/SetDefaultPolicyVersion/AttachUserPolicy/PutUserPolicy), AssumeRole/trust-policy weaknesses (Principal AWS:*, missing ExternalId), credential privesc (CreateAccessKey/UpdateLoginProfile/UpdateAssumeRolePolicy), GCP iam.serviceAccounts.actAs/serviceAccountUser/setIamPolicy/serviceAccountKeys.create, Azure Microsoft.Authorization/roleAssignments/write (grant self Owner) and Contributor abuse, and overly broad managed policies. Use when reviewing IAM policies, Terraform IAM, trust/assume-role policies, GCP/Azure role bindings, "shadow admin" permissions, or least-privilege posture. CRITICAL: Only flag CRITICAL when a reachable identity can actually escalate to admin or access other tenants'/users' data. Theoretical paths that require already being admin (or an unreachable principal) = LOWER severity.
---

# IAM Privilege-Escalation Auditing — Cloud Identity & Policy Hardening

Detect overly permissive cloud IAM that lets a low-privilege identity escalate to admin: wildcard policies, PassRole/actAs abuse, policy-version and attachment manipulation, credential injection, weak trust policies, and self-granted role assignments — across AWS, GCP, Azure, and (briefly) Kubernetes RBAC.

**Default workflow:** Inventory identities & policies → map escalation paths (who can become admin or reach others' data) → triage by reachability → fix least-privilege first → verify with Access Analyzer/Prowler.

## Core Doctrine: Effective Permissions, Not Stated Intent

| Permission / Path | How It Escalates | Real Consequence | Severity | Proper Fix |
|---|---|---|---|---|
| `Action: "*"` / `Resource: "*"` | Identity can call any API on any resource | Full account/project admin | CRITICAL (if reachable) | Enumerate needed actions; scope to specific ARNs |
| `iam:PassRole` + `lambda:CreateFunction`/`ec2:RunInstances`/`glue:CreateDevEndpoint` | Pass a privileged role to a compute service you control, run code as that role | Become the admin role | CRITICAL | Scope PassRole to one role ARN + `iam:PassedToService` condition |
| `iam:CreatePolicyVersion` / `iam:SetDefaultPolicyVersion` | Add an admin statement as a new default version of an attached policy | Silent self-grant of `*:*` | CRITICAL | Remove these perms; manage policy versions out-of-band |
| `iam:AttachUserPolicy` / `iam:PutUserPolicy` | Attach `AdministratorAccess` (or inline `*:*`) to self | Instant admin | CRITICAL | Deny self-attach; use permission boundaries |
| `iam:CreateAccessKey` (for another user) | Mint long-lived keys for a more-privileged user | Impersonate any user incl. admin | CRITICAL | Scope to `${aws:username}`'s own user; alert on key creation |
| `iam:UpdateLoginProfile` / `iam:UpdateAssumeRolePolicy` | Set/reset console password of admin user, or rewrite a role's trust to allow self | Hijack admin / assume any role | CRITICAL | Remove; restrict trust edits to security team |
| `sts:AssumeRole` with broad trust (`Principal AWS:*`, missing ExternalId) | Any account/identity assumes the role | Cross-account takeover / confused deputy | CRITICAL (if principal external) | Specific principal ARNs + ExternalId/conditions |
| GCP `iam.serviceAccounts.actAs` / `serviceAccountUser` (+ deploy) | Run a job/function as a privileged service account | Inherit SA's project roles | CRITICAL | Grant `actAs` on one SA only; avoid Editor-bearing SAs |
| GCP `resourcemanager.projects.setIamPolicy` / `serviceAccountKeys.create` | Add self as `roles/owner`; or export SA key and impersonate | Project owner / SA takeover | CRITICAL | Remove `setIamPolicy`; disable user-managed SA keys |
| Azure `Microsoft.Authorization/roleAssignments/write` | Assign self the `Owner` role at sub/RG scope | Subscription admin | CRITICAL | Remove from non-PIM identities; use least-priv built-in roles |
| Azure `Contributor` (+ managed identity / deployment) | Deploy a VM/Automation with a privileged managed identity, run as it | Escalate beyond Contributor | HIGH→CRITICAL | Scope Contributor tightly; avoid privileged MIs on compute |

## Operating Principles

1. **Least privilege, no wildcards.** `Action: "*"`, `Resource: "*"`, and `iam:*`/`s3:*` are admin-equivalent in practice. Grant only the specific actions and resource ARNs a workload actually uses.
2. **Beware "shadow admin" permissions.** PassRole, policy edits (CreatePolicyVersion/AttachUserPolicy/PutUserPolicy), key creation (CreateAccessKey), login-profile/trust edits, GCP `actAs`/`setIamPolicy`, and Azure `roleAssignments/write` are all **admin-equivalent** even without `*:*`. Treat them as privileged.
3. **Scope resources and add conditions.** Pin actions to specific ARNs/projects/scopes. Add conditions (`aws:ResourceTag`, `aws:PrincipalTag`, `aws:SourceIp`, `iam:PassedToService`, GCP IAM conditions, Azure conditions) to narrow blast radius.
4. **Tight trust policies.** Role trust (`AssumeRolePolicyDocument`) must name specific principals — never `Principal: {"AWS": "*"}`. For third parties/cross-account, require `sts:ExternalId` and/or source-account conditions to prevent the confused-deputy problem.
5. **Separate human vs workload identities.** Humans → SSO/federation with MFA. Workloads → roles/OIDC/workload identity, never shared user keys. Don't grant workloads human-style broad managed policies.
6. **No long-lived keys where avoidable.** Prefer IAM roles, IRSA/OIDC, GCP Workload Identity Federation, and Azure managed identities over static access keys / SA keys. Long-lived credentials are the #1 lateral-movement enabler.
7. **Monitor with access analysis.** Run IAM Access Analyzer (external access + unused access), Prowler, ScoutSuite, PMapper/Cloudsplaining continuously — not once. Effective-permission drift is invisible without it.
8. **Deny by default.** Use SCPs / permission boundaries / GCP org policies / Azure deny assignments to make escalation impossible even if a policy is misconfigured. Explicit `Deny` beats hoping every `Allow` is scoped.

## Phase 1: Detection Strategy

**What to look for:**

1. **Wildcard actions / resources**
   - Patterns: `"Action": "*"`, `"Action": "iam:*"`, `"Action": "s3:*"`, `"Resource": "*"`, `NotAction`/`NotResource` allow-lists
   - Attack: Identity calls any API; effectively admin
   - Fix: Enumerate required actions; scope `Resource` to explicit ARNs

2. **PassRole + compute privesc**
   - Patterns: `iam:PassRole` with `Resource: "*"` alongside `lambda:CreateFunction`+`lambda:InvokeFunction`, `ec2:RunInstances`, `glue:CreateDevEndpoint`, `cloudformation:CreateStack`, `datapipeline:*`, `sagemaker:CreateNotebookInstance`
   - Attack: Pass a privileged role to a service you control, execute code as that role
   - Fix: Scope PassRole to one role ARN + `iam:PassedToService` condition limiting the receiving service

3. **Policy version / attachment privesc**
   - Patterns: `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:AttachUserPolicy`/`AttachGroupPolicy`/`AttachRolePolicy`, `iam:PutUserPolicy`/`PutGroupPolicy`/`PutRolePolicy`, `iam:CreatePolicy`
   - Attack: Add an admin statement as a new default policy version, or attach `AdministratorAccess` to self
   - Fix: Remove these from non-admins; enforce permission boundaries so attached policies can't exceed the boundary

4. **Credential / login-profile privesc**
   - Patterns: `iam:CreateAccessKey`, `iam:CreateLoginProfile`, `iam:UpdateLoginProfile`, `iam:UpdateAssumeRolePolicy`, `iam:AddUserToGroup`, `iam:CreateServiceSpecificCredential`
   - Attack: Mint keys / set a password for a privileged user, or rewrite a role's trust to add yourself
   - Fix: Restrict to the principal's own user (`${aws:username}` condition); never allow trust edits for non-security identities

5. **Trust-policy / AssumeRole weakness**
   - Patterns: `sts:AssumeRole` with `Principal: {"AWS": "*"}`, account-root principals without conditions, missing `sts:ExternalId`, `Principal: {"Service": "*"}`, public OIDC `aud`/`sub` not pinned
   - Attack: Any external principal assumes the role (cross-account takeover / confused deputy)
   - Fix: Specific principal ARNs; require `ExternalId` and source-account/`aws:PrincipalOrgID` conditions; pin OIDC `sub`/`aud`

6. **GCP actAs / setIamPolicy / key creation**
   - Patterns: `roles/iam.serviceAccountUser`, `roles/iam.serviceAccountTokenCreator`, `iam.serviceAccounts.actAs`, `resourcemanager.projects.setIamPolicy`, `iam.serviceAccountKeys.create`, `roles/owner`, `roles/editor` bindings
   - Attack: Impersonate/deploy as a privileged SA, self-add as Owner, or export an SA key
   - Fix: Grant `actAs` on a single SA; remove `setIamPolicy`; disable user-managed SA keys via org policy; replace Owner/Editor with granular roles

7. **Azure roleAssignment write & Owner/Contributor abuse**
   - Patterns: `Microsoft.Authorization/roleAssignments/write`, `Microsoft.Authorization/*`, `Owner`/`Contributor`/`User Access Administrator` assignments, `*` action in custom role definitions, scope at subscription/management-group level
   - Attack: Grant self `Owner`; or use Contributor to deploy compute with a privileged managed identity and run as it
   - Fix: Remove `roleAssignments/write` from non-PIM identities; scope built-in least-priv roles to RG, not subscription; require PIM/just-in-time

8. **Broad managed policies & unused permissions**
   - Patterns: AWS `AdministratorAccess`, `PowerUserAccess`, `IAMFullAccess` attached to humans/workloads; GCP `roles/owner`/`roles/editor`; Azure `Owner`/`Contributor`; permissions granted but never used (per Access Analyzer)
   - Attack: Over-grant becomes the escalation primitive even without a named privesc API
   - Fix: Replace with scoped custom policies/roles; remove unused permissions (right-size from Access Analyzer last-accessed data)

## Phase 2: Grep Leads

Search policy artifacts (JSON, Terraform, IaC, CLI scripts) — not source languages.

### AWS IAM Policy JSON
Pattern: `"Action"\s*:\s*"\*"` (wildcard action — admin)
Pattern: `"Resource"\s*:\s*"\*"` (wildcard resource — pair with broad actions)
Pattern: `"iam:\*"|"s3:\*"|"ec2:\*"` (service-wide wildcard, often admin-equivalent)
Pattern: `"iam:PassRole"` (check `Resource` scope + presence of `iam:PassedToService` condition)
Pattern: `"iam:CreatePolicyVersion"|"iam:SetDefaultPolicyVersion"|"iam:AttachUserPolicy"|"iam:PutUserPolicy"` (shadow-admin policy edits)
Pattern: `"iam:CreateAccessKey"|"iam:UpdateLoginProfile"|"iam:CreateLoginProfile"|"iam:UpdateAssumeRolePolicy"` (credential/trust privesc)
Pattern: `"sts:AssumeRole"` (then inspect trust target)
Pattern: `"Principal"\s*:\s*\{\s*"AWS"\s*:\s*"\*"` (world-open trust — CRITICAL)
Pattern: `"Effect"\s*:\s*"Allow"` adjacent to admin actions / `NotAction` (allow-by-exclusion is a red flag)
Pattern: `arn:aws:iam::aws:policy/AdministratorAccess|PowerUserAccess|IAMFullAccess` (broad managed policy attachment)

### Terraform / IaC
Pattern: `aws_iam_policy_document` blocks with `actions\s*=\s*\["\*"\]` or `resources\s*=\s*\["\*"\]`
Pattern: `aws_iam_role` `assume_role_policy` referencing `identifiers = ["*"]` or bare account root without `condition`
Pattern: `aws_iam_role_policy_attachment` `policy_arn = ".*AdministratorAccess"`
Pattern: `google_project_iam_member|google_project_iam_binding` with `role = "roles/owner"|"roles/editor"|"roles/iam.serviceAccountUser"|"roles/iam.serviceAccountTokenCreator"`
Pattern: `google_service_account_key` (user-managed key creation — prefer WIF)
Pattern: `azurerm_role_assignment` `role_definition_name = "Owner"|"Contributor"|"User Access Administrator"` (check `scope`)
Pattern: `azurerm_role_definition` `actions = ["*"]` or `"Microsoft.Authorization/*"` (custom role too broad)

### gcloud / az CLI bindings
Pattern: `gcloud .* add-iam-policy-binding .* --role=roles/owner|roles/editor|roles/iam.serviceAccountUser`
Pattern: `gcloud iam service-accounts keys create` (long-lived SA key export)
Pattern: `az role assignment create .* --role "Owner"|"Contributor"|"User Access Administrator"`
Pattern: `--scope .*/subscriptions/[^/]+$` (assignment at whole-subscription scope)

### Kubernetes RBAC (high level — cross-ref container skill)
Pattern: `roleRef:\s*\n\s*kind: ClusterRole\s*\n\s*name: cluster-admin` (cluster-admin binding)
Pattern: `verbs:.*"\*"` with `resources:.*"\*"` (wildcard RBAC ≈ cluster admin)
Pattern: `resources:.*"secrets"` + broad `get`/`list` (token theft → escalation)
> Deep K8s RBAC escalation (serviceaccount token abuse, `bind`/`escalate` verbs, pod-exec) lives in the **container security skill** — cross-reference rather than duplicate.

### Tooling (run these, don't rely on grep alone)
- **AWS IAM Access Analyzer** — external-access findings + **unused access** (right-size from last-accessed).
- **Prowler** / **ScoutSuite** — broad multi-cloud misconfig + IAM checks.
- **PMapper** / **Cloudsplaining** — graph and rank actual privesc paths from a given principal to admin.
- **Steampipe** — SQL-query IAM across accounts to find wildcard/PassRole/shadow-admin grants at scale.

## Phase 3: Triage

| Issue | Reachable identity can escalate? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| `Action:*`/`Resource:*` on a human/workload identity | YES | CRITICAL | Yes | Medium |
| `iam:PassRole Resource:*` + `lambda:CreateFunction` | YES | CRITICAL | Yes | Low |
| `iam:CreatePolicyVersion` on attached policy | YES | CRITICAL | Yes | Low |
| `iam:CreateAccessKey` for other users | YES | CRITICAL | Yes | Low |
| Trust policy `Principal AWS:*` (external) | YES | CRITICAL | Yes | Low |
| Trust policy broad but principal is same-account & already admin | NO | LOW | No | N/A (no new privilege) |
| GCP `roles/owner` bound to a service account used by a function | YES | CRITICAL | Yes | Medium |
| GCP `actAs` on an Editor-bearing SA | YES | CRITICAL | Yes | Medium |
| Azure `roleAssignments/write` on a Contributor identity | YES | CRITICAL | Yes | Low |
| `AdministratorAccess` attached, but only assumable by break-glass MFA admins | NO | LOW | No | N/A (already admin) |
| Wildcard action but resource gated by tight `Condition` (e.g. specific tag) | Partial | MEDIUM | Limited | Low |
| Unused broad permission (Access Analyzer: never accessed) | NO (yet) | MEDIUM | Latent | Low |

> Severity hinges on **reachability**: a privesc primitive granted to a principal a low-priv attacker can actually reach (user, assumable role, workload identity, public OIDC) is CRITICAL. A path that requires already being admin, or a principal nobody can assume, is LOW.

## Phase 4: Ponytail Fix Ladder

1. **Remove unused / over-broad permissions (least privilege first).**
   - Use Access Analyzer last-accessed / unused-access findings. If a permission was never used, delete it.
   - If an identity or policy shouldn't exist → remove it entirely.

2. **Replace wildcards with specific actions + resources.**
   - `Action: "*"` → enumerated actions; `Resource: "*"` → explicit ARNs/project/scope.
   - Split read vs write; grant the minimum verb set the workload calls.

3. **Add conditions / scoping.**
   - `aws:ResourceTag`/`aws:PrincipalTag`, `aws:SourceIp`/`aws:SourceVpc`, `iam:PassedToService`, `sts:ExternalId`, GCP IAM conditions, Azure conditions.
   - Narrow even necessary permissions to the exact context they're used in.

4. **Tighten trust policies & kill long-lived keys.**
   - Trust → specific principal ARNs + ExternalId/source-account conditions.
   - Replace static access keys / SA keys with roles, OIDC (IRSA/GitHub OIDC), GCP Workload Identity Federation, Azure managed identities.

5. **Permission boundaries / SCP / org-policy guardrails.**
   - AWS permission boundaries cap what created principals can do; SCPs deny org-wide (e.g. deny `iam:CreatePolicyVersion`, deny `*` outside approved regions).
   - GCP org policies (disable SA key creation, restrict `setIamPolicy`); Azure deny assignments / Azure Policy.

6. **Continuous analysis + alerts.**
   - Schedule Access Analyzer / Prowler / PMapper in CI and on a cadence.
   - Alert (CloudTrail/EventBridge, GCP audit logs, Azure Activity Log) on `CreateAccessKey`, `AttachUserPolicy`, `CreatePolicyVersion`, `roleAssignments/write`, `setIamPolicy`, trust-policy edits.

## Phase 5: Record Format

```
ID: IAM-001
Title: iam:PassRole with Resource:* + lambda:CreateFunction enables admin escalation
Severity: CRITICAL
Cloud: AWS
Location: terraform/iam/ci-deploy-policy.json:14
Identity: role/ci-deployer (assumable via GitHub OIDC — externally reachable)
Vector: Attacker creates a Lambda, passes the privileged "ops-admin" role to it, invokes it, runs arbitrary API calls as ops-admin
Escalation target: ops-admin (AdministratorAccess)
Reachable: YES (CI principal reachable via OIDC; ops-admin is more privileged)
Impact: Full account compromise from a low-privilege CI identity
Evidence: Statement allows iam:PassRole on "*" with lambda:CreateFunction + lambda:InvokeFunction, no iam:PassedToService condition
Confidence: 95%
Fix: Scope PassRole to arn:aws:iam::ACCT:role/lambda-exec only + Condition iam:PassedToService = lambda.amazonaws.com
```

## Phase 6: Vulnerable → Fixed Examples

**(a) Wildcard policy (Vulnerable):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }]
}
```

**(a) Scoped actions + ARNs (Fixed):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::app-uploads-prod/*"
  }]
}
```

**(b) iam:PassRole with Resource:* (Vulnerable):**
```json
{
  "Effect": "Allow",
  "Action": ["iam:PassRole", "lambda:CreateFunction", "lambda:InvokeFunction"],
  "Resource": "*"
}
```

**(b) PassRole limited to one role + service condition (Fixed):**
```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::123456789012:role/lambda-exec",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" }
  }
}
```

**(c) Over-broad AssumeRole trust (Vulnerable):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "*" },
    "Action": "sts:AssumeRole"
  }]
}
```

**(c) Specific principal + ExternalId (Fixed):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::999999999999:role/partner-integration" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "a1b2c3-unique-per-tenant" }
    }
  }]
}
```

**(d) GCP roles/owner binding (Vulnerable):**
```hcl
resource "google_project_iam_member" "app_sa" {
  project = "prod-1234"
  role    = "roles/owner"   # DANGER: SA used by a Cloud Function is project owner
  member  = "serviceAccount:app@prod-1234.iam.gserviceaccount.com"
}
```

**(d) Granular predefined role (Fixed):**
```hcl
resource "google_project_iam_member" "app_sa" {
  project = "prod-1234"
  role    = "roles/storage.objectAdmin"   # only what the workload needs
  member  = "serviceAccount:app@prod-1234.iam.gserviceaccount.com"
}
```

**(e) Azure Owner role assignment (Vulnerable):**
```hcl
resource "azurerm_role_assignment" "app" {
  scope                = "/subscriptions/00000000-0000-0000-0000-000000000000"
  role_definition_name = "Owner"   # DANGER: subscription-wide Owner
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}
```

**(e) Least-priv built-in role, scoped to RG (Fixed):**
```hcl
resource "azurerm_role_assignment" "app" {
  scope                = azurerm_resource_group.app.id   # RG, not subscription
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}
```

## Phase 7: Verification Checklist

- [ ] No `Action: "*"` or `Resource: "*"` on any reachable human/workload identity
- [ ] No service-wide wildcards (`iam:*`, `s3:*`, `ec2:*`) unless justified and bounded
- [ ] `iam:PassRole` scoped to specific role ARNs + `iam:PassedToService` condition
- [ ] No shadow-admin perms (`CreatePolicyVersion`, `AttachUserPolicy`, `PutUserPolicy`, `CreateAccessKey`, `UpdateLoginProfile`, `UpdateAssumeRolePolicy`) on non-admin identities
- [ ] All role trust policies name specific principals — no `Principal: {"AWS": "*"}`
- [ ] Cross-account/third-party trust requires `sts:ExternalId` and/or `aws:PrincipalOrgID`/source-account
- [ ] OIDC trust pins `sub`/`aud` (no wildcard repo/branch in GitHub OIDC subjects)
- [ ] No long-lived access keys / SA keys where roles/OIDC/workload identity are possible
- [ ] GCP: no `roles/owner`/`roles/editor` on workload SAs; `actAs` scoped to one SA; user-managed SA keys disabled by org policy
- [ ] Azure: no `Microsoft.Authorization/roleAssignments/write` on non-PIM identities; Owner/Contributor scoped to RG, not subscription
- [ ] Permission boundaries / SCPs / GCP org policies / Azure deny assignments in place as guardrails
- [ ] IAM Access Analyzer (external + unused) clean; Prowler/PMapper/Cloudsplaining show no privesc path to admin
- [ ] Alerting configured on credential, policy-edit, trust-edit, and role-assignment events

## Quality Bar

1. Every privesc finding states the **reachable identity**, the **escalation target**, and **why it's reachable**
2. No wildcard actions or resources on reachable identities
3. PassRole/actAs scoped to a single role/SA with a service/condition constraint
4. No shadow-admin permissions on non-admin identities
5. All trust/assume-role policies use specific principals + conditions (ExternalId where cross-account)
6. Long-lived keys replaced with roles/OIDC/workload identity wherever feasible
7. Broad managed policies (AdministratorAccess/PowerUser/Owner/Editor) justified or replaced with scoped roles
8. Guardrails (permission boundary/SCP/org policy/deny assignment) prevent escalation even on misconfig
9. Severity reflects exploitability: already-admin or unreachable paths = LOW, not CRITICAL
10. Findings verified with at least one tool (Access Analyzer/Prowler/PMapper), not grep alone

## Example Triggers

- "IAM audit"
- "privilege escalation"
- "cloud IAM"
- "overly permissive policy"
- "PassRole"
- "least privilege"
- "AssumeRole"
- "role assignment"

## Relationship to blueteam-defend

Covers **Broken Access Control at the cloud/infrastructure layer** — overly permissive IAM identities and the escalation paths they enable. Core doctrine: effective permissions, not stated intent; only flag CRITICAL when a reachable identity can actually escalate to admin or reach others' data. For **application-layer** authorization (IDOR/BOLA/BFLA), cross-reference the **access-control-auditing** skill. For **Kubernetes RBAC** escalation (serviceaccount token abuse, `bind`/`escalate` verbs, pod-exec), cross-reference the **container security** skill.
