import { describe, expect, it } from "vitest";
import {
  ContractValidationError,
  parseAgentIntent,
  parseAgentRun,
  parseAgentToolCall,
  parseUserFacingError,
} from "../lib/agent/contracts";
import { parseCommand } from "../lib/agent/intents";

describe("agent contracts", () => {
  it("parses supported triage and scheduling intents", () => {
    expect(parseAgentIntent({ kind: "triage", parameters: { source: "email", limit: 5 } })).toEqual(
      {
        kind: "triage",
        parameters: { source: "email", limit: 5 },
      },
    );
    expect(
      parseAgentIntent({
        kind: "schedule",
        parameters: { request: "Meet tomorrow", attendees: ["a@example.com"] },
      }),
    ).toEqual({
      kind: "schedule",
      parameters: { request: "Meet tomorrow", attendees: ["a@example.com"] },
    });
  });

  it("rejects unsupported intents and unsafe limits", () => {
    expect(() => parseAgentIntent({ kind: "send_email", parameters: {} })).toThrow(
      ContractValidationError,
    );
    expect(() => parseAgentIntent({ kind: "triage", parameters: { limit: 101 } })).toThrow(/limit/);
  });

  it("requires explicit read/write classification for tool calls", () => {
    const call = parseAgentToolCall({
      id: "call-1",
      tenantId: "tenant-1",
      plugin: "gmail",
      action: "api.threads.list",
      operation: "read",
      args: { q: "in:inbox" },
    });
    expect(call.operation).toBe("read");
    expect(() => parseAgentToolCall({ ...call, operation: "unknown" })).toThrow(/operation/);
  });

  it("keeps user-facing errors bounded and actionable", () => {
    expect(
      parseUserFacingError({
        code: "authentication_required",
        message: "Sign in to continue.",
        retryable: false,
        action: "sign_in",
      }),
    ).toEqual({
      code: "authentication_required",
      message: "Sign in to continue.",
      retryable: false,
      action: "sign_in",
    });
    expect(() =>
      parseUserFacingError({
        code: "execution_failed",
        message: "x".repeat(501),
        retryable: false,
      }),
    ).toThrow(/500/);
  });

  it("rejects sensitive agent metadata and accepts serializable run data", () => {
    const run = parseAgentRun({
      id: "run-1",
      conversationId: "conversation-1",
      status: "running",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      metadata: { source: "console", attempt: 1 },
    });
    expect(run.status).toBe("running");
    expect(() => parseAgentRun({ ...run, metadata: { accessToken: "never" } })).toThrow(
      /sensitive/,
    );
  });

  it("parses email triage commands with an explicit limit", () => {
    expect(parseCommand("  show my unread emails, top 5  ")).toEqual({
      ok: true,
      intent: { kind: "triage", parameters: { source: "email", limit: 5 } },
    });
  });

  it("parses calendar triage and scheduling commands", () => {
    expect(parseCommand("show my upcoming events")).toEqual({
      ok: true,
      intent: { kind: "triage", parameters: { source: "calendar", limit: undefined } },
    });
    expect(
      parseCommand("Schedule a meeting with A@Example.com and a@example.com tomorrow"),
    ).toEqual({
      ok: true,
      intent: {
        kind: "schedule",
        parameters: {
          request: "Schedule a meeting with A@Example.com and a@example.com tomorrow",
          attendees: ["a@example.com"],
        },
      },
    });
  });

  it("inherits intent from history if explicit keywords are missing", () => {
    const history = [
      { role: "user", content: "schedule a meeting" },
      { role: "assistant", content: "Sure, what time?" }
    ];
    
    expect(parseCommand("what about tomorrow?", history)).toEqual({
      ok: true,
      intent: {
        kind: "schedule",
        parameters: { request: "what about tomorrow?", attendees: undefined },
      },
    });

    const triageHistory = [
      { role: "user", content: "triage my emails" },
      { role: "assistant", content: "You have 5 unread emails." }
    ];

    expect(parseCommand("show me the top 2", triageHistory)).toEqual({
      ok: true,
      intent: {
        kind: "triage",
        parameters: { source: "email", limit: 2 },
      },
    });
  });

  it("rejects unsupported, ambiguous, empty, and oversized commands", () => {
    expect(parseCommand("send an email")).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(parseCommand("triage my inbox and schedule a meeting")).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(parseCommand(" ")).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(parseCommand("x".repeat(2001))).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
  });
});
