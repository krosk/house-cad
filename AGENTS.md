# Agent Instructions

`CLAUDE.md` is the authoritative source of project instructions for this
repository. Read it in full before taking any action, then read
`.claude/handoff.md` for the current working state and outstanding tasks.

This file is primarily a compatibility pointer for tools that discover
`AGENTS.md`. Do not duplicate shared project guidance here. Any change to
shared instructions must be made in `CLAUDE.md`; if this file and `CLAUDE.md`
conflict, `CLAUDE.md` takes precedence.

Codex-specific compatibility notes are the sole exception. They belong only in
this file because Claude Code does not need them and they must not be copied
into `CLAUDE.md`.

## Codex Compatibility

This repository's agent environment is organized for Claude Code. Codex must
bridge into that environment as follows:

- Treat `CLAUDE.md`, not this file, as the authoritative source of shared
  project instructions. Read it in full before taking action.
- Read `.claude/handoff.md` after `CLAUDE.md`. It contains live session state;
  stable technical detail belongs in `CLAUDE.md`, `docs/`, or `packaging/`.
- Claude Code workflows in `.claude/skills/` may not appear in Codex's native
  skill registry. When a task matches one, read its `SKILL.md` in full and
  follow the underlying procedure.
- Claude Code memory referenced by project documentation may be unavailable to
  Codex. Treat that as a compatibility gap: use repository-backed context,
  state the missing context when material, and do not invent or silently
  replace it.
- Do not introduce Codex-specific memory or persistence files. Follow the
  repository's existing `CLAUDE.md`, `.claude/handoff.md`, design-doc, and
  implementation-doc persistence model.
- When a Claude-oriented command, tool, or auto-loading behavior is missing,
  state the compatibility gap and use the narrowest documented fallback. Do
  not silently bypass the project workflow.
