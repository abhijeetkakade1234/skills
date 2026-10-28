"""Procedural hard-surface models for the web with Blender's bpy module (no Blender app).

    python build_model.py --glb public/models/object.glb --previews output/object

Needs the bpy pip package (bpy 5.x wheels need Python 3.11):
    uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python bpy

Model in the SITE's frame (three.js: metres, y up, +x forward, centred on z); B() converts
to Blender's z-up and the glTF exporter converts back. Keep coordinates your site's code
depends on (where things sit, where a simulation places objects) as named constants.

Every Part exports two objects: the beveled mesh (solid layer) and an unbeveled
`<name>__ghost` twin (for wireframe / point layers: bevels give no useful edges).
Replace build_model() with your object; keep the helpers.
"""

import argparse
import math
import os
import sys

import bpy  # must come first: it makes bmesh and mathutils importable
import bmesh
from mathutils import Matrix, Vector

# --- palette (sRGB hex; keep in sync with the site's tokens) -----------------------------
COLORS = {
    'body': '#D9D6CF',     # main clay
    'light': '#CFD2D0',    # secondary clay
    'trim': '#8E9694',     # details
    'dark': '#4F5451',     # rubber / vents
    'glass': '#5B615E',
    'accent': '#E8A83D',   # use sparingly (status light), same job as on the site
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    h = COLORS[name].lstrip('#')
    rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.55 if name == 'glass' else 0.85
    return m


# --- three.js frame helpers ----------------------------------------------------------------
def B(x, y, z):
    """three (x, y_up, z) -> blender (x, -z, y)."""
    return Vector((x, -z, y))


def nose_up(a):
    """Pitch in the side view: rotates the +x end upwards by `a` radians."""
    return Matrix.Rotation(-a, 4, 'Y')


AXIS_SIDE = Matrix.Rotation(math.pi / 2, 4, 'X')   # cylinder along three z
AXIS_FWD = Matrix.Rotation(math.pi / 2, 4, 'Y')    # cylinder along three x
AXIS_UP = Matrix.Identity(4)                       # cylinder along three y


class Part:
    """Accumulates primitives into one mesh with one material (= one draw call)."""

    def __init__(self, name, mat, bevel=0.02, segments=3):
        self.name, self.mat, self.bevel, self.segments = name, mat, bevel, segments
        self.bm = bmesh.new()

    def box(self, center, size, rot=None):
        lx, ly, lz = size
        m = Matrix.Translation(B(*center)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((lx, lz, ly, 1))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self

    def box_span(self, x0, x1, y0, y1, z0, z1, rot=None):
        return self.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), rot)

    def cyl(self, center, radius, depth, axis, segments=32, extra=None):
        m = Matrix.Translation(B(*center)) @ (extra or Matrix.Identity(4)) @ axis
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments,
                              radius1=radius, radius2=radius, depth=depth, matrix=m)
        return self

    def prism(self, profile, z0, z1):
        """Side-view polygon [(x, y), ...] extruded across z0..z1 (cabs, wedges, housings)."""
        verts = [self.bm.verts.new(B(x, y, z0)) for x, y in profile]
        face = self.bm.faces.new(verts)
        ext = bmesh.ops.extrude_face_region(self.bm, geom=[face])
        moved = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, verts=moved, vec=B(0, 0, z1) - B(0, 0, z0))
        return self

    def build(self, parent):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.shade_smooth()
        me.materials.append(self.mat)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ghost = bpy.data.objects.new(f'{self.name}__ghost', me.copy())
        bpy.context.scene.collection.objects.link(ghost)
        ghost.parent = parent
        if self.bevel > 0:
            bev = ob.modifiers.new('Bevel', 'BEVEL')
            bev.width = self.bevel
            bev.segments = self.segments
            bev.limit_method = 'ANGLE'
            bev.angle_limit = math.radians(30)
            bev.harden_normals = True
            bev.use_clamp_overlap = True
        return ob


# --- the model: replace this with your object -------------------------------------------
def build_model():
    """Example: a device on a plinth (body with vents, a lens, a status light)."""
    M = {k: material(k) for k in COLORS}
    root = bpy.data.objects.new('Model', None)
    bpy.context.scene.collection.objects.link(root)

    Part('plinth', M['light'], bevel=0.03).box_span(-0.9, 0.9, 0.0, 0.12, -0.7, 0.7).build(root)

    body = Part('body', M['body'], bevel=0.07, segments=4)
    body.prism([(-0.6, 0.12), (0.6, 0.12), (0.62, 0.62), (0.5, 0.78), (-0.6, 0.78)], -0.45, 0.45)
    body.build(root)

    vents = Part('vents', M['dark'], bevel=0.006, segments=2)
    for i in range(6):
        vents.box((-0.35 + i * 0.1, 0.45, 0.455), (0.04, 0.22, 0.02))
    vents.build(root)

    lens = Part('lens', M['trim'], bevel=0.01, segments=2)
    lens.cyl((0.63, 0.45, 0.0), 0.13, 0.06, AXIS_FWD, segments=32)
    lens.build(root)
    Part('lens_glass', M['glass'], bevel=0.004, segments=2).cyl((0.665, 0.45, 0.0), 0.08, 0.02, AXIS_FWD).build(root)
    Part('status', M['accent'], bevel=0.004, segments=2).cyl((0.3, 0.66, 0.455), 0.025, 0.02, AXIS_SIDE).build(root)
    return root


# --- export + previews ------------------------------------------------------------------------
def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)


def render_previews(outdir, views):
    os.makedirs(outdir, exist_ok=True)
    scene = bpy.context.scene
    # Ghost twins occupy the same space as the beveled meshes; rendering both z-fights
    # (large black faces). They exist only for the site's wire/point layers.
    for ob in scene.objects:
        if ob.name.endswith('__ghost'):
            ob.hide_render = True
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.render.resolution_x, scene.render.resolution_y = 960, 600
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.035, 0.034, 1)
    scene.world = world
    floor = bpy.data.materials.new('floor')
    floor.use_nodes = True
    floor.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.41, 0.39, 1)
    bpy.ops.mesh.primitive_plane_add(size=40)
    bpy.context.active_object.data.materials.append(floor)
    sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(18)
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, (pos, target, fov) in views.items():
        cam.location = B(*pos)
        cam.rotation_euler = (B(*target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.angle = math.radians(fov)
        scene.render.filepath = os.path.join(outdir, f'{name}.png')
        bpy.ops.render.render(write_still=True)


PREVIEW_VIEWS = {  # name: (camera position, look-at, fov) in the site's frame
    'front34': ((2.6, 1.4, 2.2), (0, 0.4, 0), 38),
    'side': ((0, 0.6, 3.4), (0, 0.4, 0), 34),
    'high': ((-1.8, 2.6, 2.0), (0, 0.4, 0), 40),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--glb', required=True)
    ap.add_argument('--previews')
    args = ap.parse_args(sys.argv[1:])
    # Blender resolves relative paths against its own cwd: make them absolute.
    glb = os.path.abspath(args.glb)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_model()
    export_glb(glb)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = sum(len(o.evaluated_get(dg).data.loop_triangles) for o in bpy.context.scene.objects if o.type == 'MESH')
    print(f'exported {glb} ({os.path.getsize(glb) / 1024:.0f} KB, {tris} tris)')
    if args.previews:
        render_previews(os.path.abspath(args.previews), PREVIEW_VIEWS)
        print(f'previews in {os.path.abspath(args.previews)}')


if __name__ == '__main__':
    main()
