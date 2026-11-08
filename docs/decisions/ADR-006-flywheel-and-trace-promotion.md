# ADR-006: Production-to-Test Flywheel Strategy, PII Redaction, and Trace Promotion Policy

## Context
A major failure mode of enterprise LLM evaluation is test-set staleness: benchmarks reflect early synthetic test prompts or static golden sets while production traffic drifts into real-world edge cases, user complaints, and domain-specific vocabulary.

The goal of the **Production-to-Test Flywheel** is to close this loop:
1. Ingest production traces (user inputs, model outputs, latencies, feedback).
2. Triage failure cases (negative user feedback, low judge scores, latency timeouts, anomalies).
3. Anonymize sensitive data (PII scrubbing: emails, phone numbers, credit cards, SSNs, API tokens, IP addresses).
4. Deduplicate and cluster traces to avoid bias or flooding the test set with repetitive complaints.
5. Synthetically expand edge cases (perturbations and entity substitutions) to multiply test coverage.
6. Promote traces into content-addressed dataset versions with full provenance tracking.

## Decision

### 1. Multi-Tier PII Redaction Before Persistence and Promotion
All production traces must undergo PII redaction before promotion into datasets. The redaction pipeline applies:
- **Email Addresses**: Scrubbed to `[EMAIL]` via RFC-compliant regex.
- **Credit Card Numbers**: Scrubbed to `[CREDIT_CARD]` with standard 13-19 digit card patterns and Luhn checksum validation to eliminate false positives.
- **US Social Security Numbers (SSN)**: Scrubbed to `[SSN]` matching standard formatted `XXX-XX-XXXX` and unseparated 9-digit patterns.
- **Phone Numbers**: Scrubbed to `[PHONE]` handling international (E.164) and US formats.
- **API Keys / Bearer Tokens**: Scrubbed to `[API_KEY]` targeting OpenAI (`sk-...`), JWT tokens (`eyJ...`), Anthropic keys, GitHub PATs, and generic bearer tokens.
- **IP Addresses**: Scrubbed to `[IP_ADDRESS]` covering IPv4 and IPv6.
- **Custom Redaction Rules**: Extensible interface allowing callers to supply custom regexes and replacement tokens.

### 2. Lexical & Semantic Deduplication
To prevent a single trending user issue from distorting benchmark weights:
- Traces are tokenized and compared using **Jaccard similarity on word n-grams** ($n=2$ / $n=3$).
- If a candidate trace has similarity $\ge 0.85$ with an existing test case in the target dataset, it is flagged as a duplicate.
- When ingesting batches of traces, the flywheel clusters traces into equivalence groups, selecting the centroid/representative trace for promotion.

### 3. Triage Classification
Incoming traces are automatically scored and categorized into triage priority:
- `CRITICAL`: Negative user feedback (e.g. thumbs-down, bug report) combined with low judge rating ($\le 0.3$).
- `HIGH`: Low judge rating ($\le 0.5$) or provider error/timeout.
- `MEDIUM`: Anomalously long response latency or length disparity.
- `LOW`: Neutral or positive feedback with passing evaluations.

### 4. Synthetic Variation Multiplier
Promoting a single failing trace risks overfitting a prompt to that exact wording. The flywheel provides a deterministic synthetic perturbation generator that creates $k$ variations:
- **Entity swapping**: Replaces names, dates, amounts, and geographic locations.
- **Lexical perturbations**: Modifies formality, whitespace, punctuation, and introduces minor common typos.
- **Seeded PRNG**: When generating variations, a deterministic seed guarantees that identical trace inputs produce identical synthetic variations across runs.

### 5. Content-Addressed Provenance Invariant
When a trace is promoted into a dataset:
- The case input is generated with explicit metadata:
  ```json
  {
    "promotedFromTrace": "trace_xyz123",
    "promotedAt": "2026-11-08T02:50:00.000Z",
    "triageReason": "negative_user_feedback",
    "synthetic": false
  }
  ```
- The dataset version is generated using the content-addressed hashing standard established in ADR-003: `sha256(canonicalJson(cases))`.

## Consequences
- **Positive**: Evaluation benchmarks stay dynamically aligned with production edge cases without human transcription overhead.
- **Positive**: Zero raw PII leaks into evaluation suites, repositories, or CI logs.
- **Positive**: Benchmarks remain statistically balanced via clustering and deduplication.
- **Trade-off**: High-volume production ingestion requires batching and filtering to avoid unbounded trace table growth; TTL retention policies will be added in Phase 14.

