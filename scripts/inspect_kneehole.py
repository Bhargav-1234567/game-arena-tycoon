import bpy
import mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='public/assets/models/game creation/reception table/table.glb')
obj = bpy.data.objects[0]
bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
min_z = min([p.z for p in bb])
min_x = min([p.x for p in bb]); max_x = max([p.x for p in bb])
min_y = min([p.y for p in bb]); max_y = max([p.y for p in bb])
cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2

obj.location.x -= cx
obj.location.y -= cy
obj.location.z -= min_z
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mw = obj.matrix_world
me = obj.data

# Let's count vertices in the +Y half vs -Y half
pos_y_count = sum(1 for v in me.vertices if (mw @ v.co).y > 0)
neg_y_count = sum(1 for v in me.vertices if (mw @ v.co).y < 0)
print(f"Verts in +Y half: {pos_y_count}, in -Y half: {neg_y_count}")

# Check inner faces pointing up around desk height (Z between 0.90 and 1.05)
for p in me.polygons:
    wn = (mw.to_3x3() @ p.normal).normalized()
    if wn.z > 0.9 and p.area > 0.2:
        wc = mw @ p.center
        print(f"Large surface at Z={wc.z:.3f}, Center X={wc.x:.3f}, Y={wc.y:.3f}, Area={p.area:.3f}")

