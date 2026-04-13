import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/hooks/use-user-profile", () => ({
  useUserProfile: vi.fn(),
}));

vi.mock("@/components/profile/profile-content", () => ({
  ProfileContent: () => null,
}));

vi.mock("@/lib/date-helpers", () => ({
  formatMemberSince: (d: string) => d,
}));

import { PublicProfileView } from "@/app/u/[slug]/profile-view";
import { useSession } from "next-auth/react";
import { useUserProfile } from "@/hooks/use-user-profile";

const mockedUseSession = vi.mocked(useSession);
const mockedUseUserProfile = vi.mocked(useUserProfile);

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

    mockedUseUserProfile.mockReturnValue({
      user: {
        name: "Viewed User",
        nickname: null,
        image: null,
        slug: "alice",
        created_at: "2026-01-01T00:00:00Z",
        first_seen: null,
        badges: [],
      },
      data: {
        user: {
          name: "Viewed User",
          nickname: null,
          image: null,
          slug: "alice",
          created_at: "2026-01-01T00:00:00Z",
          first_seen: null,
          badges: [],
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
      } as any,
      daily: [],
      sources: [],
      models: [],
      heatmap: [],
      loading: false,
      error: null,
      notFound: false,
      refetch: vi.fn(),
    });
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
