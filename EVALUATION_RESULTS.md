# Deterministic evaluation results

Generated 2026-09-13T21:43:02.715Z. 8/8 passed. These results exercise the real coordinator against isolated fixture state. They do not establish live API behavior.

| Case | Expected | Actual | Writes | Verified | Recovered | Pass |
|---|---|---|---:|---:|---:|---|
| A · all succeed | SUCCESS | SUCCESS | 5 | 5 | 0 | yes |
| B · rejected mutation | FAILED | FAILED | 3 | 1 | 0 | yes |
| C · acknowledged stale write | SUCCESS | SUCCESS | 6 | 5 | 1 | yes |
| D · concurrent edit | FAILED | FAILED | 0 | 0 | 0 | yes |
| E · ambiguous request | INCONCLUSIVE | INCONCLUSIVE | 0 | 0 | 0 | yes |
| F · approval withheld | INCONCLUSIVE | INCONCLUSIVE | 0 | 0 | 0 | yes |
| F2 · explicit approval | SUCCESS | SUCCESS | 5 | 5 | 0 | yes |
| G · unreadable postcondition | INCONCLUSIVE | INCONCLUSIVE | 2 | 1 | 0 | yes |

Run: `npm run evaluate`. Unit/contract/HTTP tests: `npm test`. Local machine-readable receipts: `data/evaluations/`.
