# Security

Keep `.env`, OAuth secrets, API keys, access tokens, and service-role keys out of Git. Use least privilege and server-only credentials. Validate all model output with schemas and authorization checks.

The backend—not only the UI—must enforce that consequential writes have a persisted proposal and explicit approval. Revalidate stale proposals before execution, verify results, handle expired sessions safely, and show users understandable errors without stack traces.
