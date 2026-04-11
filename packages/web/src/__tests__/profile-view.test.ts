import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
  };
});

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/hooks/use-public-profile", () => ({
  usePublicProfile: vi.fn(),
}));

vi.mock("@/hooks/use-pricing", () => ({
  usePricingMap: vi.fn(),
  formatCost: (v: number) => `$${v.toFixed(2)}`,
}));

import { PublicProfileView } from "@/app/u/[slug]/profile-view";
import { useSession } from "next-auth/react";
import { usePublicProfile } from "@/hooks/use-public-profile";
import { usePricingMap } from "@/hooks/use-pricing";

const mockedUseSession = vi.mocked(useSession);
const mockedUsePublicProfile = vi.mocked(usePublicProfile);
const mockedUsePricingMap = vi.mocked(usePricingMap);

function collectByHref(node: unknown, href: string, out: unknown[] = []): unknown[] {
  if (!node) return out;

  if (Array.isArray(node)) {
    for (const child of node) collectByHref(child, href, out);
    return out;
  }

  if (typeof node === "object" && node !== null) {
    const obj = node as { props?: Record<string, unknown> };
    const props = obj.props;
    if (props) {
      if (props.href === href) out.push(node);
      if ("children" in props) {
        collectByHref(props.children, href, out);
      }
    }
  }

  return out;
}

describe("PublicProfileView Compare CTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUsePricingMap.mockReturnValue({
      pricingMap: {
        models: {},
        prefixes: [],
        sourceDefaults: {},
        fallback: { input: 0, output: 0, cached: 0 },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockedUsePublicProfile.mockImplementation(() => ({
      user: {
        name: "Viewed User",
        image: null,
        slug: "alice",
        created_at: "2026-01-01T00:00:00Z",
      },
      data: {
        user: {
          name: "Viewed User",
          image: null,
          slug: "alice",
          created_at: "2026-01-01T00:00:00Z",
        },
        viewed_user_id: "viewed-id",
        records: [],
        summary: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 0,
        },
      },
      daily: [],
      sources: [],
      models: [],
      heatmap: [],
      loading: false,
      error: null,
      notFound: false,
      refetch: vi.fn(),
    }));
  });

  it("shows Compare button linking to /u/[slug]/compare only for signed-in non-self viewers", () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          id: "viewer-id",
          name: "Viewer",
          email: "viewer@example.com",
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
      update: vi.fn(),
    });

    const tree = PublicProfileView({ slug: "alice" });
    const links = collectByHref(tree, "/u/alice/compare");

    expect(links).toHaveLength(1);
  });

  it("hides Compare button for self profile", () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          id: "viewed-id",
          name: "Viewer",
          email: "viewer@example.com",
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
      update: vi.fn(),
    });

    const tree = PublicProfileView({ slug: "alice" });
    const links = collectByHref(tree, "/u/alice/compare");

    expect(links).toHaveLength(0);
  });

  it("hides Compare button for unauthenticated visitors", () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });

    const tree = PublicProfileView({ slug: "alice" });
    const links = collectByHref(tree, "/u/alice/compare");

    expect(links).toHaveLength(0);
  });
});
