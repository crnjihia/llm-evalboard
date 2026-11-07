import { describe, expect, it } from "vitest";
import { computeDatasetDiff } from "./diff.js";
import { parseJsonlDataset } from "./parser.js";

describe("dataset diff computation", () => {
  it("identifies added, removed, changed, and unchanged cases", () => {
    const v1Jsonl = `{"input": {"q": "case 1"}, "expected": "A"}
{"input": {"q": "case 2"}, "expected": "B"}
{"input": {"q": "case 3"}, "expected": "C"}`;

    const v2Jsonl = `{"input": {"q": "case 1"}, "expected": "A"}
{"input": {"q": "case 2"}, "expected": "B_modified"}
{"input": {"q": "case 4"}, "expected": "D"}`;

    const casesV1 = parseJsonlDataset(v1Jsonl);
    const casesV2 = parseJsonlDataset(v2Jsonl);

    const diff = computeDatasetDiff(casesV1, casesV2);

    expect(diff.unchangedCount).toBe(1); // case 1 unchanged
    expect(diff.changedCases).toHaveLength(1); // case 2 modified
    expect(diff.changedCases[0]?.fieldChanges).toContain("expected");
    expect(diff.addedCases).toHaveLength(1); // case 4 added
    expect(diff.addedCases[0]?.input.q).toBe("case 4");
    expect(diff.removedCases).toHaveLength(1); // case 3 removed
    expect(diff.removedCases[0]?.input.q).toBe("case 3");

    expect(diff.summary).toContain("+1 added");
    expect(diff.summary).toContain("-1 removed");
    expect(diff.summary).toContain("1 changed");
    expect(diff.summary).toContain("1 unchanged");
  });
});
