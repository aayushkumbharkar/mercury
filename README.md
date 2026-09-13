# Mercury

Mercury traces the consequences of a launch-date change across Google Calendar, Google Sheets, and Google Docs, applies scoped repairs, and verifies external state before claiming success.

## Two-minute demo

- **Production video:** [demo/mercury-demo.mp4](demo/mercury-demo.mp4) (1:57, 1080p, synchronized voiceover and captions).
- **Verified live take:** Take 2 reached live API mismatch at 43.5s and verified recovery at 62.5s ([demo/render-report.json](demo/render-report.json)).
- **Visual evidence:** Complete aligned UI screenshots preserved in [demo/evidence/](demo/evidence/) ([take-2-failure.png](demo/evidence/take-2-failure.png), [take-2-impact.png](demo/evidence/take-2-impact.png), [take-2-proof.png](demo/evidence/take-2-proof.png), [take-2-receipt.png](demo/evidence/take-2-receipt.png)).
- **Reproduction guide & shot list:** [demo/README.md](demo/README.md).

## Run locally

Requires Node 24+.

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4317. Rehearsal mode uses labeled fixtures. Live mode never falls back to fixtures.

## Live Google setup

Create a Google Desktop OAuth client. Enable Calendar, Sheets and Docs APIs, and add your Google account as a test user. Save its JSON to `secrets/google-client.json`. Run `npm run auth`, grant access in your regular browser, then run `npm run seed`. The seed creates only dedicated Mercury sandbox resources. Tokens and resource manifests remain local and gitignored.

Use: `Move launch from 2026-09-18 to 2026-09-22`. After a successful run, replay requires resetting the sandbox or using the currently observed source date. The demo runner handles its own verified reset.

The supported launch grammar requires no model API key. Broader prose currently uses an optional OpenAI API integration and is not required for the recorded workflow; it is not verified for this account. Do not claim autonomous, general-purpose reasoning from the deterministic demo.

## Verify

```powershell
npm test
npm run build
npm run evaluate
npm run test:browser
```

Browser checks require the running server and Microsoft Edge. Evaluation results are deterministic fixture evidence; live receipts are separately labeled and stored in `data/receipts/`.

## Reliability contract

- SUCCESS: every scoped postcondition was independently observed in the desired state.
- FAILED: known mismatch, conflict, or violated constraint.
- INCONCLUSIVE: missing evidence, ambiguity, interrupted execution, or approval withheld.
- At most two mutation attempts; read back before retrying uncertain writes.
- Revalidate preview assumptions, dependency membership, and prerequisites.
- Calendar uses etags; Docs uses revision-controlled exact-range edits.
- Sheets has no compare-and-swap. Use the dedicated register with one editor during the demo.
- Partial changes are retained and reported; there is no cross-app atomic transaction or blind rollback.

The six-second demo pause makes a real failed verification readable. Disable `MERCURY_DEMO_PAUSE_MS` for ordinary execution. It does not replace any external API result.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [EVALUATION.md](EVALUATION.md). Never commit `secrets/`, `.env`, or local OAuth tokens.
