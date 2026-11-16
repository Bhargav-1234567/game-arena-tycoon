# Gaming Zone Tycoon — Asset Design Bible

## 1. Visual & Art Pillars
- **Camera Perspective:** Isometric Orthographic projection, 45-degree angle.
- **Style:** Stylized Low-Poly with clean, crisp geometry, readable silhouettes from distant zoom.
- **Lighting:** Soft ambient fill with rich neon / RGB accents (Teal `#0D9488`, Purple `#8B5CF6`, Amber `#F59E0B`).
- **Materials:** Low-specular stylized PBR. Emissive accents on PC lights, keycaps, LED strips, and screen glow.

## 2. Palette Guide
| Name | Hex Code | Purpose |
|---|---|---|
| Deep Navy | `#172033` | Floors, base cabinets, structural chassis |
| Slate Blue | `#27364B` | Secondary furniture, wall panels, desk legs |
| Teal Accent | `#0D9488` | Tier 2 RGB lighting, brand highlights, UI accents |
| Neon Purple | `#8B5CF6` | Tier 3/4 RGB lighting, VIP zones, gaming chair trim |
| Amber Glow | `#F59E0B` | Power buttons, currency badges, warm decor |
| Soft Platinum | `#E2E8F0` | Keycaps, monitor frames, text highlights |

## 3. Scale & Pivot Conventions
- **Grid Unit:** 1 Unit = 1 Meter (1 Tile = 1m x 1m).
- **Pivot Point:** Always bottom-center `(0, 0, 0)` at floor contact.
- **Orientation:** Front faces `+Z` or `-Z` consistently.
- **Standard Heights:**
  - Desk surface: `0.75m`
  - Chair seat: `0.45m`
  - Monitor screen center: `1.05m`
  - PC Cabinet: `0.45m - 0.55m`
  - Wall height: `2.6m`

