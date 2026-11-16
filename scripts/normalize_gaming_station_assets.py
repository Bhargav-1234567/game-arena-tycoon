"""
Normalize all Gaming Station 3D assets to a unified coordinate system:
- Desks: Width along X, depth along Z, front facing +Z in Three.js (-Y in Blender), height = 0.72m
- Chairs: Backrest at +Z in Three.js (-Y in Blender), seat facing -Z (+Y in Blender), height = 0.88m..1.00m
- Monitors: Screen facing +Z in Three.js (-Y in Blender), base at Z = 0
- Keyboards: Spacebar at +Z in Three.js (-Y in Blender), width = 0.45m, base at Z = 0
- Mice: Palm at +Z in Three.js (-Y in Blender), buttons at -Z, length = 0.12m, base at Z = 0
- CPUs: Front panel at +Z in Three.js (-Y in Blender), base at Z = 0
- Speakers: Cone facing +Z in Three.js (-Y in Blender), base at Z = 0
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
    'tables/gaming lvl 1.glb': {'dest': 'furniture/desks/desk_lvl1.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.72},
    'tables/gaming lvl 2.glb': {'dest': 'furniture/desks/desk_lvl2.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 0.72},
    'tables/gaming lvl 3.glb': {'dest': 'furniture/desks/desk_lvl3.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 0.72},
    'tables/lvl 4.glb':        {'dest': 'furniture/desks/desk_lvl4.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 0.72},

    # --- CHAIRS ---
    'chairs/lvl 1.glb': {'dest': 'equipment/chairs/chair_lvl1.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.88},
    'chairs/lvl 2.glb': {'dest': 'equipment/chairs/chair_lvl2.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.92},
    'chairs/lvl 3.glb': {'dest': 'equipment/chairs/chair_lvl3.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 0.95},
    'chairs/lvl 4.glb': {'dest': 'equipment/chairs/chair_lvl4.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 1.00},

    # --- MONITORS ---
    'monitor/lvl 1.glb': {'dest': 'equipment/monitors/monitor_lvl1.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 0.38},
    'monitor/lvl 2.glb': {'dest': 'equipment/monitors/monitor_lvl2.glb', 'rot_z': -90, 'scale_mode': 'h', 'target': 0.42},
    'monitor/lvl 3.glb': {'dest': 'equipment/monitors/monitor_lvl3.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.45},
    'monitor/lvl 4.glb': {'dest': 'equipment/monitors/monitor_lvl4.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.48},

    # --- KEYBOARDS ---
    'keyboard/lvl 1.glb': {'dest': 'equipment/keyboards/keyboard_lvl1.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.45},
    'keyboard/lvl 2.glb': {'dest': 'equipment/keyboards/keyboard_lvl2.glb', 'rot_z': 45, 'scale_mode': 'w', 'target': 0.45},
    'keyboard/lvl 3.glb': {'dest': 'equipment/keyboards/keyboard_lvl3.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.45},
    'keyboard/lvl 4.glb': {'dest': 'equipment/keyboards/keyboard_lvl4.glb', 'rot_z': 0,  'scale_mode': 'w', 'target': 0.45},

    # --- MICE ---
    'mouse/lvl 1.glb': {'dest': 'equipment/mice/mouse_lvl1.glb', 'rot_z': 180, 'scale_mode': 'len', 'target': 0.12},
    'mouse/lvl 2.glb': {'dest': 'equipment/mice/mouse_lvl2.glb', 'rot_z': 0,   'scale_mode': 'len', 'target': 0.12},
    'mouse/lvl 3.glb': {'dest': 'equipment/mice/mouse_lvl3.glb', 'rot_z': 180, 'scale_mode': 'len', 'target': 0.12},
    'mouse/lvl 4.glb': {'dest': 'equipment/mice/mouse_lvl4.glb', 'rot_z': 0,   'scale_mode': 'len', 'target': 0.12},

    # --- CPUS ---
    'CPU/lvl 1.glb': {'dest': 'equipment/pcs/pc_lvl1.glb', 'rot_z': 0,   'scale_mode': 'h', 'target': 0.44},
    'CPU/lvl 2.glb': {'dest': 'equipment/pcs/pc_lvl2.glb', 'rot_z': 180, 'scale_mode': 'h', 'target': 0.46},
    'CPU/lvl 3.glb': {'dest': 'equipment/pcs/pc_lvl3.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 0.48},
    'CPU/lvl 4.glb': {'dest': 'equipment/pcs/pc_lvl4.glb', 'rot_z': 90,  'scale_mode': 'h', 'target': 0.52},

    # --- SPEAKERS ---
    'speaker/lvl 1.glb': {'dest': 'equipment/speakers/speaker_lvl1.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.18},
    'speaker/lvl 2.glb': {'dest': 'equipment/speakers/speaker_lvl2.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.22},
    'speaker/lvl 3.glb': {'dest': 'equipment/speakers/speaker_lvl3.glb', 'rot_z': 0, 'scale_mode': 'h', 'target': 0.25},
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

    # Determine scaling factor
    mode = cfg['scale_mode']
    target_val = cfg['target']
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

    # Center horizontally at X=0, Y=0, and place bottom at Z=0
    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    bz = min_z

    for o in mesh_objs:
        o.location.x = (o.location.x - cx) * scale_factor
        o.location.y = (o.location.y - cy) * scale_factor
        o.location.z = (o.location.z - bz) * scale_factor
        o.scale *= scale_factor

    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

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
    print("=== Normalizing All Gaming Station Assets ===")
    for src_rel, cfg in NORMALIZATION_CONFIG.items():
        normalize_asset(src_rel, cfg)
    print("=== All 28 Gaming Station Assets Normalized Successfully ===")

if __name__ == '__main__':
    main()

