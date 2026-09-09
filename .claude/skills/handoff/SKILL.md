---
name: handoff
description: Write or update a handoff document so a new session can reconstruct context efficiently, prune it of everything that no longer earns its place, and emit a copy-pasteable prompt for the next session. Use when ending a session, switching context, or when an effort spans multiple sessions.
---

Produce a handoff a *fresh* session can act on: a document that reconstructs context efficiently,
and a short prompt that points at it.

The document is the deliverable. The prompt is a pointer plus the few things that would be
dangerous or wasteful to discover late.

`$ARGUMENTS` may name the target document. If absent, find or create it (step 2).

---

## The rule that governs everything here

**A handoff doc is read once, by someone with no memory, who will act on it.** Every stale line
costs more than a missing one — a fresh agent cannot tell which lines are current. So:

- **Verify from the repo, not from conversation memory.** You will misremember. Run `git log`,
  `git status`, `git diff`; read the file. This is not optional — a wrong "this regressed" claim
  sends the next session to fix something that was deliberate.
- Label claims **Proven** or **Hypothesis** (per `CLAUDE.md` if the project defines it). Never let
  a hypothesis read as settled.
- **Accurate and sparse beats comprehensive and stale.**

---

## Steps

### 1. Establish what is actually true

Do this before writing anything.

```bash
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1   # upstream? sometimes none
git log @{u}..HEAD --oneline 2>/dev/null || git log --oneline -20   # commits not yet pushed
git status --short
```

For every uncommitted tracked file: **look at the diff and work out whether it is yours.**
Pre-existing local modifications that predate the effort must be reported as such, not as
regressions to fix. If a prior commit deliberately left something dirty, say so and say why.

If the repo has a large untracked working tree (build output, data, scratch scripts), filter it —
`git status --short | grep -v '^??'` — and report only tracked changes plus untracked files the
effort actually created.

### 2. Find or create the document

Look for an existing handoff or plan doc before creating one — updating beats proliferating.
A multi-session effort often wants two files:

| File | Role |
|---|---|
| `<effort>-handoff.md` | "How do I resume" — the doc this skill maintains |
| `<effort>-plan.md` | Phase history, findings, detailed plan |

Keep the split if it exists. Cross-link them; do not duplicate content between them. Put them
wherever the project keeps working docs (e.g. a `docs/` or `.claude/` directory).

### 3. Write the document

Use this structure. Drop sections that do not apply; do not invent content to fill them.

```markdown
# <Effort> — session handoff

**Read this first, then <detailed-plan>.** This file is the "how do I resume" doc.

**Date:** <YYYY-MM-DD> (session N)
**Status:** <one line: what state the work is in>

## Where things stand in one paragraph
<What exists, what works, what is proven. Then the CURRENT GOAL, stated plainly —
especially if it changed. Point at the section to read before planning work.>

## What changed in session N
> Next agent: when you add your own section here, fold anything still a live constraint
> into "Standing decisions" or "Findings" and delete the rest.
<Numbered, short. Findings, not narrative.>

## Standing decisions
<Facts from earlier sessions still in force. This is where prior sessions' changelogs
go to be compressed. Each entry: the decision and why it holds.>

## Findings / traps worth knowing
<Things that cost real time to discover. Non-obvious behaviour, replicated defects,
constraints that look wrong but are deliberate.>

## Commits
<Substantive commits only. Say that doc-only commits are omitted. Record push state,
whether the branch has an upstream, and any branch needing owner sign-off before merge.>

## Resuming from a clean checkout
<Exact commands: install, build, run, the fast test/check and its expected result.
Note what is already present on this machine so it is not rebuilt needlessly.>

## The artifacts and what each is for
| Path | Role |
<One row per file the next session will touch. Role, not description.>

## Next step
<Ranked options, A/B/C. For each: what it is and why it is or is not next.
Strike through superseded options AND GIVE THE REASON — otherwise the next
session re-derives them.>

## Known open questions
<What is unverified, unexercised, or uncertain. Be explicit that these are gaps.>
```

If the effort touches a second repo, record its branch, its base ref, and whether its owners have
signed off — that is easy to lose and expensive to rediscover.

### 4. Prune — the part most often skipped

Read the whole document as if you had never seen it. Remove:

| Remove | Because |
|---|---|
| Sentences true for one session, phrased as standing facts | e.g. "no changes were needed this session" reads as permanent |
| Per-session changelogs older than the current one | Fold live constraints into Standing decisions; delete the narrative |
| The same point stated in 2–3 places | Keep one canonical statement; others become pointers |
| Doc-only / trivial commits in the commits table | Noise in an orientation table; `git log` has them |
| Structure an agent can read from the code | Directory listings, obvious call sequences |
| Anything likely wrong within a sprint | Volatile detail belongs in code, not docs |

**Do not delete a superseded goal — strike it through and give the reason.** Deleting it means the
next session re-derives it and wastes the same time. This is the single highest-value pruning rule.

### 5. Emit the next-session prompt

Print it in a fenced block, ready to copy. Keep it short — the document carries the detail. Include
only:

1. **Read order**, with a note not to preload large or binary context (data files, big generated
   sources).
2. **Branch**, and any constraint on it (no upstream, never work on the default branch directly,
   needs sign-off).
3. **Goal**, including what is explicitly *not* the goal if that changed.
4. **First task**, concrete enough to start on.
5. **Traps** — put anything actively dangerous (destructive git operation, a file that must not be
   staged, an unsafe call) FIRST. A fresh agent reaches for the plausible-looking thing.
6. **Setup**, pointing at the document's resume section, noting what already exists locally.

If the work is genuinely simple, "read `<doc>` and continue" is a complete prompt. Do not pad it.

### 6. Offer to commit

Prefer committing by **explicit path** over `git add -A` when the working tree contains generated
files, data, or scratch that should not be staged. Follow the project's branch and commit-message
conventions (per `CLAUDE.md` if defined). Report anything left uncommitted and whose it is.

---

## Constraints

- Never state a repo fact you have not just verified in this session.
- Never write a per-session changelog without also compressing the previous one.
- Never delete a superseded decision silently.
- Never pad the next-session prompt to look thorough; it competes for attention with the document.
- The document is for a reader with no memory of the conversation. Anything that only makes sense
  to someone who was here does not belong in it.
