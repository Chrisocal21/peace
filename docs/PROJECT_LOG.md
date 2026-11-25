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

## Alpine world and construction materials

The runtime loads 14 local JPEGs from `public/art`. The built-in image generator produced the alpine panorama and two material sheets. The sheets were split into individual textures for tiling and mipmapping.

<details>
<summary>Original art prompts</summary>

**Alpine panorama**

Photorealistic seamless 360 degree equirectangular 2:1 environment panorama, camera floating at water level in the middle of a remote alpine lake. Dead-level waterline at exactly 50% image height. All around the distant shore are mixed conifer forests, craggy mountain peaks with patches of late spring snow, atmospheric blue ridges, wisps of mist. Luminous textured high clouds with areas of blue, warm side lighting from the west. Foreground entirely open gently rippled water reflecting the mountains, no foreground objects, no buildings, people, boats or text. Physically believable colors and exposure, photographic environmental lighting map for a realistic architectural sandbox. Wide landscape image, full continuous 360 panorama.

**Timber and masonry**

Square photorealistic seamless building material texture atlas. Exactly four equally sized square quadrants, hard straight dividing lines at 50% width and height. No borders or margins. Top left: horizontal old oak floorboards, about 8 planks tall, staggered joints, knots and dry grain, weathered natural brown. Top right: irregular horizontal courses of tightly fitted grey natural fieldstone masonry with pale recessed mortar, stones of varied shapes and sizes. Bottom left: staggered old burnt red brick wall pale mortar. Bottom right: lightly weather-stained cast concrete with fine natural aggregate and sparse shutter tie holes. Four ultra-detailed flat front orthographic material scans at identical resolution, softly diffuse lighting, no vignettes, no perspective, no shadows cast by surroundings. Edge-to-edge tileable materials, no labels text or objects.

**Roofing, metal, stone, and cloth**

Photorealistic architectural material scan contact sheet, SQUARE, exact 3 by 3 equal square grid, hard boundaries no borders no margins no shadows no objects no text, orthographic full textures. Row 1 left woven bundled golden reed thatch roof, center subtly worn brushed silver sheet metal with mechanical rivets at panel boundaries, right warm white plaster with subtle hand trowel marks. Row 2 left fine veined white Carrara marble, center overlapping rows of charcoal grey natural slate roof shingles, right overlapping rows of curved Tuscan orange terracotta roof tiles. Row 3 left natural stonework covered in green moss, center grid of very small muted blue glazed ceramic mosaic tiles with grout, right coarse unbleached beige linen weave. Each tile entirely fills exactly 1/9 of the image. Beautiful true-to-life diffuse material photography, fine detail.

</details>

The visible backdrop now uses Andreas Mischok's [Lago d'Isola spherical photograph](https://polyhaven.com/a/lago_disola), licensed CC0. The game uses the complete sphere at 6144 × 3072 for the background and a 1024 × 512 copy for material lighting. Both share the same orientation, with the scene light aligned to the photographed sun.

The subsequent scale pass moved the lakeshore and conifers into world space. The mountain backdrop uses the distant-facing half of the same capture, reflected around the horizon to exclude the nearby photographed trees. The bank starts about 200–360 world units from the build origin. Trees are sized relative to the four-unit foundation and three-unit wall, and the water reflects the modeled shore at its actual position.
