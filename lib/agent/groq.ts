import type { UserFacingError } from "./contracts";

export const DEFAULT_GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const DEFAULT_MAX_INPUT_CHARACTERS = 6000;
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARACTERS = 4000;

export interface GroqTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface GroqToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface GroqAdapterConfig {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  maxInputCharacters?: number;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GroqCompletionResult {
  text?: string;
  toolCalls?: GroqToolCall[];
  usedFallback: boolean;
  model?: string;
  error?: UserFacingError;
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: GroqToolCall[] } }>;
}

function fallbackResult(fallback: string, error?: UserFacingError): GroqCompletionResult {
  return { text: fallback, usedFallback: true, error };
}

function providerError(status: number): UserFacingError {
  if (status === 401 || status === 403) {
    return {
      code: "authentication_required",
      message: "The language assistant is not authenticated.",
      retryable: false,
      action: "connect_integration",
    };
  }
  if (status === 429) {
    return {
      code: "rate_limited",
      message: "The language assistant is temporarily rate-limited.",
      retryable: true,
      action: "retry",
    };
  }
  return {
    code: "integration_unavailable",
    message: "The language assistant is temporarily unavailable.",
    retryable: true,
    action: "retry",
  };
}

function invalidPrompt(message: string): UserFacingError {
  return { code: "invalid_request", message, retryable: false };
}

export class GroqAdapter {
  private readonly config: Required<
    Pick<
      GroqAdapterConfig,
      | "model"
      | "endpoint"
      | "maxInputCharacters"
      | "maxCompletionTokens"
      | "timeoutMs"
      | "fetchImpl"
    >
  > & { apiKey?: string };

  constructor(config: GroqAdapterConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GROQ_API_KEY,
      model: config.model ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
      endpoint: config.endpoint ?? DEFAULT_GROQ_ENDPOINT,
      maxInputCharacters: config.maxInputCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS,
      maxCompletionTokens: config.maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: config.fetchImpl ?? fetch,
    };
  }

  async complete(
    messages: readonly GroqMessage[],
    fallback: string,
    tools?: readonly GroqTool[],
    forceToolName?: string,
  ): Promise<GroqCompletionResult> {
    const validationError = this.validateMessages(messages);
    if (validationError) return fallbackResult(fallback, validationError);
    if (!this.config.apiKey?.trim()) {
      return fallbackResult(fallback, {
        code: "integration_unavailable",
        message: "The optional language assistant is not configured.",
        retryable: false,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.config.fetchImpl(this.config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_completion_tokens: this.config.maxCompletionTokens,
          n: 1,
          ...(tools && tools.length > 0
            ? {
                tools,
                tool_choice: forceToolName
                  ? { type: "function", function: { name: forceToolName } }
                  : "auto",
              }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let bodyText = "<unreadable body>";
        try {
          bodyText = await response.text();
        } catch {
          // ignore body-read failures; status/statusText are still logged below
        }
        console.error(
          `Groq request failed: ${response.status} ${response.statusText} — ${bodyText.slice(0, 1000)}`,
        );
        return fallbackResult(fallback, providerError(response.status));
      }

      const payload = (await response.json()) as GroqResponse;
      const message = payload.choices?.[0]?.message;
      if (!message || (typeof message.content !== "string" && !message.tool_calls)) {
        console.error(
          "Groq returned an unusable response payload:",
          JSON.stringify(payload).slice(0, 1000),
        );
        return fallbackResult(fallback, {
          code: "integration_unavailable",
          message: "The language assistant returned an unusable response.",
          retryable: true,
          action: "retry",
        });
      }
      return {
        text: message.content ? message.content.trim() : undefined,
        toolCalls: message.tool_calls,
        usedFallback: false,
        model: this.config.model,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      console.error(
        isTimeout ? "Groq request timed out" : "Groq request threw an exception:",
        isTimeout ? undefined : error,
      );
      return fallbackResult(fallback, {
        code: "integration_unavailable",
        message: isTimeout
          ? "The language assistant took too long to respond."
          : "The language assistant is temporarily unavailable.",
        retryable: true,
        action: "retry",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateMessages(messages: readonly GroqMessage[]): UserFacingError | undefined {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return invalidPrompt(`Provide between 1 and ${MAX_MESSAGES} prompt messages.`);
    }

    let totalCharacters = 0;
    for (const message of messages) {
      if (!message || !["system", "user", "assistant", "tool"].includes(message.role)) {
        return invalidPrompt("Invalid message role.");
      }
      const contentLen = typeof message.content === "string" ? message.content.length : 0;
      if (contentLen > MAX_MESSAGE_CHARACTERS) {
        return invalidPrompt("Message content is too long.");
      }
      totalCharacters += contentLen;
      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          totalCharacters += tc.function.arguments.length;
        }
      }
    }

    if (totalCharacters > this.config.maxInputCharacters) {
      return invalidPrompt("The language-assistant prompt is too long.");
    }
    return undefined;
  }
}
