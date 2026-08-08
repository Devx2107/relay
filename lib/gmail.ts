import { IntegrationService, ToolCall, ToolResult } from "./integration";

export class GmailService {
  constructor(private integration: IntegrationService) {}

  /**
   * Search for email threads.
   * By default, it queries the user's recent inbox.
   */
  async searchThreads(tenantId: string, query: string = "in:inbox", maxResults: number = 10): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "gmail",
      action: "api.threads.list",
      args: { q: query, maxResults }
    };
    
    return this.integration.executeTool(tenantId, call);
  }

  /**
   * Fetch the full details of a specific thread.
   */
  async getThread(tenantId: string, threadId: string): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "gmail",
      action: "api.threads.get",
      args: { id: threadId, format: "full" }
    };

    return this.integration.executeTool(tenantId, call);
  }

  /**
   * Construct an RFC2822 raw email string for a reply.
   */
  private constructReplyRaw(threadData: any, body: string): string {
    const messages = threadData.messages || [];
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) throw new Error("Thread has no messages");

    const headers = lastMessage.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const subject = getHeader("subject") || "";
    const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
    const messageId = getHeader("message-id");
    
    // In a reply, we reply TO the person who sent the last message.
    // If we sent the last message, this might reply to ourselves, but for this hackathon we assume it's replying to the sender.
    const to = getHeader("from") || "";
    const references = getHeader("references") ? `${getHeader("references")} ${messageId}` : messageId;

    const emailLines = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];

    if (messageId) {
      emailLines.push(`In-Reply-To: ${messageId}`);
    }
    if (references) {
      emailLines.push(`References: ${references}`);
    }

    emailLines.push("");
    emailLines.push(body);

    const emailStr = emailLines.join("\r\n");
    return Buffer.from(emailStr, "utf-8").toString("base64url");
  }

  /**
   * Create a draft reply to a specific thread.
   */
  async createReplyDraft(tenantId: string, threadId: string, body: string): Promise<ToolResult> {
    const threadResult = await this.getThread(tenantId, threadId);
    if (threadResult.error || !threadResult.data) {
      return threadResult; // Pass through errors (e.g. auth/rate limit)
    }

    const raw = this.constructReplyRaw(threadResult.data, body);

    const call: ToolCall = {
      plugin: "gmail",
      action: "api.drafts.create",
      args: {
        draft: {
          message: {
            threadId,
            raw,
          }
        }
      }
    };

    return this.integration.executeTool(tenantId, call);
  }

  /**
   * Send a reply to a specific thread.
   */
  async sendReply(tenantId: string, threadId: string, body: string): Promise<ToolResult> {
    const threadResult = await this.getThread(tenantId, threadId);
    if (threadResult.error || !threadResult.data) {
      return threadResult; 
    }

    const raw = this.constructReplyRaw(threadResult.data, body);

    const call: ToolCall = {
      plugin: "gmail",
      action: "api.messages.send",
      args: {
        threadId,
        raw,
      }
    };

    return this.integration.executeTool(tenantId, call);
  }
}
