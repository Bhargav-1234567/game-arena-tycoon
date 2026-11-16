"""
Gaming Zone Tycoon - Procedural 3D Asset Generator
Runs headlessly via Blender 3.3 to produce stylized low-poly GLB assets.
Adheres strictly to Gaming_Zone_Tycoon_3D_Asset_Blueprint.md specifications.
"""

import bpy
import os
import math

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../public/assets/models"))

# Blueprint Color Palette (sRGB to linear conversion approximations for Blender PBR)
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_to_rgba(hex_code, alpha=1.0):
    hex_code = hex_code.lstrip('#')
    r = int(hex_code[0:2], 16) / 255.0
    g = int(hex_code[2:4], 16) / 255.0
    b = int(hex_code[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)

PALETTE = {
    'dark_navy': hex_to_rgba('172033'),
    'slate_blue': hex_to_rgba('27364B'),
    'teal': hex_to_rgba('0D9488'),
    'purple': hex_to_rgba('8B5CF6'),
    'amber': hex_to_rgba('F59E0B'),
    'light_grey': hex_to_rgba('E2E8F0'),
    'matte_dark': hex_to_rgba('111827'),
    'charcoal': hex_to_rgba('1E293B'),
    'screen_blue': hex_to_rgba('0284C7'),
    'screen_purple': hex_to_rgba('A855F7'),
    'glass': hex_to_rgba('38BDF8', alpha=0.35),
    'skin_light': hex_to_rgba('FCD34D'),
    'wood': hex_to_rgba('78350F'),
    'plant_green': hex_to_rgba('10B981'),
    'plant_dark': hex_to_rgba('047857'),
}

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_material(name, base_color, metallic=0.1, roughness=0.5, emission=None, emission_strength=1.0, is_glass=False):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    
    if is_glass:
        # Blender 3.3 Principled BSDF Transmission
        if 'Transmission' in bsdf.inputs:
            bsdf.inputs['Transmission'].default_value = 0.85
        mat.blend_method = 'BLEND'
    
    if emission:
        if 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = emission
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
            
    return mat

def export_glb(relative_path):
    full_path = os.path.join(OUTPUT_DIR, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    bpy.ops.export_scene.gltf(
        filepath=full_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )
    print(f"Exported: {full_path}")

# ==============================================================================
# Model Generators
# ==============================================================================

def build_desk_single():
    reset_scene()
    m_wood = create_material('DeskSurface', PALETTE['dark_navy'], roughness=0.3)
    m_metal = create_material('DeskLegs', PALETTE['slate_blue'], metallic=0.7, roughness=0.4)
    m_accent = create_material('DeskAccent', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=2.0)
    
    # Top Surface (1.2m wide, 0.75m deep, 0.05m thick, top at Z=0.75m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.725))
    top = bpy.context.active_object
    top.scale = (1.2, 0.75, 0.05)
    top.data.materials.append(m_wood)
    
    # LED strip along back edge
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.365, 0.73))
    led = bpy.context.active_object
    led.scale = (1.18, 0.02, 0.02)
    led.data.materials.append(m_accent)
    
    # 4 Steel Legs
    for x in [-0.55, 0.55]:
        for y in [-0.32, 0.32]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, 0.35))
            leg = bpy.context.active_object
            leg.scale = (0.05, 0.05, 0.70)
            leg.data.materials.append(m_metal)
            
    export_glb("furniture/desks/desk_single.glb")

def build_desk_rgb():
    reset_scene()
    m_carbon = create_material('CarbonSurface', PALETTE['matte_dark'], roughness=0.2)
    m_metal = create_material('SteelFrame', PALETTE['charcoal'], metallic=0.8, roughness=0.3)
    m_neon = create_material('DeskRGB', PALETTE['purple'], emission=PALETTE['purple'], emission_strength=3.5)
    
    # Wide Top Surface (1.4m wide, 0.8m deep)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.73))
    top = bpy.context.active_object
    top.scale = (1.4, 0.8, 0.06)
    top.data.materials.append(m_carbon)
    
    # RGB Bevel Edges
    for side in [-0.69, 0.69]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side, 0, 0.73))
        trim = bpy.context.active_object
        trim.scale = (0.02, 0.78, 0.05)
        trim.data.materials.append(m_neon)
        
    # K-Style Racing Frame Legs
    for x in [-0.62, 0.62]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.35))
        leg = bpy.context.active_object
        leg.scale = (0.08, 0.6, 0.70)
        leg.data.materials.append(m_metal)
        
    export_glb("furniture/desks/desk_rgb.glb")

def build_chair_basic():
    reset_scene()
    m_base = create_material('ChairBase', PALETTE['charcoal'], metallic=0.5, roughness=0.6)
    m_fabric = create_material('ChairFabric', PALETTE['slate_blue'], roughness=0.8)
    
    # Seat (0.45m high, 0.45m x 0.45m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.45))
    seat = bpy.context.active_object
    seat.scale = (0.45, 0.45, 0.08)
    seat.data.materials.append(m_fabric)
    
    # Backrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.2, 0.72))
    back = bpy.context.active_object
    back.scale = (0.42, 0.06, 0.5)
    back.data.materials.append(m_fabric)
    
    # Center Spindle & 5-wheel Star Base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.4, location=(0, 0, 0.2))
    pole = bpy.context.active_object
    pole.data.materials.append(m_base)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=0.04, location=(0, 0, 0.04))
    base = bpy.context.active_object
    base.data.materials.append(m_base)
    
    export_glb("equipment/chairs/chair_basic.glb")

def build_chair_racing():
    reset_scene()
    m_leather = create_material('RacingLeather', PALETTE['matte_dark'], roughness=0.3)
    m_accent = create_material('ChairAccent', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=2.0)
    m_frame = create_material('ChairFrame', PALETTE['charcoal'], metallic=0.7, roughness=0.3)
    
    # High-bolster Seat
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.46))
    seat = bpy.context.active_object
    seat.scale = (0.50, 0.50, 0.10)
    seat.data.materials.append(m_leather)
    
    # Racing Side Bolsters
    for x in [-0.23, 0.23]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.50))
        b = bpy.context.active_object
        b.scale = (0.06, 0.48, 0.12)
        b.data.materials.append(m_accent)
        
    # Tall Racing Backrest with Headrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.22, 0.85))
    back = bpy.context.active_object
    back.scale = (0.46, 0.08, 0.75)
    back.data.materials.append(m_leather)
    
    # Harness Cutout Emissive Inserts
    for x in [-0.12, 0.12]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.22, 1.1))
        cutout = bpy.context.active_object
        cutout.scale = (0.06, 0.09, 0.06)
        cutout.data.materials.append(m_accent)
        
    # Armrests
    for x in [-0.28, 0.28]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.65))
        arm = bpy.context.active_object
        arm.scale = (0.06, 0.25, 0.04)
        arm.data.materials.append(m_frame)
        
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.55))
        pillar = bpy.context.active_object
        pillar.scale = (0.03, 0.04, 0.20)
        pillar.data.materials.append(m_frame)
        
    # Spindle & Base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.4, location=(0, 0, 0.2))
    pole = bpy.context.active_object
    pole.data.materials.append(m_frame)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=0.05, location=(0, 0, 0.04))
    base = bpy.context.active_object
    base.data.materials.append(m_frame)
    
    export_glb("equipment/chairs/chair_racing.glb")

# PC Upgrades (Tiers 1 to 4)
def build_pc_basic():
    reset_scene()
    m_metal = create_material('PCBasicCase', PALETTE['dark_navy'], roughness=0.6)
    m_front = create_material('PCFrontPanel', PALETTE['charcoal'], roughness=0.4)
    m_led = create_material('PowerLED', PALETTE['amber'], emission=PALETTE['amber'], emission_strength=2.0)
    
    # Compact Micro Tower (0.18m x 0.40m x 0.38m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.19))
    body = bpy.context.active_object
    body.scale = (0.18, 0.40, 0.38)
    body.data.materials.append(m_metal)
    
    # Front grill
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.201, 0.19))
    front = bpy.context.active_object
    front.scale = (0.17, 0.01, 0.36)
    front.data.materials.append(m_front)
    
    # Power Button LED
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.04, -0.202, 0.34))
    led = bpy.context.active_object
    led.scale = (0.02, 0.01, 0.02)
    led.data.materials.append(m_led)
    
    export_glb("equipment/pcs/pc_basic.glb")

def build_pc_gaming():
    reset_scene()
    m_case = create_material('MidTowerCase', PALETTE['charcoal'], roughness=0.3)
    m_glass = create_material('GlassPanel', PALETTE['glass'], roughness=0.1, is_glass=True)
    m_rgb = create_material('FanRGB', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=4.0)
    m_gpu = create_material('GPUMetal', PALETTE['light_grey'], metallic=0.8, roughness=0.3)
    
    # Main Tower Chassis
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.22))
    body = bpy.context.active_object
    body.scale = (0.22, 0.45, 0.44)
    body.data.materials.append(m_case)
    
    # Tempered Glass Side Window
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.111, 0, 0.22))
    glass = bpy.context.active_object
    glass.scale = (0.01, 0.43, 0.42)
    glass.data.materials.append(m_glass)
    
    # Visible GPU Inside
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.04, 0.02, 0.18))
    gpu = bpy.context.active_object
    gpu.scale = (0.07, 0.24, 0.05)
    gpu.data.materials.append(m_gpu)
    
    # 2 Front RGB Ring Fans
    for z in [0.15, 0.28]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.015, location=(0, -0.226, z))
        fan = bpy.context.active_object
        fan.rotation_euler = (math.pi / 2, 0, 0)
        fan.data.materials.append(m_rgb)
        
    export_glb("equipment/pcs/pc_gaming.glb")

def build_pc_premium():
    reset_scene()
    m_case = create_material('DualChamberCase', PALETTE['matte_dark'], metallic=0.2, roughness=0.2)
    m_glass = create_material('ClearGlass', PALETTE['glass'], roughness=0.05, is_glass=True)
    m_rgb_cyan = create_material('CoolantRGB', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=4.0)
    m_rgb_purple = create_material('RAM_RGB', PALETTE['purple'], emission=PALETTE['purple'], emission_strength=4.0)
    m_rad = create_material('Radiator', PALETTE['light_grey'], metallic=0.7, roughness=0.3)
    
    # Wide Dual Chamber Chassis
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.24))
    body = bpy.context.active_object
    body.scale = (0.28, 0.48, 0.48)
    body.data.materials.append(m_case)
    
    # Wrap-around Front & Side Glass
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.141, -0.02, 0.24))
    glass_side = bpy.context.active_object
    glass_side.scale = (0.01, 0.44, 0.46)
    glass_side.data.materials.append(m_glass)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.04, -0.241, 0.24))
    glass_front = bpy.context.active_object
    glass_front.scale = (0.20, 0.01, 0.46)
    glass_front.data.materials.append(m_glass)
    
    # Liquid Cooling Reservoir Tube
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.25, location=(0.08, -0.12, 0.25))
    res = bpy.context.active_object
    res.data.materials.append(m_rgb_cyan)
    
    # 3 Glowing Top Radiator Fans
    for y in [-0.12, 0.0, 0.12]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.02, location=(0.04, y, 0.48))
        rfan = bpy.context.active_object
        rfan.data.materials.append(m_rgb_purple)
        
    export_glb("equipment/pcs/pc_premium.glb")

def build_pc_ultimate():
    reset_scene()
    m_super = create_material('CyberChassis', PALETTE['dark_navy'], metallic=0.8, roughness=0.1)
    m_gold = create_material('GoldAccent', PALETTE['amber'], metallic=0.9, roughness=0.2)
    m_dual_rgb = create_material('UltimateRGB', PALETTE['purple'], emission=PALETTE['purple'], emission_strength=5.0)
    m_cyan_rgb = create_material('CoreRGB', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=5.0)
    
    # Open-Air Futuristic Angled Frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.26))
    core = bpy.context.active_object
    core.scale = (0.30, 0.52, 0.52)
    core.data.materials.append(m_super)
    
    # Outer Exo-Skeleton Wings
    for x in [-0.17, 0.17]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.28))
        wing = bpy.context.active_object
        wing.scale = (0.04, 0.56, 0.48)
        wing.data.materials.append(m_gold)
        
    # Dual Illuminated Liquid Distribution Plates
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.265, 0.26))
    distro = bpy.context.active_object
    distro.scale = (0.24, 0.015, 0.44)
    distro.data.materials.append(m_dual_rgb)
    
    # Quad Custom High-Velocity Fans
    for z in [0.15, 0.35]:
        for x in [-0.07, 0.07]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.02, location=(x, 0.265, z))
            bfan = bpy.context.active_object
            bfan.rotation_euler = (math.pi / 2, 0, 0)
            bfan.data.materials.append(m_cyan_rgb)
            
    export_glb("equipment/pcs/pc_ultimate.glb")

# Monitors
def build_monitor_basic():
    reset_scene()
    m_bezel = create_material('Bezel', PALETTE['charcoal'], roughness=0.5)
    m_screen = create_material('ScreenGlow', PALETTE['screen_blue'], emission=PALETTE['screen_blue'], emission_strength=2.0)
    m_stand = create_material('Stand', PALETTE['slate_blue'], metallic=0.6, roughness=0.4)
    
    # Screen Panel (0.60m wide, 0.36m high, center at Z=0.30 above desk)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.32))
    panel = bpy.context.active_object
    panel.scale = (0.60, 0.03, 0.36)
    panel.data.materials.append(m_bezel)
    
    # Glowing Active Display Face
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.016, 0.32))
    display = bpy.context.active_object
    display.scale = (0.57, 0.005, 0.33)
    display.data.materials.append(m_screen)
    
    # Stand Arm and Foot
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.04, 0.16))
    arm = bpy.context.active_object
    arm.scale = (0.06, 0.04, 0.28)
    arm.data.materials.append(m_stand)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.01, 0.01))
    foot = bpy.context.active_object
    foot.scale = (0.24, 0.18, 0.02)
    foot.data.materials.append(m_stand)
    
    export_glb("equipment/monitors/monitor_basic.glb")

def build_monitor_ultrawide():
    reset_scene()
    m_bezel = create_material('UWBezel', PALETTE['matte_dark'], roughness=0.2)
    m_screen = create_material('UWScreen', PALETTE['screen_purple'], emission=PALETTE['screen_purple'], emission_strength=2.8)
    m_rgb = create_material('BacklightRGB', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=3.0)
    m_stand = create_material('AluStand', PALETTE['light_grey'], metallic=0.8, roughness=0.2)
    
    # Curved / Wide Screen (0.95m wide)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.34))
    panel = bpy.context.active_object
    panel.scale = (0.95, 0.04, 0.40)
    panel.data.materials.append(m_bezel)
    
    # Screen face
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.021, 0.34))
    display = bpy.context.active_object
    display.scale = (0.92, 0.005, 0.37)
    display.data.materials.append(m_screen)
    
    # Ambient Rear Light Ring
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=0.015, location=(0, 0.025, 0.34))
    ring = bpy.context.active_object
    ring.rotation_euler = (math.pi / 2, 0, 0)
    ring.data.materials.append(m_rgb)
    
    # V-Shape Gaming Base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.06, 0.18))
    arm = bpy.context.active_object
    arm.scale = (0.08, 0.06, 0.32)
    arm.data.materials.append(m_stand)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.02, 0.01))
    foot = bpy.context.active_object
    foot.scale = (0.42, 0.22, 0.02)
    foot.data.materials.append(m_stand)
    
    export_glb("equipment/monitors/monitor_ultrawide.glb")

# Peripherals
def build_keyboard_mouse():
    reset_scene()
    m_pad = create_material('MousepadMat', PALETTE['matte_dark'], roughness=0.9)
    m_rgb = create_material('PadRGB', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=2.5)
    m_kb = create_material('KeyboardCase', PALETTE['charcoal'], roughness=0.4)
    m_keys = create_material('Keycaps', PALETTE['light_grey'], emission=PALETTE['purple'], emission_strength=1.5)
    m_mouse = create_material('GamingMouse', PALETTE['charcoal'], roughness=0.3)
    
    # Extended Desk Pad (0.80m x 0.32m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.003))
    pad = bpy.context.active_object
    pad.scale = (0.80, 0.32, 0.006)
    pad.data.materials.append(m_pad)
    
    # RGB Border
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.004))
    border = bpy.context.active_object
    border.scale = (0.81, 0.33, 0.004)
    border.data.materials.append(m_rgb)
    
    # Mechanical Keyboard
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.14, 0, 0.015))
    kb = bpy.context.active_object
    kb.scale = (0.40, 0.14, 0.018)
    kb.data.materials.append(m_kb)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.14, 0, 0.026))
    keys = bpy.context.active_object
    keys.scale = (0.38, 0.12, 0.008)
    keys.data.materials.append(m_keys)
    
    # Ergonomic Gaming Mouse
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.20, 0, 0.018))
    mouse = bpy.context.active_object
    mouse.scale = (0.07, 0.12, 0.024)
    mouse.data.materials.append(m_mouse)
    
    export_glb("equipment/accessories/keyboard_mouse.glb")

# Infrastructure & Decor
def build_reception_counter():
    reset_scene()
    m_counter = create_material('CounterWood', PALETTE['dark_navy'], roughness=0.4)
    m_top = create_material('CounterTop', PALETTE['light_grey'], roughness=0.2)
    m_neon = create_material('FrontStrip', PALETTE['amber'], emission=PALETTE['amber'], emission_strength=3.0)
    m_pos = create_material('POSScreen', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=2.0)
    
    # Front counter main desk (1.8m wide, 0.8m deep, 1.05m high)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.50))
    body = bpy.context.active_object
    body.scale = (1.8, 0.8, 1.0)
    body.data.materials.append(m_counter)
    
    # White Marble/Quartz Cap
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.02))
    top = bpy.context.active_object
    top.scale = (1.85, 0.85, 0.04)
    top.data.materials.append(m_top)
    
    # Warm Amber Front Accent Bar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.405, 0.70))
    strip = bpy.context.active_object
    strip.scale = (1.6, 0.02, 0.04)
    strip.data.materials.append(m_neon)
    
    # POS Register Terminal
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.3, -0.05, 1.18))
    pos = bpy.context.active_object
    pos.scale = (0.32, 0.24, 0.22)
    pos.data.materials.append(m_pos)
    
    export_glb("furniture/counters/reception_counter.glb")

def build_vending_machine():
    reset_scene()
    m_body = create_material('VendingChassis', PALETTE['slate_blue'], metallic=0.3, roughness=0.4)
    m_glass = create_material('VendingGlass', PALETTE['glass'], roughness=0.1, is_glass=True)
    m_lit = create_material('VendingInterior', PALETTE['light_grey'], emission=PALETTE['light_grey'], emission_strength=1.8)
    m_sign = create_material('CanCanGlow', PALETTE['amber'], emission=PALETTE['amber'], emission_strength=3.0)
    
    # Cabinet (0.9m wide, 0.8m deep, 1.9m tall)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.95))
    body = bpy.context.active_object
    body.scale = (0.9, 0.8, 1.9)
    body.data.materials.append(m_body)
    
    # Illuminated Front Display Window
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.38, 1.1))
    glass = bpy.context.active_object
    glass.scale = (0.74, 0.05, 1.0)
    glass.data.materials.append(m_glass)
    
    # Top Header Logo
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.39, 1.75))
    sign = bpy.context.active_object
    sign.scale = (0.76, 0.04, 0.16)
    sign.data.materials.append(m_sign)
    
    # Dispenser Tray
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.39, 0.35))
    tray = bpy.context.active_object
    tray.scale = (0.6, 0.05, 0.22)
    tray.data.materials.append(m_body)
    
    export_glb("business/vending_machine.glb")

def build_plant_indoor():
    reset_scene()
    m_pot = create_material('PotCeramic', PALETTE['light_grey'], roughness=0.2)
    m_leaf = create_material('LeafGreen', PALETTE['plant_green'], roughness=0.6)
    m_stem = create_material('StemGreen', PALETTE['plant_dark'], roughness=0.5)
    
    # Geometric Hex/Cylinder Planter Pot
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.45, vertices=8, location=(0, 0, 0.225))
    pot = bpy.context.active_object
    pot.data.materials.append(m_pot)
    
    # Plant Leaves Fan Out
    for angle in [0, 60, 120, 180, 240, 300]:
        rad = math.radians(angle)
        lx = math.cos(rad) * 0.18
        ly = math.sin(rad) * 0.18
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(lx, ly, 0.60))
        leaf = bpy.context.active_object
        leaf.scale = (0.12, 0.26, 0.02)
        leaf.rotation_euler = (math.radians(25), math.radians(15), rad)
        leaf.data.materials.append(m_leaf)
        
    export_glb("decorations/plant_indoor.glb")

def build_neon_sign():
    reset_scene()
    m_backing = create_material('NeonBacking', PALETTE['matte_dark'], roughness=0.7)
    m_neon_t = create_material('NeonTeal', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=5.0)
    m_neon_p = create_material('NeonPurple', PALETTE['purple'], emission=PALETTE['purple'], emission_strength=5.0)
    
    # Mounting Board (1.2m wide, 0.04m deep, 0.45m high)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.225))
    board = bpy.context.active_object
    board.scale = (1.2, 0.04, 0.45)
    board.data.materials.append(m_backing)
    
    # Neon Tube Bars ("G A M I N G" styling)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.025, 0.26))
    bar1 = bpy.context.active_object
    bar1.scale = (0.9, 0.02, 0.06)
    bar1.data.materials.append(m_neon_t)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.025, 0.14))
    bar2 = bpy.context.active_object
    bar2.scale = (0.6, 0.02, 0.04)
    bar2.data.materials.append(m_neon_p)
    
    export_glb("decorations/neon_sign_game.glb")

def build_floor_tile():
    reset_scene()
    m_floor = create_material('FloorTile', PALETTE['dark_navy'], roughness=0.3)
    m_grid = create_material('TileBorder', PALETTE['slate_blue'], roughness=0.5)
    
    # 1.0m x 1.0m tile, 0.05m deep
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.025))
    tile = bpy.context.active_object
    tile.scale = (0.98, 0.98, 0.05)
    tile.data.materials.append(m_floor)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.028))
    base = bpy.context.active_object
    base.scale = (1.0, 1.0, 0.04)
    base.data.materials.append(m_grid)
    
    export_glb("environment/floors/floor_tile.glb")

def build_wall_modules():
    # Straight Wall (1.0m wide, 0.15m thick, 2.6m tall)
    reset_scene()
    m_wall = create_material('WallPanel', PALETTE['slate_blue'], roughness=0.6)
    m_trim = create_material('WallTrim', PALETTE['dark_navy'], roughness=0.4)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.3))
    wall = bpy.context.active_object
    wall.scale = (1.0, 0.15, 2.6)
    wall.data.materials.append(m_wall)
    
    # Baseboard
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.08, 0.06))
    trim = bpy.context.active_object
    trim.scale = (1.0, 0.02, 0.12)
    trim.data.materials.append(m_trim)
    
    export_glb("environment/walls/wall_straight.glb")

def build_arcade_machine():
    reset_scene()
    m_body = create_material('ArcadeCabinet', PALETTE['dark_navy'], roughness=0.3)
    m_screen = create_material('ArcadeScreen', PALETTE['screen_purple'], emission=PALETTE['screen_purple'], emission_strength=3.5)
    m_marquee = create_material('ArcadeMarquee', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=4.0)
    m_controls = create_material('ControlPanel', PALETTE['charcoal'], roughness=0.4)
    m_btn = create_material('ArcadeBtn', PALETTE['amber'], emission=PALETTE['amber'], emission_strength=2.5)
    
    # Main Cabinet Body (0.8m wide, 0.9m deep, 1.85m tall)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.925))
    body = bpy.context.active_object
    body.scale = (0.8, 0.9, 1.85)
    body.data.materials.append(m_body)
    
    # Glowing Top Marquee Header
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.42, 1.72))
    marquee = bpy.context.active_object
    marquee.scale = (0.76, 0.08, 0.22)
    marquee.data.materials.append(m_marquee)
    
    # Angled CRT Screen Face
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.35, 1.35))
    screen = bpy.context.active_object
    screen.scale = (0.68, 0.04, 0.45)
    screen.rotation_euler = (math.radians(-15), 0, 0)
    screen.data.materials.append(m_screen)
    
    # Control Panel Desk
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.46, 0.95))
    ctrl = bpy.context.active_object
    ctrl.scale = (0.76, 0.24, 0.06)
    ctrl.data.materials.append(m_controls)
    
    # Joystick and Buttons
    bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=0.1, location=(-0.18, -0.46, 1.02))
    stick = bpy.context.active_object
    stick.data.materials.append(m_btn)
    
    for bx in [0.08, 0.20]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.03, location=(bx, -0.46, 0.99))
        btn = bpy.context.active_object
        btn.data.materials.append(m_btn)
        
    export_glb("business/arcade_machine.glb")

def build_trophy_cabinet():
    reset_scene()
    m_wood = create_material('CabinetBase', PALETTE['dark_navy'], roughness=0.3)
    m_glass = create_material('CabinetGlass', PALETTE['glass'], roughness=0.05, is_glass=True)
    m_gold = create_material('TrophyGold', PALETTE['amber'], metallic=0.9, roughness=0.15)
    m_glow = create_material('PedestalGlow', PALETTE['teal'], emission=PALETTE['teal'], emission_strength=3.0)
    
    # Base and Top Plinth (1.2m wide, 0.5m deep, 2.0m tall)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.15))
    base = bpy.context.active_object
    base.scale = (1.2, 0.5, 0.3)
    base.data.materials.append(m_wood)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.95))
    top = bpy.context.active_object
    top.scale = (1.2, 0.5, 0.1)
    top.data.materials.append(m_wood)
    
    # Glass Enclosure
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.15))
    glass = bpy.context.active_object
    glass.scale = (1.16, 0.46, 1.5)
    glass.data.materials.append(m_glass)
    
    # Glass Shelf with LED Rim
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.05))
    shelf = bpy.context.active_object
    shelf.scale = (1.14, 0.44, 0.02)
    shelf.data.materials.append(m_glow)
    
    # Gold Esports Championship Cup Trophy
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.22, location=(0, 0, 1.25))
    cup = bpy.context.active_object
    cup.data.materials.append(m_gold)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.14, depth=0.06, location=(0, 0, 1.38))
    rim = bpy.context.active_object
    rim.data.materials.append(m_gold)
    
    export_glb("business/trophy_cabinet.glb")

def build_sofa_lounge():
    reset_scene()
    m_cushion = create_material('SofaFabric', PALETTE['slate_blue'], roughness=0.8)
    m_base = create_material('SofaBase', PALETTE['dark_navy'], roughness=0.4)
    m_accent = create_material('SofaAccent', PALETTE['purple'], emission=PALETTE['purple'], emission_strength=1.5)
    
    # 2-Seat Lounge Sofa (1.5m wide, 0.8m deep, 0.75m tall)
    # Seat
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.25))
    seat = bpy.context.active_object
    seat.scale = (1.5, 0.8, 0.25)
    seat.data.materials.append(m_cushion)
    
    # Backrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.3, 0.55))
    back = bpy.context.active_object
    back.scale = (1.5, 0.22, 0.45)
    back.data.materials.append(m_cushion)
    
    # Armrests
    for x in [-0.7, 0.7]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.42))
        arm = bpy.context.active_object
        arm.scale = (0.16, 0.8, 0.35)
        arm.data.materials.append(m_base)
        
    export_glb("furniture/sofas/sofa_lounge.glb")

def build_bean_bag():
    reset_scene()
    m_bag = create_material('BeanBagMat', PALETTE['purple'], roughness=0.85)
    
    # Cozy round bean bag (0.7m diameter, 0.45m high)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=0.40, vertices=10, location=(0, 0, 0.20))
    bag = bpy.context.active_object
    bag.data.materials.append(m_bag)
    
    export_glb("furniture/sofas/bean_bag.glb")

def build_trash_bin():
    reset_scene()
    m_metal = create_material('BinMetal', PALETTE['light_grey'], metallic=0.7, roughness=0.3)
    m_top = create_material('BinTop', PALETTE['charcoal'], roughness=0.4)
    
    # Compact office trash bin
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=0.45, vertices=12, location=(0, 0, 0.225))
    body = bpy.context.active_object
    body.data.materials.append(m_metal)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.19, depth=0.04, vertices=12, location=(0, 0, 0.45))
    cap = bpy.context.active_object
    cap.data.materials.append(m_top)
    
    export_glb("decorations/trash_bin.glb")

def build_customer():
    reset_scene()
    m_skin = create_material('Skin', PALETTE['skin_light'], roughness=0.8)
    m_shirt = create_material('CustomerShirt', PALETTE['teal'], roughness=0.7)
    m_pants = create_material('CustomerJeans', PALETTE['slate_blue'], roughness=0.8)
    m_hair = create_material('Hair', PALETTE['matte_dark'], roughness=0.9)
    
    # Head
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.55))
    head = bpy.context.active_object
    head.scale = (0.22, 0.22, 0.24)
    head.data.materials.append(m_skin)
    
    # Hair
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.02, 1.68))
    hair = bpy.context.active_object
    hair.scale = (0.24, 0.24, 0.10)
    hair.data.materials.append(m_hair)
    
    # Torso
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.15))
    torso = bpy.context.active_object
    torso.scale = (0.36, 0.22, 0.50)
    torso.data.materials.append(m_shirt)
    
    # Legs
    for x in [-0.10, 0.10]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.45))
        leg = bpy.context.active_object
        leg.scale = (0.13, 0.16, 0.85)
        leg.data.materials.append(m_pants)
        
    export_glb("characters/character_customer.glb")
    
def build_employee():
    reset_scene()
    m_skin = create_material('EmpSkin', PALETTE['skin_light'], roughness=0.8)
    m_emp_shirt = create_material('EmpUniform', PALETTE['purple'], roughness=0.6)
    m_emp_badge = create_material('EmpBadge', PALETTE['amber'], emission=PALETTE['amber'], emission_strength=2.0)
    m_pants = create_material('EmpPants', PALETTE['matte_dark'], roughness=0.8)
    
    # Head
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.55))
    head = bpy.context.active_object
    head.scale = (0.22, 0.22, 0.24)
    head.data.materials.append(m_skin)
    
    # Torso (Purple Uniform)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.15))
    torso = bpy.context.active_object
    torso.scale = (0.36, 0.22, 0.50)
    torso.data.materials.append(m_emp_shirt)
    
    # Staff ID Badge
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.08, -0.115, 1.25))
    badge = bpy.context.active_object
    badge.scale = (0.06, 0.01, 0.08)
    badge.data.materials.append(m_emp_badge)
    
    # Legs
    for x in [-0.10, 0.10]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.45))
        leg = bpy.context.active_object
        leg.scale = (0.13, 0.16, 0.85)
        leg.data.materials.append(m_pants)
        
    export_glb("characters/character_employee.glb")

def main():
    print("=== Starting Gaming Zone Tycoon 3D Asset Batch Generation ===")
    build_desk_single()
    build_desk_rgb()
    build_chair_basic()
    build_chair_racing()
    build_pc_basic()
    build_pc_gaming()
    build_pc_premium()
    build_pc_ultimate()
    build_monitor_basic()
    build_monitor_ultrawide()
    build_keyboard_mouse()
    build_reception_counter()
    build_vending_machine()
    build_arcade_machine()
    build_trophy_cabinet()
    build_sofa_lounge()
    build_bean_bag()
    build_trash_bin()
    build_plant_indoor()
    build_neon_sign()
    build_floor_tile()
    build_wall_modules()
    build_customer()
    build_employee()
    print("=== All Assets Generated Successfully! ===")

if __name__ == '__main__':
    main()
