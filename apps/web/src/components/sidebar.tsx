"use client";

import {
  BarChart3,
  BookOpen,
  CheckSquare,
  Database,
  FileCode2,
  FolderGit2,
  Moon,
  PlayCircle,
  Scale,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (
      localStorage.getItem("theme") === "dark" ||
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  const navItems = [
    { label: "Suites & Projects", href: "/", icon: FolderGit2 },
    { label: "Compare View", href: "/compare", icon: Scale, highlight: true },
    { label: "Pareto Frontier", href: "/pareto", icon: BarChart3 },
    { label: "Prompts", href: "/prompts", icon: FileCode2 },
    { label: "Datasets", href: "/datasets", icon: Database },
    { label: "Judge Calibration", href: "/calibration", icon: CheckSquare },
    { label: "Evaluation Runs", href: "/runs", icon: PlayCircle },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-screen sticky top-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            Δ
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">
              llm-evalboard
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Statistical Evaluation
            </div>
          </div>
        </Link>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.highlight && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 font-semibold">
                  Hero
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer & Controls */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Documentation</span>
        </a>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
