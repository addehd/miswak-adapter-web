# Virtual fit test (trimesh + manifold3d) - Oct 28 2026
Verdict v1 (as printed before): FAILS. v2 (now in miswak_adapter.py + exported STLs): FITS, grip OK; tolerance safe -0.15..+0.10 mm, marginal +0.15.
v4 (Oct 29 2026, R2.5 neck-to-head fillet, body x<10 only): sweep_final.csv rerun is byte-identical to v3/v2 (0.000 mm3 to z0 1.9, cone contact z0~1.6 at 0.25 mm3, 11.17 mm3 at seat z0 0.5); cone tolerance unchanged (first contact z0 0.8/1.1/1.6 for d -0.15/-0.10/0); coupons watertight; min clearance gap 0.006 mm.

v1: cone started at r 4.5 (full thread), cap teeth tip r 3.93 -> cap cannot pass; 2.2 mm3 phase-independent collision from z0 6.8 to 2.3; only the unreachable z0~1.4 (0.09 mm3) was clear. Cap cone also started at cap z=5 while head thread ran to 6.5.
v2 sweep (helix: rotation 1.25 mm/turn, 25 positions z0 7.3->0.5, sweep_final.csv): 0.000 mm3 up to z0 1.9; cone contact z0~1.6 (0.25 mm3) -> 11.2 mm3 at seat z0 0.5 (finger squeeze only).
Tolerance (both parts +-d per surface, normal): THREAD_CLEAR 0.20 fails at +0.10 (11.3 mm3), 0.30 fails +0.10 (5.0), 0.40: OK to +0.10 (0.3), +0.15 10.4 mm3 marginal; negative d all clear. Cone contact shifts 2d/sin20 = 0.58 mm at 0.10, 0.88 at 0.15.
Files: cross_section_assembled.png, clearance_heatmap.png, sweep_final.csv, thread_test_head.stl (print upright), thread_test_cap.stl (= cap.stl, mouth down), scripts.
