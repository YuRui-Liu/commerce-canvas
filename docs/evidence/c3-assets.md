# C3 asset workflows evidence

2026-10-13, macOS arm64 / Apple M5 Pro, Electron 44.7.0, embedded Node 24.21.0.

## Final verification

- `npm run typecheck`: passed after the final source changes.
- `npm test`: 53 tests passed across 11 files. The final follow-up source changes were the inspector's project-session synchronization and library spacing; the extended Electron scenario verifies that synchronization.
- Development full Electron run: 12 passed, one packaged-only test skipped.
- `npm run package:desktop` completed; the final packaged executable ran all 13 Electron tests successfully in 16.6 seconds, including all C1/C2 tests and the three C3 scenarios. The production package was rebuilt after the final project-session synchronization fix.
- `git diff --check`: clean.

The packaged command used `COMMERCECANVAS_EXECUTABLE=.../dist/packages/CommerceCanvas-darwin-arm64/CommerceCanvas.app/Contents/MacOS/CommerceCanvas npm run test:e2e`. Each scenario uses a temporary user-data directory and the real preload, main process, utility process, SQLite, managed files, and image decoder.

## Behavior assertions

- External file drop is tested after actual zoom controls and middle-button pan. The test independently computes the inverse viewport transform and asserts the inserted node's flow coordinates. Client coordinates go directly to React Flow's `screenToFlowPosition`, without subtracting the canvas origin twice. Placement explicitly disables snap for the initial drop.
- Clipboard image and plain text produce managed assets and nodes. Input, textarea and contenteditable paste do not produce nodes. Delete in the text inspector preserves the node. A synthetic composing Enter does not submit the text form.
- A batch containing an invalid PNG and a valid PNG retains the valid asset and exposes both file results. The native file-dialog scenario supplies only the selected paths through a test override of `showOpenDialog`; actual main-process reads and runtime imports execute. Dropped files use DOM `DataTransfer`/`File` inputs, never a mock storage service.
- Dragging an existing asset ID creates another graph reference while the asset count stays unchanged; image bytes are not copied again.
- The same text source connects to separate Agents with distinct roles. Editing one edge's role leaves the other unchanged. Unit coverage rejects an occupied target role.
- Text save creates a new immutable version on the same asset. The original text remains readable. Only the selected node changes its version reference; descendants receive `stale`, unrelated nodes retain their state, and graph node data does not contain the full text. Drafts survive node selection and project switches in the current session.
- Viewer fit and actual-pixel modes assert rendered image dimensions. Compare uses differently shaped 1200×600 and 600×1200 originals: at 1:1 their DOM bounds equal those dimensions, zoom transforms match, and the same 40×30-pixel pan applies to both. Slider clipping is asserted independently. Escape restores focus to the actual trigger. Double-clicking a graph preview leaves its node transform unchanged.

## Regressions found and repaired

- Graph version replacement and edge-role tests first failed against identity stubs; common pixel-fit math first failed with an incorrect scale of 1.
- The transformed-drop Electron assertion first exposed grid snapping (160 instead of 163.055…); direct screen conversion with explicit unsnapped initial placement fixed it.
- Screenshot review found missing thumbnails immediately after import. A new runtime test reproduced `ENOENT`. Thumbnail reads now wait for the queued job associated with that hash, not the complete background queue. Existing error handling settles failed jobs and records the error; original managed asset bytes and database references remain intact.
- The pre-existing explicit `cleanupUnreferenced(0)` test failed intermittently because fractional file modification times could exceed integer `Date.now()` by less than one millisecond. Zero now means immediate cleanup while still requiring no asset-version references. Positive retention periods keep the age check.
- A new cross-project draft scenario failed because the restored canvas did not publish its initial document to the inspector. The region now synchronizes the current project session on ID change; the extended scenario passed.
- The native packaged run exposed a test-only creation race in the C1 conflict test: it read `currentProject` before creation completed. It now waits for the product field before capturing the ID. Double-click coverage was also corrected to separate overlapping nodes and compare only position transforms, allowing normal selection z-index changes.
- An initial C3 launch timeout was a test-directory prefix mistake, not an application failure. A later sandboxed packaging attempt failed at a network fetch; the authorized escalated packaging command succeeded.

## Visual evidence and boundaries

The final screenshots were opened and inspected:

- `apps/desktop/dist/c3-studio.png`
- `apps/desktop/dist/c3-editorial.png`
- `apps/desktop/dist/c3-compare.png`

These use locally generated colored rectangular fixtures to demonstrate aspect ratios, pixel geometry, image loading and unchanged colors across themes. They are not real-product creative approval or advertising claims. Screenshots and packages remain in ignored build output.

Clipboard/drop and IME composition inputs are explicitly synthesized DOM events. This does not claim a human OS clipboard, Finder drag, or real Chinese IME session was exercised. No provider credentials, remote uploads, generation requests or fake production adapters were involved. Graph and node drafts are still in-memory sessions; durable persistence remains C4.
