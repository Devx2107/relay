export type ServerConfig = {
  databaseUrl: string;
  corsairKek: string;
  corsairProjectApiKey: string;
  corsairSigningSecret: string;
};

function required(name: string, env: Record<string, string | undefined>): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  return {
    databaseUrl: required("DATABASE_URL", env),
    corsairKek: required("CORSAIR_KEK", env),
    corsairProjectApiKey: required("CORSAIR_DEV_API_KEY", env),
    corsairSigningSecret: required("CORSAIR_DEV_SIGNING_SECRET", env),
  };
}
