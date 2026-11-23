export type FacilityType = 'sofa' | 'vending' | 'arcade';

export interface FacilityLayout {
  halfWidth: number;
  halfDepth: number;
  entry: [number, number]; // Local X/Z on the walkable floor
  seat?: [number, number, number]; // Local X, cushion height, Z
  controls?: [number, number]; // Wrist height and forward reach from the visitor
}

// Measured on the shipped GLBs. The sectional's ottoman and the racing seat
// require different entry paths. Arcade 2's cabinet is offset by its power cord.
export const FACILITY_LAYOUTS: Record<FacilityType, FacilityLayout[]> = {
  sofa: [
    { halfWidth: .750, halfDepth: .284, entry: [0, .66], seat: [0, .246, .05] },
    { halfWidth: .875, halfDepth: .337, entry: [0, .71], seat: [0, .340, .08] },
    { halfWidth: 1.025, halfDepth: .717, entry: [-.55, 1.07], seat: [-.55, .40, -.19] },
    { halfWidth: 1.175, halfDepth: .865, entry: [.84, 1.22], seat: [.84, .391, -.03] }
  ],
  vending: [
    { halfWidth: .626, halfDepth: .313, entry: [.24, .66], controls: [1.13, .32] },
    { halfWidth: .597, halfDepth: .308, entry: [.22, .66], controls: [.98, .37] },
    { halfWidth: .460, halfDepth: .386, entry: [.17, .73], controls: [1.09, .40] },
    { halfWidth: .540, halfDepth: .563, entry: [.24, .91], controls: [1.15, .41] }
  ],
  arcade: [
    { halfWidth: .314, halfDepth: .419, entry: [0, .76], controls: [1.04, .38] },
    { halfWidth: .805, halfDepth: .925, entry: [.44, 1.27], controls: [1.07, .39] },
    { halfWidth: .533, halfDepth: .553, entry: [.04, .90], controls: [.76, .43] },
    { halfWidth: .832, halfDepth: 1.259, entry: [-1.19, .59], seat: [0, .46, .59], controls: [.91, .42] }
  ]
};
