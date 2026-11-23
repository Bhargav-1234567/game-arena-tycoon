import * as THREE from 'three';

export const HAIRSTYLES = {
  male: ['crop', 'side_part', 'quiff', 'curls', 'bun'],
  female: ['crop', 'side_part', 'curls', 'bob', 'ponytail', 'bun', 'braid']
} as const;
export const APPEARANCE_OPTIONS = {
  top: ['polo', 'tshirt', 'raglan', 'hoodie', 'overshirt', 'blazer'],
  bottoms: ['jeans', 'chinos', 'joggers', 'shorts'],
  shoes: ['sneakers', 'high_tops', 'boots', 'loafers'],
  glasses: ['none', 'square', 'round'],
  headwear: ['none', 'baseball_cap', 'beanie', 'headphones'],
  neckwear: ['none', 'knit_scarf', 'neckerchief']
} as const;
const WOMENS_TOPS = [...APPEARANCE_OPTIONS.top, 'wrap_blouse'] as const;
const WOMENS_BOTTOMS = [...APPEARANCE_OPTIONS.bottoms, 'a_line_skirt', 'pleated_skirt'] as const;
export const APPEARANCE_SLOTS = ['hair', 'top', 'bottoms', 'shoes', 'glasses', 'headwear', 'neckwear'] as const;
export type AppearanceSlot = typeof APPEARANCE_SLOTS[number];
export type CharacterGender = keyof typeof HAIRSTYLES;
export function wardrobeFor(gender: CharacterGender) {
  return {
    ...APPEARANCE_OPTIONS, hair: HAIRSTYLES[gender],
    top: gender === 'female' ? WOMENS_TOPS : APPEARANCE_OPTIONS.top,
    bottoms: gender === 'female' ? WOMENS_BOTTOMS : APPEARANCE_OPTIONS.bottoms
  };
}
export interface CharacterAppearance {
  hair: typeof HAIRSTYLES[CharacterGender][number];
  top: typeof WOMENS_TOPS[number];
  bottoms: typeof WOMENS_BOTTOMS[number];
  shoes: typeof APPEARANCE_OPTIONS.shoes[number];
  glasses: typeof APPEARANCE_OPTIONS.glasses[number];
  headwear: typeof APPEARANCE_OPTIONS.headwear[number];
  neckwear: typeof APPEARANCE_OPTIONS.neckwear[number];
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  soleColor: string;
  hairColor: string;
  accentColor: string;
  frameColor: string;
}
export const WARDROBE_COLORS = {
  shirts: ['#286d72', '#995648', '#394f79', '#c1b5a0', '#637a64', '#b18b3f', '#81658f', '#a13f51'],
  pants: ['#293b50', '#32363b', '#b5a080', '#5d6750', '#766454', '#a8a7a0'],
  shoes: ['#ece5da', '#29303b', '#884b3a', '#315b6d', '#6f4630', '#706280'],
  hair: ['#211f20', '#493227', '#775138', '#ad814e', '#45302d', '#a5a09a'],
  accents: ['#ded5c3', '#c09355', '#d1dcd5', '#34454b', '#967bab', '#9b4f40']
} as const;

/** Independent choices are made once at spawn, never during animation updates. */
export function randomCharacterAppearance(gender: CharacterGender, role: 'customer' | 'receptionist' = 'customer', random = Math.random): CharacterAppearance {
  const pick = <T>(values: readonly T[]): T => values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
  const uniform = role === 'receptionist';
  const wardrobe = wardrobeFor(gender);
  return {
    hair: pick(wardrobe.hair), top: uniform ? 'blazer' : pick(wardrobe.top),
    bottoms: uniform ? 'chinos' : pick(wardrobe.bottoms), shoes: pick(wardrobe.shoes),
    glasses: random() < .65 ? 'none' : pick(['square', 'round'] as const),
    headwear: random() < .45 ? pick(['baseball_cap', 'beanie', 'headphones'] as const) : 'none',
    neckwear: random() < .25 ? pick(['knit_scarf', 'neckerchief'] as const) : 'none',
    shirtColor: uniform ? '#273c53' : pick(WARDROBE_COLORS.shirts), pantsColor: uniform ? '#273440' : pick(WARDROBE_COLORS.pants),
    shoeColor: pick(WARDROBE_COLORS.shoes), soleColor: random() < .75 ? '#d4d4ce' : '#343438',
    hairColor: pick(WARDROBE_COLORS.hair), accentColor: uniform ? '#74a5a2' : pick(WARDROBE_COLORS.accents),
    frameColor: pick(['#343139', '#735039', '#617078'])
  };
}

/** Selects authored mesh modules and recolours this instance's cloned materials. */
export function applyCharacterAppearance(model: THREE.Group, appearance: CharacterAppearance): void {
  const options = model.userData.customHuman?.appearanceOptions as Record<AppearanceSlot, string[]> | undefined;
  if (!options) throw new Error('The original character has no modular wardrobe.');
  for (const slot of APPEARANCE_SLOTS) if (!options[slot]?.includes(appearance[slot])) throw new Error(`Unsupported ${slot}: ${appearance[slot]}`);
  const colors = {
    Cotton: appearance.shirtColor, Accent: appearance.accentColor, Denim: appearance.pantsColor,
    Shoe: appearance.shoeColor, Sole: appearance.soleColor, Hair: appearance.hairColor, Frames: appearance.frameColor
  };
  for (const color of Object.values(colors)) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Character colours must use six-digit hex values.');
  model.traverse((node) => {
    const part = node.userData.customAppearance as { slot: AppearanceSlot; option: string } | undefined;
    if (part) node.visible = part.option === appearance[part.slot];
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const surface = material as THREE.MeshStandardMaterial;
      const color = colors[material.name as keyof typeof colors];
      if (color && surface.color) surface.color.set(color);
      if (material.name === 'HairStrands') surface.color.set(appearance.hairColor).lerp(new THREE.Color('#c7b6a0'), .15);
      if (material.name === 'Seam') surface.color.set(appearance.pantsColor).lerp(new THREE.Color('#d0c5b8'), .18);
    }
  });
  model.userData.appearance = { ...appearance };
}
