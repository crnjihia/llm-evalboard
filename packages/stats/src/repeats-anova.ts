import { mean } from "./descriptives.js";

export interface AnovaVarianceDecomposition {
  kCases: number;
  mRepeats: number;
  msb: number;
  msw: number;
  varBetween: number;
  varWithin: number;
  totalVar: number;
  icc: number;
  pctModelNoise: number;
  pctCaseVariance: number;
  recommendation: {
    recommendedRepeats: string;
    explanation: string;
  };
}

/**
 * Computes one-way random effects ANOVA to decompose evaluation variance into:
 * 1. Between-case variance (difficulty/content diversity across test cases)
 * 2. Within-case variance (run-to-run stochasticity/model noise)
 *
 * Provides Intraclass Correlation Coefficient (ICC) and plain-language repeats recommendation.
 */
export function computeRepeatsAnova(casesData: number[][]): AnovaVarianceDecomposition {
  const validCases = casesData.filter((caseRuns) => caseRuns.length > 0);
  const k = validCases.length;

  if (k < 2) {
    return {
      kCases: k,
      mRepeats: validCases[0]?.length ?? 0,
      msb: 0,
      msw: 0,
      varBetween: 0,
      varWithin: 0,
      totalVar: 0,
      icc: 0,
      pctModelNoise: 0,
      pctCaseVariance: 0,
      recommendation: {
        recommendedRepeats: "1 repeat",
        explanation: "Insufficient cases to estimate variance components.",
      },
    };
  }

  const caseLengths = validCases.map((c) => c.length);
  const isBalanced = caseLengths.every((len) => len === caseLengths[0]);
  const totalN = caseLengths.reduce((a, b) => a + b, 0);

  const caseMeans = validCases.map((c) => mean(c));
  const grandMean = validCases.flat().reduce((sum, v) => sum + v, 0) / totalN;

  // Between-case Sum of Squares (SSB)
  let ssb = 0;
  for (let i = 0; i < k; i++) {
    const mi = validCases[i]?.length ?? 1;
    const cm = caseMeans[i] ?? 0;
    ssb += mi * (cm - grandMean) ** 2;
  }
  const dfB = k - 1;
  const msb = ssb / dfB;

  // Within-case Sum of Squares (SSW)
  let ssw = 0;
  for (let i = 0; i < k; i++) {
    const runs = validCases[i] ?? [];
    const cm = caseMeans[i] ?? 0;
    for (const val of runs) {
      ssw += (val - cm) ** 2;
    }
  }
  const dfW = totalN - k;
  const msw = dfW > 0 ? ssw / dfW : 0;

  // Effective m for unbalanced designs
  let effectiveM = 0;
  if (isBalanced) {
    effectiveM = caseLengths[0] ?? 1;
  } else {
    const sumMiSq = caseLengths.reduce((sum, len) => sum + len * len, 0);
    effectiveM = (totalN - sumMiSq / totalN) / (k - 1);
  }

  const varWithin = msw;
  const varBetween = effectiveM > 0 ? Math.max(0, (msb - msw) / effectiveM) : 0;
  const totalVar = varBetween + varWithin;
  const icc = totalVar > 0 ? varBetween / totalVar : 0;

  const pctModelNoise = totalVar > 0 ? (varWithin / totalVar) * 100 : 0;
  const pctCaseVariance = totalVar > 0 ? (varBetween / totalVar) * 100 : 0;

  let recommendedRepeats = "1-2 repeats";
  let explanation = "";

  if (icc >= 0.9) {
    recommendedRepeats = "1-2 repeats";
    explanation = `Model noise is minimal (${pctModelNoise.toFixed(1)}% of total variance). Test case differences drive ${pctCaseVariance.toFixed(1)}% of variance. Extra repeats add negligible information.`;
  } else if (icc >= 0.7) {
    recommendedRepeats = "3-5 repeats";
    explanation = `Moderate run-to-run stochasticity (${pctModelNoise.toFixed(1)}% model noise). Recommend 3-5 repeats to stabilize point estimates.`;
  } else {
    recommendedRepeats = "5+ repeats or temperature reduction";
    explanation = `Substantial run-to-run noise (${pctModelNoise.toFixed(1)}% of variance). The model is highly stochastic. Recommend 5+ repeats or reducing temperature to achieve statistical stability.`;
  }

  return {
    kCases: k,
    mRepeats: isBalanced ? (caseLengths[0] ?? 1) : Math.round(totalN / k),
    msb,
    msw,
    varBetween,
    varWithin,
    totalVar,
    icc,
    pctModelNoise,
    pctCaseVariance,
    recommendation: {
      recommendedRepeats,
      explanation,
    },
  };
}
