"""Builds the WIND SHIELD PRO bottle in Blender and exports a GLB.

Run headless:
    blender --background --factory-startup --python build_wind_shield_pro.py -- <out_dir>

Writes <out_dir>/wind-shield-pro.glb, .blend and preview.png.

Coordinates: Blender Z-up, label faces -Y (the glTF exporter turns this into
three.js Y-up with the label facing +Z). The bottle spans world height
-0.6 .. 1.4, the same envelope as the old placeholder, so the hero scene's
framing, hit zone and shadows keep working.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector

OUT_DIR = sys.argv[sys.argv.index("--") + 1]
Y_OFFSET = -0.6          # base of the bottle sits here in world space
R_BODY = 0.268           # straight body radius
SEG = 128
FONT_DIR = "C:/Windows/Fonts"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------------------------------------------------------------- helpers
def lathe(name, profile, segments=SEG):
    """Revolve (r, h) profile points around Z into a closed surface."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        rings.append([bm.verts.new((r * math.sin(a), -r * math.cos(a), h + Y_OFFSET))
                      for r, h in profile])
    for i in range(segments):
        a_ring, b_ring = rings[i], rings[(i + 1) % segments]
        for j in range(len(profile) - 1):
            quad = [a_ring[j], b_ring[j], b_ring[j + 1], a_ring[j + 1]]
            uniq = []
            for v in quad:
                if all((v.co - u.co).length > 1e-7 for u in uniq):
                    uniq.append(v)
            if len(uniq) >= 3:
                bm.faces.new(uniq)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def select_only(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)


def smooth(ob, angle=40):
    select_only(ob)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def srgb(hexstr):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(hexstr[i:i + 2], 16)) for i in (1, 3, 5))


def material(name, color, rough, metal=0.0, coat=0.0, coat_rough=0.05,
             transmission=0.0, ior=1.45, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    settings = {
        "Base Color": (*srgb(color), 1.0),
        "Roughness": rough,
        "Metallic": metal,
        "Coat Weight": coat,
        "Coat Roughness": coat_rough,
        "Transmission Weight": transmission,
        "IOR": ior,
        "Emission Strength": emission_strength,
    }
    if emission:
        settings["Emission Color"] = (*srgb(emission), 1.0)
    for key, val in settings.items():
        if key in p.inputs:
            p.inputs[key].default_value = val
    return m


def bezier(p0, p1, p2, p3, n):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        pts.append(tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d
                         for a, b, c, d in zip(p0, p1, p2, p3)))
    return pts


def arc_pts(cx, cy, rad, a0, a1, n):
    return [(cx + rad * math.cos(a0 + (a1 - a0) * i / n),
             cy + rad * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ---------------------------------------------------------------- materials
m_liquid = material("OrangeLiquid", "#e8620a", 0.06, coat=1.0, coat_rough=0.03,
                    transmission=0.45, ior=1.45, emission="#b84400", emission_strength=0.2)
m_clear = material("ClearPET", "#ffffff", 0.04, coat=1.0, coat_rough=0.02,
                   transmission=1.0, ior=1.5)
m_cap = material("OrangeCap", "#ee6e20", 0.62)
m_label = material("LabelBlack", "#0b0b0c", 0.4, coat=0.2, coat_rough=0.15)
m_orange_ink = material("InkOrange", "#e8773a", 0.4)
m_white_ink = material("InkWhite", "#f2f2f2", 0.4)
m_grey_ink = material("InkGrey", "#6a6a6a", 0.45)
m_black_ink = material("InkBlack", "#111214", 0.4)
m_icon = material("IconFill", "#d6d6d6", 0.45)

# ---------------------------------------------------------------- bottle (liquid-filled body)
prof = [(0.0, 0.012), (0.20, 0.0), (0.233, 0.0)]
prof += arc_pts(0.233, 0.035, 0.035, -math.pi / 2, 0, 8)[1:]      # rounded heel
prof += [(R_BODY, 0.035 + (0.78 - 0.035) * i / 12) for i in range(1, 13)]  # straight wall
prof += bezier((R_BODY, 0.78), (R_BODY, 0.93), (0.112, 0.89), (0.112, 1.06), 20)  # S-shoulder
prof += [(0.112 - 0.008 * i / 10, 1.06 + 0.54 * i / 10) for i in range(1, 11)]   # long neck
prof += [(0.1046, 1.60), (0.0, 1.595)]  # liquid surface, slight meniscus
body = lathe("Bottle_Body", prof)
body.data.materials.append(m_liquid)
smooth(body)

# ---------------------------------------------------------------- clear neck (air gap) + threaded finish
finish = lathe("Bottle_Finish", [
    (0.0, 1.603), (0.106, 1.603), (0.105, 1.668), (0.116, 1.668), (0.116, 1.690), (0.126, 1.695), (0.126, 1.705),
    (0.116, 1.710), (0.126, 1.717), (0.126, 1.727), (0.116, 1.732), (0.132, 1.738),
    (0.132, 1.758), (0.0, 1.758),
])
finish.data.materials.append(m_clear)
smooth(finish, angle=50)

# ---------------------------------------------------------------- ridged orange cap
CAP_SEG = 192
cap_prof = [(0.0, 1.755), (0.152, 1.755)]
cap_prof += arc_pts(0.152, 1.761, 0.006, -math.pi / 2, 0, 3)[1:]
cap_prof += [(0.158, 1.80), (0.158, 1.88), (0.158, 1.962)]
cap_prof += arc_pts(0.150, 1.962, 0.008, 0, math.pi / 2, 3)[1:]
cap_prof += [(0.146, 1.972), (0.146, 1.992)]
cap_prof += arc_pts(0.138, 1.992, 0.008, 0, math.pi / 2, 3)[1:]
cap_prof += [(0.0, 2.0)]
cap = lathe("Bottle_Cap", cap_prof, segments=CAP_SEG)
cap.data.materials.append(m_cap)
for v in cap.data.vertices:                      # 48 vertical grip grooves
    h = v.co.z - Y_OFFSET
    if math.hypot(v.co.x, v.co.y) > 0.155 and 1.768 < h < 1.958:
        i = round((math.atan2(v.co.x, -v.co.y) % (2 * math.pi)) / (2 * math.pi) * CAP_SEG)
        k = (0.158 - 0.011) / 0.158 if (i // 2) % 2 else 1.0
        v.co.x *= k
        v.co.y *= k
smooth(cap, angle=20)

# ---------------------------------------------------------------- label sleeve
def band(name, h0, h1, offset, mat, rows=6):
    ob = lathe(name, [(R_BODY + offset, h0 + (h1 - h0) * i / rows) for i in range(rows + 1)])
    ob.data.materials.append(mat)
    smooth(ob, angle=60)
    return ob


label = band("Label", 0.045, 0.770, 0.003, m_label, rows=12)
stripe = band("Label_Stripe", 0.694, 0.702, 0.0042, m_white_ink, rows=1)


# ---------------------------------------------------------------- flat artwork wrapped onto the label
def wrap(ob, offset):
    """Map a flat mesh in the XZ plane (x = arc length, z = height) onto the body."""
    r = R_BODY + offset
    for v in ob.data.vertices:
        a = v.co.x / r
        v.co = Vector((r * math.sin(a), -r * math.cos(a), v.co.z + Y_OFFSET))
    for poly in ob.data.polygons:
        poly.use_smooth = True


def text(name, body, size, h, mat, left=None, center=None, fit_w=None,
         font="arial.ttf", offset=0.0065, spacing=1.0, weight=0.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "LEFT"
    cu.align_y = "CENTER"
    cu.space_character = spacing
    cu.resolution_u = 8
    cu.offset = weight * size
    cu.font = bpy.data.fonts.load(f"{FONT_DIR}/{font}", check_existing=True)
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    ob.rotation_euler = (math.pi / 2, 0, 0)       # stand up in XZ, facing -Y
    select_only(ob)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs = [v.co.x for v in ob.data.vertices]
    x0, x1 = min(xs), max(xs)
    sx = fit_w / (x1 - x0) if fit_w else 1.0      # condense/stretch to measured width
    w = (x1 - x0) * sx
    start = left if left is not None else center - w / 2
    for v in ob.data.vertices:
        v.co.x = start + (v.co.x - x0) * sx
        v.co.z += h
    wrap(ob, offset)
    ob.data.materials.append(mat)
    return ob


def rect(name, x0, x1, h0, h1, mat, offset, cols=8):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = [[bm.verts.new((x0 + (x1 - x0) * i / cols, 0, z)) for z in (h0, h1)]
            for i in range(cols + 1)]
    for i in range(cols):
        bm.faces.new([grid[i][0], grid[i + 1][0], grid[i + 1][1], grid[i][1]])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    wrap(ob, offset)
    ob.data.materials.append(mat)
    return ob


def disk(name, cx, h, rad, mat, offset, n=32):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    c = bm.verts.new((cx, 0, h))
    ring = [bm.verts.new((cx + rad * math.cos(2 * math.pi * i / n), 0,
                          h + rad * math.sin(2 * math.pi * i / n))) for i in range(n)]
    for i in range(n):
        bm.faces.new([c, ring[(i + 1) % n], ring[i]])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    wrap(ob, offset)
    ob.data.materials.append(mat)
    return ob


LEFT = -0.195   # label artwork is left-aligned to this arc position
art = [
    text("Txt_Title", "WIND SHIELD", 0.10, 0.585, m_orange_ink, left=LEFT, fit_w=0.305,
         font="bahnschrift.ttf", weight=0.022),
    rect("Pro_Box", 0.020, 0.114, 0.480, 0.530, m_white_ink, 0.0052),
    text("Txt_Pro", "PRO", 0.034, 0.505, m_black_ink, center=0.067, fit_w=0.066,
         font="arialbd.ttf", offset=0.0068, weight=0.04),
    text("Txt_Line1", "Clears oily film instantly", 0.026, 0.352, m_white_ink,
         left=LEFT, fit_w=0.235),
    text("Txt_Line2", "Anti-freeze down to -22°F", 0.026, 0.312, m_white_ink,
         left=LEFT, fit_w=0.235),
    text("Txt_Volume", "120ML/4FL.OZ", 0.05, 0.132, m_white_ink, left=LEFT, fit_w=0.262,
         weight=0.02),
]
for i, cx in enumerate((-0.175, -0.117, -0.059)):          # three feature badges
    art.append(disk(f"Icon_{i}_Rim", cx, 0.425, 0.025, m_white_ink, 0.0052))
    art.append(disk(f"Icon_{i}_Fill", cx, 0.425, 0.020, m_icon, 0.0064))
    art.append(disk(f"Icon_{i}_Dot", cx, 0.425, 0.008, m_black_ink, 0.0074, n=16))
h = 0.075                                                    # fine hatching, right edge
while h < 0.66:
    art.append(rect(f"Hatch_{h:.3f}", 0.14, 0.25, h, h + 0.0013, m_grey_ink, 0.005))
    h += 0.0085

# ---------------------------------------------------------------- merge artwork, parent, export
select_only(art[0])
for ob in art[1:]:
    ob.select_set(True)
bpy.ops.object.join()
art_ob = bpy.context.view_layer.objects.active
art_ob.name = "Label_Artwork"

root = bpy.data.objects.new("WindShieldPro", None)
scene.collection.objects.link(root)
for ob in (body, finish, cap, label, stripe, art_ob):
    ob.parent = root

bpy.ops.wm.save_as_mainfile(filepath=f"{OUT_DIR}/wind-shield-pro.blend")
bpy.ops.export_scene.gltf(
    filepath=f"{OUT_DIR}/wind-shield-pro.glb",
    export_format="GLB",
    export_yup=True,
    export_apply=True,
)

# ---------------------------------------------------------------- preview render (photo-like studio)
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 85
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0.35, -6.2, 0.55)
cam.rotation_euler = (Vector((0, 0, 0.4)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (*srgb("#cfcac4"), 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
scene.world = world
for name, loc, energy, size in (("Key", (-3, -3, 3), 700, 3),
                                ("Rim", (2.5, 3, 2.5), 600, 2),
                                ("Fill", (3, -2.5, 0.8), 250, 3)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 0.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(lo)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, Y_OFFSET))
bpy.context.active_object.data.materials.append(material("Floor", "#bdb8b2", 0.6))

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.filepath = f"{OUT_DIR}/preview.png"
bpy.ops.render.render(write_still=True)
print("DONE")
