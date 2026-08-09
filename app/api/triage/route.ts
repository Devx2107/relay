import { NextResponse } from "next/server";
import { TriageBriefingAuthError, TriageBriefingService } from "../../../lib/triage-briefing";

export const dynamic = "force-dynamic";

const briefingService = new TriageBriefingService();

function requestedLimit(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const response = await briefingService.getBriefing(requestedLimit(request));
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof TriageBriefingAuthError) {
      return NextResponse.json(
        {
          error: {
            code: "authentication_required",
            message: "Sign in to load your triage briefing.",
            retryable: false,
          },
        },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "integration_unavailable",
          message: "The triage briefing is temporarily unavailable.",
          retryable: true,
        },
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
