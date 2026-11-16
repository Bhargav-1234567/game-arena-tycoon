import bpy
import mathutils
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SOURCE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models", "game creation", "reception table")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "models", "furniture", "counters")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_and_flatten_glb(filepath):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    new_objs = list(set(bpy.data.objects) - before)

    # Clear parent while keeping world transforms
    bpy.ops.object.select_all(action='DESELECT')
    for o in new_objs:
        if o.type == 'MESH':
            o.select_set(True)
    if bpy.context.selected_objects:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')

    # Remove non-mesh objects (empties, cameras, lights)
    for o in new_objs:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)

    meshes = [o for o in bpy.data.objects if o in new_objs and o.type == 'MESH']
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    return meshes

def get_group_bounds(objs):
    pts = []
    for o in objs:
        pts.extend([o.matrix_world @ mathutils.Vector(c) for c in o.bound_box])
    if not pts:
        return 0, 0, 0, 0, 0, 0
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

def place_prop(objs, target_width, target_x, target_y, target_z_floor, rot_z_deg=0):
    if not objs:
        return

    min_x, max_x, min_y, max_y, min_z, max_z = get_group_bounds(objs)
    dx = max_x - min_x
    if dx <= 0:
        dx = 1.0

    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    bz = min_z

    scale_factor = target_width / dx

    # Create root empty at prop's base center
    root = bpy.data.objects.new("PropRoot", None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (cx, cy, bz)
    bpy.context.view_layer.update()

    for o in objs:
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()

    # Transform root empty to target position, scale, and rotation
    root.scale = (scale_factor, scale_factor, scale_factor)
    root.rotation_euler.z = math.radians(rot_z_deg)
    root.location = (target_x, target_y, target_z_floor)
    bpy.context.view_layer.update()

    # Clear parent and bake transforms into vertices
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.data.objects.remove(root, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def build_reception_table(level_num, props_config, output_filename):
    reset_scene()

    # 1. Import and normalize base table
    table_path = os.path.join(SOURCE_DIR, "table.glb")
    table_objs = import_and_flatten_glb(table_path)

    min_x, max_x, min_y, max_y, min_z, max_z = get_group_bounds(table_objs)
    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    bz = min_z

    for o in table_objs:
        o.location.x -= cx
        o.location.y -= cy
        o.location.z -= bz

    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in table_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = table_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Target surface heights from table.glb geometry:
    # Desk working surface is at Z = 1.003m
    # Customer transaction ledge is at Z = 1.052m
    # +0.003m (3mm) cushion prevents z-fighting and ensures item is strictly on top
    DESK_SURFACE_Z = 1.006
    LEDGE_SURFACE_Z = 1.055

    # 2. Import and position each prop
    for p in props_config:
        p_path = os.path.join(SOURCE_DIR, p["file"])
        if not os.path.exists(p_path):
            print(f"Warning: {p_path} not found!")
            continue

        p_objs = import_and_flatten_glb(p_path)
        target_z = LEDGE_SURFACE_Z if p.get("on_ledge", False) else DESK_SURFACE_Z

        place_prop(
            p_objs,
            target_width=p["width"],
            target_x=p["x"],
            target_y=p["y"],
            target_z_floor=target_z,
            rot_z_deg=p.get("rot_z", 0)
        )

        p_min_x, p_max_x, p_min_y, p_max_y, p_min_z, p_max_z = get_group_bounds(p_objs)
        print(f"  Level {level_num} Prop '{p['file']}': bottom Z = {p_min_z:.4f}m (target = {target_z:.4f}m, top Z = {p_max_z:.4f}m)")

    # 3. Export complete model
    bpy.ops.object.select_all(action='SELECT')
    out_path = os.path.join(OUTPUT_DIR, output_filename)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True
    )
    print(f"[SUCCESS] Exported Level {level_num} to {out_path} ({os.path.getsize(out_path)} bytes)\n")

LEVELS = [
    {
        "level": 1,
        "output": "reception_lvl1.glb",
        "props": [
            # lvl 1.glb: Guest register pad / notebook
            {"file": "lvl 1.glb", "width": 0.40, "x": 0.15, "y": -0.28, "on_ledge": False, "rot_z": 0},
            # lvl 1.1.glb: Welcome nameplate / card stand facing customer
            {"file": "lvl 1.1.glb", "width": 0.18, "x": -0.20, "y": 0.25, "on_ledge": True, "rot_z": 180},
            # lvl 1.2.glb: Pen & office tools mug
            {"file": "lvl 1.2.glb", "width": 0.10, "x": 0.50, "y": -0.28, "on_ledge": False, "rot_z": 0}
        ]
    },
    {
        "level": 2,
        "output": "reception_lvl2.glb",
        "props": [
            # lvl 2.glb: Desktop filing organizer & accessories
            {"file": "lvl 2.glb", "width": 0.50, "x": -0.10, "y": -0.25, "on_ledge": False, "rot_z": 0},
            # lvl 2.1.glb: Office telephone with handset
            {"file": "lvl 2.1.glb", "width": 0.26, "x": 0.40, "y": -0.28, "on_ledge": False, "rot_z": 0}
        ]
    },
    {
        "level": 3,
        "output": "reception_lvl3.glb",
        "props": [
            # lvl 3.1.glb: Staff laptop facing receptionist
            {"file": "lvl 3.1.glb", "width": 0.38, "x": 0.20, "y": -0.28, "on_ledge": False, "rot_z": 180},
            # lvl 3.glb: Customer card terminal / scanner facing customer
            {"file": "lvl 3.glb", "width": 0.26, "x": -0.25, "y": 0.25, "on_ledge": True, "rot_z": 0},
            # lvl 3.2.glb: Stationery tray organizer
            {"file": "lvl 3.2.glb", "width": 0.26, "x": -0.25, "y": -0.25, "on_ledge": False, "rot_z": 0}
        ]
    },
    {
        "level": 4,
        "output": "reception_lvl4.glb",
        "props": [
            # lvl 4.glb: Touchscreen POS terminal & cash drawer
            {"file": "lvl 4.glb", "width": 0.46, "x": 0.10, "y": -0.25, "on_ledge": False, "rot_z": 0},
            # lvl 4.1.glb: Thermal receipt printer
            {"file": "lvl 4.1.glb", "width": 0.20, "x": 0.45, "y": -0.25, "on_ledge": False, "rot_z": 0}
        ]
    }
]

if __name__ == "__main__":
    for lvl in LEVELS:
        build_reception_table(lvl["level"], lvl["props"], lvl["output"])
