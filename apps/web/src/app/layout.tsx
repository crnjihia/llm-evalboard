import { Sidebar } from "@/components/sidebar";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "llm-evalboard | Statistically Honest LLM Evaluation",
  description:
    "An evaluation framework and dashboard that answers: Is this prompt or model change a real improvement, or just noise?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
