import { toNextJsHandler } from "corsair";
import { getCorsair } from "../../../../corsair";
import { createClient } from "../../../../lib/supabase/server";
import { NextResponse } from "next/server";

function handle(method: "GET" | "POST" | "OPTIONS") {
  return async (request: Request) => {
    if (method !== "OPTIONS") {
      // The Corsair Hub sends webhook requests that are signed.
      // If a signature is present, we bypass Supabase auth and let the Corsair SDK validate it.
      const isHubRequest =
        request.headers.has("x-corsair-signature") || request.headers.has("corsair-signature");

      // The Corsair CLI needs to read the schema locally to sync with the Hub.
      const url = new URL(request.url);
      const isSchemaFetch =
        method === "GET" &&
        (url.pathname === "/api/corsair" ||
          url.pathname === "/api/corsair/" ||
          url.pathname === "/api/corsair/openapi.json");

      // Secure everything else with a Supabase session check!
      if (!isHubRequest && !isSchemaFetch) {
        const supabase = await createClient();
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          return new NextResponse("Unauthorized", { status: 401 });
        }
      }
    }

    return toNextJsHandler(getCorsair(), { basePath: "/api/corsair" })[method](request);
  };
}

export const GET = handle("GET");
export const POST = handle("POST");
export const OPTIONS = handle("OPTIONS");
