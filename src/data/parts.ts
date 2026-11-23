export const PART_SLOTS = ['cpu', 'gpu', 'ram', 'ssd', 'psu', 'cooling'] as const;
export type PartSlot = typeof PART_SLOTS[number];

export interface HardwarePart {
  id: string;
  slot: PartSlot;
  name: string;
  tier: number;
  detail: string;
}

export const SLOT_LABELS: Record<PartSlot, string> = {
  cpu: 'Processor', gpu: 'Graphics card', ram: 'Memory kit',
  ssd: 'Storage', psu: 'Power supply', cooling: 'Cooling'
};

const SPECS: Record<PartSlot, string[]> = {
  cpu: ['4 cores', '8 cores', '12 cores', '16 cores'],
  gpu: ['4 GB VRAM', '8 GB VRAM', '16 GB VRAM', '24 GB VRAM'],
  ram: ['8 GB kit', '16 GB kit', '32 GB kit', '64 GB kit'],
  ssd: ['256 GB', '512 GB', '1 TB', '2 TB'],
  psu: ['450 W', '650 W', '850 W', '1000 W'],
  cooling: ['Air cooler', 'Tower cooler', '240 mm AIO', '360 mm AIO']
};

export const HARDWARE_PARTS: HardwarePart[] = [1, 2, 3, 4].flatMap((tier) =>
  PART_SLOTS.map((slot) => ({
    id: `${slot}_t${tier}`, slot, tier,
    name: `${['Starter', 'Gaming', 'High-end', 'Ultimate'][tier - 1]} ${SLOT_LABELS[slot]}`,
    detail: SPECS[slot][tier - 1]
  }))
);

export function getPart(id: string): HardwarePart {
  const part = HARDWARE_PARTS.find((entry) => entry.id === id);
  if (!part) throw new Error('Unknown hardware part.');
  return part;
}
