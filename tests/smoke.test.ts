import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../lib/server-config";

describe("bootstrap", () => {
  it("has a working test runner", () => {
    expect(true).toBe(true);
  });

  it("loads the server-only Corsair and database configuration", () => {
    expect(
      loadServerConfig({
        DATABASE_URL: "postgres://session-pooler.example/db",
        CORSAIR_KEK: "test-kek",
        CORSAIR_DEV_API_KEY: "test-api-key",
        CORSAIR_DEV_SIGNING_SECRET: "test-signing-secret",
      }),
    ).toEqual({
      databaseUrl: "postgres://session-pooler.example/db",
      corsairKek: "test-kek",
      corsairProjectApiKey: "test-api-key",
      corsairSigningSecret: "test-signing-secret",
    });
  });

  it("rejects incomplete server configuration", () => {
    expect(() => loadServerConfig({ DATABASE_URL: "postgres://example" })).toThrow("CORSAIR_KEK");
  });
});
