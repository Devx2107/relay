import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// RLS tests use a live database and are opt-in so placeholder local values do not
// turn the normal unit-test command into a network-dependent suite.
const dbUrl = process.env.DATABASE_URL;
const runIf = dbUrl && process.env.RUN_RLS_TESTS === "true" ? describe : describe.skip;

runIf("Row Level Security Policies", () => {
  let client: Client;
  const userA_id = "00000000-0000-0000-0000-00000000000a";
  const userB_id = "00000000-0000-0000-0000-00000000000b";

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    await client.connect();

    // Create mock users in a transaction so we can roll them back,
    // or just insert them if they don't exist and clean up later.
    // For RLS, we simulate by setting the JWT claims.
    await client.query("BEGIN");

    // Disable RLS temporarily to insert test data, or use service role
    // Since we connect using DATABASE_URL, we assume it's a superuser or service role
    await client.query(
      `
      INSERT INTO auth.users (id, email) VALUES 
      ($1, 'userA@example.com'),
      ($2, 'userB@example.com')
      ON CONFLICT DO NOTHING
    `,
      [userA_id, userB_id],
    );

    await client.query(
      `
      INSERT INTO public.users (id, email) VALUES 
      ($1, 'userA@example.com'),
      ($2, 'userB@example.com')
      ON CONFLICT DO NOTHING
    `,
      [userA_id, userB_id],
    );
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("allows user to select their own profile and blocks others", async () => {
    // Set role to authenticated and simulate User A's JWT
    await client.query(`
      SET LOCAL role authenticated;
      SELECT set_config('request.jwt.claims', '{"sub": "${userA_id}"}', true);
    `);

    const result = await client.query("SELECT * FROM public.users");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(userA_id);

    // Switch to User B
    await client.query(`
      SELECT set_config('request.jwt.claims', '{"sub": "${userB_id}"}', true);
    `);

    const resultB = await client.query("SELECT * FROM public.users");
    expect(resultB.rows.length).toBe(1);
    expect(resultB.rows[0].id).toBe(userB_id);
  });

  it("enforces RLS on conversations", async () => {
    // Act as postgres (service role) to insert a conversation for User A
    await client.query("RESET role;");
    const convResult = await client.query(
      `
      INSERT INTO public.conversations (user_id, title) 
      VALUES ($1, 'User A Conv') 
      RETURNING id
    `,
      [userA_id],
    );
    const convId = convResult.rows[0].id;

    // Switch to User B
    await client.query(`
      SET LOCAL role authenticated;
      SELECT set_config('request.jwt.claims', '{"sub": "${userB_id}"}', true);
    `);

    // User B should not see User A's conversation
    const result = await client.query("SELECT * FROM public.conversations WHERE id = $1", [convId]);
    expect(result.rows.length).toBe(0);

    // User B should not be able to insert for User A
    await client.query("SAVEPOINT conversation_insert_check;");
    await expect(
      client.query("INSERT INTO public.conversations (user_id, title) VALUES ($1, 'Hacked')", [
        userA_id,
      ]),
    ).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT conversation_insert_check;");
  });

  it("enforces RLS on triage items", async () => {
    await client.query("RESET role;");
    const itemResult = await client.query(
      `
      INSERT INTO public.triage_items (user_id, source, source_id, content)
      VALUES ($1, 'email', 'thread-rls', '{"summary":"Private"}')
      RETURNING id
    `,
      [userA_id],
    );
    const itemId = itemResult.rows[0].id;

    await client.query(`
      SET LOCAL role authenticated;
      SELECT set_config('request.jwt.claims', '{"sub": "${userB_id}"}', true);
    `);

    const result = await client.query("SELECT * FROM public.triage_items WHERE id = $1", [itemId]);
    expect(result.rows.length).toBe(0);

    await client.query("SAVEPOINT triage_insert_check;");
    await expect(
      client.query(
        `
        INSERT INTO public.triage_items (user_id, source, source_id, content)
        VALUES ($1, 'email', 'hacked-thread', '{}')
      `,
        [userA_id],
      ),
    ).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT triage_insert_check;");
  });
});
