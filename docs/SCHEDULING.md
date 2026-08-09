# Scheduling

SCH-001 owns deterministic scheduling-intent parsing. The normalized request is bounded to 2,000 characters. Explicit attendee email addresses are lowercased, deduplicated in first-seen order, syntax-validated, and limited to 20. The intent carries `attendeeStatus`: `provided` for valid explicit addresses, `missing` when none were supplied, or `unresolved` when the user supplied display names that have not been verified against a contact source. Names are never converted into guessed email addresses. Malformed or excessive attendee input is rejected with a safe clarification error.

SCH-001 may inherit scheduling context only from the most recent valid user scheduling request in the authenticated conversation history. It does not apply duration, meeting-provider, calendar, or timezone defaults; SCH-002 owns those editable defaults. It does not call Calendar, resolve contacts, find slots, create events, or send invitations.

SCH-002 normalizes scheduling options without executing anything. Missing values default to 30 minutes, Google Meet (`google_meet`), the primary calendar (`primary`), and the validated account IANA timezone. The command may explicitly override duration, Google Meet, primary calendar, or timezone; unsupported providers/calendars, invalid durations, and invalid timezones are rejected rather than silently defaulted. The browser supplies its resolved timezone only through the authenticated `/api/chat` boundary, where it is validated. If no account timezone is supplied, the deterministic `Asia/Kolkata` fallback (IST, UTC+05:30) is marked as fallback context for later review.

Parse a natural-language request, identify attendees, ask for material missing information, read availability, and suggest 2–3 slots. Defaults are 30 minutes, Google Meet, the primary calendar, and the account timezone; defaults must remain editable.

SCH-003 post-processes the server-side Calendar availability read deterministically. It normalizes busy intervals for every attendee, generates weekday candidates on a 30-minute grid between 09:00 and 17:00 in the requested timezone, rejects any overlap for any attendee, and returns at most three earliest verified slots. Results include start/end timestamps, duration, timezone, and safe ranking context only. A missing, malformed, or unavailable calendar is not treated as free time; no-result output is truthful and no slot is reserved or approved by this task.

SCH-004 turns those verified slots into one side-effect-free `schedule_proposal`. The proposal contains one selected event (`summary`, start/end, timezone, duration, provider, and calendar), a separate invitation recipient list, and bounded alternative slots. The title uses an explicit `called`, `titled`, `about`, or `regarding` phrase when present and otherwise uses the neutral `Meeting` label. Optional email data is omitted unless explicitly supplied and validated; proposal preparation never creates an event, sends an invitation, or sends email.

Scheduling runs with a verified slot stop at the server approval boundary with the combined proposal. SCH-005 owns rendering the combined approval and executing it only after server validation.

Present one combined approval for the event and any invitation/email. Execute only after server validation of the approval, then verify the created event and report success or an actionable failure.

The UI must render only verified slots returned by the scheduling boundary. Zero verified slots, unavailable Calendar access, and missing scheduling inputs are distinct states when the server contract provides those reasons. The unavailable-slot presentation may offer bounded retry or constraint changes, but must not invent times, timezones, attendees, reservations, or meeting links.
