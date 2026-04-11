import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/app/u/[slug]/compare/compare-view", () => ({
  CompareView: (props: { slug: string }) => ({
    type: "CompareView",
    props,
  }),
}));

import ProfileComparePage from "@/app/u/[slug]/compare/page";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const mockedAuth = vi.mocked(auth);
const mockedRedirect = vi.mocked(redirect);

describe("/u/[slug]/compare page auth guard", () => {
  it("redirects unauthenticated users to /login", async () => {
    (mockedAuth as any).mockResolvedValue(null);

    await expect(
      ProfileComparePage({ params: Promise.resolve({ slug: "alice" }) }),
    ).rejects.toThrow("REDIRECT:/login");

    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders compare view for authenticated users", async () => {
    (mockedAuth as any).mockResolvedValue({
      user: { id: "u1", email: "u1@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
    });

    const element = await ProfileComparePage({
      params: Promise.resolve({ slug: "alice" }),
    });

    expect((element as any).props.slug).toBe("alice");
  });
});
