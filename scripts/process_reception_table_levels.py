import bpy
import mathutils
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SOURCE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models", "game creation", "reception table")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models", "furniture", "counters")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def get_mesh_bounds(objects):
    pts = []
    for o in objects:
        if o.type == 'MESH':
            pts.extend([o.matrix_world @ mathutils.Vector(c) for c in o.bound_box])
    if not pts:
        return 0, 0, 0, 0, 0, 0
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

def import_glb(filepath):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    after = set(bpy.data.objects)
    return list(after - before)

def scale_and_place_group(objs, target_width, target_x, target_y, target_z):
    """
    Uniformly scales a group of imported objects so its bounding box width matches target_width,
    and positions its bottom center at (target_x, target_y, target_z).
    """
    min_x, max_x, min_y, max_y, min_z, max_z = get_mesh_bounds(objs)
    dx = max_x - min_x
    if dx <= 0:
        return

    scale_factor = target_width / dx

    # Create an empty as parent to transform group cleanly
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "PropRoot"

    for o in objs:
        if o.parent is None:
            o.parent = root

    root.scale = (scale_factor, scale_factor, scale_factor)
    bpy.context.view_layer.update()

    # Recalculate bounds after scale
    min_x, max_x, min_y, max_y, min_z, max_z = get_mesh_bounds(objs)
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    bottom_z = min_z

    root.location.x += (target_x - center_x)
    root.location.y += (target_y - center_y)
    root.location.z += (target_z - bottom_z)
    bpy.context.view_layer.update()

    # Apply transforms and unparent
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.data.objects.remove(root, do_unlink=True)

def build_reception_level(level_num, props_config, output_filename):
    reset_scene()

    # 1. Import base table
    table_path = os.path.join(SOURCE_DIR, "table.glb")
    table_objs = import_glb(table_path)

    # Normalize table: center XY, bottom Z at 0
    min_x, max_x, min_y, max_y, min_z, max_z = get_mesh_bounds(table_objs)
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    bottom_z = min_z

    for o in table_objs:
        if o.parent is None:
            o.location.x -= center_x
            o.location.y -= center_y
            o.location.z -= bottom_z

    bpy.context.view_layer.update()

    # Surface heights:
    # Inner desk height is ~0.68m
    # Upper customer ledge height is ~1.05m
    DESK_Z = 0.68
    LEDGE_Z = 1.05

    # 2. Import and place each level-specific prop
    for prop in props_config:
        prop_path = os.path.join(SOURCE_DIR, prop["file"])
        if not os.path.exists(prop_path):
            print(f"Warning: {prop_path} not found!")
            continue

        prop_objs = import_glb(prop_path)
        z_pos = LEDGE_Z if prop.get("on_ledge", False) else DESK_Z
        scale_and_place_group(
            prop_objs,
            target_width=prop["width"],
            target_x=prop["x"],
            target_y=prop["y"],
            target_z=z_pos
        )

    # Select all meshes and export to GLB
    bpy.ops.object.select_all(action='SELECT')
    out_path = os.path.join(OUTPUT_DIR, output_filename)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True
    )
    print(f"[SUCCESS] Exported Level {level_num} to {out_path} ({os.path.getsize(out_path)} bytes)")

LEVELS = [
    {
        "level": 1,
        "output": "reception_lvl1.glb",
        "props": [
            # lvl 1.glb: Guest register pad
            {"file": "lvl 1.glb", "width": 0.42, "x": -0.15, "y": -0.15, "on_ledge": False},
            # lvl 1.1.glb: Welcome nameplate / card stand
            {"file": "lvl 1.1.glb", "width": 0.16, "x": 0.35, "y": 0.18, "on_ledge": True},
            # lvl 1.2.glb: Pen and office tools mug
            {"file": "lvl 1.2.glb", "width": 0.10, "x": 0.28, "y": -0.15, "on_ledge": False}
        ]
    },
    {
        "level": 2,
        "output": "reception_lvl2.glb",
        "props": [
            # lvl 2.glb: Desktop filing organizer & accessories
            {"file": "lvl 2.glb", "width": 0.45, "x": -0.32, "y": -0.10, "on_ledge": False},
            # lvl 2.1.glb: Office telephone with handset
            {"file": "lvl 2.1.glb", "width": 0.24, "x": 0.32, "y": -0.15, "on_ledge": False}
        ]
    },
    {
        "level": 3,
        "output": "reception_lvl3.glb",
        "props": [
            # lvl 3.1.glb: Staff laptop
            {"file": "lvl 3.1.glb", "width": 0.38, "x": 0.0, "y": -0.15, "on_ledge": False},
            # lvl 3.glb: Customer check-in card terminal / reader
            {"file": "lvl 3.glb", "width": 0.28, "x": -0.35, "y": 0.18, "on_ledge": True},
            # lvl 3.2.glb: Stationery tray organizer
            {"file": "lvl 3.2.glb", "width": 0.25, "x": 0.38, "y": -0.15, "on_ledge": False}
        ]
    },
    {
        "level": 4,
        "output": "reception_lvl4.glb",
        "props": [
            # lvl 4.glb: Touchscreen POS terminal & cash drawer
            {"file": "lvl 4.glb", "width": 0.45, "x": -0.12, "y": -0.05, "on_ledge": False},
            # lvl 4.1.glb: Receipt thermal printer
            {"file": "lvl 4.1.glb", "width": 0.20, "x": 0.35, "y": -0.10, "on_ledge": False}
        ]
    }
]

if __name__ == "__main__":
    for lvl in LEVELS:
        build_reception_level(lvl["level"], lvl["props"], lvl["output"])

