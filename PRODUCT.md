# Mercury — cross-app recovery

Mercury understands the blast radius of a launch change, repairs affected work, and proves what recovered.

## Frozen MVP
One operator, one dedicated launch workspace, three real applications: Google Calendar, Google Sheets, Google Docs. Move the launch from 2026-09-18 to 2026-09-22, preserve task offsets and dependencies, update the launch brief only after its prerequisites verify. “Nobody stale” means the explicitly discovered artifacts; it never means everyone read a message.

The event links to a task register and brief. Register rows carry stable task IDs, owners, dates, prerequisites, fixed deadlines, and lock flags. Mercury discovers those links and relationships from external state, not from a hardcoded action list. Scope remains bounded to the provisioned sandbox.

## Competitive decision
Likely commodity: chat UI, three API calls, happy-path automation. This is a strategic hypothesis, not a claim about actual entrants. Winning wedge: acknowledged-but-wrong writes, independent readback, dependency-aware stopping, recovery, and a falsifiable receipt. A conditional refusal is more valuable than an inflated success counter.

Choose a deterministic coordinator over an agent framework or multi-agent system: cheapest architecture with the strongest trust boundary. One optional model call interprets intent; it cannot authorize writes or invent entities. Exact supported requests also work without model cost.

## Two-minute demo
0–20s: launch change and externally discovered blast radius.
20–40s: dates, owners, edges, risks, and approved scope.
40–80s: execute with visibly labeled controlled fault; one real write deliberately retains the old date. Independent read detects the mismatch; one safe repair is attempted.
80–105s: verified external links, before/expected/observed values, timestamps.
105–120s: show conflict evaluation: Mercury refuses to overwrite an intervening edit. End on “Tool success is not task success.”

## Non-goals and honesty
No Slack/Linear/Notion, multi-tenant auth, background watcher, universal graph, or notification delivery claims. Rehearsal uses explicitly labeled local fixtures. Live mode never falls back to fixtures. Three live integrations and a rehearsed demo are submission gates, not claims implied by unit tests.
