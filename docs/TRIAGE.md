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
