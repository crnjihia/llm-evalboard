import { FileCode2 } from "lucide-react";

export default function PromptsPage() {
  const mockPrompts = [
    {
      id: "a1c4e78299b341f2",
      name: "Customer Support Prompt",
      version: "v2.1",
      hash: "a1c4e78299b341f238d9f10928a3819201948271039481920391820192830192",
      updatedAt: "2 hours ago",
      variables: ["customer_name", "query", "order_id"],
      runsUsing: 8,
    },
    {
      id: "f83b1029c71629d8",
      name: "Financial Data Extractor",
      version: "v1.0",
      hash: "f83b1029c71629d8491820391820391820391820391820391820391820391820",
      updatedAt: "Yesterday",
      variables: ["document_text", "fiscal_year"],
      runsUsing: 14,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Prompt Management & Immutability
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Every prompt version is content-addressed via canonical SHA-256 hashes. Edits produce new
          versions; past runs are permanently immutable.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                <th className="py-2.5">Prompt Name</th>
                <th className="py-2.5">Version Hash (SHA-256)</th>
                <th className="py-2.5">Variables</th>
                <th className="py-2.5">Updated</th>
                <th className="py-2.5 text-center">Historical Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {mockPrompts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-indigo-500" />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-slate-500 text-[11px]">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {p.hash.slice(0, 16)}...
                    </span>
                  </td>
                  <td className="py-3 font-sans text-slate-600 dark:text-slate-400">
                    {p.variables.join(", ")}
                  </td>
                  <td className="py-3 font-sans text-slate-500">{p.updatedAt}</td>
                  <td className="py-3 text-center">{p.runsUsing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
