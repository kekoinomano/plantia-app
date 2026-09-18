// Plantia enclosure, derived from the PCB Gerber and pick-and-place files.
// Units: mm. Export with -D 'part="base"' or -D 'part="lid"'.
part = "base";

pcb_w = 37.211;
pcb_l = 59.055;
pcb_thickness = 1.6;       // Confirm against the manufactured PCB.
under_board_space = 2.8;   // Increase if a battery will sit below the PCB.
top_clearance = 12;
floor_thickness = 2.2;
wall = 2;
pcb_edge_gap = 0.7;
corner_radius = 3;
lid_thickness = 2;
lid_lip_height = 1.8;
lid_fit = 0.15;
pcb_side_clearance = 0.2;

outer_margin = wall + pcb_edge_gap;
outer_w = pcb_w + 2 * outer_margin;
outer_l = pcb_l + 2 * outer_margin;
pcb_bottom = floor_thickness + under_board_space;
pcb_top = pcb_bottom + pcb_thickness;
base_height = pcb_top + top_clearance;

// Drill coordinates from Drill_PTH_Through.DRL, mirrored into positive Y.
// Nominal drill: 0.9144 mm. The columns support the PCB around these holes;
// nothing has to pass through them.
mounts = [[2.54, 2.54], [34.671, 2.54],
          [2.54, 56.515], [34.671, 56.515]];

module rounded_prism(w, l, r, h) {
    linear_extrude(height = h)
        offset(r = r)
            square([w - 2 * r, l - 2 * r], center = true);
}

module base() {
    difference() {
        union() {
            // Main shell.
            difference() {
                translate([outer_w / 2, outer_l / 2, 0])
                    rounded_prism(outer_w, outer_l, corner_radius, base_height);
                translate([outer_w / 2, outer_l / 2, floor_thickness])
                    rounded_prism(outer_w - 2 * wall,
                                  outer_l - 2 * wall,
                                  corner_radius - wall,
                                  base_height - floor_thickness + 0.1);
            }
            // The PCB rests on four columns. The lid has matching columns
            // that touch the PCB from above, so no screws are needed.
            for (p = mounts)
                translate([outer_margin + p[0], outer_margin + p[1], floor_thickness])
                    cylinder(d = 3.4, h = under_board_space, $fn = 32);

            // Short locating ribs leave 0.2 mm clearance around PCB edges.
            for (yy = [outer_margin + 8, outer_margin + pcb_l - 8]) {
                translate([wall, yy - 2, floor_thickness])
                    cube([pcb_edge_gap - pcb_side_clearance, 4,
                          under_board_space + pcb_thickness + 0.3]);
                translate([outer_w - outer_margin + pcb_side_clearance,
                           yy - 2, floor_thickness])
                    cube([pcb_edge_gap - pcb_side_clearance, 4,
                          under_board_space + pcb_thickness + 0.3]);
            }
            for (xx = [outer_margin + 10, outer_margin + pcb_w - 10]) {
                translate([xx - 2, wall, floor_thickness])
                    cube([4, pcb_edge_gap - pcb_side_clearance,
                          under_board_space + pcb_thickness + 0.3]);
                translate([xx - 2, outer_l - outer_margin + pcb_side_clearance,
                           floor_thickness])
                    cube([4, pcb_edge_gap - pcb_side_clearance,
                          under_board_space + pcb_thickness + 0.3]);
            }
        }

        // USBC1: right edge, centre 23.876 mm from the PCB's top edge.
        translate([outer_w - wall - 1,
                   outer_margin + 23.876 - 6,
                   pcb_top - 1.5])
            cube([wall + 2, 12, 7.5]);

        // CN6 PJ-3200: 3.5 mm jack exits the lower short side.
        translate([outer_margin + 23.622, outer_l + 0.5, pcb_top + 2.5])
            rotate([90, 0, 0]) cylinder(d = 8, h = wall + 2, $fn = 64);

        // SW4: opening for the right-angle slide switch on the right edge.
        translate([outer_w - wall - 1,
                   outer_margin + 45.72 - 5,
                   pcb_top + 0.5])
            cube([wall + 2, 10, 6]);

        // Recesses for four small snap bumps on the lid lip.
        for (yy = [12.5, 55.5], xx = [wall, outer_w - wall])
            translate([xx, yy, base_height - 0.9])
                scale([0.45, 2.2, 0.45]) sphere(r = 1, $fn = 24);
    }
}

module lid() {
    difference() {
        union() {
            translate([outer_w / 2, outer_l / 2, top_clearance])
                rounded_prism(outer_w, outer_l, corner_radius, lid_thickness);
            // In assembly the lid underside sits at base_height.
            difference() {
                translate([outer_w / 2, outer_l / 2,
                           top_clearance - lid_lip_height])
                    rounded_prism(outer_w - 2 * (wall + lid_fit),
                                  outer_l - 2 * (wall + lid_fit),
                                  corner_radius - wall - lid_fit,
                                  lid_lip_height + 0.02);
                translate([outer_w / 2, outer_l / 2,
                           top_clearance - lid_lip_height - 0.1])
                    rounded_prism(outer_w - 2 * (wall + lid_fit + 1.4),
                                  outer_l - 2 * (wall + lid_fit + 1.4),
                                  0.3, lid_lip_height + 0.22);
            }
            for (p = mounts)
                translate([outer_margin + p[0], outer_margin + p[1], 0])
                    cylinder(d = 3.4, h = top_clearance + 0.02, $fn = 32);
            for (yy = [12.5, 55.5], xx = [wall + lid_fit,
                                          outer_w - wall - lid_fit])
                translate([xx, yy, top_clearance - 0.9])
                    scale([0.32, 2, 0.35]) sphere(r = 1, $fn = 24);
        }

        // The mark is a through opening above the LED cluster.
        translate([0, 0, top_clearance - 0.1])
            linear_extrude(height = lid_thickness + 0.2)
                import("murmura-mark.svg");

        // MUROMURA is recessed 0.6 mm into the top surface.
        translate([0, 0, top_clearance + lid_thickness - 0.6])
            linear_extrude(height = 0.7)
                import("muromura-wordmark.svg");
    }
}

if (part == "base") base();
else if (part == "lid") lid();
