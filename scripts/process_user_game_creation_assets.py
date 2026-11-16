"""
Process and normalize all models added by user in 'public/assets/models/game creation'
Runs via Blender 3.3 headless.
"""
import bpy
import os
import mathutils

SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../public/assets/models/game creation"))
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../public/assets/models"))

# Target physical dimensions (height in meters, or specific scale)
TARGET_CONFIG = {
    # CPUs
    'CPU/lvl 1.glb': ('equipment/pcs/pc_lvl1.glb', 0.44),
    'CPU/lvl 2.glb': ('equipment/pcs/pc_lvl2.glb', 0.46),
    'CPU/lvl 3.glb': ('equipment/pcs/pc_lvl3.glb', 0.48),
    'CPU/lvl 4.glb': ('equipment/pcs/pc_lvl4.glb', 0.52),

    # Chairs
    'chairs/lvl 1.glb': ('equipment/chairs/chair_lvl1.glb', 0.85),
    'chairs/lvl 2.glb': ('equipment/chairs/chair_lvl2.glb', 0.88),
    'chairs/lvl 3.glb': ('equipment/chairs/chair_lvl3.glb', 0.92),
    'chairs/lvl 4.glb': ('equipment/chairs/chair_lvl4.glb', 0.95),

    # Monitors
    'monitor/lvl 1.glb': ('equipment/monitors/monitor_lvl1.glb', 0.38),
    'monitor/lvl 2.glb': ('equipment/monitors/monitor_lvl2.glb', 0.42),
    'monitor/lvl 3.glb': ('equipment/monitors/monitor_lvl3.glb', 0.45),
    'monitor/lvl 4.glb': ('equipment/monitors/monitor_lvl4.glb', 0.48),

    # Keyboards
    'keyboard/lvl 1.glb': ('equipment/keyboards/keyboard_lvl1.glb', 0.035),
    'keyboard/lvl 2.glb': ('equipment/keyboards/keyboard_lvl2.glb', 0.035),
    'keyboard/lvl 3.glb': ('equipment/keyboards/keyboard_lvl3.glb', 0.035),
    'keyboard/lvl 4.glb': ('equipment/keyboards/keyboard_lvl4.glb', 0.035),

    # Mice
    'mouse/lvl 1.glb': ('equipment/mice/mouse_lvl1.glb', 0.04),
    'mouse/lvl 2.glb': ('equipment/mice/mouse_lvl2.glb', 0.04),
    'mouse/lvl 3.glb': ('equipment/mice/mouse_lvl3.glb', 0.04),
    'mouse/lvl 4.glb': ('equipment/mice/mouse_lvl4.glb', 0.04),

    # Speakers
    'speaker/lvl 1.glb': ('equipment/speakers/speaker_lvl1.glb', 0.18),
    'speaker/lvl 2.glb': ('equipment/speakers/speaker_lvl2.glb', 0.22),
    'speaker/lvl 3.glb': ('equipment/speakers/speaker_lvl3.glb', 0.25),
    'speaker/lvl 4.glb': ('equipment/speakers/speaker_lvl4.glb', 0.28),

    # Desks / Tables
    'tables/gaming lvl 1.glb': ('furniture/desks/desk_lvl1.glb', 0.72),
    'tables/gaming lvl 2.glb': ('furniture/desks/desk_lvl2.glb', 0.72),
    'tables/gaming lvl 3.glb': ('furniture/desks/desk_lvl3.glb', 0.72),
    'tables/lvl 4.glb': ('furniture/desks/desk_lvl4.glb', 0.72),

    # Reception Tables
    'reception table/lvl 1.glb': ('furniture/counters/reception_lvl1.glb', 1.05),
    'reception table/lvl 2.glb': ('furniture/counters/reception_lvl2.glb', 1.05),
    'reception table/lvl 3.glb': ('furniture/counters/reception_lvl3.glb', 1.05),
    'reception table/lvl 4.glb': ('furniture/counters/reception_lvl4.glb', 1.05),

    # Arcades
    'arcade/lvl 1.glb': ('business/arcade/arcade_lvl1.glb', 1.85),
    'arcade/lvl 2.glb': ('business/arcade/arcade_lvl2.glb', 1.85),
    'arcade/lvl 3.glb': ('business/arcade/arcade_lvl3.glb', 1.85),
    'arcade/lvl 4.glb': ('business/arcade/arcade_lvl4.glb', 1.85),

    # Vending Machines
    'vending/lvl 1.glb': ('business/vending/vending_lvl1.glb', 1.95),
    'vending/lvl 2.glb': ('business/vending/vending_lvl2.glb', 1.95),
    'vending/lvl 3.glb': ('business/vending/vending_lvl3.glb', 1.95),
    'vending/lvl 4.glb': ('business/vending/vending_lvl4.glb', 1.95),

    # Sofas
    'sofa/lvl 1.glb': ('furniture/sofas/sofa_lvl1.glb', 0.75),
    'sofa/lvl 2.glb': ('furniture/sofas/sofa_lvl2.glb', 0.75),
    'sofa/lvl 3.glb': ('furniture/sofas/sofa_lvl3.glb', 0.75),
    'sofa/lvl 4.glb': ('furniture/sofas/sofa_lvl4.glb', 0.75),
}

def normalize_mesh_asset(src_rel, dest_rel, target_h):
    src_path = os.path.join(SRC_DIR, src_rel)
    dest_path = os.path.join(OUT_DIR, dest_rel)

    if not os.path.exists(src_path):
        print(f"Skipping missing: {src_rel}")
        return

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=src_path)
    except Exception as e:
        print(f"Failed to import {src_rel}: {e}")
        return

    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not mesh_objs:
        print(f"No meshes in {src_rel}")
        return

    # Compute bounding box
    min_x = min_y = min_z = 999999.0
    max_x = max_y = max_z = -999999.0

    for o in mesh_objs:
        for corner in o.bound_box:
            world_corner = o.matrix_world @ mathutils.Vector(corner)
            min_x = min(min_x, world_corner.x)
            max_x = max(max_x, world_corner.x)
            min_y = min(min_y, world_corner.y)
            max_y = max(max_y, world_corner.y)
            min_z = min(min_z, world_corner.z)
            max_z = max(max_z, world_corner.z)

    current_h = max_z - min_z
    if current_h <= 0.0001:
        current_h = 1.0

    scale_factor = target_h / current_h

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    floor_z = min_z

    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.location.x = (o.location.x - center_x) * scale_factor
            o.location.y = (o.location.y - center_y) * scale_factor
            o.location.z = (o.location.z - floor_z) * scale_factor
            o.scale *= scale_factor

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=dest_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )
    print(f"✓ Processed {src_rel} -> {dest_rel} (h: {target_h}m)")

def process_characters():
    # Men characters
    men_dir = os.path.join(SRC_DIR, "human/men -gltf and devided in 4 parts so we can make combinations")
    men_out = os.path.join(OUT_DIR, "characters/men")
    os.makedirs(men_out, exist_ok=True)

    if os.path.exists(men_dir):
        for f in os.listdir(men_dir):
            if f.endswith('.glb'):
                src = os.path.join(men_dir, f)
                dst = os.path.join(men_out, f)
                # Simply copy or re-export to keep skeleton pristine
                import shutil
                shutil.copyfile(src, dst)
                print(f"✓ Synced Men character: {f}")

    # Women characters
    women_dir = os.path.join(SRC_DIR, "human/Women Pack-glb and devided in 4 parts so we can make combinations")
    women_out = os.path.join(OUT_DIR, "characters/women")
    os.makedirs(women_out, exist_ok=True)

    if os.path.exists(women_dir):
        for f in os.listdir(women_dir):
            if f.endswith('.glb'):
                src = os.path.join(women_dir, f)
                dst = os.path.join(women_out, f)
                import shutil
                shutil.copyfile(src, dst)
                print(f"✓ Synced Women character: {f}")

def main():
    print("=== Processing User Game Creation Assets ===")
    for src_rel, (dest_rel, target_h) in TARGET_CONFIG.items():
        normalize_mesh_asset(src_rel, dest_rel, target_h)
    
    process_characters()
    print("=== All Game Creation Assets Processed Successfully ===")

if __name__ == '__main__':
    main()
