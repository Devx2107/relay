import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { AgentService } from "../../../../../lib/agent/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const updatedRun = await new AgentService(user.id).cancelRun(id);
    return NextResponse.json(updatedRun);
  } catch (error: any) {
    const message =
      error?.message === "Run is no longer waiting for approval."
        ? error.message
        : "The approval could not be cancelled.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
