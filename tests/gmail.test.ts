import { describe, expect, it, beforeEach } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { GmailService } from "../lib/gmail";

describe("GmailService", () => {
  let mockIntegration: MockIntegrationService;
  let gmail: GmailService;

  beforeEach(() => {
    mockIntegration = new MockIntegrationService();
    gmail = new GmailService(mockIntegration);
  });

  it("searchThreads sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.list", {
      content: "Success",
      data: { threads: [{ id: "t1", snippet: "Test thread" }] },
    });

    const result = await gmail.searchThreads("tenant-123", "is:unread", 5);

    expect(result.content).toBe("Success");
    expect(result.data.threads[0].id).toBe("t1");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-123");
    expect(calls[0].call.plugin).toBe("gmail");
    expect(calls[0].call.action).toBe("api.threads.list");
    expect(calls[0].call.args).toEqual({ q: "is:unread", maxResults: 5 });
  });

  it("getThread sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.get", {
      content: "Success",
      data: { id: "t2", messages: [] },
    });

    const result = await gmail.getThread("tenant-456", "t2");

    expect(result.data.id).toBe("t2");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-456");
    expect(calls[0].call.action).toBe("api.threads.get");
    expect(calls[0].call.args).toEqual({ id: "t2", format: "full" });
  });

  it("createReplyDraft constructs RFC2822 email and sends correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.get", {
      content: "Success",
      data: {
        id: "t3",
        messages: [
          {
            id: "m1",
            payload: {
              headers: [
                { name: "From", value: "Sender <sender@test.com>" },
                { name: "Subject", value: "Hello" },
                { name: "Message-ID", value: "<msg123@test.com>" },
              ],
            },
          },
        ],
      },
    });
    mockIntegration.mockResponse("gmail", "api.drafts.create", {
      content: "Success",
      data: { id: "d1" },
    });

    const result = await gmail.createReplyDraft("tenant-123", "t3", "My reply body");
    expect(result.data.id).toBe("d1");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(2);
    expect(calls[1].call.action).toBe("api.drafts.create");

    const rawArgs = calls[1].call.args as any;
    const rawEmail = Buffer.from(rawArgs.draft.message.raw, "base64url").toString("utf-8");
    expect(rawEmail).toContain("To: Sender <sender@test.com>");
    expect(rawEmail).toContain("Subject: Re: Hello");
    expect(rawEmail).toContain("In-Reply-To: <msg123@test.com>");
    expect(rawEmail).toContain("My reply body");
  });

  it("sendReply constructs RFC2822 email and sends correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.get", {
      content: "Success",
      data: {
        id: "t4",
        messages: [
          {
            id: "m2",
            payload: {
              headers: [
                { name: "From", value: "Sender <sender@test.com>" },
                { name: "Subject", value: "Re: Hello" },
                { name: "Message-ID", value: "<msg124@test.com>" },
                { name: "References", value: "<msg123@test.com>" },
              ],
            },
          },
        ],
      },
    });
    mockIntegration.mockResponse("gmail", "api.messages.send", {
      content: "Success",
      data: { id: "m3" },
    });

    const result = await gmail.sendReply("tenant-123", "t4", "Another reply");
    expect(result.data.id).toBe("m3");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(2);
    expect(calls[1].call.action).toBe("api.messages.send");

    const rawArgs = calls[1].call.args as any;
    const rawEmail = Buffer.from(rawArgs.raw, "base64url").toString("utf-8");
    expect(rawEmail).toContain("To: Sender <sender@test.com>");
    expect(rawEmail).toContain("Subject: Re: Hello");
    expect(rawEmail).toContain("In-Reply-To: <msg124@test.com>");
    expect(rawEmail).toContain("References: <msg123@test.com> <msg124@test.com>");
    expect(rawEmail).toContain("Another reply");
  });
});
