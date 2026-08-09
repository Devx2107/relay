import { NextResponse } from "next/server";
import { getCorsair } from "../../../corsair";
import { createClient } from "../../../lib/supabase/server";

const CONNECTABLE_PLUGINS = new Set(["gmail", "googlecalendar"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const plugin = url.searchParams.get("plugin");

  if (!plugin || !CONNECTABLE_PLUGINS.has(plugin)) {
    return new NextResponse("Unsupported integration", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const corsair = getCorsair();
    const link = await corsair.manage.connect.createLink({
      tenantId: user.id,
      plugin: plugin,
    });
    return NextResponse.redirect(link.connectUrl);
  } catch (error: any) {
    console.error("Failed to create connect link", error);
    return new NextResponse("Failed to create connect link", { status: 500 });
  }
}
