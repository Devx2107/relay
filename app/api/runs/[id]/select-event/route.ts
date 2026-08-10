import { NextResponse } from "next/server";
import { AgentService } from "../../../../../lib/agent/service";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = (await request.json()) as { eventId?: unknown };
    if (typeof eventId !== "string" || !eventId.trim()) {
      return NextResponse.json({ error: "Select a meeting to cancel." }, { status: 400 });
    }

    const { id } = await params;
    const { data: run } = await supabase
      .from("agent_runs")
      .select("conversations(user_id)")
      .eq("id", id)
      .single();
    const conversation = run?.conversations as { user_id?: string } | null;
    if (!run || !conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updatedRun = await new AgentService(user.id).prepareCalendarCancellation(
      id,
      eventId.trim(),
    );
    return NextResponse.json(updatedRun);
  } catch {
    return NextResponse.json(
      { error: "The meeting selection is no longer available. Please try again." },
      { status: 409 },
    );
  }
}
