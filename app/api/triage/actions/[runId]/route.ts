import { NextResponse } from "next/server";
import { TriageActionError, TriageActionService } from "../../../../../lib/triage-actions";

export const dynamic = "force-dynamic";

const service = new TriageActionService();

export async function PUT(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const body = (await request.json()) as { body?: string };
    return NextResponse.json(await service.updateReplyProposal(runId, body.body ?? ""), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
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
          message: "The reply proposal could not be updated.",
          retryable: true,
        },
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
