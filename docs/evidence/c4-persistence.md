# C4 persistent canvas and context evidence

2026-10-13; macOS arm64, Apple M5 Pro; Electron 44.7.0 / embedded Node 24.21.0.

## Implementation boundaries

- Migration 004 adds project-scoped canvases and selected-canvas state. Canvas graph, viewport, right-panel drafts, active tab, selected IDs and local user requirements save atomically under an expected storage revision. Node payloads contain asset-version references, not image bytes or full product facts. Asset versions must exist in the same project; unavailable run/definition references are rejected. Canvas references are recorded for asset retention.
- Project facts retain their separate C1 revision. Current project is now persisted as an explicit settings value; the previous bridge test expectation of `null` after restart was advanced to the exact selected project ID. Its cross-project image-access denial assertion remains intact.
- SaveCoordinator separates local edit sequence from database revision. A delayed acknowledgement advances only saved sequence, never replaces the live document or viewport. Saves serialize and coalesce; dragging publishes at gesture end. Failed revisions retain the draft, never silently retry or overwrite. Explicit transient retry still uses the same expected revision. Conflict offers reload or a distinct canvas copy.
- Canvas mounts change only for explicit load ID/epoch. Theme changes and save acknowledgements preserve the graph mount. Project/canvas switches cancel unfinished add batches and flush committed work; ordinary close waits for batch completion. Existing import locks remain active across file imports.
- PanelState is typed and canvas/project scoped. Inspector drafts are keyed by node ID. Saving a requirement snapshots selected node references immediately, then displays the user message only after SQLite confirms it. The UI says execution is unconnected and does not fabricate assistant output or an LLM submission. Credential forms are not part of PanelState.
- Main prevents normal window close and app quit, sends a fixed preload flush request with nonce, and waits for a sender-validated result. Renderer waits for active work, commits pending canvas work, flushes SQLite saves and saves product facts. Main destroys the window/shuts down runtime only on success. Renderer timeout and main 15-second timeout show failure and preserve the window; conflict recovery was exercised. This does not promise persistence after OS force-kill or power failure.
- C3 follow-ups: “商品资料 / 补充商品依据” clear the actual canvas selection so clicking the same node reopens its inspector; project changes clear import results. Both have Electron assertions.

## Verification

- `npm test`: 59 tests passed across 14 files. Includes a real SQLite close/reopen, stale revision rollback, foreign-project asset rejection, reference retention, independent project revision, delayed save acknowledgement/new viewport, rejected stale/future acknowledgements, conflict no-retry, explicit transient retry and immutable selected-input snapshot.
- `npm run typecheck`: passed. `git diff --check`: clean.
- `npm run package:desktop`: completed once for final persistence implementation. Full packaged Electron rerun: **15 passed in 18.3 seconds** using the built macOS executable and isolated `commercecanvas-e2e-` userData.
- New Electron tests restore nodes, edge, group, stale flag, original text-version reference, viewport, inspector draft, chat draft, selected canvas and exact project after normal close/relaunch. They switch multiple canvases/projects; save an actual user requirement; close while a draft is still awaiting debounce; and assert an external revision conflict is not overwritten, blocks close visibly, then recovers by saving a separate canvas.
- Existing graph keyboard/pointer/history, batch cancellation, 200-node/300-edge benchmark, image geometry, partial file import, bridge security, themes and product-form tests remain in the full suite.

## Observed failure and evidence limits

The first packaged full run had 14 passes and one C3 clipboard failure: a dialog intercepted the node-header click. The error artifact lacked a DOM snapshot identifying that dialog. A same-package targeted rerun with trace and dialog diagnostics passed (`dialog=[]`), then the full same-package rerun passed all 15. No production fix or weaker assertion was applied for that observation; its cause is unconfirmed. The diagnostic remains in the test to help identify a recurrence.

The close test proves a queued debounce is flushed and a failed conflict blocks close. Unit tests separately prove delayed in-flight acknowledgements preserve newer edits. A real 15-second nonresponsive renderer and forced utility-process crash were not newly injected in the C4 Electron scenario; runtime-client timeout/exit rejection retains its existing unit coverage.

After that packaged run, the user requested that tests not display desktop windows. Test-only window creation now uses `show: false` and disables background throttling whenever the validated isolated userData environment is present. macOS test mode hides the dock and prohibits activation; fixed/sanitized close/startup errors go to stderr instead of a native error dialog. The conflict test captures that error path. Typecheck was repeated; no further GUI launch was performed. Therefore the packaged 15-test evidence predates these test-window visibility/error-reporting changes and relocation of the screenshot output path. All future agents must run a newly built hidden-test application; the older visible package must not be launched for testing.

## Visual evidence

`apps/desktop/dist/c4-restored.png` is retained in the ignored evidence directory and was opened and inspected. It shows the restored group, selected text node, instruction edge, stale Agent, saved user requirement with one input snapshot and the draft saved by the close handshake. It is actual local test data with no generated model result. The final toolbar keeps project name and canvas selector visible.
