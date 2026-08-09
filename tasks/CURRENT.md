# Current Task

## Current Task: Implement deterministic triage ranking and optional LLM classification (TRI-002)

## Goal

Normalize completed TRI-001 Gmail and Calendar inputs into deterministically ranked triage candidates, with optional bounded Groq classification for ambiguous signals.

## Context

TRI-001 provides a typed retrieval boundary containing raw-but-safe Gmail and Calendar source results. TRI-002 is dependency-ready because AGT-003 and TRI-001 are complete. The product requirements define deterministic signals for urgency, response expectation, sender relevance, deadlines, calendar proximity, recency, and explicit urgency language. TRI-003 owns persistence and the final 2-5 item response contract.

## Requirements

- Normalize supported Gmail thread/message and Calendar event fields into typed triage candidates.
- Apply the documented deterministic seven-signal score with a 100-point maximum.
- Use deterministic tie-breaking and produce safe reasons and urgency levels.
- Permit optional Groq classification only for ambiguous candidates; deterministic ranking remains authoritative.
- Safely fall back when Groq is unconfigured, unavailable, malformed, or low-confidence.
- Keep provider errors, prompts, credentials, and classifier internals out of candidate output.

## Acceptance Criteria

- A typed ranking entry point accepts `TriageInputs` and returns normalized, deterministically ordered candidates.
- Gmail and Calendar normalization supports IDs, summaries, timestamps, headers, labels, deadlines, attendees, and response context where available.
- The seven deterministic signals are independently testable and sum to a maximum of 100 points.
- Ties are resolved by score, deadline/time sensitivity, recency, then lexical stable ID.
- Optional classification affects only ambiguous signal values and never directly assigns final rank or performs actions.
- Empty, malformed, or partially failed source inputs do not crash ranking or leak provider details.
- Unit tests cover normalization, each signal, tie-breaking, mixed sources, classifier fallback, and output safety.
- TRI-003 persistence, UI rendering, writes, and 2-5 item shaping are not implemented.

## Relevant Areas

- `lib/triage.ts`
- `lib/triage-ranking.ts`
- `lib/agent/groq.ts`
- `docs/TRIAGE.md`
- `tests/triage.test.ts`
- `tests/triage-ranking.test.ts`

## Constraints

- Keep ranking server-side and use only the existing TRI-001 retrieval boundary.
- Deterministic scoring is authoritative; Groq is optional advisory assistance.
- Do not expose credentials, raw provider errors, prompts, or internal model reasoning.
- Do not persist candidates, call write tools, render UI, or implement TRI-003's 2-5 item contract.
- Normal tests must use fixtures and injected classifiers; no live accounts or network calls.

## Plan

1. **Define contracts**: Add typed normalized candidates, signal sets, ranking output, classifier input/output, and ranking options.
2. **Normalize and score**: Implement Gmail/Calendar normalization, seven weighted deterministic signals, safe reasons, urgency levels, and tie-breaking.
3. **Add optional classification**: Implement an injectable Groq-backed classifier with strict JSON validation and deterministic fallback.
4. **Test**: Cover normalization, every signal, mixed-source ordering, malformed/partial inputs, classifier behavior, and output safety.
5. **Review and verify**: Run formatting, lint, typecheck, tests, and build; review prompt safety, secret handling, and scope.
6. **Document status**: Update `docs/TRIAGE.md` and this task with exact policy and verification results; mark TRI-002 `DONE` only after all gates pass.

## Verification

- [x] Pre-implementation inspection complete.
- [x] Formatting passes.
- [x] Lint passes after migrating to Next 16 native flat config imports and preserving the dynamic-provider boundary rule.
- [x] Typecheck passes.
- [x] Tests pass (58 tests, including 8 TRI-002 tests).
- [x] Build passes.
- [x] Security and scope review complete.

## Status

DONE - TRI-002 is implemented and fully verified.
