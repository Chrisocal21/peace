# peace: Progress Tracker

Updated 2026-11-24.

## Stage

Early prototype running on localhost:3000 (Vite + Three.js).

## Done

- Concept defined: creative snap-piece builder mixing the building systems of Conan Exiles, Satisfactory, Rust and The Front.
- Confirmed separate from Castle Builder.
- Grid decided: square tiles, one grid for all pieces.
- Platform decided: expandable foundation over water.
- Blueprint mode decided: 90 degree rotation, quarter-tile nudge.
- Pieces approach decided: one shape set, swappable materials.
- Look decided: same stylized look as Castle Builder.
- Camera decided: flight mode plus walk mode with simple collision.

- Prototype built: 8 pieces, 6 materials, blueprint ghost with rotate and nudge, platform expansion over water, flight and walk modes with simple collision.
- Build menu (Tab/B) with categories, 3D piece thumbnails, material swatches, plus a hotbar.
- 15 pieces: foundation, floor, wall, doorway, window, half wall, fence, walkway, ramp, stairs, pillar, roof, flat roof, pyramid roof, dome.
- Autosave to the browser (localStorage). Shift+N starts a new world.
- Lake setting with a wooded shoreline, animated wind ripples, and sky colors that follow the day/night toggle.
- Beveled foundation caps and pilings, framed rectangular doors and windows, and shaped barrels with raised hoops. Textured finishes have shallow surface relief and rotate with placed pieces.
- Realism pass across the 127-piece catalog. The alpine panorama lights the materials and appears in live water reflections. Fixed rock and reed islets give nearby scenery parallax in flight.
- Thirteen local surface textures support weathered masonry, timber, roofing, metalwork, cloth, and other finishes. Glass and ice use transmission. Construction details and material groups are shared by the build menu, blueprints, placed pieces, and loaded worlds.

## In progress

- Playtesting the prototype and tuning the placeholder values (tile 4, wall height 3, nudge 1).

## Next

0. Playtest findings.
1. Settle the v1 piece list and the proportions of the master tile.
2. Settle the platform expansion mechanic.
3. Decide the v1 material set.
4. Decide save and share.
5. Pick a name.
6. Tiny prototype: one foundation tile, a wall, blueprint placement, flight and walk toggle.

## Piece catalog + customization (2026-11-24)

- `src/catalog.js` generates about 600 more pieces from families (788 in total). Families: wall openings × heights, timbered walls, gables, curved walls, floor and platform shapes × thickness, foundations, stairs (3 styles × 2 rises × 3 widths), spiral stairs, ramps, roof profiles (bell, ogee, pagoda, mansard, saltbox, hip), domes and spires, 12 column styles × 3 heights, arches, beams and trusses, 15 railing styles, doors and window inserts, furniture, lighting, storage, garden, magic, and 34 primitive shapes in 4 sizes.
- Customization on every piece: width, height and depth stretch, mirror, lift, any rotation, and colour tint. Free placement (H) puts a piece exactly where you aim so it can clip into anything. I or middle-click samples a placed piece. The Customize panel opens with U.
- The menu has search across all pieces and renders icons a few per frame.
- Structural mode: walls, floors, roofs and corner columns placed while it is on obey physics (posts and beams). Pieces placed in Creative mode stay anchored.
- Tested in headless Chrome (`?debug` exposes `window.peace` for testing).

## Worlds, biomes and main menu (2026-11-24)

- Main menu (`src/title.js`): Continue, New world (name, biome, starting platform or empty land, Creative or Structural physics), Load world (play, rename, duplicate, export, delete, with thumbnails), Settings (mouse sensitivity, invert Y, field of view, graphics quality, shadows, on-screen controls), Controls, and Import a world file. The current world orbits slowly behind the menu.
- Esc opens a pause menu: Resume, Settings, Controls, Save & main menu. The build menu's World dropdown has Main menu and Clear this world.
- Save slots (`src/saves.js`): each world stores its biome, seed, physics mode, day/night, thumbnail, pieces and terrain in localStorage. The old single autosave is migrated to "My First World" (Alpine Lake). Imported files and share links become new worlds.
- Biomes (`src/biomes.js`): Green Meadow, Alpine Lake (the original), Desert Mesa, Snowy Tundra, Tropical Isle, Ashlands, Sky Islands. Each has its own sky dome with stars at night, lighting and fog, ground shape and colours (the sculptable build area matches the distant land), water, ice, lava or a cloud sea, scattered trees, cacti and rocks, and snow or ember particles.

## Open desert + terraforming
- Terrain is streamed in 64 m chunks (only sculpted chunks are saved); distant land and scatter follow the player. Desert is the only biome listed (others parked in biomes.js DEFS).
- Walk by default; fly only if enabled in Settings (F toggles). Falling below ground snaps you back up.
- Auto-level (N toggles): placing a foundation cuts/fills the ground flat to build level (max 6 m) and blends a skirt into the land. Stilt/Footing foundations never dig. Flatten tool: Shift levels to where the stroke started.
