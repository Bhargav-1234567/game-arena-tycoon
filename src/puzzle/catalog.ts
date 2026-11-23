// Level data synchronized from the local BuildAndBoot.Game/GameCatalog.cs.
// Run scripts/sync-puzzle-catalog.py <BuildAndBoot folder> to refresh it.
export const PIECES = ['cpu', 'ram', 'gpu', 'ssd', 'power', 'fan'] as const;
export type PieceKind = typeof PIECES[number];
export type ObstacleKind = 'none' | 'dust' | 'cable' | 'heat' | 'virus';
export type BoosterKind = 'gpu' | 'cpu' | 'mouse' | 'cooling';
export interface PuzzleLevel {
  number: number;
  name: string;
  buildPart: string;
  buildPartShort: string;
  objective: string;
  tip: string;
  target: PieceKind;
  targetCount: number;
  moves: number;
  obstacle: ObstacleKind;
  obstacleCount: number;
  rewardBooster: BoosterKind;
  rewardTier: number;
}
export const PIECE_LABELS: Record<PieceKind, string> = {
  cpu: 'CPU', ram: 'RAM', gpu: 'GPU', ssd: 'SSD', power: 'PSU', fan: 'FAN'
};
type BuildSeed = [number, string, string, string, string, string, string];
export const BUILD_PATHS = ([
  [1, 'Gaming Rig', 'STARTER', 'Complete the circuit.', 'Clear puzzle levels to route power across the motherboard. Every glowing node installs the next part in your gaming PC.', 'BYTEFORGE', 'Gaming rig online. Your first complete PC is ready.'],
  [2, 'Creator Station', 'CREATOR', 'Engineer the upgrade.', 'Tighter move limits and denser hazards assemble a professional creator workstation.', 'ARC STUDIO', 'Creator workstation ready for production.'],
  [3, 'Streaming Tower', 'BROADCAST', 'Power the broadcast.', 'Build an encoding-focused streaming PC while tougher circuits demand cleaner combos.', 'STREAM CORE', 'Streaming tower online and ready to broadcast.'],
  [4, 'Esports Machine', 'VELOCITY', 'Tune for competition.', 'Higher collection targets and packed hazards test fast, accurate match planning.', 'VOLT ARENA', 'Esports machine tuned for competitive play.'],
  [5, 'VR Reactor', 'IMMERSION', 'Drive the virtual world.', 'Dense cooling and graphics routes make every move matter in this VR-ready build.', 'NEXUS VR', 'VR reactor synchronized for immersive worlds.'],
  [6, 'AI Developer Box', 'NEURAL', 'Train the compute stack.', 'Large component targets and aggressive hazards create a serious AI development system.', 'NEURAL LAB', 'AI developer box ready for model workloads.'],
  [7, 'Simulation Forge', 'SIMULATION', 'Calculate at full scale.', 'Longer objectives, layered hazards and careful power-up timing define this simulation build.', 'SIM FORGE', 'Simulation forge online for complex calculations.'],
  [8, 'Cyber Command Rig', 'FORTRESS', 'Secure every circuit.', 'Virus-heavy boards and strict efficiency targets create the toughest defensive workstation yet.', 'CYBER OPS', 'Cyber command rig secured and operational.'],
  [9, 'Quantum Lab PC', 'QUANTUM', 'Stabilize the system.', 'Advanced component routes push cascades, specials and lifelines to their limits.', 'Q-LAB', 'Quantum lab PC stabilized for research.'],
  [10, 'Ultimate ByteCore', 'ULTIMATE', 'Master the motherboard.', 'The final ten circuits combine the largest targets, densest hazards and tightest strategy challenge.', 'BYTECORE X', 'All ten systems complete. You mastered the workshop.'],
] as BuildSeed[]).map(([number, name, tier, heading, description, modelLabel, completion]) =>
  ({ number, name, tier, heading, description, modelLabel, completion }));
type LevelSeed = [number, string, string, string, string, string, PieceKind, number, number, ObstacleKind, number, BoosterKind];
const FIRST_LEVELS: LevelSeed[] = [
  [1, 'Signal Start', 'Motherboard', 'BOARD', 'Collect 10 power circuits', 'The motherboard connects every major component and lets them communicate.', 'power', 10, 20, 'none', 0, 'mouse'],
  [2, 'Processing Power', 'CPU', 'CPU', 'Collect 12 CPU chips', 'A CPU processes instructions. Its socket and motherboard must be compatible.', 'cpu', 12, 20, 'dust', 4, 'cpu'],
  [3, 'Keep It Cool', 'CPU Cooler', 'COOLER', 'Collect 14 fans', 'Thermal paste helps transfer heat from the CPU into its cooler.', 'fan', 14, 21, 'heat', 5, 'cooling'],
  [4, 'Memory Lane', 'RAM', 'RAM', 'Collect 16 RAM modules', 'RAM helps a computer keep active apps ready for quick access.', 'ram', 16, 22, 'cable', 5, 'mouse'],
  [5, 'Fast Storage', 'M.2 SSD', 'SSD', 'Collect 17 SSDs', 'An NVMe SSD fits into an M.2 slot and can load data very quickly.', 'ssd', 17, 23, 'dust', 7, 'gpu'],
  [6, 'Render Ready', 'Graphics Card', 'GPU', 'Collect 18 graphics cards', 'A dedicated GPU renders game worlds, video and other visual workloads.', 'gpu', 18, 24, 'virus', 6, 'gpu'],
  [7, 'Power Route', 'Power Supply', 'PSU', 'Collect 20 power circuits', 'A power supply should provide enough clean power for the complete build.', 'power', 20, 25, 'cable', 8, 'cpu'],
  [8, 'Airflow Online', 'Case Fans', 'FANS', 'Collect 20 cooling fans', 'Front fans usually pull cool air in while rear fans push warm air out.', 'fan', 20, 25, 'heat', 9, 'cooling'],
  [9, 'Control Connected', 'Mouse & Keyboard', 'I/O', 'Collect 22 RAM modules', 'USB ports carry both power and data for peripherals such as a mouse and keyboard.', 'ram', 22, 26, 'virus', 9, 'mouse'],
  [10, 'Final Boot', 'Boot Sequence', 'BOOT', 'Collect 24 CPU chips', 'Connect a monitor to the graphics card when the PC uses a dedicated GPU.', 'cpu', 24, 27, 'cable', 10, 'gpu'],
  [11, 'Blueprint Online', 'Creator Motherboard', 'X670 BOARD', 'Collect 24 power circuits', 'Workstation boards provide more expansion lanes for storage, capture cards and high-core-count CPUs.', 'power', 24, 23, 'dust', 8, 'mouse'],
  [12, 'Multi-Core Matrix', 'Creator CPU', '16-CORE', 'Collect 26 CPU chips', 'More CPU cores help with rendering, compiling and running several demanding tasks together.', 'cpu', 26, 24, 'cable', 8, 'cpu'],
  [13, 'Liquid Loop', 'AIO Liquid Cooler', '360 AIO', 'Collect 28 cooling fans', 'A liquid cooler moves heat from the CPU block to a radiator where fans carry it away.', 'fan', 28, 25, 'heat', 9, 'cooling'],
  [14, 'Memory Array', 'ECC Memory', '64GB ECC', 'Collect 30 RAM modules', 'ECC memory can detect and correct common data errors, improving workstation reliability.', 'ram', 30, 25, 'virus', 9, 'mouse'],
  [15, 'Storage Stripes', 'NVMe Storage Array', 'NVME ×2', 'Collect 32 SSDs', 'A striped storage array can increase speed, but important files still need a separate backup.', 'ssd', 32, 26, 'cable', 10, 'gpu'],
  [16, 'Studio Render', 'Creator Graphics Card', 'PRO GPU', 'Collect 34 graphics cards', 'A creator GPU accelerates 3D rendering, video effects and AI-assisted creative tools.', 'gpu', 34, 27, 'virus', 11, 'gpu'],
  [17, 'Clean Power', 'Modular Power Supply', '1000W PSU', 'Collect 36 power circuits', 'A modular PSU lets builders connect only the cables the system needs, improving airflow.', 'power', 36, 28, 'heat', 11, 'cpu'],
  [18, 'Pressure Tuned', 'Triple Intake Fans', '3× FANS', 'Collect 38 cooling fans', 'Slight positive air pressure can reduce dust entering through unfiltered openings.', 'fan', 38, 29, 'dust', 12, 'cooling'],
  [19, 'Studio Connected', 'Capture & Studio I/O', 'STUDIO I/O', 'Collect 40 RAM modules', 'Fast USB and capture connections keep cameras, audio interfaces and storage moving smoothly.', 'ram', 40, 30, 'virus', 13, 'mouse'],
  [20, 'Creator Launch', 'Render Workstation', 'RENDER', 'Collect 42 CPU chips', 'Balanced cooling, power and memory matter as much as raw speed during long creative workloads.', 'cpu', 42, 31, 'cable', 14, 'gpu'],
];
const levelNames = ['Blueprint Route', 'Core Clock', 'Thermal Flow', 'Memory Grid', 'Storage Lane', 'Graphics Pipeline', 'Power Matrix', 'Airflow Tunnel', 'Control Link', 'System Launch'];
const partNames = ['Motherboard', 'Processor', 'Cooling System', 'Memory Kit', 'Storage Array', 'Graphics Card', 'Power Supply', 'Case Airflow', 'Control I/O', 'Boot Sequence'];
const partShortNames = ['BOARD', 'CPU', 'COOLER', 'RAM', 'SSD', 'GPU', 'PSU', 'FANS', 'I/O', 'BOOT'];
const tips = ['A motherboard chipset determines many expansion and connectivity options.', 'CPU performance depends on architecture, clock speed, core count and cooling.', 'Good cooling protects performance by moving heat away from working components.', 'Matched memory modules help a system use multi-channel memory bandwidth.', 'Fast storage improves loading, but important files still need a separate backup.', 'A GPU needs suitable case space, cooling and power connectors.', 'Choose a quality power supply with enough capacity and the correct connectors.', 'Balanced intake and exhaust airflow helps avoid hot spots inside the case.', 'External devices work best when connected to ports that support their full speed.', 'A stable system should pass temperature, memory and workload tests before daily use.'];
const targets: PieceKind[] = ['power', 'cpu', 'fan', 'ram', 'ssd', 'gpu', 'power', 'fan', 'ram', 'cpu'];
const rewards: BoosterKind[] = ['mouse', 'cpu', 'cooling', 'mouse', 'gpu', 'gpu', 'cpu', 'cooling', 'mouse', 'gpu'];
const hazards: ObstacleKind[] = ['dust', 'cable', 'heat', 'virus'];
export const PUZZLE_LEVELS: PuzzleLevel[] = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1, buildNumber = Math.floor(index / 10) + 1, slot = index % 10;
  const rewardTier = Math.min(4, Math.ceil(buildNumber / 3));
  const seed = FIRST_LEVELS[index];
  if (seed) {
    const [number, name, buildPart, buildPartShort, objective, tip, target, targetCount, moves, obstacle, obstacleCount, rewardBooster] = seed;
    return { number, name, buildPart, buildPartShort, objective, tip, target, targetCount, moves, obstacle, obstacleCount, rewardBooster, rewardTier };
  }
  const build = BUILD_PATHS[buildNumber - 1], targetCount = 20 + buildNumber * 4 + slot * 2;
  return { number, name: `${build.tier} ${levelNames[slot]}`,
    buildPart: slot === 9 ? `${build.name} Boot` : `${build.tier} ${partNames[slot]}`,
    buildPartShort: partShortNames[slot], objective: `Collect ${targetCount} ${PIECE_LABELS[targets[slot]]} tiles`,
    tip: tips[slot], target: targets[slot], targetCount, moves: 22 + buildNumber + slot,
    obstacle: hazards[(buildNumber + slot) % 4], obstacleCount: Math.min(20, 8 + buildNumber + Math.floor(slot / 2)),
    rewardBooster: rewards[slot], rewardTier };
});
export function getLevel(number: number): PuzzleLevel {
  const level = PUZZLE_LEVELS.find((entry) => entry.number === number);
  if (!level) throw new Error('Unknown puzzle level.');
  return level;
}
