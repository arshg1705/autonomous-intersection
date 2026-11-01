import math

# Test the spawn fleet and verify bounding boxes don't overlap
CAR_L = 4.5
CAR_W = 2.0
STOP_LINE = 75.5 # 90.0 - 14.5

def get_corners(x, y, heading):
    cos = math.cos(heading)
    sin = math.sin(heading)
    halfL = CAR_L / 2
    halfW = CAR_W / 2
    localOffsets = [
        (halfL, halfW),
        (halfL, -halfW),
        (-halfL, -halfW),
        (-halfL, halfW)
    ]
    return [(x + dx * cos - dy * sin, y + dx * sin + dy * cos) for dx, dy in localOffsets]

def project(vertices, axis):
    dots = [v[0] * axis[0] + v[1] * axis[1] for v in vertices]
    return min(dots), max(dots)

def check_sat(c1, c2):
    for poly in [c1, c2]:
        for i in range(len(poly)):
            p1 = poly[i]
            p2 = poly[(i + 1) % len(poly)]
            edge = (p2[0] - p1[0], p2[1] - p1[1])
            axis = (-edge[1], edge[0])
            length = math.hypot(axis[0], axis[1])
            if length == 0: continue
            norm_axis = (axis[0] / length, axis[1] / length)
            minA, maxA = project(c1, norm_axis)
            minB, maxB = project(c2, norm_axis)
            if maxA < minB or maxB < minA:
                return False
    return True

print("SAT tester ready")
