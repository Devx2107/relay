# Triage

TRI-001 retrieves recent inbox threads and upcoming calendar events through the server-side integration boundary. TRI-002 normalizes those payloads into ranked candidates. TRI-003 owns persistence and the user-facing 2-5 item response contract.

## Deterministic ranking

Each candidate receives a score from seven independent signals. The maximum score is 100:

| Signal               | Maximum | Deterministic behavior                                                                                                                                      |
| -------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Urgency              |      25 | Important or starred email receives 25; calendar text containing critical or mandatory receives 15.                                                         |
| Response expectation |      20 | Unread email from a sender, addressed to a relevant account, or calendar attendees needing a response receives 20; tentative/possible responses receive 10. |
| Deadline             |      20 | Calendar start within 24 hours receives 20, within 3 days 12, within 7 days 5; email deadline language receives 12.                                         |
| Sender relevance     |      15 | Relevant calendar attendee receives 15; known email sender receives 5, other identifiable senders 10; missing data receives 0.                              |
| Calendar proximity   |      10 | Calendar start within 2 hours receives 10, within 24 hours 7, within 3 days 3.                                                                              |
| Recency              |       5 | Source timestamp within 24 hours receives 5; within 7 days receives 3.                                                                                      |
| Explicit urgency     |       5 | Urgent, ASAP, immediately, critical, action required, or time-sensitive language receives 5.                                                                |

Missing or malformed fields receive zero for the affected signal and do not invalidate other candidates. Candidate order is determined by total score, then deadline score, then most recent timestamp, then lexical stable ID.

Normalized candidates contain a stable source-prefixed ID, source, summary, safe text, timestamp/deadline where available, sender/attendees, response context, signal scores, final score, urgency, and a user-readable reason. Raw provider payloads and provider error text are not returned by the ranking layer.

## Optional classification

Groq is advisory and injectable. It is called only when deterministic urgency or response expectation is ambiguous. The classifier must return JSON with `urgency` (`low`, `medium`, `high`), `responseExpectation` (`none`, `possible`, `expected`), and `confidence` (`low`, `medium`, `high`). Only high-confidence values may fill zero-valued ambiguous signals. Groq never assigns the final score directly, executes actions, or overrides deterministic values.

If Groq is not configured, unavailable, rate-limited, malformed, oversized, or low-confidence, the deterministic candidate remains unchanged. Prompts treat source text as untrusted data, and no prompt, credential, raw provider error, or model reasoning is exposed to users.

Triage actions such as reply, ignore/archive, and snooze remain separate workflows. Replies are drafted, editable, and approval-gated before sending.

## Persistence and response contract

TRI-003 persists ranked candidates in the authenticated user's `triage_items` rows. The existing unique key `(user_id, source, source_id)` makes repeated triage runs idempotent. Candidate display data is stored in `content` as safe JSONB containing the score, urgency, reason, signal values, summary, timestamps, sender/attendees, and supported action names. Raw Gmail/Calendar payloads, credentials, prompts, and model internals are not persisted.

The server response contains `items`, `generatedAt`, and optional per-source status. It reads only `pending` rows owned by the authenticated user, validates stored content, sorts by score descending followed by recency and stable source ID, and returns no more than five items. A requested limit is clamped to the 2-5 range; if fewer valid items exist, the response returns fewer. TRI-005 and TRI-006 will own status transitions and action execution.

## Proactive console briefing

The authenticated console loads its briefing through the internal `GET /api/triage?limit=5` boundary. The endpoint uses `no-store` semantics, authenticates the Supabase session before integrations or persistence, retrieves both sources, ranks with the authenticated account as relevant-address context, upserts ranked candidates, and returns the TRI-003 response. Browser code never calls Corsair, Gmail, Calendar, Groq, or Supabase persistence directly.

## TRI-005 actions

Triage actions use the internal `/api/triage/actions` boundary. The server verifies the authenticated owner, pending item status, source, and supported action before creating a fifteen-minute `agent_runs` approval proposal. Provider writes execute only through the approved server-side tool registry.

- Email `reply` creates a Gmail draft after approval; editable composition and sending remain TRI-006.
- Email `ignore` archives the thread by removing the `INBOX` label, then dismisses the local item after a successful provider result.
- Calendar `ignore` is a local dismissal and does not call Calendar.
- `snooze` is local and accepts only `one_hour`, `tomorrow`, or `next_week`; the item becomes `snoozed` with a bounded reappearance timestamp.

Approval rechecks ownership, pending status, proposal expiration, and the expected tool/item relationship. Repeated or stale proposals are rejected. Responses contain only safe action status and generic provider errors.

Authentication failures return a safe `401` response. Unexpected orchestration or persistence failures return a safe retryable `503`; source-specific read failures remain represented in the response's per-source status while available items can still be shown. The console makes one briefing request per mount and does not poll or run background loops.
