"""Import the local Build & Boot C# level catalog without changing its source."""
import csv
import json
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]) / 'src/BuildAndBoot.Game/GameCatalog.cs'
code = source.read_text(encoding='utf-8-sig')
rows = [next(csv.reader([match], skipinitialspace=True))
        for match in re.findall(r'^\s*new\((\d+,.*)\),?$', code, re.M)]
builds, levels = [], []
booster = {'Mouse': 'mouse', 'Cpu': 'cpu', 'Gpu': 'gpu', 'CoolingFan': 'cooling'}
for row in rows:
    row = [value.strip() for value in row]
    if len(row) == 7:
        builds.append([int(row[0]), *row[1:]])
    elif len(row) == 12:
        levels.append([int(row[0]), *row[1:6], row[6].split('.')[-1].lower(),
                       int(row[7]), int(row[8]), row[9].split('.')[-1].lower(),
                       int(row[10]), booster[row[11].split('.')[-1]]])
assert len(builds) == 10 and len(levels) == 20, 'Unexpected C# catalog format.'

def strings(name):
    return re.findall(r'"([^"]*)"', re.search(rf'var {name} = new\[\]\s*\{{(.*?)\}};', code, re.S)[1])

def literal(value):
    return json.dumps(value, ensure_ascii=False).replace("'", "\\'").replace('"', "'")

header = '''// Level data synchronized from the local BuildAndBoot.Game/GameCatalog.cs.
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
export const BUILD_PATHS = ('''
build_data = '[\n' + ''.join('  ' + literal(row) + ',\n' for row in builds) + ']'
level_data = '[\n' + ''.join('  ' + literal(row) + ',\n' for row in levels) + ']'
text = header + build_data + ''' as BuildSeed[]).map(([number, name, tier, heading, description, modelLabel, completion]) =>
  ({ number, name, tier, heading, description, modelLabel, completion }));
type LevelSeed = [number, string, string, string, string, string, PieceKind, number, number, ObstacleKind, number, BoosterKind];
const FIRST_LEVELS: LevelSeed[] = ''' + level_data + ';\n'
for name in ['levelNames', 'partNames', 'partShortNames', 'tips']:
    text += f'const {name} = {literal(strings(name))};\n'
text += '''const targets: PieceKind[] = ['power', 'cpu', 'fan', 'ram', 'ssd', 'gpu', 'power', 'fan', 'ram', 'cpu'];
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
'''
Path('src/puzzle/catalog.ts').write_text(text, encoding='utf-8')
print('Synchronized 10 builds and 100 levels from', source)
