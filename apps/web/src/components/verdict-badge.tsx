import type { ComparisonVerdict } from "@evalboard/stats";
import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle } from "lucide-react";

interface VerdictBadgeProps {
  verdict: ComparisonVerdict | string;
  className?: string;
  showIcon?: boolean;
}

export function VerdictBadge({ verdict, className = "", showIcon = true }: VerdictBadgeProps) {
  switch (verdict) {
    case "BETTER":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 ${className}`}
          aria-label="Verdict: Better"
        >
          {showIcon && (
            <CheckCircle2
              className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          )}
          <span>BETTER</span>
        </span>
      );

    case "WORSE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 ${className}`}
          aria-label="Verdict: Worse"
        >
          {showIcon && (
            <AlertTriangle
              className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400"
              aria-hidden="true"
            />
          )}
          <span>WORSE</span>
        </span>
      );

    case "NO MEANINGFUL DIFFERENCE":
    case "NO_MEANINGFUL_DIFFERENCE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800 ${className}`}
          aria-label="Verdict: No meaningful difference"
        >
          {showIcon && (
            <MinusCircle
              className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400"
              aria-hidden="true"
            />
          )}
          <span>NO MEANINGFUL DIFFERENCE</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ${className}`}
          aria-label="Verdict: Inconclusive"
        >
          {showIcon && (
            <HelpCircle
              className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
          )}
          <span>INCONCLUSIVE</span>
        </span>
      );
  }
}
