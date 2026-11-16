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

# Check vertical faces pointing in +Y vs -Y
pos_y_faces = [p for p in me.polygons if (mw.to_3x3() @ p.normal).normalized().y > 0.8]
neg_y_faces = [p for p in me.polygons if (mw.to_3x3() @ p.normal).normalized().y < -0.8]

print(f"Faces pointing +Y (front): count={len(pos_y_faces)}, total area={sum(p.area for p in pos_y_faces):.3f}")
print(f"Faces pointing -Y (back): count={len(neg_y_faces)}, total area={sum(p.area for p in neg_y_faces):.3f}")

# Where are the extreme Y coordinates of solid walls from floor (Z=0 to Z=0.8)?
low_verts = [mw @ v.co for v in me.vertices if (mw @ v.co).z < 0.8]
print(f"Low verts (<0.8m) Y range: min={min(v.y for v in low_verts):.2f}, max={max(v.y for v in low_verts):.2f}")

