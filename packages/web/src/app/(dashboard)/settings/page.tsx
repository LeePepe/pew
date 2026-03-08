"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  User,
  Users,
  Plus,
  LogIn,
  Copy,
  Check,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSettings {
  nickname: string | null;
  slug: string | null;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  invite_code: string;
  created_by: string;
  member_count: number;
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session } = useSession();

  // User settings state
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [nickname, setNickname] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [showJoinTeam, setShowJoinTeam] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joiningTeam, setJoiningTeam] = useState(false);
  const [teamMessage, setTeamMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image;

  // ---------------------------------------------------------------------------
  // Fetch settings
  // ---------------------------------------------------------------------------

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setNickname(data.nickname ?? "");
        setSlug(data.slug ?? "");
      }
    } catch {
      // Silently fail on initial load
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams ?? []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchTeams();
  }, [fetchSettings, fetchTeams]);

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      const body: Record<string, unknown> = {};
      if (nickname !== (settings?.nickname ?? "")) {
        body.nickname = nickname || null;
      }
      if (slug !== (settings?.slug ?? "")) {
        body.slug = slug || null;
      }

      if (Object.keys(body).length === 0) {
        setSaveMessage({ type: "success", text: "No changes to save." });
        setSaving(false);
        return;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setSaveMessage({ type: "success", text: "Settings saved." });
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveMessage({
          type: "error",
          text: (data as { error?: string }).error ?? "Failed to save settings.",
        });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create team
  // ---------------------------------------------------------------------------

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    setTeamMessage(null);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });

      if (res.ok) {
        setNewTeamName("");
        setShowCreateTeam(false);
        setTeamMessage({ type: "success", text: "Team created!" });
        fetchTeams();
      } else {
        const data = await res.json().catch(() => ({}));
        setTeamMessage({
          type: "error",
          text: (data as { error?: string }).error ?? "Failed to create team.",
        });
      }
    } catch {
      setTeamMessage({ type: "error", text: "Network error." });
    } finally {
      setCreatingTeam(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Join team
  // ---------------------------------------------------------------------------

  const handleJoinTeam = async () => {
    if (!inviteCode.trim()) return;
    setJoiningTeam(true);
    setTeamMessage(null);

    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      });

      if (res.ok) {
        setInviteCode("");
        setShowJoinTeam(false);
        setTeamMessage({ type: "success", text: "Joined team!" });
        fetchTeams();
      } else {
        const data = await res.json().catch(() => ({}));
        setTeamMessage({
          type: "error",
          text: (data as { error?: string }).error ?? "Failed to join team.",
        });
      }
    } catch {
      setTeamMessage({ type: "error", text: "Network error." });
    } finally {
      setJoiningTeam(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Leave team
  // ---------------------------------------------------------------------------

  const handleLeaveTeam = async (teamId: string) => {
    if (!confirm("Are you sure you want to leave this team?")) return;
    setTeamMessage(null);

    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) {
        setTeamMessage({ type: "success", text: "Left team." });
        fetchTeams();
      } else {
        const data = await res.json().catch(() => ({}));
        setTeamMessage({
          type: "error",
          text: (data as { error?: string }).error ?? "Failed to leave team.",
        });
      }
    } catch {
      setTeamMessage({ type: "error", text: "Network error." });
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account settings, leaderboard nickname, and team management.
        </p>
      </div>

      {/* Account Section */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <User className="h-4 w-4" strokeWidth={1.5} />
          Account
        </h2>
        <div className="rounded-xl bg-secondary p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              {userImage && <AvatarImage src={userImage} alt={userName} />}
              <AvatarFallback className="bg-primary text-primary-foreground">
                {userName[0] ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Google
            </span>
          </div>
        </div>
      </section>

      <Separator />

      {/* Profile Section */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
          Public Profile
        </h2>
        <div className="rounded-xl bg-secondary p-5 space-y-4">
          {/* Nickname */}
          <div>
            <label htmlFor="nickname" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Leaderboard Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={userName}
              maxLength={32}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 transition-shadow"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Displayed on the leaderboard instead of your real name. Leave empty to use your Google name.
            </p>
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Profile URL
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-border bg-background overflow-hidden">
              <span className="px-3 py-2 text-sm text-muted-foreground bg-accent/50 border-r border-border shrink-0">
                pew.dev/u/
              </span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="your-slug"
                maxLength={32}
                className="flex-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none bg-transparent min-w-0"
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Your public profile URL. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className={cn(
                "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                saving && "opacity-50 cursor-not-allowed",
              )}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saveMessage && (
              <span
                className={cn(
                  "text-xs",
                  saveMessage.type === "success"
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                {saveMessage.text}
              </span>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* Teams Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="h-4 w-4" strokeWidth={1.5} />
            Teams
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowJoinTeam(!showJoinTeam);
                setShowCreateTeam(false);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.5} />
              Join
            </button>
            <button
              onClick={() => {
                setShowCreateTeam(!showCreateTeam);
                setShowJoinTeam(false);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Create
            </button>
          </div>
        </div>

        {/* Team message */}
        {teamMessage && (
          <div
            className={cn(
              "rounded-lg p-3 text-xs mb-3",
              teamMessage.type === "success"
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {teamMessage.text}
          </div>
        )}

        {/* Create team form */}
        {showCreateTeam && (
          <div className="rounded-xl bg-secondary p-4 mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Team Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="My Team"
                maxLength={64}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 transition-shadow min-w-0"
                onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
              />
              <button
                onClick={handleCreateTeam}
                disabled={creatingTeam || !newTeamName.trim()}
                className={cn(
                  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0",
                  (creatingTeam || !newTeamName.trim()) && "opacity-50 cursor-not-allowed",
                )}
              >
                {creatingTeam ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Join team form */}
        {showJoinTeam && (
          <div className="rounded-xl bg-secondary p-4 mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Invite Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. abc12345"
                maxLength={32}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 transition-shadow min-w-0"
                onKeyDown={(e) => e.key === "Enter" && handleJoinTeam()}
              />
              <button
                onClick={handleJoinTeam}
                disabled={joiningTeam || !inviteCode.trim()}
                className={cn(
                  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0",
                  (joiningTeam || !inviteCode.trim()) && "opacity-50 cursor-not-allowed",
                )}
              >
                {joiningTeam ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        )}

        {/* Teams list */}
        {teams.length === 0 ? (
          <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">
            You&apos;re not in any teams yet. Create one or join with an invite code.
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="rounded-xl bg-secondary p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-muted-foreground shrink-0">
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Invite code */}
                    <div className="hidden sm:flex items-center gap-1 rounded-md bg-accent px-2 py-1">
                      <code className="text-[10px] font-mono text-muted-foreground">
                        {team.invite_code}
                      </code>
                      <CopyButton text={team.invite_code} />
                    </div>
                    {/* Leave button */}
                    <button
                      onClick={() => handleLeaveTeam(team.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Leave team"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
