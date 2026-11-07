import json
import os

def compute_kappa(human, judge, categories=None, weights=None):
    if categories is None:
        categories = sorted(list(set(human) | set(judge)))
    k = len(categories)
    cat_to_idx = {c: i for i, c in enumerate(categories)}
    N = len(human)
    C = [[0] * k for _ in range(k)]
    for h, j in zip(human, judge):
        C[cat_to_idx[h]][cat_to_idx[j]] += 1

    R = [sum(C[i]) for i in range(k)]
    S = [sum(C[i][j] for i in range(k)) for j in range(k)]

    if weights is None:
        po = sum(C[i][i] for i in range(k)) / N
        pe = sum(R[i] * S[i] for i in range(k)) / (N * N)
    else:
        po = 0.0
        pe = 0.0
        for i in range(k):
            for j in range(k):
                if weights == "linear":
                    w = 1.0 - abs(i - j) / (k - 1)
                elif weights == "quadratic":
                    w = 1.0 - ((i - j) ** 2) / ((k - 1) ** 2)
                else:
                    w = 1.0 if i == j else 0.0
                po += w * C[i][j] / N
                pe += w * (R[i] * S[j]) / (N * N)

    if abs(1.0 - pe) < 1e-12:
        kappa = 1.0 if abs(po - 1.0) < 1e-12 else 0.0
    else:
        kappa = (po - pe) / (1.0 - pe)

    raw_agreement = sum(1 for h, j in zip(human, judge) if h == j) / N

    return {
        "kappa": round(kappa, 6),
        "raw_agreement": round(raw_agreement, 6),
        "confusion_matrix": C,
        "categories": categories,
    }

def generate_kappa_vectors():
    vectors = []

    # Vector 1: Perfect agreement binary
    y1_true = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0]
    y1_pred = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0]
    res1 = compute_kappa(y1_true, y1_pred, categories=[0, 1])
    vectors.append({
        "id": "binary_perfect",
        "description": "Perfect agreement on binary scale (10 items)",
        "human": y1_true,
        "judge": y1_pred,
        "categories": [0, 1],
        "expected_kappa_unweighted": res1["kappa"],
        "expected_confusion_matrix": res1["confusion_matrix"],
        "raw_agreement": res1["raw_agreement"],
    })

    # Vector 2: Partial agreement binary
    y2_true = [1, 1, 1, 0, 0, 0, 1, 0, 1, 0]
    y2_pred = [1, 1, 0, 0, 1, 0, 1, 0, 0, 0]
    res2 = compute_kappa(y2_true, y2_pred, categories=[0, 1])
    vectors.append({
        "id": "binary_partial",
        "description": "Partial agreement on binary scale (10 items)",
        "human": y2_true,
        "judge": y2_pred,
        "categories": [0, 1],
        "expected_kappa_unweighted": res2["kappa"],
        "expected_confusion_matrix": res2["confusion_matrix"],
        "raw_agreement": res2["raw_agreement"],
    })

    # Vector 3: 5-point ordinal scale (unweighted, linear, quadratic)
    y3_true = [1, 2, 3, 4, 5, 2, 3, 4, 3, 5, 1, 2, 4, 5, 3]
    y3_pred = [1, 2, 2, 4, 5, 3, 3, 5, 3, 4, 1, 1, 4, 5, 2]
    cats3 = [1, 2, 3, 4, 5]
    res3_unw = compute_kappa(y3_true, y3_pred, categories=cats3)
    res3_lin = compute_kappa(y3_true, y3_pred, categories=cats3, weights="linear")
    res3_quad = compute_kappa(y3_true, y3_pred, categories=cats3, weights="quadratic")
    vectors.append({
        "id": "ordinal_5point",
        "description": "5-point Likert scale (1-5) evaluation with linear & quadratic weights",
        "categories": cats3,
        "human": y3_true,
        "judge": y3_pred,
        "expected_kappa_unweighted": res3_unw["kappa"],
        "expected_kappa_linear": res3_lin["kappa"],
        "expected_kappa_quadratic": res3_quad["kappa"],
        "expected_confusion_matrix": res3_unw["confusion_matrix"],
        "raw_agreement": res3_unw["raw_agreement"],
    })

    # Vector 4: Complete disagreement (kappa = -1.0)
    y4_true = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
    y4_pred = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    res4 = compute_kappa(y4_true, y4_pred, categories=[0, 1])
    vectors.append({
        "id": "binary_inverted",
        "description": "Complete disagreement (kappa = -1.0)",
        "human": y4_true,
        "judge": y4_pred,
        "categories": [0, 1],
        "expected_kappa_unweighted": res4["kappa"],
        "expected_confusion_matrix": res4["confusion_matrix"],
        "raw_agreement": res4["raw_agreement"],
    })

    # Vector 5: 3-class nominal scale
    y5_true = ["cat", "dog", "bird", "cat", "dog", "cat", "bird", "bird", "dog", "dog"]
    y5_pred = ["cat", "dog", "cat",  "cat", "dog", "cat", "dog",  "bird", "dog", "cat"]
    cats5 = ["bird", "cat", "dog"]
    res5 = compute_kappa(y5_true, y5_pred, categories=cats5)
    vectors.append({
        "id": "nominal_3class",
        "description": "3-class nominal scale ('bird', 'cat', 'dog')",
        "categories": cats5,
        "human": y5_true,
        "judge": y5_pred,
        "expected_kappa_unweighted": res5["kappa"],
        "expected_confusion_matrix": res5["confusion_matrix"],
        "raw_agreement": res5["raw_agreement"],
    })

    out_dir = os.path.join(os.path.dirname(__file__), "..", "..", "conformance", "vectors")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "kappa.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"schemaVersion": "1.0", "generator": "scikit-learn/scipy-compatible", "vectors": vectors}, f, indent=2)
    print(f"Generated {len(vectors)} kappa vectors into {out_file}")

if __name__ == "__main__":
    generate_kappa_vectors()
