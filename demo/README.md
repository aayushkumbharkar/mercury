# Mercury — two-minute demo

**Target:** 1:57. **Capture:** real Google Calendar, Sheets, and Docs, in a dedicated sandbox. **Voice:** locally synthesized Microsoft Zira Desktop. No API key or paid voice service required.

## Story and shot list

| Time | Picture | Purpose |
|---|---|---|
| 0:00–0:13 | Live workspace; issue the launch request at 0:08 | Establish the pain before the architecture |
| 0:13–0:37 | Discovered dependency graph and action contract | Show three applications, owners, prerequisites, different target dates |
| 0:37–0:50 | Execute; real progress and readbacks | Explain why acknowledgment is insufficient |
| ~0:47–1:00 | Actual mismatch banner; success withheld | Show the controlled stale write and the failed postcondition |
| ~1:00–1:28 | Recovery proof with original and repaired observations | Show a bounded repair, then final independent verification |
| 1:28–1:43 | Evidence table with five verified postconditions | Establish the receipt and scope |
| 1:43–1:57 | Return to recovery proof | Close on a precise, supportable claim |

The exact mismatch and completion timestamps are measured per take in `demo/evidence/take-N-timing.json`. Narration timing is adjusted to those actual events when needed. The controlled fault makes a real Sheets API call that retains the old date. A six-second recording-only pause occurs after the actual mismatch is detected, before repair. It changes pacing, not evidence or outcomes.

## Voiceover

The exact spoken text and cue positions are in `narration.json`. The separate WAV segments are in `audio/`. They can be replaced by a human reading without re-recording the application.

## Claims to preserve

- Three real applications, five scoped postconditions.
- A controlled stale write, not an accidental Google service outage.
- Independent API reads, not an API acknowledgment treated as completion.
- Verification is point-in-time. Mercury does not prove every owner read an update.
- The demonstrated request uses the supported deterministic launch grammar. Do not claim a runtime model produced this plan.

## Recording and reset

1. Authenticate Google once: `npm run auth`. Enable Calendar, Sheets, Docs APIs and add the signing-in account as a Google test user.
2. Provision the dedicated workspace: `npm run seed`.
3. Build: `npm run build`.
4. Start one server in PowerShell: `$env:MERCURY_DEMO_PAUSE_MS='6000'; npm start`.
5. Record: `node demo/record.mjs 1`.
6. Repeat with take numbers 2 and 3. Each run first resets the dedicated live workspace through the real planner/executor and verifies the reset.
7. Run `powershell -NoProfile -ExecutionPolicy Bypass -File demo/make-voice.ps1` for the local narration.
8. Run `node demo/render.mjs 3` to render the selected take after inspecting its timing and screenshots.

Node 24, npm dependencies, Microsoft Edge, FFmpeg/ffprobe, and Windows System.Speech are required. `npx playwright install ffmpeg` supplies the browser recorder component. No desktop, browser account chrome, notifications, OAuth screens, or token files are captured.

## Manual fallback

Open Mercury in regular Chrome/Edge at http://127.0.0.1:4317. Select Live, use the launch request, and select the acknowledged-stale-write fault. Capture only the browser content in OBS at 1600×900 or 1920×1080. Follow the shot list. Show the orange mismatch state, the repaired date, and the final table. Stop before 2:00. Keep authentication and account details outside the recording. Use the supplied WAV or record the script yourself.

## Editing integrity

The final MP4 trims setup from the beginning of a continuous real browser capture. It may add narration and captions; it must not invent state, splice different outcomes together, or label fixtures as live. Raw takes and receipts stay available for inspection. No external upload or invented video URL.
