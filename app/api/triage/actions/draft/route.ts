import { NextResponse } from "next/server";
import { TriageActionError, TriageActionService } from "../../../../../lib/triage-actions";

export const dynamic = "force-dynamic";

const service = new TriageActionService();

function errorResponse(error: unknown) {
  if (error instanceof TriageActionError) {
    const status =
      error.code === "authentication_required"
        ? 401
        : error.code === "not_found"
          ? 404
          : error.code === "invalid_request"
            ? 400
            : error.code === "conflict"
              ? 409
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
        message: "The reply draft service is temporarily unavailable.",
        retryable: true,
      },
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { conversationId?: string; triageItemId?: string };
    if (!body.conversationId || !body.triageItemId) {
      throw new TriageActionError(
        "conversationId and triageItemId are required.",
        "invalid_request",
      );
    }
    return NextResponse.json(
      await service.prepareReplyDraft({
        conversationId: body.conversationId,
        triageItemId: body.triageItemId,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
