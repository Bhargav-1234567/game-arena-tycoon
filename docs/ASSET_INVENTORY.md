# Asset Inventory & Progression Tracker

The imported equipment/environment records below cover the earlier Kenney and
Quaternius assets. Current people are original project assets; see Section 5.

## 1. Gaming PCs (Quaternius Actual Assets)
| Asset ID | Tier | Name | Pack Source | File Size | Status |
|---|---|---|---|---|---|
| `pc_basic` | T1 | Office Micro Tower | Modular Sci-Fi (`Props_ComputerSmall.glb`) | 42.1 KB | Active |
| `pc_gaming` | T2 | RGB Mid-Tower Glass | Cyberpunk (`Computer.glb`) | 36.1 KB | Active |
| `pc_premium` | T3 | Liquid Dual-Chamber Rig | Modular Sci-Fi (`Props_Computer.glb`) | 42.1 KB | Active |
| `pc_ultimate` | T4 | Cyber Custom Super-Tower | Cyberpunk (`Computer_Large.glb`) | 105.7 KB | Active |

## 2. Chairs (Kenney Furniture Kit)
| Asset ID | Tier | Name | Pack Source | File Size | Status |
|---|---|---|---|---|---|
| `chair_basic` | T1 | Swivel Desk Chair | Furniture Kit (`chairDesk.glb`) | 39.0 KB | Active |
| `chair_racing` | T2 | Modern Frame Racing Chair | Furniture Kit (`chairModernFrameCushion.glb`) | 18.6 KB | Active |

## 3. Monitors (Kenney & Quaternius)
| Asset ID | Tier | Name | Pack Source | File Size | Status |
|---|---|---|---|---|---|
| `monitor_basic` | T1 | 24" Flat Desktop Monitor | Kenney (`computerScreen.glb`) | 6.4 KB | Active |
| `monitor_ultrawide` | T2 | Curved Ultrawide Display | Quaternius (`TV_2.glb`) | 28.1 KB | Active |

## 4. Furniture & Infrastructure
| Asset ID | Category | Model File | Pack Source | File Size | Status |
|---|---|---|---|---|---|
| `desk_single` | Furniture | `furniture/desks/desk_single.glb` | Kenney Furniture (`desk.glb`) | 15.0 KB | Active |
| `desk_rgb` | Furniture | `furniture/desks/desk_rgb.glb` | Kenney Furniture (`deskCorner.glb`) | 18.0 KB | Active |
| `reception_counter`| Counter | `furniture/counters/reception_counter.glb` | Kenney Arcade (`cash-register.glb`) | 25.1 KB | Active |
| `arcade_machine` | Arcade | `business/arcade_machine.glb` | Kenney Arcade (`arcade-machine.glb`) | 38.9 KB | Active |
| `vending_machine`| Service | `business/vending_machine.glb` | Kenney Arcade (`vending-machine.glb`) | 16.2 KB | Active |
| `air_hockey` | Arcade | `business/air_hockey.glb` | Kenney Arcade (`air-hockey.glb`) | 42.1 KB | Active |
| `pinball` | Arcade | `business/pinball.glb` | Kenney Arcade (`pinball.glb`) | 58.8 KB | Active |
| `sofa_lounge` | Furniture | `furniture/sofas/sofa_lounge.glb` | Kenney Furniture (`loungeSofa.glb`) | 9.6 KB | Active |
| `bean_bag` | Furniture | `furniture/sofas/bean_bag.glb` | Kenney Furniture (`loungeChair.glb`) | 9.6 KB | Active |
| `plant_indoor` | Decor | `decorations/plant_indoor.glb` | Kenney Furniture (`pottedPlant.glb`) | 7.6 KB | Active |
| `trash_bin` | Decor | `decorations/trash_bin.glb` | Kenney Furniture (`trashcan.glb`) | 6.5 KB | Active |
| `neon_sign_game`| Decor | `decorations/neon_sign_game.glb` | Quaternius Cyberpunk (`Sign_1.glb`) | 6.7 KB | Active |
| `floor_tile` | Modular | `environment/floors/floor_tile.glb` | Kenney Arcade (`floor.glb`) | 3.9 KB | Active |
| `wall_straight` | Modular | `environment/walls/wall_straight.glb` | Kenney Arcade (`wall.glb`) | 5.1 KB | Active |
| `wall_corner` | Modular | `environment/walls/wall_corner.glb` | Kenney Arcade (`wall-corner.glb`) | 7.6 KB | Active |
| `character_customer` | Character | `characters/character_customer.glb` | Kenney Arcade (`character-gamer.glb`) | 211.9 KB | Retired from runtime |
| `character_employee` | Character | `characters/character_employee.glb` | Kenney Arcade (`character-employee.glb`) | 216.5 KB | Retired from runtime |

## 5. Original People

Five customers (`customer_aarav`, `customer_kabir`, `customer_rohan`,
`customer_meera`, `customer_anaya`) and receptionist `receptionist_isha` are authored
from original source in `source-assets/characters/create_characters.py`. Runtime
uses their `_game.glb` versions; the character studio uses the detailed `.glb`
versions. All 12 files live in `public/assets/models/characters/original/` beside
a manifest with their exact size, triangle/joint count, animation list and hash.
Each file includes interchangeable hair, clothes, shoes, glasses, hats, headphones and scarves.
Female wardrobes also include a wrap blouse and two skirt cuts. The manifest lists every
module and the maximum visible combination (up to 16,570 triangles per game character).

See [Original Character Upgrade](ORIGINAL_CHARACTERS.md) for the source, preview,
motion/furniture contracts and validation commands.
