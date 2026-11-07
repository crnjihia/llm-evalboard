import { VerdictBadge } from "@/components/verdict-badge";
import { ArrowRight, FolderGit2, Scale } from "lucide-react";
import Link from "next/link";

interface MockRunItem {
  id: string;
  suiteName: string;
  date: string;
  arms: number;
  cases: number;
  costUsd: number;
  overallVerdict: string;
}

const RECENT_RUNS: MockRunItem[] = [
  {
    id: "run-e8f2a1b9-3c4d-4e5f",
    suiteName: "Customer Support Prompt Optimization",
    date: "10 mins ago",
    arms: 2,
    cases: 100,
    costUsd: 0.193,
    overallVerdict: "BETTER",
  },
  {
    id: "run-c149b8a2-11a3-48ef",
    suiteName: "Financial Advisory Compliance Benchmark",
    date: "2 hours ago",
    arms: 3,
    cases: 60,
    costUsd: 0.342,
    overallVerdict: "NO MEANINGFUL DIFFERENCE",
  },
  {
    id: "run-90bf23ea-88c1-45bd",
    suiteName: "Red-Team Prompt Injection Defense Suite",
    date: "Yesterday",
    arms: 2,
    cases: 40,
    costUsd: 0.088,
    overallVerdict: "WORSE",
  },
];

export default function HomePage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            LLM Evaluation Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Statistically honest evaluation for prompt and model iterations. Answering:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              "Is this change a real improvement, or just noise?"
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow transition-colors"
          >
            <Scale className="w-4 h-4" />
            <span>Open Compare View</span>
          </Link>
        </div>
      </div>

      {/* Metrics Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Active Evaluation Suites</div>
          <div className="text-2xl font-bold font-mono mt-1 text-slate-900 dark:text-slate-100">
            4
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Test Cases</div>
          <div className="text-2xl font-bold font-mono mt-1 text-slate-900 dark:text-slate-100">
            200
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Cached API Calls</div>
          <div className="text-2xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
            100%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Smallest Effect Size (δ)</div>
          <div className="text-2xl font-bold font-mono mt-1 text-indigo-600 dark:text-indigo-400">
            3.0 pts
          </div>
        </div>
      </div>

      {/* Recent Evaluation Runs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-slate-500" />
            <span>Recent Evaluation Runs</span>
          </h2>
          <span className="text-xs text-slate-500">PostgreSQL Backed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                <th className="py-2.5">Suite / Project</th>
                <th className="py-2.5">Date</th>
                <th className="py-2.5 text-center">Arms</th>
                <th className="py-2.5 text-center">Cases</th>
                <th className="py-2.5 text-right">Cost ($ USD)</th>
                <th className="py-2.5 text-center">Statistical Verdict</th>
                <th className="py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {RECENT_RUNS.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                    <div>{run.suiteName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{run.id}</div>
                  </td>
                  <td className="py-3 font-sans text-slate-500">{run.date}</td>
                  <td className="py-3 text-center">{run.arms}</td>
                  <td className="py-3 text-center">{run.cases}</td>
                  <td className="py-3 text-right">${run.costUsd.toFixed(3)}</td>
                  <td className="py-3 text-center">
                    <VerdictBadge verdict={run.overallVerdict} />
                  </td>
                  <td className="py-3 text-right font-sans">
                    <Link
                      href="/compare"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                    >
                      <span>Compare</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
