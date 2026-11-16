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

# Group large flat horizontal faces (area > 0.5)
surfaces = []
for p in me.polygons:
    wn = (mw.to_3x3() @ p.normal).normalized()
    if wn.z > 0.9 and p.area > 0.5:
        face_verts = [mw @ me.vertices[vi].co for vi in p.vertices]
        xs = [v.x for v in face_verts]
        ys = [v.y for v in face_verts]
        zs = [v.z for v in face_verts]
        surfaces.append({
            'avg_z': sum(zs)/len(zs),
            'min_z': min(zs),
            'max_z': max(zs),
            'min_x': min(xs),
            'max_x': max(xs),
            'min_y': min(ys),
            'max_y': max(ys),
            'area': p.area
        })

print("FOUND LARGE TABLETOP SURFACES:")
for i, s in enumerate(sorted(surfaces, key=lambda s: s['avg_z'], reverse=True)):
    print(f"Surface #{i+1}: Z = {s['avg_z']:.3f}m | X: [{s['min_x']:.2f}, {s['max_x']:.2f}] (w={s['max_x']-s['min_x']:.2f}) | Y: [{s['min_y']:.2f}, {s['max_y']:.2f}] (d={s['max_y']-s['min_y']:.2f})")

