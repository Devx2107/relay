import { describe, expect, it, vi } from "vitest";
import { GroqAdapter } from "../lib/agent/groq";

function response(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response;
}

describe("GroqAdapter", () => {
  it("sends a bounded authenticated chat completion request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ choices: [{ message: { content: "Classified" } }] }));
    const adapter = new GroqAdapter({ apiKey: "test-key", model: "test-model", fetchImpl });

    const result = await adapter.complete(
      [
        { role: "system", content: "Classify only." },
        { role: "user", content: "Email text" },
      ],
      "Fallback",
    );

    expect(result).toEqual({ text: "Classified", usedFallback: false, model: "test-model" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "test-model",
      max_completion_tokens: 1024,
      n: 1,
    });
  });

  it("falls back without a request when the key is missing or input is too long", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const missingKey = new GroqAdapter({ apiKey: "", fetchImpl });
    const missingResult = await missingKey.complete(
      [{ role: "user", content: "Hello" }],
      "Fallback",
    );
    expect(missingResult).toMatchObject({ text: "Fallback", usedFallback: true });

    const bounded = new GroqAdapter({ apiKey: "key", maxInputCharacters: 4, fetchImpl });
    const longResult = await bounded.complete([{ role: "user", content: "Too long" }], "Fallback");
    expect(longResult).toMatchObject({
      text: "Fallback",
      usedFallback: true,
      error: { code: "invalid_request" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "authentication_required"],
    [429, "rate_limited"],
    [500, "integration_unavailable"],
  ])("maps provider status %s and returns fallback", async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({}, { ok: false, status }));
    const result = await new GroqAdapter({ apiKey: "key", fetchImpl }).complete(
      [{ role: "user", content: "Hello" }],
      "Fallback",
    );
    expect(result).toMatchObject({ text: "Fallback", usedFallback: true, error: { code } });
  });

  it("falls back for malformed responses and network failures", async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(response({ choices: [] }));
    const malformedResult = await new GroqAdapter({ apiKey: "key", fetchImpl: malformed }).complete(
      [{ role: "user", content: "Hello" }],
      "Fallback",
    );
    expect(malformedResult).toMatchObject({ text: "Fallback", usedFallback: true });

    const network = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));
    const networkResult = await new GroqAdapter({ apiKey: "key", fetchImpl: network }).complete(
      [{ role: "user", content: "Hello" }],
      "Fallback",
    );
    expect(networkResult).toMatchObject({
      text: "Fallback",
      usedFallback: true,
      error: { retryable: true },
    });
  });
});
