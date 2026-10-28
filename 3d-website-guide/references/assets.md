# 3D assets without a 3D artist

## Options, by what you need
| Need | Use |
|---|---|
| Hard-surface objects (machines, devices, vehicles, furniture, buildings) | Procedural `bpy` script (below) or code-built geometry |
| Organic forms (people, animals, faces) | CC-licensed library assets (check **commercial** use), AI 3D generators, or a 3D artist |
| Glows, eyes, liquids, energy, data | Shaders and particles beat meshes |
| Animated people doing a task | Mixamo-style rigged assets |
| Screens/dashboards inside the scene | `CanvasTexture` drawn in 2D, or an HTML product shot as a texture |

## Procedural models with bpy (`templates/tools/build_model.py`)
Setup (keep caches on a drive with space):
```
uv venv --python 3.11 <dir>/.venv              # bpy 5.x wheels need Python 3.11
uv pip install --python <dir>/.venv/bin/python bpy
python -c "import bpy; print(bpy.app.version_string)"
```
Pattern:
- Model in the **site's coordinate frame** (three.js y-up metres); a helper converts to
  Blender's z-up; glTF export converts back. Keep any coordinates the site's code depends on
  (where objects sit, where a simulation stacks things) pinned to the same numbers.
- `Part(name, material, bevel, segments)` accumulates primitives (box, box_span, cyl,
  extruded side-profile prism) into one mesh per material group = few draw calls.
- Bevel modifier (`harden_normals`, angle limit 30°) for soft premium edges; `export_apply`.
- Export an unbeveled `<part>__ghost` twin per part for the wireframe/points layers.
- `--previews <dir>` renders Cycles preview images. **Look at them and iterate**: first
  passes always have floating parts and wrong proportions.
- Pass absolute output paths (Blender resolves relative paths against its own cwd).

## Loading in the site
```tsx
const { scene } = useGLTF('/models/object.glb')
// pair each mesh with its __ghost twin: solid from the mesh, edges + points from the twin
useGLTF.preload('/models/object.glb')
```
Many copies (a grid of units): one `InstancedMesh` per part using the ghost geometry and a
plain material.

## Budgets that held up
One hero object ~40k triangles / ~800 KB GLB including twins; a 14-copy grid instanced to
~13 draw calls. Compress (Draco/meshopt, KTX2) only after measuring on target devices.

## Product shots
Real app screenshots often clash with the site and can leak customer data. Build an HTML
page in the site's style with the app's real information architecture and invented sample
data, render at 2x with Playwright (`templates/tools/render-shot.mjs`), label "Sample data".
