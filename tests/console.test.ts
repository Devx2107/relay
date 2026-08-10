import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ConsolePage from "../app/console/page";

describe("authenticated console route", () => {
  it("renders the console shell for an authenticated user", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { email: "person@example.com" } } });

    const page = await ConsolePage();

    expect(page).toMatchObject({ props: { email: "person@example.com" } });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users before rendering the console", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });

    await expect(ConsolePage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
