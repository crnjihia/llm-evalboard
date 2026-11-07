import { JudgeTrustBadge } from "@/components/judge-trust-badge";

export default function CalibrationPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          LLM Judge Calibration & Human Agreement
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Calibrating LLM judges against blinded human ground-truth labels. Agreement is quantified
          via Cohen's Kappa (κ), confusion matrices, and length bias analysis (Phase 6).
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Active Judge: Rubric Judge (Claude 3.5 Sonnet)
            </h2>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              Criterion: Overall Helpfulness & Quality | Sample: N = 50 Blinded Items
            </div>
          </div>
          <JudgeTrustBadge level="TRUSTED" kappa={0.78} />
        </div>

        {/* Agreement Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div className="text-xs text-slate-500 font-medium">
              Cohen's Kappa (Linear-Weighted)
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              0.780
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              95% Bootstrap CI: [0.685, 0.865]
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div className="text-xs text-slate-500 font-medium">Raw Percentage Agreement</div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
              82.0%
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              41 of 50 exact label matches
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div className="text-xs text-slate-500 font-medium">Output Length Bias (Pearson r)</div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
              +0.04
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              No verbosity preference detected (|r| &lt; 0.15)
            </div>
          </div>
        </div>

        {/* Confusion Matrix */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Human vs. Judge Confusion Matrix (1–5 Likert Scale)
          </h3>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse font-mono">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-2 text-left font-sans">Human \ Judge</th>
                  <th className="p-2 text-center w-12">Score 1</th>
                  <th className="p-2 text-center w-12">Score 2</th>
                  <th className="p-2 text-center w-12">Score 3</th>
                  <th className="p-2 text-center w-12">Score 4</th>
                  <th className="p-2 text-center w-12">Score 5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                    Score 1
                  </td>
                  <td className="p-2 text-center bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                    8
                  </td>
                  <td className="p-2 text-center text-slate-400">1</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                    Score 2
                  </td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                    7
                  </td>
                  <td className="p-2 text-center text-slate-400">2</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                    Score 3
                  </td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">1</td>
                  <td className="p-2 text-center bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                    9
                  </td>
                  <td className="p-2 text-center text-slate-400">1</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                    Score 4
                  </td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">2</td>
                  <td className="p-2 text-center bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                    8
                  </td>
                  <td className="p-2 text-center text-slate-400">1</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                    Score 5
                  </td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">0</td>
                  <td className="p-2 text-center text-slate-400">1</td>
                  <td className="p-2 text-center bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                    9
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
