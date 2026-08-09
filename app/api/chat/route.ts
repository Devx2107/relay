import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { AgentService } from "../../../lib/agent/service";

export const dynamic = "force-dynamic";

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
    const { command, conversationId: reqConversationId } = body;

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Command is required" }, { status: 400 });
    }

    let conversationId = reqConversationId;

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
        return NextResponse.json(
          { error: "Failed to create conversation", details: convError },
          { status: 500 },
        );
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
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    // Start agent run.
    const agentService = new AgentService(user.id);
    const run = await agentService.startRun(conversationId, command);

    return NextResponse.json({ conversationId, run });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error", stack: error.stack },
      { status: 500 },
    );
  }
}
