"""
Normalize all Gaming Station 3D assets to a unified coordinate system with progressive tier scaling:
- Upgrades make items visibly larger ("bit bigger not too much"):
  - Desks: width grows 1.35m -> 1.50m -> 1.65m -> 1.85m, tabletop surface stays at 0.720m
  - Monitors: width grows 0.48m -> 0.58m -> 0.70m -> 0.88m, facing +Z towards camera
  - Keyboards: width grows 0.40m -> 0.46m -> 0.52m -> 0.58m
  - Chairs: height grows 0.85m -> 0.95m -> 1.06m -> 1.18m
  - Mice: length grows 0.11m -> 0.125m -> 0.14m -> 0.155m
  - CPUs: height grows 0.42m -> 0.46m -> 0.50m -> 0.55m
  - Speakers: height grows 0.16m -> 0.20m -> 0.24m -> 0.28m
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
    # --- DESKS ---
    # Width grows 1.35m -> 1.50m -> 1.65m -> 1.85m, tabletop surface stays at 0.72m
    'tables/gaming lvl 1.glb': {'dest': 'furniture/desks/desk_lvl1.glb', 'rot_z': 180, 'scale_mode': 'desk', 'target': 1.35},
    'tables/gaming lvl 2.glb': {'dest': 'furniture/desks/desk_lvl2.glb', 'rot_z': 90,  'scale_mode': 'desk', 'target': 1.50},
    'tables/gaming lvl 3.glb': {'dest': 'furniture/desks/desk_lvl3.glb', 'rot_z': 90,  'scale_mode': 'desk', 'target': 1.65},
    'tables/lvl 4.glb':        {'dest': 'furniture/desks/desk_lvl4.glb', 'rot_z': 0,   'scale_mode': 'desk', 'target': 1.85},

    # --- CHAIRS ---
    # Progressive height & bulk: 0.85m -> 0.95m -> 1.06m -> 1.18m
    'chairs/lvl 1.glb': {'dest': 'equipment/chairs/chair_lvl1.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.85},
    'chairs/lvl 2.glb': {'dest': 'equipment/chairs/chair_lvl2.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.95},
    'chairs/lvl 3.glb': {'dest': 'equipment/chairs/chair_lvl3.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 1.06},
    'chairs/lvl 4.glb': {'dest': 'equipment/chairs/chair_lvl4.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 1.18},

    # --- MONITORS ---
    # Progressive width: 0.48m -> 0.58m -> 0.70m -> 0.88m, facing +Z towards camera
    'monitor/lvl 1.glb': {'dest': 'equipment/monitors/monitor_lvl1.glb', 'rot_z': 0,   'scale_mode': 'w', 'target': 0.48},
    'monitor/lvl 2.glb': {'dest': 'equipment/monitors/monitor_lvl2.glb', 'rot_z': -90, 'scale_mode': 'w', 'target': 0.58},
    'monitor/lvl 3.glb': {'dest': 'equipment/monitors/monitor_lvl3.glb', 'rot_z': 180, 'scale_mode': 'w', 'target': 0.70},
    'monitor/lvl 4.glb': {'dest': 'equipment/monitors/monitor_lvl4.glb', 'rot_z': 180, 'scale_mode': 'w', 'target': 0.88},

    # --- KEYBOARDS ---
    # Progressive width: 0.40m -> 0.46m -> 0.52m -> 0.58m
    'keyboard/lvl 1.glb': {'dest': 'equipment/keyboards/keyboard_lvl1.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.40},
    'keyboard/lvl 2.glb': {'dest': 'equipment/keyboards/keyboard_lvl2.glb', 'rot_z': 45, 'scale_mode': 'w', 'target': 0.46},
    'keyboard/lvl 3.glb': {'dest': 'equipment/keyboards/keyboard_lvl3.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.52},
    'keyboard/lvl 4.glb': {'dest': 'equipment/keyboards/keyboard_lvl4.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.58},

    # --- MICE ---
    # Progressive length: 0.11m -> 0.125m -> 0.14m -> 0.155m
    'mouse/lvl 1.glb': {'dest': 'equipment/mice/mouse_lvl1.glb', 'rot_z': 180, 'scale_mode': 'len', 'target': 0.11},
    'mouse/lvl 2.glb': {'dest': 'equipment/mice/mouse_lvl2.glb', 'rot_z': 0,   'scale_mode': 'len', 'target': 0.125},
    'mouse/lvl 3.glb': {'dest': 'equipment/mice/mouse_lvl3.glb', 'rot_z': 180, 'scale_mode': 'len', 'target': 0.14},
    'mouse/lvl 4.glb': {'dest': 'equipment/mice/mouse_lvl4.glb', 'rot_z': 0,   'scale_mode': 'len', 'target': 0.155},

    # --- CPUS ---
    # Progressive height: 0.42m -> 0.46m -> 0.50m -> 0.55m
    'CPU/lvl 1.glb': {'dest': 'equipment/pcs/pc_lvl1.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 0.42},
    'CPU/lvl 2.glb': {'dest': 'equipment/pcs/pc_lvl2.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.46},
    'CPU/lvl 3.glb': {'dest': 'equipment/pcs/pc_lvl3.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 0.50},
    'CPU/lvl 4.glb': {'dest': 'equipment/pcs/pc_lvl4.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.55},

    # --- SPEAKERS ---
    # Progressive height: 0.16m -> 0.20m -> 0.24m -> 0.28m
    'speaker/lvl 1.glb': {'dest': 'equipment/speakers/speaker_lvl1.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.16},
    'speaker/lvl 2.glb': {'dest': 'equipment/speakers/speaker_lvl2.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.20},
    'speaker/lvl 3.glb': {'dest': 'equipment/speakers/speaker_lvl3.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.24},
    'speaker/lvl 4.glb': {'dest': 'equipment/speakers/speaker_lvl4.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.28},
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

    # 3. Rotate group around Z axis if needed
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

    if mode == 'desk':
        # Scale X and Y by target width, lock Z height to 0.72m
        scale_xy = target_val / dim_x if dim_x > 0 else 1.0
        scale_z = 0.72 / dim_z if dim_z > 0 else 1.0
        for o in mesh_objs:
            o.location.x = (o.location.x - cx) * scale_xy
            o.location.y = (o.location.y - cy) * scale_xy
            o.location.z = (o.location.z - bz) * scale_z
            o.scale.x *= scale_xy
            o.scale.y *= scale_xy
            o.scale.z *= scale_z
    else:
        if mode == 'h':
            current_dim = dim_z
        elif mode == 'w':
            current_dim = dim_x
        elif mode == 'len':
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

    # Export normalized glTF
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
    print(f"[OK] {src_rel} -> {cfg['dest']}: size=({final_dx:.3f}m, {final_dy:.3f}m, {final_dz:.3f}m) base_z={min(p.z for p in pts_final):.4f}m")

def main():
    print("=== Normalizing All Gaming Station Assets With Progressive Tier Scaling ===")
    for src_rel, cfg in NORMALIZATION_CONFIG.items():
        normalize_asset(src_rel, cfg)
    print("=== All 28 Gaming Station Assets Normalized Successfully ===")

if __name__ == '__main__':
    main()
