"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FolderKanban, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  project_ref: string;
  label: string | null;
  sources: string[];
  session_count: number;
  last_active: string;
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Inline editable label
// ---------------------------------------------------------------------------

function EditableLabel({
  projectRef,
  label,
  onSave,
}: {
  projectRef: string;
  label: string | null;
  onSave: (projectRef: string, newLabel: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (!value.trim()) return;
    if (value.trim() === label) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const success = await onSave(projectRef, value.trim());
    setSaving(false);

    if (success) {
      setEditing(false);
    }
  };

  const handleCancel = () => {
    setValue(label ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "w-full text-left px-2 py-1 rounded-md transition-colors",
          label
            ? "text-foreground hover:bg-accent"
            : "text-muted-foreground/50 italic hover:bg-accent hover:text-muted-foreground"
        )}
      >
        {label || "Click to label"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!saving) handleSave();
        }}
        placeholder="Label name"
        maxLength={100}
        disabled={saving}
        className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-success hover:bg-success/10 transition-colors shrink-0"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleCancel();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  "claude-code": "bg-orange-500/10 text-orange-600",
  codex: "bg-green-500/10 text-green-600",
  "gemini-cli": "bg-blue-500/10 text-blue-600",
  opencode: "bg-purple-500/10 text-purple-600",
  openclaw: "bg-pink-500/10 text-pink-600",
};

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] ?? "bg-gray-500/10 text-gray-600";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", color)}>
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Projects Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleSaveLabel = async (
    projectRef: string,
    newLabel: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ref: projectRef, label: newLabel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Failed to save label:", data);
        return false;
      }

      const data = await res.json();
      setProjects((prev) =>
        prev.map((p) =>
          p.project_ref === projectRef ? data.project : p,
        ),
      );
      return true;
    } catch (err) {
      console.error("Failed to save label:", err);
      return false;
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign labels to anonymized project references from your AI coding tools.
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">
          Loading projects...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">
          No projects found. Sync your AI tools to see project data.
        </div>
      )}

      {/* Projects table */}
      {!loading && !error && projects.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderKanban className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-sm font-medium text-foreground">All Projects</h2>
            <span className="text-xs text-muted-foreground">
              ({projects.length})
            </span>
          </div>

          <div className="rounded-xl bg-secondary overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_140px_100px_80px_100px] sm:grid-cols-[1fr_180px_140px_100px_120px] gap-2 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
              <div>Label</div>
              <div>Project Ref</div>
              <div>Sources</div>
              <div className="text-right">Sessions</div>
              <div className="text-right">Last Active</div>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-border">
              {projects.map((project) => (
                <div
                  key={project.project_ref}
                  className="grid grid-cols-[1fr_140px_100px_80px_100px] sm:grid-cols-[1fr_180px_140px_100px_120px] gap-2 px-4 py-2.5 text-sm items-center hover:bg-accent/50 transition-colors"
                >
                  {/* Label */}
                  <div className="min-w-0">
                    <EditableLabel
                      projectRef={project.project_ref}
                      label={project.label}
                      onSave={handleSaveLabel}
                    />
                  </div>

                  {/* Project ref */}
                  <div className="font-mono text-xs text-muted-foreground truncate">
                    {project.project_ref}
                  </div>

                  {/* Sources */}
                  <div className="flex flex-wrap gap-1">
                    {project.sources.slice(0, 2).map((source) => (
                      <SourceBadge key={source} source={source} />
                    ))}
                    {project.sources.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{project.sources.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Session count */}
                  <div className="text-right text-sm text-muted-foreground">
                    {project.session_count}
                  </div>

                  {/* Last active */}
                  <div className="text-right text-xs text-muted-foreground">
                    {relativeTime(project.last_active)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
