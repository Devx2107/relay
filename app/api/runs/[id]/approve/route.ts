import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { AgentService } from "../../../../../lib/agent/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Optional: Validate that the run belongs to a conversation owned by the user
    const { data: run } = await supabase
      .from("agent_runs")
      .select("conversations(user_id)")
      .eq("id", id)
      .single();

    const conversation = run?.conversations as any;
    if (!run || !conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const agentService = new AgentService(user.id);
    const updatedRun = await agentService.approveRun(id);

    return NextResponse.json(updatedRun);
  } catch (error: any) {
    console.error("Failed to approve run", error);
    return NextResponse.json({ error: error.message || "Failed to approve run" }, { status: 500 });
  }
}
