# Asset Licenses & Attribution Log

## Original characters

The active customers, receptionist and street pedestrians use original project
assets under `public/assets/models/characters/original/`. All human geometry,
rigging, skin weights, procedural face/fabric textures and seven animation clips
are authored in `source-assets/characters/create_characters.py`; no third-party
human mesh, rig, motion or texture is incorporated into this family. See
[`ORIGINAL_CHARACTERS.md`](ORIGINAL_CHARACTERS.md) and the generated manifest for
the two detail versions of all six fictional identities and reproducible hashes.
The same generator authors all wardrobe items, including the caps, beanies,
headphones, scarves, wrap blouse, A-line skirt and pleated skirt. Instance colour palettes
and random wardrobe selection use original project code in `CharacterAppearance.ts`.

## Earlier assets and imported environment

The interface favicon at `public/favicon.svg` is original SVG artwork created for this repository. It uses no third-party images, fonts, or asset packs.

Puzzle component silhouettes and hazard styling in `src/puzzle/presentation.ts` and `src/puzzle.css` are adapted from the user-provided local Build & Boot project's `Home.razor.cs` and `wwwroot/css/app.css`. Level/build descriptions and tips are synchronized from its `GameCatalog.cs`. These are local project sources; no external image, font or asset pack was downloaded for the puzzle artwork.

The Pixel District storefronts, roofs, signs, streets, trees, plaza, lighting fixtures and map controls are original procedural geometry, Canvas text and CSS. Imported neighborhood buildings, cars, bus and bicycle reuse the existing city GLB files under `public/assets/models/environment/city/`; no new external asset pack was downloaded for this feature. Existing source/license records still apply; the procedural additions do not independently verify the provenance of imported files.

The historical imported-asset records below identify assets sourced from **Kenney**
and **Quaternius**. They do not describe the new original character family.

| Asset ID | File | Creator / Source | Original Pack | License | Attribution Required | Download Date |
|---|---|---|---|---|---|---|
| `pc_basic` | `equipment/pcs/pc_basic.glb` | Quaternius | Modular Sci-Fi Kit (`Props_ComputerSmall.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `pc_gaming` | `equipment/pcs/pc_gaming.glb` | Quaternius | Cyberpunk Pack (`Computer.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `pc_premium` | `equipment/pcs/pc_premium.glb` | Quaternius | Modular Sci-Fi Kit (`Props_Computer.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `pc_ultimate` | `equipment/pcs/pc_ultimate.glb` | Quaternius | Cyberpunk Pack (`Computer_Large.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `chair_basic` | `equipment/chairs/chair_basic.glb` | Kenney | Furniture Kit (`chairDesk.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `chair_racing` | `equipment/chairs/chair_racing.glb` | Kenney | Furniture Kit (`chairModernFrameCushion.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `desk_single` | `furniture/desks/desk_single.glb` | Kenney | Furniture Kit (`desk.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `desk_rgb` | `furniture/desks/desk_rgb.glb` | Kenney | Furniture Kit (`deskCorner.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `monitor_basic` | `equipment/monitors/monitor_basic.glb` | Kenney | Furniture Kit (`computerScreen.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `monitor_ultrawide` | `equipment/monitors/monitor_ultrawide.glb` | Quaternius | Cyberpunk Pack (`TV_2.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `keyboard_mouse` | `equipment/accessories/keyboard_mouse.glb` | Kenney | Furniture Kit (`computerKeyboard.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `reception_counter` | `furniture/counters/reception_counter.glb` | Kenney | Mini Arcade Kit (`cash-register.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `arcade_machine` | `business/arcade_machine.glb` | Kenney | Mini Arcade Kit (`arcade-machine.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `vending_machine` | `business/vending_machine.glb` | Kenney | Mini Arcade Kit (`vending-machine.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `air_hockey` | `business/air_hockey.glb` | Kenney | Mini Arcade Kit (`air-hockey.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `pinball` | `business/pinball.glb` | Kenney | Mini Arcade Kit (`pinball.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `sofa_lounge` | `furniture/sofas/sofa_lounge.glb` | Kenney | Furniture Kit (`loungeSofa.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `bean_bag` | `furniture/sofas/bean_bag.glb` | Kenney | Furniture Kit (`loungeChair.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `plant_indoor` | `decorations/plant_indoor.glb` | Kenney | Furniture Kit (`pottedPlant.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `trash_bin` | `decorations/trash_bin.glb` | Kenney | Furniture Kit (`trashcan.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `neon_sign_game` | `decorations/neon_sign_game.glb` | Quaternius | Cyberpunk Pack (`Sign_1.glb`) | CC0 (Public Domain) | No (Credited) | 2026-11-10 |
| `floor_tile` | `environment/floors/floor_tile.glb` | Kenney | Mini Arcade Kit (`floor.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `wall_straight` | `environment/walls/wall_straight.glb` | Kenney | Mini Arcade Kit (`wall.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `wall_corner` | `environment/walls/wall_corner.glb` | Kenney | Mini Arcade Kit (`wall-corner.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `character_customer` | `characters/character_customer.glb` | Kenney | Mini Arcade Kit (`character-gamer.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |
| `character_employee` | `characters/character_employee.glb` | Kenney | Mini Arcade Kit (`character-employee.glb`) | CC0 1.0 Universal | No (Credited) | 2026-11-10 |

## Lounge staff and cleaning equipment

Employees reuse the project-authored modular human rigs with seeded uniforms and original task poses in `src/entities/EmployeeAvatar.ts`. The bin, litter, mop, tool case, crate, bag, scanner and vending access panel are project-authored Three.js geometry in `src/entities/StaffProps.ts`.
