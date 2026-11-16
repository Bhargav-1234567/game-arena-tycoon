# Gaming Zone Tycoon
## 3D Asset Production & Game Development Blueprint

**Project direction:** Isometric 3D · Stylized / Low-poly · Mobile-first · Three.js-compatible  
**Primary asset format:** GLB (`.glb`)  
**Recommended tools:** Blender + AI-assisted modelling + Three.js  
**Document purpose:** A practical plan for designing, sourcing, producing, organizing, optimizing, and integrating the complete 3D asset library for Gaming Zone Tycoon.

---

# 1. Game concept and visual direction

Gaming Zone Tycoon is a management/tycoon game in which the player starts with a small gaming shop and gradually builds a modern gaming centre, premium gaming lounge, esports arena, and eventually a luxury gaming entertainment business.

The player should be able to:

- Buy and place gaming stations.
- Upgrade PCs, monitors, chairs, desks, and accessories.
- Expand the gaming floor and add rooms.
- Decorate and customize the venue.
- Serve customers and manage employees.
- Earn revenue, improve customer satisfaction, and reinvest profits.
- Unlock higher-end equipment and business tiers.

## 1.1 Art direction

| Property | Direction |
|---|---|
| Camera | Isometric, preferably orthographic |
| Art style | Stylized low-poly |
| Geometry | Clean, simple, readable silhouettes |
| Materials | Simple PBR materials; avoid unnecessary realism |
| Lighting | Soft ambient lighting with selective RGB accents |
| Shadows | Baked or carefully optimized real-time shadows |
| Textures | Use small, efficient textures; many props can use materials without textures |
| Asset format | GLB / glTF 2.0 |
| Engine | Three.js |
| Target | Android and desktop browser |

### Suggested colour palette

- Dark navy: `#172033`
- Slate blue: `#27364B`
- Teal: `#0D9488`
- Purple: `#8B5CF6`
- Amber: `#F59E0B`
- Light grey: `#E2E8F0`

Use these as a starting palette, not rigid rules. Keep the world readable and avoid making every object glow.

## 1.2 Visual consistency rules

Every asset should share:

- Similar proportions and bevel sizes.
- Consistent low-poly geometry and shading.
- Consistent material roughness and metallic values.
- A common scale and unit convention.
- Consistent origin/pivot placement.
- Similar texture resolution and texel density.
- A shared lighting and presentation style in reference renders.

Create one approved reference gaming station. Use it as the visual benchmark for every new asset.

---

# 2. Full 3D asset inventory

The counts below are a production target, not a requirement to create everything before the first playable prototype. Some variations can be produced by changing materials or modular components.

## 2.1 Gaming equipment

| Asset | Initial variations | Notes |
|---|---:|---|
| PC cabinets / towers | 4 | Basic, RGB gaming, premium liquid-cooled, ultimate/custom |
| Gaming chairs | 4 | Basic fabric, ergonomic, RGB racing, luxury/throne |
| Monitors | 3 | Basic flat, curved/ultrawide, premium/high-refresh |
| Keyboards | 3 | Basic, mechanical RGB, premium |
| Gaming mice | 2 | Basic and RGB/premium |
| Headsets | 2 | Basic and premium |
| Mousepads | 2 | Standard and extended RGB |
| Speakers | 2 | Compact and premium |

**Initial target: 22 models or meaningful variations.**

### PC visual upgrade progression

1. **Level 1 — Basic:** Small black cabinet, simple front panel, one basic fan.
2. **Level 2 — Gaming:** Tempered-glass side panel, RGB fans, more prominent GPU.
3. **Level 3 — Premium:** Liquid cooling, multiple fans, premium GPU design, cleaner cable presentation.
4. **Level 4 — Ultimate:** Custom futuristic cabinet, advanced cooling, premium lighting and distinctive silhouette.

Do not rely only on changing the colour. At each level, change at least one visible component or the overall silhouette.

### Modular PC component concept

```text
GamingPC
├── Cabinet
├── SidePanel
├── Motherboard
├── CPU
├── GPU
├── RAM
├── CoolingSystem
├── Fans
├── RGBLights
└── PowerButton
```

Internal parts can be hidden during normal gameplay. The modular structure is useful for upgrade screens, cutaways, and future customization.

## 2.2 Gaming furniture

| Asset | Initial variations | Notes |
|---|---:|---|
| Single gaming desk | 2 | Basic and premium |
| Double gaming desk | 1 | Shared station |
| Premium gaming desk | 1 | Larger surface / cable management |
| Reception counter | 1 | Main entrance |
| Sofa | 1 | Waiting area |
| Bean bags | 2 | Different colours or shapes |
| Storage cabinet | 1 | Back-office / storage |
| Wall shelf | 1 | Decoration and accessories |

**Initial target: 10 furniture models/variations.**

## 2.3 Environment and room construction

| Asset | Initial variations | Notes |
|---|---:|---|
| Floor tiles | 3 | Basic, premium, decorative |
| Wall modules | 4 | Straight, corner, doorway, window section |
| Doors | 2 | Standard and glass |
| Windows | 2 | Small and wide |
| Ceiling lights | 2 | Basic and modern |
| Wall lights | 2 | Standard and RGB accent |
| Neon signs | 3 | Generic gaming signs; avoid unauthorized brand logos |
| Plants | 2 | Small and medium |
| Posters | 4 | Original fictional designs |

Build the room from modular pieces. Expansion should place additional floor and wall modules rather than requiring a unique room mesh for every room size.

## 2.4 Business equipment and decoration

| Asset | Initial target | Purpose |
|---|---:|---|
| Vending machine | 1 | Drinks/snacks |
| Snack counter | 1 | Food service |
| Arcade machine | 1 | Additional attraction |
| Trophy cabinet | 1 | Prestige / achievements |
| Wall clock | 1 | Decoration |
| CCTV camera | 1 | Security |
| Fire extinguisher | 1 | Safety detail |
| Trash bin | 1 | Cleanliness system |
| Decorative plants | Reuse 2 plant models | Environment dressing |

## 2.5 Customers and employees

Initial character targets:

- 3 customer character base models.
- 2 employee character base models.
- 3–4 interchangeable hairstyles.
- 3 clothing variations.
- Basic idle animation.
- Walking animation.
- Sitting animation.
- Optional standing, browsing, celebrating, and frustrated animations later.

Use compatible shared skeletons and animation sets where possible. A small number of base characters can create variety through clothing, hair, colour, and accessory swaps.

## 2.6 Effects and animated details

- RGB lighting effects.
- PC fan rotation.
- Monitor screen animations.
- Keyboard lighting.
- Gaming station occupied indicators.
- Money/revenue popups.
- Upgrade sparkle effects.
- Customer satisfaction indicators.
- Optional door opening, vending machine interaction, and arcade effects.

Use lightweight effects. Avoid making every PC and every light cast expensive real-time shadows.

---

# 3. Free and low-cost tools for creating 3D models

**Important:** “Free” can mean free software, free credits, free downloads, or a free model with restrictions. Check the current plan and the licence for the exact output before using it in a commercial game.

## 3.1 Blender — primary modelling and cleanup tool

Website: https://www.blender.org/  
Manual: https://docs.blender.org/manual/

Use Blender to:

- Create models from scratch.
- Clean up AI-generated models.
- Adjust geometry and polygon count.
- Set dimensions, origins, and pivots.
- Create and edit materials.
- Make modular components and variations.
- Create simple animations.
- Export GLB files.

Blender is free and open-source. It should be the central tool in the asset pipeline even if AI generates the first draft.

## 3.2 Meshy — AI text/image-to-3D

Website: https://www.meshy.ai/  
Free plan information: https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan

Useful for:

- First drafts of chairs, desks, PC cabinets, props, and decorations.
- Turning reference images into rough 3D models.
- Exploring alternative designs quickly.

The Meshy help page currently describes a free tier with monthly credits and a limited number of downloads for specified model versions. Free-plan limits and licensing can change. Check the model's download eligibility and commercial-use terms before relying on it.

## 3.3 Tripo — AI 3D generation

Website: https://www.tripo3d.ai/  
Pricing/credits: https://www.tripo3d.ai/product-doc/getting-started/pricing-credits

Useful for:

- Text-to-3D and image-to-3D experiments.
- Generating props and concept models.
- Creating a starting point for Blender refinement.

The published plan information includes a free tier with limited monthly credits and export restrictions by model/version. Confirm the current export format and licence for each output.

## 3.4 Krea

Website: https://www.krea.ai/

Explore its image and 3D creation tools. Availability, free credits, export options, and commercial-use terms may differ by feature and plan. Treat it as an optional experimentation tool, not a guaranteed free production pipeline.

## 3.5 Other useful modelling resources

- Sloyd: https://www.sloyd.ai/ — procedural and AI-assisted asset creation; check each asset's licence and export limits.
- BlenderKit / Blendkit: https://www.blenderkit.com/ — asset browser and library; free and paid content may have different licences.
- Blockbench: https://www.blockbench.net/ — simple low-poly and block-style modelling, useful for deliberately simple props.

### Recommended approach

1. Create a visual reference for the object.
2. Generate a first draft with an AI tool if useful.
3. Import the result into Blender.
4. Fix the silhouette, scale, topology, materials, and origin.
5. Reduce unnecessary geometry and texture size.
6. Create variations from the cleaned base model.
7. Export as GLB and test in Three.js.

AI-generated models are not automatically game-ready. Inspect geometry, UVs, normals, materials, scale, file size, and animation compatibility.

---

# 4. Free existing 3D model libraries

These libraries can reduce the amount of modelling required. They do not all specialize in gaming PCs or gaming furniture; use them for suitable props, furniture, characters, environment pieces, materials, and prototypes.

## 4.1 Recommended libraries

| Resource | Link | Best use | Licence note |
|---|---|---|---|
| Kenney | https://kenney.nl/assets | Consistent game asset packs and prototypes | Kenney asset packs are generally CC0; check the individual pack page |
| Quaternius | https://quaternius.com/ | Stylized low-poly characters, props, environments, and animations | Current Quaternius Asset License permits use in commercial games without credit; do not resell/redistribute the assets as standalone assets |
| Poly Pizza | https://poly.pizza/ | Searchable low-poly models; useful for props and prototypes | Licence varies by model; check CC0 vs CC-BY and avoid non-commercial licences |
| Poly Haven | https://polyhaven.com/ | Models, PBR textures, HDRIs, environmental materials | Assets are CC0; especially useful for materials and environment assets |
| ambientCG | https://ambientcg.com/ | Free PBR materials and surface textures | CC0; useful for floors, walls, wood, metal, and fabric |
| Sketchfab | https://sketchfab.com/ | Specific furniture, electronics, and props | Licence is model-specific; avoid CC-BY-NC for a monetized game and comply with attribution requirements |
| OpenGameArt | https://opengameart.org/ | Community game assets, including 3D content | Licence varies by item; inspect each asset page |
| itch.io game assets | https://itch.io/game-assets | Indie asset packs, including 3D packs | Free/paid and licences vary by creator and pack |
| Blendkit / BlenderKit | https://www.blenderkit.com/ | Blender-integrated models, materials, and scenes | Licence and free availability vary by asset |
| Fab | https://www.fab.com/ | Free and paid game assets | Check each listing's licence and usage terms |
| Gobkit | https://gobkit.com/ | Low-poly GLB models, characters, and nature props | Check current site and individual asset terms |
| Sloyd gallery | https://www.sloyd.ai/ | Generated models and simple props | Check creator attribution and licence for each model |

### Best starting order

1. **Kenney and Quaternius:** matching stylized assets and prototypes.
2. **Poly Pizza:** search for individual low-poly models.
3. **Sketchfab:** search for specific gaming furniture and electronics.
4. **Poly Haven and ambientCG:** materials and environmental surfaces.
5. **OpenGameArt and itch.io:** fill gaps after checking licences.

## 4.2 Search terms for this project

Use these phrases on the model libraries:

### Gaming equipment
- low poly gaming PC
- low poly desktop computer
- low poly computer tower
- low poly gaming chair
- low poly office chair
- low poly computer monitor
- low poly curved monitor
- low poly keyboard
- low poly computer mouse
- low poly headset
- low poly speakers

### Furniture
- low poly computer desk
- low poly office desk
- low poly reception counter
- low poly sofa
- low poly bean bag
- low poly storage cabinet
- low poly wall shelf

### Environment and decoration
- low poly modular interior
- low poly floor tiles
- low poly wall modular kit
- low poly door
- low poly window
- low poly ceiling light
- low poly neon sign
- low poly indoor plant
- low poly vending machine
- low poly arcade machine
- low poly trophy cabinet
- low poly CCTV camera
- low poly trash bin

### Characters
- low poly customer character
- low poly casual character
- low poly cashier character
- low poly sitting character
- low poly walking character

A search result is not proof that a model is free for commercial use. Open the individual asset page and inspect its licence before downloading.

---

# 5. Licensing and commercial-use checklist

Gaming Zone Tycoon may earn revenue through ads or other monetization. Treat it as a commercial project even while it is in development.

Before using any downloaded or generated asset:

- [ ] Confirm that commercial use is allowed.
- [ ] Confirm whether attribution is required.
- [ ] Confirm whether modification is allowed.
- [ ] Avoid “Non-Commercial” licences.
- [ ] Avoid “No Derivatives” licences if you plan to modify the model.
- [ ] Check ShareAlike obligations before using CC-BY-SA assets.
- [ ] Check whether the asset contains third-party logos, trademarks, or branded designs.
- [ ] Save the asset page, creator name, licence name, and download date.
- [ ] Keep a copy of the licence or terms applicable at the time of download.
- [ ] Do not redistribute raw model files as a standalone asset pack.

### Licence reminders

- **CC0:** generally permits commercial use without attribution.
- **CC-BY:** commercial use is allowed, but attribution is required.
- **CC-BY-SA:** attribution and ShareAlike conditions apply to adaptations.
- **CC-BY-NC:** not suitable for a monetized commercial game.
- **CC-BY-ND:** restrictions apply to distributing modified versions.
- **Custom asset licences:** read the specific terms; “free download” does not automatically mean unrestricted commercial use.

Keep an `ASSET_CREDITS.md` or `ASSET_LICENSES.csv` file in the repository, even if many assets are CC0.

Suggested record:

| Asset ID | File | Creator/source | Licence | Attribution | Download date |
|---|---|---|---|---|---|
| chair_basic_01 | chair_basic_01.glb | To be filled | To be checked | To be checked | To be filled |

---

# 6. Asset production pipeline

## Step 1 — Concept and reference

For every model:

- Decide its gameplay purpose.
- Decide its upgrade tier.
- Define its dimensions.
- Create a reference image or sketch.
- Define the common low-poly style.
- Decide which parts should be modular.

## Step 2 — AI-assisted modelling or manual modelling

Choose one of three routes:

1. Create it manually in Blender.
2. Generate a draft using Meshy, Tripo, or another tool, then refine it in Blender.
3. Download an existing model with a suitable licence, then adapt it in Blender.

## Step 3 — Blender refinement

Inspect and correct:

- Scale and proportions.
- Object origins and pivots.
- Mesh topology and unnecessary geometry.
- Normals and shading.
- UV maps.
- Material slots.
- Texture dimensions.
- Object names and hierarchy.
- Animation and rigging if applicable.

## Step 4 — Create variations

Reuse the base model where sensible:

- Change materials and colours.
- Swap modular parts.
- Add or remove fans, panels, lights, and accessories.
- Change the silhouette when the upgrade should feel substantial.
- Keep variants compatible with the same placement and interaction system.

Do not make every upgrade a mere colour swap.

## Step 5 — Export

Export as GLB (`.glb`) with:

- Required meshes.
- Materials and textures.
- Animation clips, if any.
- Sensible object names.
- Correct scale and orientation.

## Step 6 — Three.js integration

Load the GLB, position it in the scene, and connect it to placement, upgrades, customer interactions, and game data.

## Step 7 — Optimization and testing

Test:

- Visual quality at the actual isometric camera distance.
- Loading time.
- Texture memory.
- Draw calls.
- Triangle/vertex count.
- Frame rate on target Android devices.
- Whether the model remains readable at small screen sizes.

---

# 7. Technical specifications and mobile optimization

These are initial working targets, not strict engine limits. Profile the real scene and adjust them based on device performance.

| Asset type | Suggested starting triangle target |
|---|---:|
| Small accessories | 100–1,000 |
| Chairs and furniture | 500–3,000 |
| PC cabinets | 1,000–4,000 |
| Large decorative objects | 2,000–6,000 |
| Characters | 3,000–10,000 |

## Optimization rules

- Prefer shared materials and texture atlases.
- Use small textures where possible; 512px or 1024px can be a useful starting point.
- Avoid unnecessary transparent materials.
- Use baked ambient occlusion where appropriate.
- Compress textures with KTX2 where supported by the pipeline.
- Use Meshopt or Draco geometry compression where appropriate and test loading costs.
- Use instancing for repeated objects such as chairs, lights, and decorative props.
- Reuse geometries and materials for identical assets.
- Load assets on demand instead of loading the entire library at startup.
- Dispose of unused geometries, materials, and textures when appropriate.
- Avoid excessive real-time shadows and too many dynamic lights.
- Use LODs or simpler distant representations if the venue becomes large.
- Test on low-end Android devices, not only a desktop GPU.

## Isometric camera notes

- Use an orthographic camera if you want a consistent tycoon-style isometric view.
- Keep object heights and placement readable.
- Avoid tall props that obscure too much of the room.
- Ensure selection outlines and interaction indicators remain visible.
- Decide early whether the player can rotate the camera or only pan and zoom.

---

# 8. Three.js model integration

Three.js recommends glTF/GLB for most real-time model delivery workflows. Use `GLTFLoader` to load the model.

Documentation:
- Three.js model loading guide: https://threejs.org/manual/pages/loading-3d-models.html
- GLTFLoader API: https://threejs.org/docs/pages/GLTFLoader.html
- Blender glTF export documentation: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html

Example:

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load(
  '/assets/models/equipment/pcs/pc_basic.glb',
  (gltf) => {
    const pc = gltf.scene;

    pc.position.set(0, 0, 0);
    pc.scale.setScalar(1);

    scene.add(pc);
  },
  undefined,
  (error) => {
    console.error('Unable to load PC model:', error);
  }
);
```

For a production game, create an asset-loading service or manager rather than writing a separate loader call for every placed object. Cache loaded GLTF scenes and clone them appropriately. Be careful with shared materials and geometries when disposing of objects.

---

# 9. Reusable upgrade system

Keep upgrade definitions separate from game logic. Each upgrade should point to a model asset and contain the relevant game-balance values.

Example:

```javascript
export const pcUpgrades = [
  {
    level: 1,
    id: 'basic',
    model: '/assets/models/equipment/pcs/pc_basic.glb',
    price: 500,
    performance: 20,
    hourlyRevenue: 30
  },
  {
    level: 2,
    id: 'gaming',
    model: '/assets/models/equipment/pcs/pc_gaming.glb',
    price: 1500,
    performance: 45,
    hourlyRevenue: 55
  },
  {
    level: 3,
    id: 'premium',
    model: '/assets/models/equipment/pcs/pc_premium.glb',
    price: 4000,
    performance: 75,
    hourlyRevenue: 90
  },
  {
    level: 4,
    id: 'ultimate',
    model: '/assets/models/equipment/pcs/pc_ultimate.glb',
    price: 10000,
    performance: 100,
    hourlyRevenue: 150
  }
];
```

These numbers are example game-balance values, not real hardware benchmarks.

Use the same data-driven pattern for:

- Gaming chairs.
- Monitors.
- Desks.
- Accessories.
- Room upgrades.
- Decorations.
- Business facilities.

When the player purchases an upgrade, replace the current visual model while preserving the station's position, rotation, ownership, and gameplay state.

---

# 10. Suggested project folder structure

```text
gaming-zone-tycoon/
│
├── public/
│   └── assets/
│       ├── models/
│       │   ├── equipment/
│       │   │   ├── pcs/
│       │   │   ├── chairs/
│       │   │   ├── monitors/
│       │   │   ├── keyboards/
│       │   │   ├── mice/
│       │   │   ├── headsets/
│       │   │   ├── mousepads/
│       │   │   └── speakers/
│       │   │
│       │   ├── furniture/
│       │   │   ├── desks/
│       │   │   ├── counters/
│       │   │   ├── sofas/
│       │   │   └── storage/
│       │   │
│       │   ├── environment/
│       │   │   ├── floors/
│       │   │   ├── walls/
│       │   │   ├── doors/
│       │   │   ├── windows/
│       │   │   └── lights/
│       │   │
│       │   ├── business/
│       │   ├── decorations/
│       │   ├── characters/
│       │   └── effects/
│       │
│       ├── textures/
│       ├── audio/
│       └── ui/
│
├── source-assets/
│   ├── blender/
│   ├── references/
│   ├── generated/
│   └── downloaded-originals/
│
├── docs/
│   ├── ASSET_DESIGN_BIBLE.md
│   ├── ASSET_LICENSES.md
│   └── ASSET_INVENTORY.md
│
└── src/
    ├── game/
    ├── systems/
    │   ├── building/
    │   ├── upgrades/
    │   ├── economy/
    │   ├── customers/
    │   └── employees/
    ├── components/
    ├── services/
    └── data/
        ├── assets.js
        ├── pc-upgrades.js
        ├── chair-upgrades.js
        └── monitor-upgrades.js
```

Keep original Blender files and downloaded source files outside the public build directory. Ship only optimized runtime assets that the game needs.

---

# 11. Development roadmap

Do not create 100 models before testing the gameplay. Build a small, complete playable room first.

## Phase 1 — First playable gaming room

- [ ] Floor modules.
- [ ] Wall modules.
- [ ] One reception counter.
- [ ] One gaming desk.
- [ ] One gaming chair.
- [ ] One basic PC.
- [ ] One monitor.
- [ ] Keyboard and mouse.
- [ ] Basic isometric camera.
- [ ] Place and select a gaming station.
- [ ] Basic customer interaction.

## Phase 2 — First upgrades

- [ ] Three additional PC upgrade models.
- [ ] Three chair variations.
- [ ] Two monitor variations.
- [ ] RGB lighting.
- [ ] Premium desk.
- [ ] Upgrade UI and purchase flow.
- [ ] Visual model replacement after purchase.

## Phase 3 — Gaming centre expansion

- [ ] Additional room modules.
- [ ] Reception decorations.
- [ ] Vending machine.
- [ ] Arcade machine.
- [ ] Trophy cabinet.
- [ ] Customer characters.
- [ ] Employee characters.
- [ ] Waiting area furniture.
- [ ] Basic customer and employee animations.

## Phase 4 — Polish and optimization

- [ ] PC fan animations.
- [ ] Monitor screen animations.
- [ ] Keyboard lighting.
- [ ] Revenue popups.
- [ ] Customer satisfaction indicators.
- [ ] Sound effects.
- [ ] Asset optimization.
- [ ] Android performance testing.
- [ ] Loading and memory profiling.

---

# 12. Initial 19-model starter pack

This is the first deliverable I recommend producing. It is enough to make a small but recognizable gaming centre.

| # | Asset | Required model |
|---:|---|---|
| 1 | Floor | Basic floor module |
| 2 | Wall | Straight wall module |
| 3 | Wall | Corner / end wall module |
| 4 | Reception | Reception counter |
| 5 | Desk | Single gaming desk |
| 6 | Chair | Basic gaming chair |
| 7 | PC | Basic PC cabinet |
| 8 | Monitor | Basic monitor |
| 9 | Keyboard | Basic keyboard |
| 10 | Mouse | Basic mouse |
| 11 | Lighting | Ceiling light |
| 12 | Door | Standard door |
| 13 | Window | Window module |
| 14 | Decoration | Plant |
| 15 | Decoration | Gaming poster |
| 16 | Decoration | Neon gaming sign |
| 17 | Business equipment | Vending machine |
| 18 | Character | Customer character |
| 19 | Character | Employee character |

Some entries are modular pieces rather than standalone decorative models. The starter pack is a milestone, not the final complete asset inventory.

---

# 13. Asset naming and tracking conventions

Use predictable file names:

```text
pc_basic.glb
pc_gaming.glb
pc_premium.glb
pc_ultimate.glb

chair_basic.glb
chair_ergonomic.glb
chair_rgb.glb
chair_luxury.glb

monitor_basic.glb
monitor_curved.glb
monitor_premium.glb
```

For every asset, track:

- Asset ID.
- Display name.
- Category.
- Upgrade tier.
- Model path.
- Dimensions.
- Triangle count.
- Texture sizes.
- Materials used.
- Licence and attribution.
- Source file path.
- Optimization status.
- In-game test status.

Suggested status values:

`planned` → `reference-ready` → `generated/downloaded` → `refined` → `optimized` → `integrated` → `tested`.

---

# 14. Final recommendations

1. Start with Blender even if AI generates most initial models.
2. Use AI for custom gaming equipment designs that are difficult to find in free libraries.
3. Use Kenney, Quaternius, Poly Pizza, and other libraries for suitable supporting assets.
4. Keep the art direction consistent; do not mix unrelated visual styles.
5. Use modular PC, chair, monitor, and desk designs to make upgrades scalable.
6. Use GLB for runtime assets and Three.js `GLTFLoader` for integration.
7. Optimize for Android from the beginning.
8. Record every asset licence before including it in a monetized release.
9. Build the first playable room before producing the full asset library.
10. Keep model definitions and upgrade data separate from gameplay code.

## Official and useful documentation links

- Blender: https://www.blender.org/
- Blender manual: https://docs.blender.org/manual/
- Three.js: https://threejs.org/
- Three.js model loading: https://threejs.org/manual/pages/loading-3d-models.html
- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Meshy free plan: https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan
- Tripo pricing and credits: https://www.tripo3d.ai/product-doc/getting-started/pricing-credits
- Quaternius licence: https://quaternius.com/license.html
- Poly Haven licence: https://polyhaven.com/license
- Sketchfab model licences: https://sketchfab.com/features/free-3d-models

---

**Recommended immediate next action:** Create the first reference gaming station in Blender, approve its art style and scale, then use it as the standard for every subsequent model in Gaming Zone Tycoon.
