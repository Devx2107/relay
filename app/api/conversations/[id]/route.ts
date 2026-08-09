import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select()
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Fetch messages
    const { data: messages } = await supabase
      .from("messages")
      .select()
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    // Fetch runs
    const { data: runs } = await supabase
      .from("agent_runs")
      .select()
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    const parsedRuns = (runs || []).map((run) => {
      if (typeof run.error === "string") {
        try {
          run.error = JSON.parse(run.error);
        } catch {
          // ignore
        }
      }
      return run;
    });

    return NextResponse.json({ messages: messages || [], runs: parsedRuns });
  } catch (error) {
    console.error("Conversation fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
