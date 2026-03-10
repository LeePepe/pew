import { Github } from "lucide-react";
import { LandingContent } from "@/components/landing/landing-content";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function LandingPage() {
  return (
    <div className="relative flex h-screen flex-col bg-background overflow-hidden">
      {/* Top-right icons */}
      <div className="absolute right-6 top-4 z-50 flex items-center gap-1">
        <a
          href="https://github.com/nicnocquee/pew"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="GitHub"
        >
          <Github className="h-4 w-4" strokeWidth={1.5} />
        </a>
        <ThemeToggle />
      </div>

      {/* Main — fills remaining space */}
      <LandingContent />

      {/* Footer — single compact line */}
      <footer className="border-t border-border/50 px-6 py-3">
        <div className="mx-auto max-w-6xl text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} pew.md
        </div>
      </footer>
    </div>
  );
}
