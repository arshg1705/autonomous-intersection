import math

# Exact diagnostic script to simulate the exact JS logic from telemetry.js and llm_service.js
LANE_W = 3.5
STOP_OFFSET = 14.5
LEN_VAL = 90.0
D_OUTER = 1.5 * LANE_W
D_INNER = 0.5 * LANE_W
CAR_L = 4.5
CAR_W = 2.0
MAX_SPEED = 12.0
MAX_ACCEL = 3.2
MAX_BRAKE = 6.5
COMF_BRAKE = 2.8

def build_path(approach, maneuver):
    if approach == 'S':
        laneX = D_INNER if maneuver == 'LEFT' else D_OUTER
        start = (laneX, -LEN_VAL)
        if maneuver == 'STRAIGHT':
            ctrl = [start, (laneX, -STOP_OFFSET), (laneX, STOP_OFFSET), (laneX, LEN_VAL)]
        elif maneuver == 'RIGHT':
            ctrl = [start, (laneX, -STOP_OFFSET), (laneX + 2.0, -D_OUTER - 2.0), (STOP_OFFSET, -D_OUTER), (LEN_VAL, -D_OUTER)]
        elif maneuver == 'LEFT':
            ctrl = [start, (laneX, -STOP_OFFSET), (laneX, 0.0), (0.0, D_INNER), (-STOP_OFFSET, D_INNER), (-LEN_VAL, D_INNER)]
    elif approach == 'N':
        laneX = -D_INNER if maneuver == 'LEFT' else -D_OUTER
        start = (laneX, LEN_VAL)
        if maneuver == 'STRAIGHT':
            ctrl = [start, (laneX, STOP_OFFSET), (laneX, -STOP_OFFSET), (laneX, -LEN_VAL)]
        elif maneuver == 'RIGHT':
            ctrl = [start, (laneX, STOP_OFFSET), (laneX - 2.0, D_OUTER + 2.0), (-STOP_OFFSET, D_OUTER), (-LEN_VAL, D_OUTER)]
        elif maneuver == 'LEFT':
            ctrl = [start, (laneX, STOP_OFFSET), (laneX, 0.0), (0.0, -D_INNER), (STOP_OFFSET, -D_INNER), (LEN_VAL, -D_INNER)]
    elif approach == 'W':
        laneY = -D_INNER if maneuver == 'LEFT' else -D_OUTER
        start = (-LEN_VAL, laneY)
        if maneuver == 'STRAIGHT':
            ctrl = [start, (-STOP_OFFSET, laneY), (STOP_OFFSET, laneY), (LEN_VAL, laneY)]
        elif maneuver == 'RIGHT':
            ctrl = [start, (-STOP_OFFSET, laneY), (-D_OUTER - 2.0, laneY - 2.0), (-D_OUTER, -STOP_OFFSET), (-D_OUTER, -LEN_VAL)]
        elif maneuver == 'LEFT':
            ctrl = [start, (-STOP_OFFSET, laneY), (0.0, laneY), (D_INNER, 0.0), (D_INNER, STOP_OFFSET), (D_INNER, LEN_VAL)]
    elif approach == 'E':
        laneY = D_INNER if maneuver == 'LEFT' else D_OUTER
        start = (LEN_VAL, laneY)
        if maneuver == 'STRAIGHT':
            ctrl = [start, (STOP_OFFSET, laneY), (-STOP_OFFSET, laneY), (-LEN_VAL, laneY)]
        elif maneuver == 'RIGHT':
            ctrl = [start, (STOP_OFFSET, laneY), (D_OUTER + 2.0, laneY + 2.0), (D_OUTER, STOP_OFFSET), (D_OUTER, LEN_VAL)]
        elif maneuver == 'LEFT':
            ctrl = [start, (STOP_OFFSET, laneY), (0.0, laneY), (-D_INNER, 0.0), (-D_INNER, -STOP_OFFSET), (-D_INNER, -LEN_VAL)]

    samples = []
    cum_s = 0.0
    step_size = 0.25
    for i in range(len(ctrl) - 1):
        p0, p1 = ctrl[i], ctrl[i+1]
        seg_len = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        steps = max(1, math.ceil(seg_len / step_size))
        start_step = 0 if i == 0 else 1
        for s_idx in range(start_step, steps + 1):
            t = s_idx / steps
            x = p0[0] + (p1[0] - p0[0]) * t
            y = p0[1] + (p1[1] - p0[1]) * t
            heading = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
            if samples:
                prev = samples[-1]
                cum_s += math.hypot(x - prev['x'], y - prev['y'])
            samples.append({'x': x, 'y': y, 'heading': heading, 's': cum_s})
    return samples

def sample_at_distance(samples, s):
    if s <= 0: return samples[0]
    if s >= samples[-1]['s']: return samples[-1]
    low, high = 0, len(samples) - 1
    while low <= high:
        mid = (low + high) // 2
        if samples[mid]['s'] < s: low = mid + 1
        else: high = mid - 1
    idx0 = max(0, low - 1)
    idx1 = min(len(samples) - 1, low)
    if idx0 == idx1: return samples[idx0]
    p0, p1 = samples[idx0], samples[idx1]
    ds = p1['s'] - p0['s']
    factor = (s - p0['s']) / ds if ds > 0 else 0
    return {
        'x': p0['x'] + (p1['x'] - p0['x']) * factor,
        'y': p0['y'] + (p1['y'] - p0['y']) * factor,
        'heading': p0['heading'],
        's': s
    }

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

# 10-phase signal controller
phase_durations = [7.0, 2.5, 5.0, 2.0, 1.5, 7.0, 2.5, 5.0, 2.0, 1.5]

def get_signal_10p(phase, approach, maneuver):
    is_ns = approach in ['S', 'N']
    is_left = maneuver == 'LEFT'
    if phase == 0: return 'GREEN' if is_ns and not is_left else 'RED'
    elif phase == 1: return 'YELLOW' if is_ns and not is_left else 'RED'
    elif phase == 2: return 'GREEN' if is_ns and is_left else 'RED'
    elif phase == 3: return 'YELLOW' if is_ns and is_left else 'RED'
    elif phase == 4: return 'RED'
    elif phase == 5: return 'GREEN' if not is_ns and not is_left else 'RED'
    elif phase == 6: return 'YELLOW' if not is_ns and not is_left else 'RED'
    elif phase == 7: return 'GREEN' if not is_ns and is_left else 'RED'
    elif phase == 8: return 'YELLOW' if not is_ns and is_left else 'RED'
    elif phase == 9: return 'RED'
    return 'RED'

print("Diagnostic script ready")
class Car:
    def __init__(self, cid, app, man, samples, s, v):
        self.id = cid
        self.app = app
        self.man = man
        self.samples = samples
        self.s = s
        self.v = v
        self.a = 0.0
        self.target_a = 0.0
        self.stop_dist = LEN_VAL - STOP_OFFSET
        self.total_len = samples[-1]['s']
        self.update_geom()

    def update_geom(self):
        pt = sample_at_distance(self.samples, self.s)
        self.x = pt['x']
        self.y = pt['y']
        self.heading = pt['heading']
        self.corners = get_corners(self.x, self.y, self.heading)

def run():
    all_paths = {}
    for app in ['S', 'N', 'W', 'E']:
        for man in ['STRAIGHT', 'LEFT', 'RIGHT']:
            all_paths[f"{app}_{man}"] = build_path(app, man)

    lane_cfgs = [
        ('S', 'STRAIGHT', 3),
        ('S', 'LEFT',     3),
        ('N', 'STRAIGHT', 3),
        ('N', 'LEFT',     3),
        ('W', 'STRAIGHT', 2),
        ('W', 'LEFT',     2),
        ('E', 'STRAIGHT', 2),
        ('E', 'LEFT',     2)
    ]

    cars = []
    cid = 0
    for app, man, count in lane_cfgs:
        path = all_paths[f"{app}_{man}"]
        is_green = (app in ['S', 'N'])
        for q in range(count):
            s = 40.0 - q * 18.0
            v = 4.5 if is_green else 0.0
            cars.append(Car(cid, app, man, path, s, v))
            cid += 1

    dt = 1.0 / 60.0
    phase = 0
    phase_timer = phase_durations[0]
    collisions = []

    for step in range(120 * 60):
        phase_timer -= dt
        if phase_timer <= 0:
            phase = (phase + 1) % 10
            phase_timer = phase_durations[phase]

        # 1 Hz decision tick
        if step % 60 == 0:
            for car in cars:
                # Find front car using spatial corridor projection
                closest_d = 999.0
                lead_v = 0.0
                cos_h = math.cos(car.heading)
                sin_h = math.sin(car.heading)

                for other in cars:
                    if other.id == car.id: continue
                    dx = other.x - car.x
                    dy = other.y - car.y
                    long_d = dx * cos_h + dy * sin_h
                    lat_d = abs(-dx * sin_h + dy * cos_h)

                    # Ahead within 2.2m lateral corridor
                    if long_d > 0 and lat_d < 2.2:
                        d = long_d - CAR_L
                        if 0 < d < closest_d:
                            closest_d = d
                            lead_v = other.v

                sig = get_signal_10p(phase, car.app, car.man)
                dist_to_line = car.stop_dist - car.s
                passed = dist_to_line <= 0

                need_brake = False
                brake_intensity = 0.0

                # 1. In-box clearance rule with safe following gap!
                if passed:
                    # In box, don't stop unless following lead car!
                    if closest_d < 999.0:
                        safe_gap = max(4.0, (car.v * 1.4) + (car.v * car.v) / (2 * COMF_BRAKE))
                        if closest_d < 4.0:
                            need_brake = True
                            brake_intensity = 1.0
                        elif closest_d < safe_gap:
                            need_brake = True
                            req = (car.v * car.v - max(0, lead_v) ** 2) / (2 * max(1.0, closest_d - 3.5))
                            brake_intensity = max(0.45, min(1.0, req / MAX_BRAKE))
                    else:
                        need_brake = False
                else:
                    # 2. Before stop line
                    # Anti-gridlock
                    if dist_to_line < 4.0 and closest_d < 14.0 and lead_v < 1.0:
                        need_brake = True
                        brake_intensity = 0.75
                    elif closest_d < 999.0:
                        safe_gap = max(4.0, (car.v * 1.5) + (car.v * car.v) / (2 * COMF_BRAKE))
                        if closest_d < 4.5:
                            need_brake = True
                            brake_intensity = 1.0
                        elif closest_d < safe_gap or ((lead_v - car.v) < -0.5 and closest_d < safe_gap * 1.3):
                            need_brake = True
                            req = (car.v * car.v - max(0, lead_v) ** 2) / (2 * max(1.0, closest_d - 3.5))
                            brake_intensity = max(0.45, min(1.0, req / MAX_BRAKE))

                    if not need_brake:
                        if sig == 'RED':
                            if dist_to_line <= 2.5 and car.v <= 0.2:
                                need_brake = True
                                brake_intensity = 0.6
                            else:
                                stop_d = (car.v * car.v) / (2 * COMF_BRAKE)
                                if dist_to_line < stop_d + 10.0 or dist_to_line < 25.0:
                                    need_brake = True
                                    req_d = (car.v * car.v) / (2 * max(1.0, dist_to_line - 2.0))
                                    brake_intensity = max(0.45, min(1.0, req_d / MAX_BRAKE))
                        elif sig == 'YELLOW':
                            min_stop = (car.v * car.v) / (2 * 4.5)
                            if dist_to_line > min_stop + 3.0:
                                need_brake = True
                                req_d = (car.v * car.v) / (2 * max(1.0, dist_to_line - 2.0))
                                brake_intensity = max(0.45, min(1.0, req_d / MAX_BRAKE))

                if need_brake:
                    car.target_a = -(brake_intensity * MAX_BRAKE)
                else:
                    car.target_a = 0.75 * MAX_ACCEL if car.v < MAX_SPEED - 0.5 else 0.0

        # Kinematics
        for car in cars:
            car.a += (car.target_a - car.a) * min(1.0, 10.0 * dt)
            car.v = max(0.0, min(MAX_SPEED, car.v + car.a * dt))
            car.s += car.v * dt
            car.update_geom()

            if car.s >= car.total_len:
                car.s = 0.0
                car.v = 4.0 if get_signal_10p(phase, car.app, car.man) == 'GREEN' else 0.0
                car.a = 0.0
                car.target_a = 0.0
                car.update_geom()

        # Check SAT collisions
        for i in range(len(cars)):
            for j in range(i + 1, len(cars)):
                c1, c2 = cars[i], cars[j]
                if abs(c1.x - c2.x) < 5.0 and abs(c1.y - c2.y) < 5.0:
                    if check_sat(c1.corners, c2.corners):
                        collisions.append((step, c1.id, c2.id, c1.x, c1.y))

    print(f"Total collision events logged: {len(collisions)}")
    if collisions:
        print("First collision:", collisions[0])

run()
