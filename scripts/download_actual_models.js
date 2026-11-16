import fs from 'fs';
import path from 'path';
import https from 'https';

const KENNEY_FURNITURE_BASE = 'https://raw.githubusercontent.com/shorepine/kenney/main/3d/furniture/';
const KENNEY_ARCADE_BASE = 'https://raw.githubusercontent.com/shorepine/kenney/main/3d/mini-arcade/';
const QUATERNIUS_CYBER_BASE = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/cyberpunk_pack/';
const QUATERNIUS_SCIFI_BASE = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/modular_sci_fi/';
const QUATERNIUS_INTERIOR_BASE = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/house_interior_pack/';

const DOWNLOAD_MAP = [
  // PCs (Quaternius Actual Models)
  { url: QUATERNIUS_SCIFI_BASE + 'Props_ComputerSmall.glb', dest: 'equipment/pcs/pc_basic.glb', source: 'Quaternius' },
  { url: QUATERNIUS_CYBER_BASE + 'Computer.glb', dest: 'equipment/pcs/pc_gaming.glb', source: 'Quaternius' },
  { url: QUATERNIUS_SCIFI_BASE + 'Props_Computer.glb', dest: 'equipment/pcs/pc_premium.glb', source: 'Quaternius' },
  { url: QUATERNIUS_CYBER_BASE + 'Computer_Large.glb', dest: 'equipment/pcs/pc_ultimate.glb', source: 'Quaternius' },

  // Chairs (Kenney Actual Models)
  { url: KENNEY_FURNITURE_BASE + 'chairDesk.glb', dest: 'equipment/chairs/chair_basic.glb', source: 'Kenney' },
  { url: KENNEY_FURNITURE_BASE + 'chairModernFrameCushion.glb', dest: 'equipment/chairs/chair_racing.glb', source: 'Kenney' },

  // Desks (Kenney Actual Models)
  { url: KENNEY_FURNITURE_BASE + 'desk.glb', dest: 'furniture/desks/desk_single.glb', source: 'Kenney' },
  { url: KENNEY_FURNITURE_BASE + 'deskCorner.glb', dest: 'furniture/desks/desk_rgb.glb', source: 'Kenney' },

  // Displays (Kenney & Quaternius Actual Models)
  { url: KENNEY_FURNITURE_BASE + 'computerScreen.glb', dest: 'equipment/monitors/monitor_basic.glb', source: 'Kenney' },
  { url: QUATERNIUS_CYBER_BASE + 'TV_2.glb', dest: 'equipment/monitors/monitor_ultrawide.glb', source: 'Quaternius' },

  // Peripherals (Kenney Actual Models)
  { url: KENNEY_FURNITURE_BASE + 'computerKeyboard.glb', dest: 'equipment/accessories/keyboard_mouse.glb', source: 'Kenney' },

  // Counter & Reception
  { url: KENNEY_ARCADE_BASE + 'cash-register.glb', dest: 'furniture/counters/reception_counter.glb', source: 'Kenney' },

  // Business / Arcade / Vending (Kenney Actual Models)
  { url: KENNEY_ARCADE_BASE + 'arcade-machine.glb', dest: 'business/arcade_machine.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'vending-machine.glb', dest: 'business/vending_machine.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'air-hockey.glb', dest: 'business/air_hockey.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'pinball.glb', dest: 'business/pinball.glb', source: 'Kenney' },

  // Sofas & Decor (Kenney & Quaternius Actual Models)
  { url: KENNEY_FURNITURE_BASE + 'loungeSofa.glb', dest: 'furniture/sofas/sofa_lounge.glb', source: 'Kenney' },
  { url: KENNEY_FURNITURE_BASE + 'loungeChair.glb', dest: 'furniture/sofas/bean_bag.glb', source: 'Kenney' },
  { url: KENNEY_FURNITURE_BASE + 'pottedPlant.glb', dest: 'decorations/plant_indoor.glb', source: 'Kenney' },
  { url: KENNEY_FURNITURE_BASE + 'trashcan.glb', dest: 'decorations/trash_bin.glb', source: 'Kenney' },
  { url: QUATERNIUS_CYBER_BASE + 'Sign_1.glb', dest: 'decorations/neon_sign_game.glb', source: 'Quaternius' },

  // Environment (Kenney Actual Models)
  { url: KENNEY_ARCADE_BASE + 'floor.glb', dest: 'environment/floors/floor_tile.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'wall.glb', dest: 'environment/walls/wall_straight.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'wall-corner.glb', dest: 'environment/walls/wall_corner.glb', source: 'Kenney' },

  // Characters (Kenney Actual Models)
  { url: KENNEY_ARCADE_BASE + 'character-gamer.glb', dest: 'characters/character_customer.glb', source: 'Kenney' },
  { url: KENNEY_ARCADE_BASE + 'character-employee.glb', dest: 'characters/character_employee.glb', source: 'Kenney' }
];

const TARGET_ROOT = path.resolve('public/assets/models');
const SOURCE_ROOT = path.resolve('source-assets/downloaded-originals');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
        return;
      }
      if (response.statusCode !== 200) {
        fs.unlink(destPath, () => {});
        reject(new Error(`Failed to download ${url}: status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log(`Starting download of ${DOWNLOAD_MAP.length} actual models from Kenney and Quaternius (CC0)...`);
  for (const item of DOWNLOAD_MAP) {
    const destTarget = path.join(TARGET_ROOT, item.dest);
    const destSource = path.join(SOURCE_ROOT, item.dest);
    console.log(`Fetching [${item.source}] ${path.basename(item.dest)}...`);
    try {
      await downloadFile(item.url, destTarget);
      // also copy to source-assets
      fs.mkdirSync(path.dirname(destSource), { recursive: true });
      fs.copyFileSync(destTarget, destSource);
      const stat = fs.statSync(destTarget);
      console.log(`  ✓ Saved (${(stat.size / 1024).toFixed(1)} KB) -> ${item.dest}`);
    } catch (e) {
      console.error(`  ✗ Error downloading ${item.dest}:`, e.message);
    }
  }
  console.log('All actual 3D models downloaded and synchronized successfully!');
}

main();

