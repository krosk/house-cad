---
name: handoff
description: Bring handoff.md up to date at the end of a session and print the prompt for the successor session. Use when wrapping up work, when asked to "write the handoff", or before a session restart. Enforces the file's own rules -- outstanding work only, newest first, no perishable facts -- and ends by printing the paste-able successor prompt.
allowed-tools: Bash(git *) Bash(npm *) Bash(grep *) Read Edit Write
argument-hint: (none) | check | print
---

## Task

If `$ARGUMENTS` is `check`, run the **Audit flow** and change nothing.
If `$ARGUMENTS` is `print`, skip to **Print the successor prompt**.
Otherwise run the **Update flow**, then print.

`handoff.md` (at `.claude/handoff.md`) is the only file in the repo whose job is
what is NOT done. Every edit either adds an outstanding item, closes one, or
corrects something that has gone stale. If an edit does none of those, it belongs
somewhere else -- CLAUDE.md for durable architecture, a commit message for
finished work.

---

## What the file is for

Three rules, stated in the file itself and broken most often by good intentions:

- **Newest section first.**
- **A section with nothing OUTSTANDING in it belongs in CLAUDE.md, not here.**
  Move the durable part, then delete the section.
- **Finished work is recorded in commit messages and CLAUDE.md.** Never restate
  it here, and never re-derive it from here.

The failure this file exists to prevent is a successor acting on something that
was true when it was written. That makes accuracy about the MACHINE more
important than completeness about the WORK.

---

## Update flow

### 1. Establish what changed

```
git log --oneline <last-handoff-commit>..HEAD
git status --short
```

Read the commit messages rather than the diffs. They are the record of finished
work, which is exactly what must NOT be copied into the handoff -- what you are
looking for is the residue each commit left behind: a question it raised, a
ruling it now depends on, a thing it deliberately did not do.

If any non-markdown file changed this session, run `npm run build` and confirm it
is clean. That is the whole verification gate here -- there is no test suite,
linter, or type checker -- so a green build means imports/syntax are sound and
nothing more; runtime, canvas-rendering, and touch/controller behaviour are still
unverified until the user exercises them.

### 2. Close what closed

For every item in the file, decide: still outstanding, or done?

- **Done** -- delete it. Do not leave it with a "CLOSED" marker and a paragraph
  of history; that is what the commit message is for. The one exception is when
  the closing itself carries a constraint the next session must respect (for
  example a ruling that holds only while some other decision holds) -- keep that
  sentence, drop the rest.
- **Closed elsewhere** -- when a ruling lands, grep the whole repo for the claim
  it answers, not just the file you are editing. A note that says "still open"
  about something already decided costs a second decision on a settled question.
- **Renumber** any list you shortened, so item 1 is item 1.

### 3. Correct what went stale

Hunt these specifically. They are the edits nobody thinks to make:

- **Perishable facts stated as durable ones.** Never record a pid, "the dev
  server is currently running", or a port's state. Record how to CHECK it and how
  to RESTART it (`npm run dev`, then the printed Network URL). A pid has a
  half-life of hours; this file is read for days.
- **Diagnostics that do not diagnose.** If a check was tried this session and
  turned out to prove nothing, say so by name. A plausible-looking wrong test is
  worse than no test, because the next session will trust it. Retracting one is a
  normal edit here, not an embarrassment.
- **Inference presented as fact.** If something was concluded rather than
  observed, mark it: "I am assuming X because Y". The handoff is where this is
  most costly to skip.

### 4. Write the new section

Replace the existing `## Start here (YYYY-MM-DD)` section with the current date
and what a successor needs before acting; never accumulate multiple Start here
sections. Keep the remaining sections grouped by WHO can close the item: the
user's device/visual QA judgements (touch, Quest, phone, extrusion correctness),
agent-owned engineering, and tooling/deploy. Put each new item under its real
owner; an item filed under the wrong owner waits forever.

Prose, not bullets, wherever the reason matters more than the fact. This file is
read start to finish by whoever picks the project up, and a list of assertions
does not survive that reading as well as sentences that say why.

### 5. Check the invariants before committing

- No pids, no "currently running", no port states asserted as fact.
- No section without an outstanding item in it.
- Every date absolute, never "yesterday" or "last session".
- The session-start prompt at the top still matches how the project actually
  works -- if a recovery path (build, deploy, or run) changed this session, it
  changed there too.

Commit the handoff with author `Alexis He <ahe.krosk@gmail.com>`. `.claude/` is
gitignored, so stage with `git add -f .claude/handoff.md`. A markdown-only commit
needs no build; if any non-markdown file rides along, build first.

---

## Audit flow

Same checks, no edits. Report, in this order: sections with nothing outstanding
left in them, perishable facts stated as durable, items whose owner looks wrong,
and any note contradicted by a ruling elsewhere in the repo. Do not fix them --
`check` exists so the author can see the drift before deciding what to do about
it.

---

## Print the successor prompt

End every run by printing a fenced block the author can paste into the next
session. It is two parts and no more:

```
Read .claude/handoff.md, starting with the session-start prompt at the top, and
follow it. <One or two sentences of current intent: what we are starting, and any
decision that must be settled before code exists.>
```

The standing half -- how to verify state, the constraints a session breaks by
accident -- lives at the top of `handoff.md` and is not repeated in the paste.
The paste carries intent only.

**If the successor prompt wants to be longer than about three lines, that is a
defect in `handoff.md`, not a reason for a longer prompt.** Put the extra state
in the file and shorten the paste. A prompt that carries state is a prompt that
has to be rewritten by hand every session, which is how it ends up wrong.

Do not include in the paste: anything about a running process, an attached tool,
or an open editor. All of it can be false by the time it is read, and the file's
verification steps already cover it.
