# Canvas graph and layout history

2026-10-13 · C2

React Flow 12 supplies viewport, pointer gestures, selection and visible-element culling. Canvas documents are framework-independent Zod contracts. Asset nodes hold version references, not image data or product descriptions. Runtime state stays outside the document/history. A component mount receives an initial document; explicit document replacement needs a load epoch/key, while ordinary revisions must preserve the mount.

Each target accepts **one source for each role** (`product`, `scene`, `style`, `facts`, `instruction`, `copy`). The same source can explicitly fill different roles. Missing endpoints, self links, group endpoints, occupied role inputs and cycles are rejected. A downstream walk never invalidates ancestors or unrelated nodes.

History stores bounded layout snapshots (100 commands). Pointer moves update the active document, then drag stop records one command against the drag-start snapshot. Selection and run status are not layout commands. Undo/redo preserves the current viewport. Node deletion removes incident edges and descendant group members from the graph only; no asset repository delete method is called. Undo restores the graph and edges.

Grouping stores relative child coordinates and renders parents first. Ungrouping preserves absolute positions and reparents into the nearest surviving ancestor. DAG layout explicitly dissolves containers before laying out layers. Cyclic documents are rejected at the contract boundary; a defensive layout call on a cycle returns its input.

The graph traversal, history, group positioning, grid snapping configuration and DAG layout in `packages/canvas` are independently implemented here. No Nuomi/novelvideo canvas, store or short-drama node code was copied or imported. The prior Elastic-2.0/import-chain assessment in ADR 0001 still applies to any future reuse. React Flow handles grid snapping through its public API; there is no copied snapping implementation.

Benchmark fixtures exist only in Vitest/Playwright. The Electron fixture creates real unconfigured Agent nodes through the UI action and invokes the rendered connection callback from test evaluation. No production demo graph, fake product image, successful run or benchmark endpoint is installed.
