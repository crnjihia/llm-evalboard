import {
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export type JudgeTrustLevel =
  | "TRUSTED"
  | "USE_WITH_CAUTION"
  | "NOT_TRUSTED"
  | "UNCALIBRATED";

interface JudgeTrustBadgeProps {
  level: JudgeTrustLevel | string;
  kappa?: number;
  className?: string;
}

export function JudgeTrustBadge({
  level,
  kappa,
  className = "",
}: JudgeTrustBadgeProps) {
  const kappaStr = kappa !== undefined ? ` (κ = ${kappa.toFixed(2)})` : "";

  switch (level) {
    case "TRUSTED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 ${className}`}
          title="Judge agreement κ >= 0.70 with human ground truth"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>TRUSTED{kappaStr}</span>
        </span>
      );

    case "USE_WITH_CAUTION":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ${className}`}
          title="Moderate judge agreement 0.40 <= κ < 0.70; spot-check ratings"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>USE WITH CAUTION{kappaStr}</span>
        </span>
      );

    case "NOT_TRUSTED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800 ${className}`}
          title="Poor judge agreement κ < 0.40; ratings show high bias or noise"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>NOT TRUSTED{kappaStr}</span>
        </span>
      );

    case "UNCALIBRATED":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 ${className}`}
          title="Judge has not been calibrated against human ratings"
        >
          <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
          <span>UNCALIBRATED</span>
        </span>
      );
  }
}

