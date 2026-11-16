import bpy
import mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='public/assets/models/game creation/reception table/table.glb')
obj = bpy.data.objects[0]
bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
min_z = min([p.z for p in bb])
min_x = min([p.x for p in bb])
max_x = max([p.x for p in bb])
min_y = min([p.y for p in bb])
max_y = max([p.y for p in bb])
cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2

obj.location.x -= cx
obj.location.y -= cy
obj.location.z -= min_z
bpy.context.view_layer.update()

# Apply transform so coordinates are baked
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mw = obj.matrix_world
me = obj.data
verts_z = [(mw @ v.co).z for v in me.vertices]
print('Normalized Table Height:', max(verts_z))
print('Min Z:', min(verts_z))

planes = {}
for p in me.polygons:
    wn = (mw.to_3x3() @ p.normal).normalized()
    if wn.z > 0.95:
        w_center = mw @ p.center
        z_key = round(w_center.z, 2)
        if z_key not in planes:
            planes[z_key] = {'area': 0, 'xs': [], 'ys': []}
        planes[z_key]['area'] += p.area
        planes[z_key]['xs'].append(w_center.x)
        planes[z_key]['ys'].append(w_center.y)

for z in sorted(planes.keys(), reverse=True):
    pl = planes[z]
    if pl['area'] > 0.005:
        print(f"Plane at Z={z:.2f}m | Area={pl['area']:.4f}m^2 | X=[{min(pl['xs']):.2f}, {max(pl['xs']):.2f}] | Y=[{min(pl['ys']):.2f}, {max(pl['ys']):.2f}]")

