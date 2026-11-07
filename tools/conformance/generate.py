import json
import math
import os

# ==============================================================================
# Helper math implementations for Python conformance generation
# ==============================================================================

def normal_ppf(p):
    """
    Inverse standard normal cumulative distribution function (Acklam's algorithm).
    Accurate to > 9 decimal places across entire domain.
    """
    if p <= 0.0 or p >= 1.0:
        raise ValueError("p must be in (0, 1)")

    a = [-3.969683028665376e+01, 2.209460984245205e+02,
         -2.759285104469687e+02, 1.383577518672690e+02,
         -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02,
         -1.556989798598866e+02, 6.680131188771972e+01,
         -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01,
         -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01,
         2.445134137142996e+00, 3.754408661907416e+00]

    p_low = 0.02425
    p_high = 1.0 - p_low

    if p < p_low:
        q = math.sqrt(-2.0 * math.log(p))
        return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
               ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1.0)
    elif p <= p_high:
        q = p - 0.5
        r = q * q
        return q * (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) / \
                   (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1.0)
    else:
        q = math.sqrt(-2.0 * math.log(1.0 - p))
        return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
                ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1.0)

def wilson_interval(successes, total, confidence=0.95):
    """Wilson score confidence interval for a proportion."""
    if total == 0:
        return {"proportion": 0.0, "lower": 0.0, "upper": 0.0}
    p = successes / total
    alpha = 1.0 - confidence
    z = normal_ppf(1.0 - alpha / 2.0)
    z2 = z * z
    denom = 1.0 + z2 / total
    center = (p + z2 / (2.0 * total)) / denom
    spread = (z * math.sqrt((p * (1.0 - p) + z2 / (4.0 * total)) / total)) / denom
    lower = max(0.0, center - spread)
    upper = min(1.0, center + spread)
    return {
        "proportion": round(p, 6),
        "lower": round(lower, 6),
        "upper": round(upper, 6),
        "confidence": confidence,
    }

def mcnemar_exact(b, c):
    """Exact two-sided McNemar test for discordant pairs b and c using Binomial distribution."""
    n = b + c
    if n == 0:
        return {"p_value": 1.0, "b": b, "c": c}
    k = min(b, c)
    # Sum binomial PMF for i from 0 to k
    cum = sum(math.comb(n, i) * (0.5 ** n) for i in range(k + 1))
    pval = min(1.0, 2.0 * cum)
    return {"p_value": round(pval, 6), "b": b, "c": c}

def anova_icc(cases_data):
    """
    cases_data is a list of lists: k cases, each with m repeats.
    Computes between-case variance, within-case variance, and ICC(1).
    """
    k = len(cases_data)
    m = len(cases_data[0])
    N = k * m

    case_means = [sum(case) / m for case in cases_data]
    grand_mean = sum(case_means) / k

    # Between-case sum of squares
    ssb = m * sum((cm - grand_mean) ** 2 for cm in case_means)
    df_b = k - 1
    msb = ssb / df_b

    # Within-case sum of squares
    ssw = sum(sum((val - case_means[i]) ** 2 for val in cases_data[i]) for i in range(k))
    df_w = k * (m - 1)
    msw = ssw / df_w

    var_within = msw
    var_between = max(0.0, (msb - msw) / m)
    total_var = var_between + var_within
    icc = var_between / total_var if total_var > 0 else 0.0

    pct_model_noise = (var_within / total_var) * 100.0 if total_var > 0 else 0.0
    pct_case_variance = (var_between / total_var) * 100.0 if total_var > 0 else 0.0

    return {
        "k_cases": k,
        "m_repeats": m,
        "msb": round(msb, 6),
        "msw": round(msw, 6),
        "var_between": round(var_between, 6),
        "var_within": round(var_within, 6),
        "icc": round(icc, 6),
        "pct_model_noise": round(pct_model_noise, 2),
        "pct_case_variance": round(pct_case_variance, 2),
    }

def power_sample_size(std_diff, delta, alpha=0.05, power=0.80):
    """Calculates required sample size N for paired differences."""
    z_alpha = normal_ppf(1.0 - alpha / 2.0)
    z_beta = normal_ppf(power)
    n = ((z_alpha + z_beta) ** 2) * (std_diff ** 2) / (delta ** 2)
    return {
        "std_diff": std_diff,
        "delta": delta,
        "alpha": alpha,
        "power": power,
        "n_required": math.ceil(n),
    }

def adjust_p_values_holm(p_values):
    """Holm step-down adjustment."""
    m = len(p_values)
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    adjusted = [0.0] * m
    running_max = 0.0
    for rank, (orig_idx, p) in enumerate(indexed):
        adj = min(1.0, (m - rank) * p)
        running_max = max(running_max, adj)
        adjusted[orig_idx] = round(running_max, 6)
    return adjusted

def adjust_p_values_bh(p_values):
    """Benjamini-Hochberg (FDR) adjustment."""
    m = len(p_values)
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    adjusted = [0.0] * m
    running_min = 1.0
    for rank in range(m - 1, -1, -1):
        orig_idx, p = indexed[rank]
        i = rank + 1
        adj = min(1.0, (m / i) * p)
        running_min = min(running_min, adj)
        adjusted[orig_idx] = round(running_min, 6)
    return adjusted

# ==============================================================================
# Vector Generation
# ==============================================================================

def generate_stats_vectors():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "..", "conformance", "vectors")
    os.makedirs(out_dir, exist_ok=True)

    # 1. Wilson intervals
    wilson_vectors = [
        {"successes": 95, "total": 100, "confidence": 0.95, "expected": wilson_interval(95, 100, 0.95)},
        {"successes": 50, "total": 100, "confidence": 0.95, "expected": wilson_interval(50, 100, 0.95)},
        {"successes": 0, "total": 50, "confidence": 0.95, "expected": wilson_interval(0, 50, 0.95)},
        {"successes": 38, "total": 40, "confidence": 0.99, "expected": wilson_interval(38, 40, 0.99)},
    ]

    # 2. McNemar exact tests
    mcnemar_vectors = [
        {"b": 2, "c": 12, "expected": mcnemar_exact(2, 12)},
        {"b": 5, "c": 5, "expected": mcnemar_exact(5, 5)},
        {"b": 0, "c": 8, "expected": mcnemar_exact(0, 8)},
        {"b": 10, "c": 25, "expected": mcnemar_exact(10, 25)},
    ]

    # 3. ANOVA / ICC repeat variance
    cases_repeats = [
        [0.85, 0.88, 0.82],
        [0.92, 0.95, 0.90],
        [0.40, 0.45, 0.38],
        [0.65, 0.60, 0.70],
        [0.10, 0.15, 0.12],
    ]
    anova_vector = {
        "cases_data": cases_repeats,
        "expected": anova_icc(cases_repeats),
    }

    # 4. Power sample size calculations
    power_vectors = [
        {"std_diff": 0.15, "delta": 0.03, "alpha": 0.05, "power": 0.80, "expected": power_sample_size(0.15, 0.03, 0.05, 0.80)},
        {"std_diff": 0.08, "delta": 0.03, "alpha": 0.05, "power": 0.80, "expected": power_sample_size(0.08, 0.03, 0.05, 0.80)},
        {"std_diff": 0.20, "delta": 0.05, "alpha": 0.01, "power": 0.90, "expected": power_sample_size(0.20, 0.05, 0.01, 0.90)},
    ]

    # 5. Multiple comparisons adjustments (Holm & BH)
    p_values = [0.001, 0.012, 0.035, 0.048, 0.120, 0.650]
    multi_comp_vector = {
        "raw_p_values": p_values,
        "expected_holm": adjust_p_values_holm(p_values),
        "expected_bh": adjust_p_values_bh(p_values),
    }

    stats_out = {
        "schemaVersion": "1.0",
        "generator": "independent-python-stats",
        "wilson": wilson_vectors,
        "mcnemar": mcnemar_vectors,
        "anova": anova_vector,
        "power": power_vectors,
        "multipleComparisons": multi_comp_vector,
    }

    out_file = os.path.join(out_dir, "stats.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(stats_out, f, indent=2)
    print(f"Generated stats conformance vectors into {out_file}")

if __name__ == "__main__":
    generate_stats_vectors()
