"""
Normalize, scale, and align origin for downloaded actual models (Kenney & Quaternius).
Runs via Blender 3.3 headless.
"""
import bpy
import os
import math

TARGETS = {
    # File: (target_height, target_width_optional)
    'equipment/pcs/pc_basic.glb': 0.42,
    'equipment/pcs/pc_gaming.glb': 0.46,
    'equipment/pcs/pc_premium.glb': 0.48,
    'equipment/pcs/pc_ultimate.glb': 0.55,
    'equipment/chairs/chair_basic.glb': 0.85,
    'equipment/chairs/chair_racing.glb': 0.90,
    'equipment/monitors/monitor_basic.glb': 0.42,
    'equipment/monitors/monitor_ultrawide.glb': 0.45,
    'equipment/accessories/keyboard_mouse.glb': 0.05,
    'furniture/desks/desk_single.glb': 0.72,
    'furniture/desks/desk_rgb.glb': 0.72,
    'furniture/counters/reception_counter.glb': 1.05,
    'business/arcade_machine.glb': 1.85,
    'business/vending_machine.glb': 1.95,
    'business/air_hockey.glb': 0.82,
    'business/pinball.glb': 1.70,
    'furniture/sofas/sofa_lounge.glb': 0.75,
    'furniture/sofas/bean_bag.glb': 0.50,
    'decorations/plant_indoor.glb': 0.75,
    'decorations/trash_bin.glb': 0.65,
    'decorations/neon_sign_game.glb': 0.50,
    'environment/floors/floor_tile.glb': 0.05,
    'environment/walls/wall_straight.glb': 2.60,
    'environment/walls/wall_corner.glb': 2.60,
    'characters/character_customer.glb': 1.65,
    'characters/character_employee.glb': 1.65,
}

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../public/assets/models"))

def process_file(rel_path, target_h):
    full_path = os.path.join(ROOT_DIR, rel_path)
    if not os.path.exists(full_path):
        print(f"Skipping missing: {rel_path}")
        return

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=full_path)

    # Filter out empty or unwanted default helper cubes
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not mesh_objs:
        print(f"No meshes in {rel_path}")
        return

    # Delete stray cubes from default blender scenes if any
    for o in list(mesh_objs):
        if o.name == 'Cube' and len(mesh_objs) > 1 and o.dimensions.x == 2.0 and o.dimensions.y == 2.0:
            bpy.data.objects.remove(o, do_unlink=True)
            mesh_objs.remove(o)

    # Join or calculate combined bounding box
    bpy.ops.object.select_all(action='SELECT')
    
    # Calculate current world bounding box
    min_z = 999999.0
    max_z = -999999.0
    min_x = 999999.0
    max_x = -999999.0
    min_y = 999999.0
    max_y = -999999.0

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

    # Create root empty to scale and align pivot to bottom center (0, 0, 0)
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    floor_z = min_z

    for o in bpy.context.scene.objects:
        if o.parent is None:
            # Shift so center is (0,0) and bottom is 0
            o.location.x = (o.location.x - center_x) * scale_factor
            o.location.y = (o.location.y - center_y) * scale_factor
            o.location.z = (o.location.z - floor_z) * scale_factor
            o.scale *= scale_factor

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    # Re-export GLB cleanly
    bpy.ops.export_scene.gltf(
        filepath=full_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )
    print(f"✓ Normalized and scaled: {rel_path} (factor: {scale_factor:.3f})")

def main():
    import mathutils
    globals()['mathutils'] = mathutils
    print("=== Normalizing Actual GLB Models ===")
    for rel_path, target_h in TARGETS.items():
        process_file(rel_path, target_h)
    print("=== Normalization Complete ===")

if __name__ == '__main__':
    main()

