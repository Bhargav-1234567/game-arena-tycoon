"""
Normalize all Facilities 3D assets (Sofa, Arcade, Vending) to a unified coordinate system
with progressive tier scaling and standard front-facing direction:
- Coordinate convention:
  - Blender -Y translates to Three.js +Z (facing camera / player)
  - Centered at (X = 0, Y = 0)
  - Grounded flush at floor: Z_min = 0 (Three.js Y_min = 0)
- Progressive tier scaling ("bit bigger not too much" across upgrades):
  - Sofas (mode: w):
    - Lvl 1: width 1.50m (compact lobby bench)
    - Lvl 2: width 1.75m (modern 2-seat sofa)
    - Lvl 3: width 2.05m (executive leather couch)
    - Lvl 4: width 2.35m (VIP sectional lounge)
  - Arcades (mode: h):
    - Lvl 1: height 1.75m (classic retro cabinet)
    - Lvl 2: height 1.85m (deluxe fighting cabinet)
    - Lvl 3: height 1.95m (rhythm dance stage)
    - Lvl 4: height 1.80m (VR motion simulator cockpit)
  - Vending (mode: h):
    - Lvl 1: height 1.85m (soda dispenser)
    - Lvl 2: height 1.92m (snack & energy drink vendor)
    - Lvl 3: height 2.00m (hot coffee & meal vendor)
    - Lvl 4: height 2.08m (smart mart)
"""
import bpy
import os
import mathutils
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SRC_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models", "game creation")
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models")

NORMALIZATION_CONFIG = {
    # --- SOFAS ---
    # Width grows 1.50m -> 1.75m -> 2.05m -> 2.35m, all cushions facing -Y (Three.js +Z)
    'sofa/lvl 1.glb': {
        'dest': 'furniture/sofas/sofa_lvl1.glb',
        'rot_z': -90,
        'scale_mode': 'w',
        'target': 1.50
    },
    'sofa/lvl 2.glb': {
        'dest': 'furniture/sofas/sofa_lvl2.glb',
        'rot_z': 0,
        'scale_mode': 'w',
        'target': 1.75
    },
    'sofa/lvl 3.glb': {
        'dest': 'furniture/sofas/sofa_lvl3.glb',
        'rot_z': 0,
        'scale_mode': 'w',
        'target': 2.05
    },
    'sofa/lvl 4.glb': {
        'dest': 'furniture/sofas/sofa_lvl4.glb',
        'rot_z': 180,
        'scale_mode': 'w',
        'target': 2.35
    },

    # --- ARCADES ---
    # Height & bulk grows: 1.75m -> 1.85m -> 1.95m -> 1.80m cockpit, all screens facing -Y (Three.js +Z)
    'arcade/lvl 1.glb': {
        'dest': 'business/arcade/arcade_lvl1.glb',
        'rot_z': -90,
        'scale_mode': 'h',
        'target': 1.75
    },
    'arcade/lvl 2.glb': {
        'dest': 'business/arcade/arcade_lvl2.glb',
        'rot_z': 90,
        'scale_mode': 'h',
        'target': 1.85
    },
    'arcade/lvl 3.glb': {
        'dest': 'business/arcade/arcade_lvl3.glb',
        'rot_z': 0,
        'scale_mode': 'h',
        'target': 1.95
    },
    'arcade/lvl 4.glb': {
        'dest': 'business/arcade/arcade_lvl4.glb',
        'rot_z': 90,
        'scale_mode': 'h',
        'target': 1.80
    },

    # --- VENDING MACHINES ---
    # Height grows: 1.85m -> 1.92m -> 2.00m -> 2.08m, all fronts facing -Y (Three.js +Z)
    'vending/lvl 1.glb': {
        'dest': 'business/vending/vending_lvl1.glb',
        'rot_z': 0,
        'scale_mode': 'h',
        'target': 1.85
    },
    'vending/lvl 2.glb': {
        'dest': 'business/vending/vending_lvl2.glb',
        'rot_z': -90,
        'scale_mode': 'h',
        'target': 1.92
    },
    'vending/lvl 3.glb': {
        'dest': 'business/vending/vending_lvl3.glb',
        'rot_z': 180,
        'scale_mode': 'h',
        'target': 2.00
    },
    'vending/lvl 4.glb': {
        'dest': 'business/vending/vending_lvl4.glb',
        'rot_z': 0,
        'scale_mode': 'h',
        'target': 2.08
    },
}

def normalize_asset(src_rel, cfg):
    src_path = os.path.join(SRC_DIR, src_rel)
    dest_path = os.path.join(OUT_DIR, cfg['dest'])

    if not os.path.exists(src_path):
        print(f"Skipping missing file: {src_path}")
        return

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    try:
        bpy.ops.import_scene.gltf(filepath=src_path)
    except Exception as e:
        print(f"Failed to import {src_rel}: {e}")
        return

    # 1. Unparent all mesh objects keeping their transforms
    new_objs = list(bpy.data.objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in new_objs:
        if o.type == 'MESH':
            o.select_set(True)
    if bpy.context.selected_objects:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')

    # 2. Remove all non-mesh objects (empties, cameras, lights)
    for o in new_objs:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)

    mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
    if not mesh_objs:
        print(f"No meshes found in {src_rel}")
        return

    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 3. Rotate group around Z axis to face standard -Y
    rot_z = cfg.get('rot_z', 0)
    if rot_z != 0:
        root = bpy.data.objects.new("RotRoot", None)
        bpy.context.scene.collection.objects.link(root)
        for o in mesh_objs:
            o.parent = root
        root.rotation_euler.z = math.radians(rot_z)
        bpy.context.view_layer.update()

        bpy.ops.object.select_all(action='DESELECT')
        for o in mesh_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = mesh_objs[0]
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.data.objects.remove(root, do_unlink=True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 4. Measure bounds
    pts = [o.matrix_world @ mathutils.Vector(c) for o in mesh_objs for c in o.bound_box]
    min_x, max_x = min(p.x for p in pts), max(p.x for p in pts)
    min_y, max_y = min(p.y for p in pts), max(p.y for p in pts)
    min_z, max_z = min(p.z for p in pts), max(p.z for p in pts)

    dim_x = max_x - min_x
    dim_y = max_y - min_y
    dim_z = max_z - min_z

    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    bz = min_z

    mode = cfg['scale_mode']
    target_val = cfg['target']

    if mode == 'w':
        current_dim = dim_x
    elif mode == 'h':
        current_dim = dim_z
    elif mode == 'd':
        current_dim = dim_y
    else:
        current_dim = dim_z

    if current_dim <= 0.00001:
        current_dim = 1.0

    scale_factor = target_val / current_dim

    for o in mesh_objs:
        o.location.x = (o.location.x - cx) * scale_factor
        o.location.y = (o.location.y - cy) * scale_factor
        o.location.z = (o.location.z - bz) * scale_factor
        o.scale *= scale_factor

    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    # 5. Export normalized glTF
    bpy.ops.export_scene.gltf(
        filepath=dest_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )

    pts_final = [o.matrix_world @ mathutils.Vector(c) for o in mesh_objs for c in o.bound_box]
    final_dx = max(p.x for p in pts_final) - min(p.x for p in pts_final)
    final_dy = max(p.y for p in pts_final) - min(p.y for p in pts_final)
    final_dz = max(p.z for p in pts_final) - min(p.z for p in pts_final)
    final_bz = min(p.z for p in pts_final)
    print(f"[OK] {src_rel} -> {cfg['dest']}: size=({final_dx:.3f}w, {final_dy:.3f}d, {final_dz:.3f}h) base_z={final_bz:.4f}m")

def main():
    print("=== Normalizing All Facility Assets (Sofa, Arcade, Vending) With Progressive Scaling ===")
    for src_rel, cfg in NORMALIZATION_CONFIG.items():
        normalize_asset(src_rel, cfg)
    print("=== All 12 Facility Assets Normalized Successfully ===")

if __name__ == '__main__':
    main()

