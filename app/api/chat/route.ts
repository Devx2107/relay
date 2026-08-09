import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { AgentService } from "../../../lib/agent/service";
import { isValidTimeZone } from "../../../lib/agent/contracts";

export const dynamic = "force-dynamic";

function internalErrorResponse() {
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
        retryable: true,
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { command, conversationId: reqConversationId, timeZone } = body;

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Command is required" }, { status: 400 });
    }
    if (timeZone !== undefined && (!isValidTimeZone(timeZone) || typeof timeZone !== "string")) {
      return NextResponse.json({ error: "The account timezone is invalid" }, { status: 400 });
    }

    let conversationId = reqConversationId;

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .single();

      if (conversationError || !conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    }

    if (!conversationId) {
      // Ensure user exists in public.users before inserting conversation, bypassing RLS
      if (user.email) {
        const { getDb } = await import("../../../lib/db");
        await getDb().query(
          "INSERT INTO public.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email",
          [user.id, user.email],
        );
      }

      // Create a new conversation
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          title: command.slice(0, 50) + (command.length > 50 ? "..." : ""),
        })
        .select()
        .single();

      if (convError || !conversation) {
        console.error("Conversation insert error:", convError);
        return internalErrorResponse();
      }
      conversationId = conversation.id;
    }

    // Insert user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: command,
    });

    if (msgError) {
      console.error("Message insert error:", msgError);
      return internalErrorResponse();
    }

    // Start agent run.
    const agentService = new AgentService(user.id);
    const run = await agentService.startRun(conversationId, command, { accountTimeZone: timeZone });

    return NextResponse.json({ conversationId, run });
  } catch (error) {
    console.error("Chat API error:", error);
    return internalErrorResponse();
  }
}
