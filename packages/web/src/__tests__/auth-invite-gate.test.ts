import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { D1Client } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/d1", () => ({
  getD1Client: vi.fn(),
}));

vi.mock("@/auth", () => ({
  shouldUseSecureCookies: vi.fn(() => false),
}));

import {
  handleInviteGate,
  type InviteGateRequest,
  type InviteGateAccount,
} from "@/lib/invite";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  } as unknown as D1Client;
}

function makeReq(cookies: Record<string, string> = {}): InviteGateRequest {
  return {
    cookies: {
      get(name: string) {
        const val = cookies[name];
        return val !== undefined ? { value: val } : undefined;
      },
    },
  };
}

const GOOGLE_ACCOUNT: InviteGateAccount = {
  provider: "google",
  providerAccountId: "google-123",
  email: "user@example.com",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleInviteGate", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should allow existing user (no invite check)", async () => {
    // getUserByAccount returns a user → existing
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce({ id: "user-1" });

    const result = await handleInviteGate(
      makeReq(),
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(result).toBe(true);

    // Should NOT have called execute (no invite code consumption)
    expect(vi.mocked(mockClient.execute)).not.toHaveBeenCalled();
  });

  it("should reject new user without invite cookie", async () => {
    // getUserByAccount returns null → new user
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);

    const result = await handleInviteGate(
      makeReq(), // no cookies
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("/login?error=InviteRequired");
  });

  it("should reject new user with invalid format cookie", async () => {
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);

    const result = await handleInviteGate(
      makeReq({ "pew-invite-code": "bad" }), // invalid format
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("/login?error=InviteRequired");
  });

  it("should allow new user with valid invite cookie", async () => {
    // getUserByAccount → null (new user)
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);
    // Atomic UPDATE succeeds
    vi.mocked(mockClient.execute).mockResolvedValueOnce({
      changes: 1,
      duration: 0.01,
    });

    const result = await handleInviteGate(
      makeReq({ "pew-invite-code": "A3K9X2M4" }),
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(result).toBe(true);

    // Should have consumed the code
    expect(vi.mocked(mockClient.execute)).toHaveBeenCalledOnce();
    const [sql, params] = vi.mocked(mockClient.execute).mock.calls[0]!;
    expect(sql).toContain("UPDATE invite_codes");
    expect(sql).toContain("used_by IS NULL");
    expect(params).toContain("pending:user@example.com");
    expect(params).toContain("A3K9X2M4");
  });

  it("should reject new user with already-used invite code (changes=0)", async () => {
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);
    // Atomic UPDATE fails (code already used)
    vi.mocked(mockClient.execute).mockResolvedValueOnce({
      changes: 0,
      duration: 0.01,
    });

    const result = await handleInviteGate(
      makeReq({ "pew-invite-code": "A3K9X2M4" }),
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("/login?error=InviteRequired");
  });

  it("should fall back to providerAccountId when email is null", async () => {
    const noEmailAccount: InviteGateAccount = {
      provider: "google",
      providerAccountId: "google-456",
      email: null,
    };
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);
    vi.mocked(mockClient.execute).mockResolvedValueOnce({
      changes: 1,
      duration: 0.01,
    });

    const result = await handleInviteGate(
      makeReq({ "pew-invite-code": "A3K9X2M4" }),
      noEmailAccount,
      mockClient
    );
    expect(result).toBe(true);

    const [, params] = vi.mocked(mockClient.execute).mock.calls[0]!;
    expect(params).toContain("pending:google-456");
  });

  it("should preserve callbackUrl in redirect URL", async () => {
    vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);

    const result = await handleInviteGate(
      makeReq({ "authjs.callback-url": "/dashboard/settings" }),
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(typeof result).toBe("string");
    expect(result).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/settings")}`
    );
  });

  it("should skip check when E2E_SKIP_AUTH=true in non-production", async () => {
    vi.stubEnv("E2E_SKIP_AUTH", "true");
    vi.stubEnv("NODE_ENV", "test");

    const result = await handleInviteGate(
      makeReq(),
      GOOGLE_ACCOUNT,
      mockClient
    );
    expect(result).toBe(true);

    // Should NOT have queried the database at all
    expect(vi.mocked(mockClient.firstOrNull)).not.toHaveBeenCalled();
  });

  it("should handle req=undefined gracefully (Server Component safety)", async () => {
    const result = await handleInviteGate(undefined, GOOGLE_ACCOUNT, mockClient);
    expect(result).toBe(true);

    // Should NOT have queried the database
    expect(vi.mocked(mockClient.firstOrNull)).not.toHaveBeenCalled();
  });

  it("should handle null account gracefully", async () => {
    const result = await handleInviteGate(makeReq(), null, mockClient);
    expect(result).toBe(true);
  });
});
