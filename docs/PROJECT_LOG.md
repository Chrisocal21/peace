# peace: Project Log

## 2026-11-24: Session 1, concept

Chris pitched a creative builder mixing the building pieces of Conan Exiles, Satisfactory, Rust and The Front, played in flight mode and first person.

Decisions, in order:
- Separate game from Castle Builder. Castle Builder stays a Miniopolis-style drag-extrude voxel diorama. Only the expandable foundation over water carries over.
- Square tile grid, one grid so all pieces link. The foundation tile is the master unit, which solves the mixed-kit scale problem.
- Blueprint mode with 90 degree rotation. Chris first asked for 360 rotation, then clarified he meant nudging within the grid. Free rotation was dropped to keep snapping intact.
- Nudge is in quarter-tile steps (matches Castle Builder's 4x4 sub-grid).
- One shape set with swappable materials, instead of separate kits per source game.
- Same stylized look as Castle Builder. Shapes matter more than matching the source games.
- Walk mode with simple box collision plus flight mode for building.

Next session: master tile proportions, v1 piece list, platform expansion mechanic.
