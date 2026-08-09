import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createCorsair } from "corsair";
import { getDb } from "./lib/db";
import { loadServerConfig } from "./lib/server-config";
import { gmail } from "@corsair-dev/gmail";
import { googlecalendar } from "@corsair-dev/googlecalendar";

let corsairInstance: ReturnType<typeof createCorsair> | undefined;

export function getCorsair() {
  if (corsairInstance) {
    return corsairInstance;
  }

  const config = loadServerConfig();

  corsairInstance = createCorsair({
    kek: config.corsairKek,
    database: getDb(),
    hub: {
      projectApiKey: config.corsairProjectApiKey,
      signingSecret: config.corsairSigningSecret,
    },
    plugins: [gmail(), googlecalendar()],
  });

  return corsairInstance;
}

// The instance is intentionally not exported to avoid eager instantiation on module load.
// Call getCorsair() lazily where the SDK is needed.
