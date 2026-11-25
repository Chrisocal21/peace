# peace: Feature Map

Working title. Creative piece-snapping builder inspired by the building systems of Conan Exiles, Satisfactory, Rust and The Front. Opened 2026-11-24.

Status key: DECIDED = Chris confirmed. PROPOSED = Forge suggestion, not yet confirmed.

## Core definition

- DECIDED: A separate game from Castle Builder. Different building model (snap pieces, not drag-extrude voxels).
- DECIDED: Purely creative. Mix the building pieces of survival and factory games into one sandbox.
- DECIDED: Only thing carried over from Castle Builder is the expandable foundation platform over a body of water.
- PROPOSED: Browser first (Three.js), chunked meshing, same engine foundations as Castle Builder.
- PROPOSED: No resources, no combat, no fail state, no physics or collapse.

## Platform and grid

- DECIDED: Expandable foundation over water. The platform starts small and grows by adding foundation tiles.
- DECIDED: Square tiles. One grid for every piece so all pieces link properly.
- PROPOSED: The foundation tile is the master unit. Every other piece is a fraction or multiple of it.

## Pieces

- DECIDED: Walls, domes, doorways, walkways, floors, roofs, ramps (starter list from Chris, etc. implied).
- DECIDED: One shape set. Each piece exists once.
- DECIDED: Swappable materials and styles per piece (looks inspired by the source games, not copies).
- PROPOSED materials: thatch, wood, stone, metal, concrete, glass.

## Placement (Blueprint mode)

- DECIDED: Blueprint mode. A ghost piece is held, adjusted, and only placed on confirm.
- DECIDED: Rotate in 90 degree turns. No free rotation.
- DECIDED: Nudge left, right, forward, back within the tile.
- DECIDED: Nudge step is a quarter tile (4 positions across a tile).

## Camera and movement

- DECIDED: Flight mode for building.
- DECIDED: First person.
- DECIDED: Walk mode in first person with simple box collision (walls block, doorways pass, ramps carry you up, floors hold you).
- PROPOSED: One key toggles between flight and walk.

## Look and feel

- DECIDED: Same stylized look as Castle Builder (clean, slightly toy-like, soft shadows, warm light). No photorealism.
- DECIDED: Shapes first, materials second.

## Save and share

- NOT DISCUSSED yet. See OPEN_QUESTIONS.

## Out of scope (proposed)

Resources, crafting, combat, enemies, physics, structural collapse, multiplayer, free-rotation placement.
