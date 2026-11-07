# ADR-003: Content-Addressed Immutability for Evaluation Artifacts

## Status
Accepted

## Context
A primary tenet of `llm-evalboard` is that **reproducibility is a feature, not an afterthought**. In typical LLM development, prompts, datasets, and graders evolve continuously. If evaluation records point to mutable identifiers (e.g., auto-incrementing IDs or mutable prompt names), re-running an evaluation weeks or months later will produce divergent scores, misleading regressions, or false improvements. Furthermore, caching provider calls across identical runs requires cryptographic certainty that the prompt templates, model parameters, test case inputs, and grader rubrics have not drifted by even a single character.

## Options Considered

1. **Option 1: Traditional Mutable Records with Updated-At Timestamps.**
   - Prompts and datasets are updated in place with an `updated_at` column.
   - *Drawback:* Destroys reproducibility. Past runs reference altered prompts, making regression tracking invalid.

2. **Option 2: Semantic Versioning / Incremental Sequential Versioning (e.g. `v1`, `v2`).**
   - Each edit increments a version number.
   - *Drawback:* Sequential numbers are non-deterministic across distributed branches, merge conflicts, or multi-developer environments. Re-importing identical files creates redundant versions (`v3` identical to `v1`).

3. **Option 3: Cryptographic Content Addressing via Canonical JSON Hashes.**
   - Entities (`PromptVersion`, `DatasetVersion`, `GraderVersion`, `RunConfig`) are assigned primary keys computed as the SHA-256 hash of their canonical JSON representation.
   - Re-importing identical content is idempotent and yields the exact same hash.
   - Any edit strictly produces a new content hash without mutating existing records.

## Decision
We adopt **Option 3: Content-addressed immutability across all core evaluation domain models**:
1. **Canonical JSON Normalisation:**
   - Object keys are recursively sorted in alphabetical order.
   - Strings are normalised to Unicode NFC form.
   - Dates are converted to ISO 8601 UTC strings.
   - Array element ordering is strictly preserved.
   - Whitespace is stripped (compact JSON).
   - Numerical representations are normalized (`-0` coerced to `0`, non-finite numbers rejected).
2. **Version Identifiers:**
   - `PromptVersion.id = sha256(canonicalJson({ template, variablesSchema, messageStructure }))`
   - `Case.id = sha256(canonicalJson({ input, expected, metadata, tags }))`
   - `DatasetVersion.id = sha256(canonicalJson({ cases: orderedCaseHashes, count }))`
   - `GraderVersion.id = sha256(canonicalJson({ type, config, judgePromptText, judgeModel }))`
   - `Run.configHash = sha256(canonicalJson(resolvedSuiteConfig))`
3. **Immutability Invariant:**
   - `prompt_versions`, `dataset_versions`, `cases`, and `grader_versions` are append-only. They are never updated or deleted after creation.
   - Existing evaluation runs reference immutable version hashes, guaranteeing that historical evaluation records remain permanently reproducible.

## Consequences
- Deduplication is automatic: importing identical prompts or test cases across branches or teams resolves to the same version ID and creates zero duplicate rows.
- Past run results are permanently auditable and unaffected by future prompt or dataset revisions.
- Provider caching keys are deterministic functions of the content-addressed input state.
