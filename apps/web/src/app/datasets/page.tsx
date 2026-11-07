import { CheckCircle2, Database } from "lucide-react";

export default function DatasetsPage() {
  const mockDatasets = [
    {
      id: "dataset-cust-support",
      name: "Customer Support Gold Benchmark",
      versionHash: "d3e1098a876c1234567890123456789012345678901234567890123456789012",
      casesCount: 100,
      qualityStatus: "PASSED (0 Duplicates, 0 Formatting Errors)",
      updatedAt: "3 hours ago",
    },
    {
      id: "dataset-finance-sec",
      name: "SEC 10-K Financial QA",
      versionHash: "88f34910ab192837465019283746501928374650192837465019283746501928",
      casesCount: 60,
      qualityStatus: "PASSED (0 Duplicates, 0 Formatting Errors)",
      updatedAt: "Yesterday",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Evaluation Datasets & Quality Checks
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Datasets are immutable collections of test cases. Every dataset version is verified with
          automated quality checks.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                <th className="py-2.5">Dataset Name</th>
                <th className="py-2.5">Version Hash (SHA-256)</th>
                <th className="py-2.5 text-center">Cases</th>
                <th className="py-2.5">Quality Check</th>
                <th className="py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {mockDatasets.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-500" />
                      <span>{d.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-slate-500 text-[11px]">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {d.versionHash.slice(0, 16)}...
                    </span>
                  </td>
                  <td className="py-3 text-center">{d.casesCount}</td>
                  <td className="py-3 font-sans">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{d.qualityStatus}</span>
                    </span>
                  </td>
                  <td className="py-3 font-sans text-slate-500">{d.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
