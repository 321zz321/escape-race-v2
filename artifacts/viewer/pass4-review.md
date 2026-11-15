Viewer pass 4 is complete. The objective pill is removed; activity, discoveries and inventory stay separate and fit without horizontal scrolling. All 132 engine objects have models, including hidden contents attached to their containers. Cupboards, drawers, chests, shelf curtains, tarp and rug animate on the appropriate engine events. Static geometry is merged and books, bottles and tile bases use instancing.

Verification: 31 tests passed. All four worlds have exactly one shadow light and no missing object models. Initial hidden objects stay invisible. Nested drawer reveals and player isolation passed. No viewer exceptions or chip overflow were found. Final four-view sample: 127 FPS at render scale 1 on this machine (1151 draw calls including shadows and postprocessing). This is a local measurement, not a laptop benchmark.

The protected test asserts the old bookshelf phrase verbatim, so that one phrase is corrected at the viewer boundary. Other engine edits only polish activity and reveal wording. public/mock.js, test/ and server/ are unchanged.

Captured in headless Chrome at 1600 x 1000, demo mode, speed 4, seed 42. The CDN was unreachable; verification served the matching local Three.js 0.186.0 package without changing the production import map.

- [pass4-start-lab.png](pass4-start-lab.png)
- [pass4-containers-opening.png](pass4-containers-opening.png)
- [pass4-containers-open.png](pass4-containers-open.png)
- [pass4-focus-cabinet.png](pass4-focus-cabinet.png)
- [pass4-focus-drawer.png](pass4-focus-drawer.png)
- [pass4-storage-tarp.png](pass4-storage-tarp.png)
- [pass4-focus-storage.png](pass4-focus-storage.png)
- [pass4-minefield.png](pass4-minefield.png)
- [pass4-focus-minefield.png](pass4-focus-minefield.png)
- [pass4-vault-board.png](pass4-vault-board.png)
- [pass4-focus-vault.png](pass4-focus-vault.png)
- [pass4-focus-vault-auto.png](pass4-focus-vault-auto.png)
- [pass4-four-views-auto.png](pass4-four-views-auto.png)

[Machine-readable checks](pass4-report.json) | [Capture harness](pass4-check.cjs)

Capture browser and server stopped. Automatic approval blocked deletion of the temporary Chrome profile folders.
