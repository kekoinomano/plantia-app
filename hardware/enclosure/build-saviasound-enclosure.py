"""Build the SaviaSound enclosure from the EasyEDA STEP assembly.

Run with FreeCAD's Python interpreter:
  /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd \
    hardware/enclosure/build-saviasound-enclosure.py

All dimensions are millimetres. The PCB and component extents are read from
saviasound_v1.step so a later STEP export fails loudly if the relevant parts
or their dimensions change.
"""

from pathlib import Path

import Draft
import FreeCAD as App
import Import
import MeshPart
import Part
import importSVG


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PCB_STEP = HERE / "saviasound_v1.step"
ISOTYPE_SVG = ROOT / "brand" / "isotipo.svg"
WORDMARK_SVG = ROOT / "brand" / "saviasound.svg"

# FDM allowances. Tune lid_fit for a particular printer/material if required.
wall = 1.80
floor = 2.00
board_edge_clearance = 0.55
board_support_height = 2.10
pcb_z = floor + board_support_height
base_height = 12.50
lid_thickness = 2.00
lid_lip_depth = 2.30
lid_lip_wall = 1.20
lid_fit = 0.22
outer_corner_radius = 4.30
engraving_depth = 0.50


def rounded_box(x, y, z, width, length, height, radius):
    shape = Part.makeBox(width, length, height, App.Vector(x, y, z))
    vertical = []
    for edge in shape.Edges:
        vertices = edge.Vertexes
        if len(vertices) == 2:
            dz = abs(vertices[1].Point.z - vertices[0].Point.z)
            if dz > height * 0.9:
                vertical.append(edge)
    return shape.makeFillet(radius, vertical)


def rounded_side_cut_x(x, y, z, depth, width, height, radius):
    """Rounded rectangle extruded along X, for a side-wall opening."""
    center = Part.makeBox(depth, width - 2 * radius, height,
                          App.Vector(x, y + radius, z))
    center = center.fuse(Part.makeBox(depth, width, height - 2 * radius,
                                     App.Vector(x, y, z + radius)))
    for yy in (y + radius, y + width - radius):
        for zz in (z + radius, z + height - radius):
            center = center.fuse(
                Part.makeCylinder(radius, depth, App.Vector(x, yy, zz),
                                  App.Vector(1, 0, 0))
            )
    return center


def find_part(doc, prefix):
    matches = [o for o in doc.Objects
               if o.TypeId == "App::Part" and o.Label.startswith(prefix + "~")]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one STEP part beginning {prefix!r}, got {len(matches)}")
    return matches[0]


def find_board(doc):
    matches = [o for o in doc.Objects
               if o.TypeId == "Part::Feature" and o.Label.startswith("Board~")]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one PCB solid, got {len(matches)}")
    return matches[0]


def shape_matrix(scale, center_x, center_y, bbox):
    source_cx = (bbox.XMin + bbox.XMax) / 2
    source_cy = (bbox.YMin + bbox.YMax) / 2
    matrix = App.Matrix()
    matrix.A11 = scale
    matrix.A22 = scale
    matrix.A33 = 1
    matrix.A14 = center_x - source_cx * scale
    matrix.A24 = center_y - source_cy * scale
    return matrix


def imported_brand_shapes(svg_path, stroke_half_width):
    temp = App.newDocument("brand_import")
    importSVG.insert(str(svg_path), temp.Name)
    temp.recompute()
    shapes = []
    for obj in temp.Objects:
        if obj.Name == "Rectangle" or obj.Shape.isNull():
            continue
        shape = obj.Shape
        if not shape.Faces:
            shape = shape.makeOffset2D(stroke_half_width, 0, True, False, False)
        shapes.append(shape.copy())
    App.closeDocument(temp.Name)
    return shapes


def transformed_brand(shapes, target_width, center_x, center_y, rotation=0):
    compound = Part.makeCompound(shapes)
    bbox = compound.BoundBox
    scale = target_width / bbox.XLength
    matrix = shape_matrix(scale, center_x, center_y, bbox)
    result = [shape.transformGeometry(matrix) for shape in shapes]
    if rotation:
        for shape in result:
            shape.rotate(App.Vector(center_x, center_y, 0),
                         App.Vector(0, 0, 1), rotation)
    return result


def text_shape(text, size, center_x, center_y):
    font = "/System/Library/Fonts/Supplemental/Arial.ttf"
    temp = App.newDocument("text_import")
    obj = Draft.makeShapeString(String=text, FontFile=font, Size=size, Tracking=0)
    temp.recompute()
    shape = obj.Shape.copy()
    bbox = shape.BoundBox
    shape.translate(App.Vector(center_x - (bbox.XMin + bbox.XMax) / 2,
                               center_y - (bbox.YMin + bbox.YMax) / 2, 0))
    App.closeDocument(temp.Name)
    return shape


def cut_extruded_faces(solid, faces, z_start, depth):
    for face in faces:
        cutter = face.extrude(App.Vector(0, 0, depth))
        cutter.translate(App.Vector(0, 0, z_start))
        solid = solid.cut(cutter)
    return solid


def cut_side_text(solid, face, y_center, z_center, depth):
    """Engrave an XY text face into the outer wall on the positive-X side."""
    face.rotate(App.Vector(0, 0, 0), App.Vector(1, 1, 1), 120)
    bbox = face.BoundBox
    face.translate(App.Vector(
        outer_x_max - depth,
        y_center - (bbox.YMin + bbox.YMax) / 2,
        z_center - (bbox.ZMin + bbox.ZMax) / 2,
    ))
    return solid.cut(face.extrude(App.Vector(depth + 0.2, 0, 0)))


source = App.newDocument("pcb_source")
Import.insert(str(PCB_STEP), source.Name)
source.recompute()

board = find_board(source)
usb = find_part(source, "USBC1")
jack = find_part(source, "CN6")
switch = find_part(source, "SW4")

bb = board.Shape.BoundBox
if abs(bb.ZLength - 1.60005) > 0.05:
    raise RuntimeError(f"Unexpected PCB thickness: {bb.ZLength:.3f} mm")

# The four Ø2.20 mm mounting holes are read from the cylindrical PCB faces.
mounts = []
for face in board.Shape.Faces:
    surface = face.Surface
    if type(surface).__name__ == "Cylinder" and abs(surface.Radius - 1.10000254) < 0.02:
        point = (round(surface.Center.x, 4), round(surface.Center.y, 4))
        if point not in mounts:
            mounts.append(point)
if len(mounts) != 4:
    raise RuntimeError(f"Expected four 2.20 mm mounting holes, got {mounts}")

outer_x_min = bb.XMin - (wall + board_edge_clearance)
outer_x_max = bb.XMax + (wall + board_edge_clearance)
outer_y_min = bb.YMin - (wall + board_edge_clearance)
outer_y_max = bb.YMax + (wall + board_edge_clearance)
outer_w = outer_x_max - outer_x_min
outer_l = outer_y_max - outer_y_min

inner_x_min = bb.XMin - board_edge_clearance
inner_x_max = bb.XMax + board_edge_clearance
inner_y_min = bb.YMin - board_edge_clearance
inner_y_max = bb.YMax + board_edge_clearance
inner_w = inner_x_max - inner_x_min
inner_l = inner_y_max - inner_y_min
inner_radius = outer_corner_radius - wall

# Base shell.
base = rounded_box(outer_x_min, outer_y_min, 0,
                   outer_w, outer_l, base_height, outer_corner_radius)
cavity = rounded_box(inner_x_min, inner_y_min, floor,
                     inner_w, inner_l, base_height - floor + 0.2,
                     inner_radius)
base = base.cut(cavity)

# PCB supports and tapered locating pins. The 1.70 mm pins leave 0.25 mm
# radial clearance in the nominal Ø2.20 mm plated holes.
for x, y in mounts:
    support = Part.makeCylinder(2.10, board_support_height,
                                App.Vector(x, y, floor))
    pin = Part.makeCylinder(0.85, 1.95, App.Vector(x, y, pcb_z))
    lead = Part.makeCone(0.85, 0.62, 0.45,
                         App.Vector(x, y, pcb_z + 1.95))
    base = base.fuse(support).fuse(pin).fuse(lead)

# Openings use the actual component extents from the STEP assembly.
usb_bb = usb.Shape.BoundBox
usb_cut = rounded_side_cut_x(
    inner_x_max - 0.4,
    usb_bb.YMin - 0.55,
    pcb_z + usb_bb.ZMin - 0.45,
    outer_x_max - inner_x_max + 1.4,
    usb_bb.YLength + 1.10,
    usb_bb.ZLength + 0.90,
    0.90,
)
base = base.cut(usb_cut)

jack_bb = jack.Shape.BoundBox
jack_y = (jack_bb.YMin + jack_bb.YMax) / 2
jack_z = pcb_z + 3.60
jack_cut = Part.makeCylinder(3.65, outer_x_max - inner_x_max + 1.5,
                             App.Vector(inner_x_max - 0.4, jack_y, jack_z),
                             App.Vector(1, 0, 0))
base = base.cut(jack_cut)

switch_bb = switch.Shape.BoundBox
switch_cut = rounded_side_cut_x(
    inner_x_max - 0.4,
    switch_bb.YMin - 0.45,
    pcb_z + 3.25,
    outer_x_max - inner_x_max + 1.5,
    switch_bb.YLength + 0.90,
    4.25,
    0.80,
)
base = base.cut(switch_cut)

# Four shallow snap pockets, arranged like the reference enclosure. They sit
# near the ends of the long walls so they do not interfere with the ports.
snap_y_centres = (-54.0, -5.0)
snap_width = 6.0
snap_height = 0.85
snap_z = base_height - lid_lip_depth + 0.45
snap_depth = 0.48
for y_center in snap_y_centres:
    left_pocket = Part.makeBox(
        snap_depth + 0.1, snap_width, snap_height,
        App.Vector(inner_x_min - snap_depth, y_center - snap_width / 2, snap_z))
    right_pocket = Part.makeBox(
        snap_depth + 0.1, snap_width, snap_height,
        App.Vector(inner_x_max - 0.1, y_center - snap_width / 2, snap_z))
    base = base.cut(left_pocket).cut(right_pocket)

# Lid panel and internal friction-fit lip.
lid = rounded_box(outer_x_min, outer_y_min, base_height,
                  outer_w, outer_l, lid_thickness, outer_corner_radius)
lip_outer = rounded_box(inner_x_min + lid_fit, inner_y_min + lid_fit,
                        base_height - lid_lip_depth,
                        inner_w - 2 * lid_fit, inner_l - 2 * lid_fit,
                        lid_lip_depth + 0.05, inner_radius - lid_fit)
lip_inner = rounded_box(inner_x_min + lid_fit + lid_lip_wall,
                        inner_y_min + lid_fit + lid_lip_wall,
                        base_height - lid_lip_depth - 0.1,
                        inner_w - 2 * (lid_fit + lid_lip_wall),
                        inner_l - 2 * (lid_fit + lid_lip_wall),
                        lid_lip_depth + 0.25,
                        inner_radius - lid_fit - lid_lip_wall)
lid = lid.fuse(lip_outer.cut(lip_inner))

# Matching tabs on the lid lip provide a positive click into the base pockets.
lip_left = inner_x_min + lid_fit
lip_right = inner_x_max - lid_fit
tab_projection = snap_depth - lid_fit + 0.08
for y_center in snap_y_centres:
    left_tab = Part.makeBox(
        tab_projection, snap_width - 0.35, snap_height - 0.12,
        App.Vector(lip_left - tab_projection,
                   y_center - (snap_width - 0.35) / 2,
                   snap_z + 0.06))
    right_tab = Part.makeBox(
        tab_projection, snap_width - 0.35, snap_height - 0.12,
        App.Vector(lip_right,
                   y_center - (snap_width - 0.35) / 2,
                   snap_z + 0.06))
    lid = lid.fuse(left_tab).fuse(right_tab)

    # Relief slots turn each section of lip into a short flexible tongue, as
    # in the reference STL, instead of forcing the complete rim to deform.
    for y_edge in (y_center - (snap_width - 0.35) / 2,
                   y_center + (snap_width - 0.35) / 2):
        left_slot = Part.makeBox(
            lid_lip_wall + tab_projection + 0.25, 0.65,
            lid_lip_depth - 0.25,
            App.Vector(lip_left - tab_projection - 0.1,
                       y_edge - 0.325,
                       base_height - lid_lip_depth - 0.05))
        right_slot = Part.makeBox(
            lid_lip_wall + tab_projection + 0.25, 0.65,
            lid_lip_depth - 0.25,
            App.Vector(lip_right - lid_lip_wall - 0.1,
                       y_edge - 0.325,
                       base_height - lid_lip_depth - 0.05))
        lid = lid.cut(left_slot).cut(right_slot)

# Continue the side openings through the inner lip. This prevents the lip from
# touching the tall jack and switch bodies when the lid is pressed home.
lip_cut_x = inner_x_max - lid_fit - lid_lip_wall - 0.45
usb_lip_cut = rounded_side_cut_x(
    lip_cut_x, usb_bb.YMin - 0.55, pcb_z + usb_bb.ZMin - 0.45,
    outer_x_max - lip_cut_x + 1.0, usb_bb.YLength + 1.10,
    usb_bb.ZLength + 0.90, 0.90)
# The jack's square rear body reaches the lip above the circular socket. Clear
# that small internal area too; the visible opening remains circular.
jack_lip_cut = rounded_side_cut_x(
    lip_cut_x, jack_bb.YMin - 0.55, base_height - lid_lip_depth - 0.4,
    outer_x_max - lip_cut_x + 1.0, jack_bb.YLength + 1.10,
    lid_lip_depth + 0.9, 0.60)
switch_lip_cut = rounded_side_cut_x(
    lip_cut_x, switch_bb.YMin - 0.65, pcb_z + 3.00,
    outer_x_max - lip_cut_x + 1.0, switch_bb.YLength + 1.30,
    5.00, 0.80)
lid = lid.cut(usb_lip_cut).cut(jack_lip_cut).cut(switch_lip_cut)

# Isotype aligned with the long side of the enclosure. Only its central point
# is through-cut above the LEDs; the two waves are shallow engravings.
isotype_raw = imported_brand_shapes(ISOTYPE_SVG, 0.965)
isotype = transformed_brand(isotype_raw, 18.0, 7.5, -35.2, rotation=90)
lid = cut_extruded_faces(lid, isotype[:1], base_height - 0.2,
                         lid_thickness + 0.4)
lid = cut_extruded_faces(lid, isotype[1:],
                         base_height + lid_thickness - engraving_depth,
                         engraving_depth + 0.2)

# Wordmark: centred, horizontal in the enclosure's landscape orientation.
wordmark_raw = imported_brand_shapes(WORDMARK_SVG, 2.35)
wordmark = transformed_brand(wordmark_raw, 40.0, 22.0, -29.5, rotation=90)
lid = cut_extruded_faces(lid, wordmark,
                         base_height + lid_thickness - engraving_depth,
                         engraving_depth + 0.2)

# Switch legend engraved on the side, below the switch opening. ON points
# toward USB and OFF toward the jack.
switch_legend = text_shape("ON   OFF", 1.45, 0, 0)
base = cut_side_text(base, switch_legend,
                     (switch_bb.YMin + switch_bb.YMax) / 2, 5.65,
                     engraving_depth)

if not base.isValid() or not lid.isValid():
    raise RuntimeError("Generated enclosure contains invalid BRep geometry")

doc = App.newDocument("saviasound_enclosure")
base_obj = doc.addObject("Part::Feature", "Base")
base_obj.Label = "SaviaSound base"
base_obj.Shape = base.removeSplitter()
lid_obj = doc.addObject("Part::Feature", "Lid")
lid_obj.Label = "SaviaSound lid"
lid_obj.Shape = lid.removeSplitter()
doc.recompute()

doc.saveAs(str(HERE / "saviasound-enclosure.FCStd"))
Import.export([base_obj], str(HERE / "saviasound-base.step"))
Import.export([lid_obj], str(HERE / "saviasound-lid.step"))
Import.export([base_obj, lid_obj], str(HERE / "saviasound-enclosure-assembly.step"))

for obj, name in ((base_obj, "saviasound-base.stl"),
                  (lid_obj, "saviasound-lid.stl")):
    print_shape = obj.Shape.copy()
    if obj is lid_obj:
        # Put the broad exterior face on the build plate. The lip then prints
        # upward and the lid needs no large supported bridge.
        print_shape.rotate(App.Vector(0, 0, 0), App.Vector(1, 0, 0), 180)
        print_shape.translate(App.Vector(-print_shape.BoundBox.XMin,
                                         -print_shape.BoundBox.YMin,
                                         -print_shape.BoundBox.ZMin))
    mesh = MeshPart.meshFromShape(Shape=print_shape, LinearDeflection=0.06,
                                  AngularDeflection=0.25, Relative=False)
    mesh.write(str(HERE / name))
    print(f"{name}: {mesh.CountFacets} triangles, solid={mesh.isSolid()}")

print(f"PCB: {bb.XLength:.3f} x {bb.YLength:.3f} x {bb.ZLength:.3f} mm")
print(f"Mounting holes: Ø2.200 mm at {mounts}")
print(f"Enclosure: {outer_w:.3f} x {outer_l:.3f} x "
      f"{base_height + lid_thickness:.3f} mm")
print(f"USB opening derived from: {usb_bb}")
print(f"Jack centre: Y={jack_y:.3f}, Z={jack_z:.3f}")
print(f"Switch opening derived from: {switch_bb}")
