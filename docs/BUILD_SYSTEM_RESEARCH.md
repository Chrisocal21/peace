# peace: Build System Research (from "The Forge" universal building system)

Saved 2026-11-24. This is reference material, not an approved plan. It was written for a different project (The Forge / Project Baja, a realistic garage and workshop game), so it is filtered here for peace.

## What the research recommends

One construction language: materials become parts, parts connect into assemblies, assemblies form structures. Borrow from:
- Satisfactory: grid alignment, nudging, repeat placement, blueprints.
- Conan Exiles: snap sockets, foundations, columns, wedges, multistorey.
- Sons of the Forest: individual logs and boards, cutting, hands-on assembly.
- Icarus: span limits, material behaviour.
- The Front: swapping one foundation or wall into several shapes.
- Valheim: colour-coded stability. 7 Days to Die: weight limits. Enshrouded: fine-scale shaping.

Core rules worth keeping in mind:
1. One world scale with real dimensions. Grid steps are placement aids, not object sizes.
2. Several placement precisions (fine 5-10 cm, structural 25-50 cm, modules 1-2 m, large 4 m+) inside one system.
3. Four building methods that share one data model: modular, manual, precision, retrofit.
4. A wall can be one prefab or a set of posts, studs, sheathing and siding using the same rules.
5. Materials differ in behaviour, not only looks.
6. Terrain-aware foundations: slab, footings, piers, stilts, stepped.
7. Do not build a huge catalogue before the measurement and connection rules are locked.

## Where peace stands today

| Research idea | peace now |
|---|---|
| Grid plus freeform | Yes: 4-unit tile grid, edge/corner snapping, plus freeform beams, logs, planks and panels |
| Several precisions | Partly: tile, quarter-tile nudge, quarter-unit freeform grid, 15 degree angle snap |
| Sockets | Partly: foundation edges and corners, wall tops for upper floors. Not yet stairs-to-floor |
| Modular pieces | Yes: about 130 pieces in menu tabs |
| Manual pieces | Yes: Freeform tab |
| Retrofit (replace a material or swap a variant in place) | No |
| Blueprints | Partly: copy and paste, file export, share link |
| Terrain-aware foundations | Partly: sculptable islands, foundations allowed on flat land. No piers or stilts |
| Real measurements | No: placeholder units (tile 4, wall 3) |
| Structural physics, load paths, collapse | No, by design |
| Bill of materials, resource cost | No, by design |
| Utilities (power, plumbing) | No |

## Conflict with peace's design

peace is a purely creative sandbox: no resources, no combat, no collapse (see FEATURE_MAP.md and PROJECT_LOG.md). The Forge research assumes a simulation game with structural failure, a bill of materials and utilities. Those parts do not fit unless the design changes. A possible middle path is an optional, non-destructive "stability view" (Valheim-style colour overlay that warns but never collapses).

## Ideas that fit peace well

1. Retrofit: change the material of a placed piece, or swap it for a variant (wall to doorway to window) without rebuilding.
2. Prefab and open-up: a placed wall or roof that can be edited as its parts.
3. More precision tiers: a quarter-tile nudge plus finer steps for freeform and trim.
4. Terrain foundations: pier and stilt foundations that sit on uneven land.
5. Roof construction from parts: rafters, purlins, ridge cap, eave, gutter.
6. Small parts and trim: brackets, hinges, bolts, corner trim.
7. Optional stability overlay (green, yellow, red) with no collapse.
8. Named blueprint library.

## Open questions this raises

- Keep peace purely creative, or add an optional structural mode?
- Move to real metre scale (1 unit = 1 m) and re-proportion pieces to match?
- Is retrofit (swap and upgrade in place) a priority?
- Should prefab walls and roofs be openable into components?

## Implemented from this research (2026-11-24)

- Retrofit, aiming at a placed piece: V repaints it with the held material, Z swaps it for the held piece (same socket), O opens it into editable studs, joists or beams.
- Precision tiers: `,` and `.` change the arrow-key nudge (1, 0.5, 0.25, 0.1 units). `[` and `]` change the freeform grid (1 to 0.05 units).
- Stilt Platform and Footing Slab foundations that sit over low or sunken ground.
- Roof parts: Rafters, Low Rafters, Steep Rafters, Ridge Cap. Frame: Stud Wall. New Trim tab: baseboard, crown, corner trim, door frame, lintel, sill, shutters, brackets, gutter. New freeform kinds: rafter, stud, trim, pipe, gutter.
- K toggles the stability view (green, yellow, orange, red). It is display only and nothing collapses.
- Blueprints button in the file bar: save the Y,Y copied region by name and stamp it again later.
- Not done: real metre scale (needs every piece re-proportioned).

## Structural mode and the Frame kit (2026-11-24)

Design change requested by the user: building is piece by piece, posts and beams carry everything, panels only fit into frames, and physics is on.

- Menu tab Frame: Post, Beam (top), Sill Beam, Wall / Door / Window / Half Panel, Floor Panel, Roof Panel, Flat Roof Panel.
- Placement rules (shown in red in the HUD): posts need a foundation, a post below or a floor beam. Sill beams need a foundation edge. Top beams need posts at both ends (metal and concrete may cantilever). Wall panels fit between two posts. Floor panels need beams on two sides. Roof panels need top beams on two sides.
- Physics: pieces are checked for support, then load flows down through beams and posts. Every material has a weight and a strength (MAT_DENS and MAT_STR in main.js). Unsupported or overloaded posts and beams fall as debris and are removed. Ctrl+Z restores them.
- J toggles Structural / Creative mode. K shows the stress colours. In Structural mode the old full prefab pieces (Walls, Floors, Supports, Roofs, Slopes tabs) are blocked. Access, Trim, Furniture, Decor, Nature, Freeform and Terrain stay available.
- Not yet physical: freeform strands, stairs and ramps, furniture. Stress only covers posts, beams and the panels they carry.
