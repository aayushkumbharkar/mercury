# Evaluation contract

Tests exercise the real planner and executor against an isolated stateful external-store double. These are deterministic evaluations, not live integration evidence. Live receipts identify their mode and external IDs.

| Case | Injection | Expected outcome |
|---|---|---|
| A | None | SUCCESS; all dates verified |
| B | Permanent mutation rejection | FAILED; at most two attempts; descendants withheld |
| C | API acknowledges old value | Detect mismatch, safe retry, SUCCESS with recovery evidence |
| D | Concurrent edit after preview | FAILED; conflicting state preserved; no blind retry |
| E | Ambiguous date/request | INCONCLUSIVE; zero mutations |
| F | External-facing entity | INCONCLUSIVE until explicit approval; zero unapproved mutations |
| G | Readback unavailable | INCONCLUSIVE; no blind repeat |
| H | Lost mutation response, state correct | SUCCESS after readback, no duplicate mutation |
| I | Fixed deadline violated/cycle/missing dependency | FAILED plan; zero mutations |
| J | Post-verification drift | Final reconciliation prevents SUCCESS |

Submission requires: tests, strict typecheck, production build, browser walkthrough, independently read live changes across Calendar/Sheets/Docs, visible controlled failure and recovery. No live credentials means live status remains unverified.
