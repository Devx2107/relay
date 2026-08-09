import { NextResponse } from "next/server";
import {
  TriageActionError,
  TriageActionService,
  type CreateTriageActionRequest,
} from "../../../../lib/triage-actions";

export const dynamic = "force-dynamic";

const service = new TriageActionService();

function errorResponse(error: unknown) {
  if (error instanceof TriageActionError) {
    const status =
      error.code === "authentication_required"
        ? 401
        : error.code === "not_found"
          ? 404
          : error.code === "conflict"
            ? 409
            : error.code === "invalid_request"
              ? 400
              : 503;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, retryable: status === 503 } },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "integration_unavailable",
        message: "The triage action service is temporarily unavailable.",
        retryable: true,
      },
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get("conversationId");
  if (!conversationId)
    return errorResponse(new TriageActionError("conversationId is required.", "invalid_request"));
  try {
    return NextResponse.json(
      { proposals: await service.listProposals(conversationId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateTriageActionRequest>;
    const proposal = await service.createProposal({
      conversationId: body.conversationId ?? "",
      triageItemId: body.triageItemId ?? "",
      action: body.action as CreateTriageActionRequest["action"],
      body: body.body,
      snoozePreset: body.snoozePreset,
    });
    return NextResponse.json(proposal, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
