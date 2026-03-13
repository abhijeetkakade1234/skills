---
name: redteam-attack
description: >
  Red-team any codebase, system design, API spec, architecture document, smart contract,
  or technical document to find exploits, attack vectors, and vulnerabilities — then produce
  prioritised fixes with solutions. Use this skill whenever the user says "red team this",
  "find exploits", "break this", "attack plan", "security review", "vulnerability analysis",
  "how would someone abuse this", "stress test this", "what are the weaknesses", "find bugs",
  "hack this", "pen test", or uploads any code/spec/architecture and wants it attacked.
  Also trigger when a user asks how their system could be gamed, abused, bypassed, or manipulated.
  Works for ALL system types: web apps, APIs, smart contracts, protocols, CLI tools, databases,
  mobile apps, AI systems, SaaS platforms, distributed systems — any code or design document.
  Always produce a downloadable .docx report with attacks + solutions.
---

# Universal Red Team Attack & Solution Skill

Produces a structured offensive security review of ANY system, code, or architecture doc.
Finds real exploits. Delivers prioritised fixes. Output = downloadable `.docx` report.

---

## Step 0 — Read the docx skill

Always read `/mnt/skills/public/docx/SKILL.md` before writing any generation code.
Follow its rules exactly: dual table widths, LevelFormat.BULLET, ShadingType.CLEAR, DXA units.

---

## Step 1 — Understand the System Type

First classify what was given, because attack categories differ by system:

| System Type        | Primary Attack Surfaces                                |
| ------------------ | ------------------------------------------------------ |
| Web App / API      | Auth, injection, IDOR, CSRF, rate limits, session      |
| Smart Contract     | Reentrancy, state machine, integer math, front-running |
| Database           | SQL injection, privilege escalation, data exposure     |
| CLI / Script       | Arg injection, path traversal, env variable abuse      |
| Mobile App         | Storage, deep links, cert pinning, intent abuse        |
| AI / ML System     | Prompt injection, data poisoning, model inversion      |
| Protocol / Spec    | Logic flaws, race conditions, replay, timing attacks   |
| SaaS / Platform    | Tenant isolation, billing abuse, permission escalation |
| Distributed System | Consistency bugs, partition abuse, Byzantine faults    |

Read the input carefully. Extract:

- **What does it do?** (core function)
- **Who are the actors?** (users, admins, services, anonymous)
- **Where does money / data / power flow?**
- **What are the trust assumptions?** (each one is an attack surface)
- **What are the time-dependent operations?** (race conditions live here)
- **What external systems does it touch?** (each = supply chain risk)

---

## Step 2 — Attack Category Framework

Always think across ALL these layers. Skip ones that don't apply.

### Layer 1 — Authentication & Authorisation

- Can an unauthenticated user access protected resources?
- Can a low-privilege user escalate to high-privilege?
- Are tokens/sessions predictable, reusable, or long-lived?
- Is there an admin backdoor or hardcoded credential?

### Layer 2 — Input Handling

- SQL / NoSQL / command / LDAP / XML injection
- Path traversal (`../../etc/passwd`)
- Deserialization of untrusted data
- Integer overflow / underflow on user-supplied numbers
- Regex DoS (ReDoS) on user-supplied patterns

### Layer 3 — Business Logic

- Can the order of operations be manipulated?
- Can a user skip steps in a multi-step flow?
- Can negative values, zero values, or MAX_INT be passed where not expected?
- Are there TOCTOU (time-of-check / time-of-use) windows?
- Can discounts, credits, or rewards be applied multiple times?

### Layer 4 — State & Concurrency

- Race conditions on shared state (two requests hitting same resource simultaneously)
- Is there a check-then-act pattern that can be broken by parallel requests?
- What happens on partial failure? Is state left inconsistent?

### Layer 5 — Data Exposure

- Are secrets, keys, or PII logged?
- Are internal stack traces exposed to users?
- Is sensitive data in URLs (logged by proxies)?
- Are error messages too verbose?

### Layer 6 — Denial of Service

- Can a single user exhaust resources (memory, CPU, DB connections)?
- Are there missing rate limits on expensive operations?
- Can large payloads or deeply nested structures cause stack overflows?

### Layer 7 — Supply Chain & Dependencies

- Are there known CVEs in dependencies?
- Are dependency versions pinned?
- Is there a typosquatting risk in package names?

### Layer 8 — Configuration & Deployment

- Debug mode / verbose errors in production?
- Open ports or services not needed?
- CORS policy too permissive?
- Sensitive config in environment variables that get logged?

### Layer 9 — Economic / Incentive Abuse (if applicable)

- Can rewards, rep, or credits be farmed?
- Can the same action be triggered multiple times for profit?
- Flash loan / capital-free attack vectors?

### Layer 10 — AI-Specific (if applicable)

- Prompt injection via user input passed to LLM
- Jailbreak via system prompt override
- Data exfiltration via carefully crafted prompts
- Model output used in dangerous downstream operations without sanitisation

---

## Step 3 — Severity Rating

Rate every finding using this rubric:

```
CRITICAL  →  Attacker can steal data/funds, take over accounts,
             or break core system integrity. Low effort required.

HIGH      →  Significant damage possible. Attacker profit > attacker cost.
             Requires some effort but realistic.

MEDIUM    →  Real vulnerability but limited blast radius,
             OR requires specific conditions / elevated access.

LOW       →  Theoretical. Hard to exploit in practice,
             or impact is minor.
```

Also rate **Fix Effort**: Low / Medium / High

---

## Step 4 — For Each Attack, Document

```
ID        →  A-01, A-02, etc.
Title     →  Short descriptive name
Severity  →  CRITICAL / HIGH / MEDIUM / LOW
Vector    →  Exactly how the attacker does it, step by step
Impact    →  What they gain or what breaks
Fix       →  Concrete solution, not vague advice
```

Fixes must be **specific and actionable**, not generic:

- BAD: "Validate all inputs"
- GOOD: "Add zod schema validation on the /api/transfer endpoint; reject any amount <= 0 or > user.balance"

---

## Step 5 — Report Structure

Build the `.docx` with this structure:

```
Cover Page
  → System name, "Red Team Report", date, CONFIDENTIAL

Section 0: Scope & Methodology
  → What was reviewed, attacker model, rating legend

Section 1–N: Attacks by Category
  → One section per applicable attack layer
  → Each finding as: heading + attackEntry table (vector / impact / fix)

Priority Matrix Table
  → All findings ranked: ID | Title | Severity | Fix Effort | Sprint

Immediate Fix Checklist
  → Just the CRITICAL + HIGH findings as bullet checklist
  → These are launch blockers
```

---

## Step 6 — Code Pattern for docx Generation

Use this `attackEntry()` helper pattern (adapt to docx SKILL patterns):

```javascript
function attackEntry(id, title, severity, vector, impact, fix) {
  const sevColors = {
    CRITICAL: "C0392B",
    HIGH: "E67E22",
    MEDIUM: "F39C12",
    LOW: "27AE60",
  };
  const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
  const borders = { top: border, bottom: border, left: border, right: border };

  return [
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({
          text: `${id} — ${title}`,
          bold: true,
          size: 26,
          font: "Arial",
          color: "1A1A2E",
        }),
        new TextRun({
          text: ` [${severity}]`,
          bold: true,
          size: 22,
          font: "Arial",
          color: sevColors[severity],
        }),
      ],
    }),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2400, 6960],
      rows: [
        ["Attack Vector", vector],
        ["Impact", impact],
        ["Fix / Solution", fix],
      ].map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({
                borders,
                width: { size: 2400, type: WidthType.DXA },
                shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: label,
                        bold: true,
                        size: 20,
                        font: "Arial",
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                borders,
                width: { size: 6960, type: WidthType.DXA },
                shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: value, size: 20, font: "Arial" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
      ),
    }),
  ];
}
```

---

## Quality Bar

A good red team report must:

- Have **at least 8 findings** (if fewer, look harder)
- Cover **at least 3 different attack layers**
- Have **zero vague fixes** — every fix is a concrete code/config change
- Include a **priority matrix** so the dev knows what to fix first
- Flag **launch blockers** explicitly (CRITICAL + HIGH, low fix effort)

---

## Example Trigger Phrases

- "red team my API"
- "find exploits in this smart contract"
- "what are the vulnerabilities in this architecture"
- "how would someone hack this"
- "security review of my app"
- "stress test this design"
- "what can go wrong with this code"
- "pen test this"
- "break this system"
- "attack plan for my project"
