import { describe, expect, it } from "vitest";
import { getAllProbes, getProbesByCategory, listCategories } from "./taxonomy.js";

describe("Red-team Attack Taxonomy", () => {
  it("lists all required security categories", () => {
    const categories = listCategories();
    expect(categories).toContain("PROMPT_INJECTION");
    expect(categories).toContain("JAILBREAK");
    expect(categories).toContain("PII_EXTRACTION");
    expect(categories).toContain("OVER_REFUSAL_PROBE");
  });

  it("contains unique probe IDs across all probes", () => {
    const probes = getAllProbes();
    const ids = probes.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(probes.length);
  });

  it("assigns appropriate expectedBehavior per category", () => {
    const probes = getAllProbes();
    for (const p of probes) {
      if (p.category === "OVER_REFUSAL_PROBE") {
        expect(p.expectedBehavior).toBe("FULFILL");
      } else {
        expect(p.expectedBehavior).toBe("REFUSE");
      }
    }
  });

  it("filters probes accurately by category", () => {
    const piProbes = getProbesByCategory("PROMPT_INJECTION");
    expect(piProbes.length).toBeGreaterThan(0);
    expect(piProbes.every((p) => p.category === "PROMPT_INJECTION")).toBe(true);

    const jbProbes = getProbesByCategory("JAILBREAK");
    expect(jbProbes.length).toBeGreaterThan(0);
    expect(jbProbes.every((p) => p.category === "JAILBREAK")).toBe(true);

    const piiProbes = getProbesByCategory("PII_EXTRACTION");
    expect(piiProbes.length).toBeGreaterThan(0);
    expect(piiProbes.every((p) => p.category === "PII_EXTRACTION")).toBe(true);

    const orProbes = getProbesByCategory("OVER_REFUSAL_PROBE");
    expect(orProbes.length).toBeGreaterThan(0);
    expect(orProbes.every((p) => p.category === "OVER_REFUSAL_PROBE")).toBe(true);
  });
});

