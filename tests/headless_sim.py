import math

CONFIG_CAR_L = 4.5
CONFIG_CAR_W = 2.0
CONFIG_MAX_SPEED = 12.0
CONFIG_MAX_ACCEL = 3.2
CONFIG_MAX_BRAKE = 6.5
CONFIG_COMF_BRAKE = 2.8
STOP_LINE = 75.5
TOTAL_LEN = 180.0

lane_defs = [
    ('S', 'STRAIGHT', 5.25, -90.0, math.pi/2),
    ('S', 'LEFT',     1.75, -90.0, math.pi/2),
    ('N', 'STRAIGHT', -5.25, 90.0, -math.pi/2),
    ('N', 'LEFT',    -1.75, 90.0, -math.pi/2),
    ('W', 'STRAIGHT', -90.0, -5.25, 0.0),
    ('W', 'LEFT',     -90.0, -1.75, 0.0),
    ('E', 'STRAIGHT', 90.0, 5.25, math.pi),
    ('E', 'LEFT',     90.0, 1.75, math.pi)
]

def get_corners(x, y, heading):
    cos = math.cos(heading)
    sin = math.sin(heading)
    halfL = CONFIG_CAR_L / 2
    halfW = CONFIG_CAR_W / 2
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

class SimCar:
    def __init__(self, cid, app, man, lane_idx, s, v):
        self.id = cid
        self.app = app
        self.man = man
        self.lane_idx = lane_idx
        self.s = s
        self.v = v
        self.a = 0.0
        self.x = 0
        self.y = 0
        self.heading = 0
        self.corners = []
        self.update_pos()

    def update_pos(self):
        sx, sy, heading = lane_defs[self.lane_idx][2], lane_defs[self.lane_idx][3], lane_defs[self.lane_idx][4]
        if self.app == 'S':
            self.x, self.y = sx, sy + self.s
        elif self.app == 'N':
            self.x, self.y = sx, sy - self.s
        elif self.app == 'W':
            self.x, self.y = sx + self.s, sy
        elif self.app == 'E':
            self.x, self.y = sx - self.s, sy
        self.heading = heading
        self.corners = get_corners(self.x, self.y, self.heading)

def run_simulation(ticks=300):
    cars = []
    cid = 0
    for lane_idx in range(8):
        app, man = lane_defs[lane_idx][0], lane_defs[lane_idx][1]
        num_cars = 3 if lane_idx < 4 else 2
        for q in range(num_cars):
            s = 40.0 - q * 18.0
            is_green = (app in ['S', 'N'])
            v = 4.0 if is_green else 0.0
            cars.append(SimCar(cid, app, man, lane_idx, s, v))
            cid += 1

    dt = 1.0 / 60.0
    collision_events = 0

    phase_timer = 12.0
    phase = 0 # 0: NS Green, 1: NS Yellow, 2: Clearance, 3: EW Green, 4: EW Yellow, 5: Clearance

    for step in range(ticks * 60):
        t = step * dt
        phase_timer -= dt
        if phase_timer <= 0:
            phase = (phase + 1) % 6
            phase_timer = 12.0 if phase in [0, 3] else (3.5 if phase in [1, 4] else 2.0)

        # 1 Hz decision tick
        if step % 60 == 0:
            for car in cars:
                # Find front car in same lane
                front_dist = None
                front_dv = 0
                for other in cars:
                    if other.id != car.id and other.lane_idx == car.lane_idx:
                        dist = other.s - car.s - CONFIG_CAR_L
                        if dist > 0 and (front_dist is None or dist < front_dist):
                            front_dist = dist
                            front_dv = other.v - car.v

                # Signal state
                if car.app in ['S', 'N']:
                    sig = 'GREEN' if phase == 0 else ('YELLOW' if phase == 1 else 'RED')
                else:
                    sig = 'GREEN' if phase == 3 else ('YELLOW' if phase == 4 else 'RED')

                dist_to_line = STOP_LINE - car.s
                passed = dist_to_line <= 0

                # Decide action
                need_brake = False
                brake_intensity = 0.0

                # 1. Front car following logic
                if front_dist is not None:
                    safe_gap = max(4.0, (car.v * 1.5) + (car.v * car.v) / (2 * CONFIG_COMF_BRAKE))
                    if front_dist < 4.5:
                        need_brake = True
                        brake_intensity = 1.0
                    elif front_dist < safe_gap or (front_dv < -0.5 and front_dist < safe_gap * 1.3):
                        need_brake = True
                        req = (car.v * car.v - max(0, other.v) ** 2) / (2 * max(1.0, front_dist - 3.5))
                        brake_intensity = max(0.4, min(1.0, req / CONFIG_MAX_BRAKE))

                # 2. Traffic Light logic
                if not passed and sig == 'RED':
                    if dist_to_line <= 2.5 and car.v <= 0.2:
                        need_brake = True
                        brake_intensity = max(brake_intensity, 0.6)
                    else:
                        stop_dist = (car.v * car.v) / (2 * CONFIG_COMF_BRAKE)
                        if dist_to_line < stop_dist + 10.0 or dist_to_line < 25.0:
                            need_brake = True
                            req_decel = (car.v * car.v) / (2 * max(1.0, dist_to_line - 2.0))
                            brake_intensity = max(brake_intensity, min(1.0, max(0.45, req_decel / CONFIG_MAX_BRAKE)))
                elif not passed and sig == 'YELLOW':
                    min_stop_dist = (car.v * car.v) / (2 * 4.5)
                    if dist_to_line > min_stop_dist + 3.0:
                        need_brake = True
                        req_decel = (car.v * car.v) / (2 * max(1.0, dist_to_line - 2.0))
                        brake_intensity = max(brake_intensity, min(1.0, max(0.45, req_decel / CONFIG_MAX_BRAKE)))

                # Apply action to target acceleration
                if need_brake:
                    car.target_acc = -(brake_intensity * CONFIG_MAX_BRAKE)
                else:
                    if car.v < CONFIG_MAX_SPEED - 0.5:
                        car.target_acc = 0.8 * CONFIG_MAX_ACCEL
                    else:
                        car.target_acc = 0.0

        # Physics integration
        for car in cars:
            # Smooth throttle lag
            car.a += (car.target_acc - car.a) * min(1.0, 10.0 * dt)
            car.v = max(0.0, min(CONFIG_MAX_SPEED, car.v + car.a * dt))
            car.s += car.v * dt
            car.update_pos()

            # Recycle if cleared
            if car.s >= TOTAL_LEN:
                # Find lane with largest empty space at entry
                best_lane = None
                max_entry_gap = -1
                for l_idx in range(8):
                    min_s = min([c.s for c in cars if c.id != car.id and c.lane_idx == l_idx] or [999.0])
                    if min_s > max_entry_gap:
                        max_entry_gap = min_s
                        best_lane = l_idx

                car.lane_idx = best_lane
                car.app, car.man = lane_defs[best_lane][0], lane_defs[best_lane][1]
                car.s = 0.0
                car.v = 4.0 if (car.app in ['S', 'N'] and phase == 0) or (car.app in ['W', 'E'] and phase == 3) else 0.0
                car.a = 0.0
                car.target_acc = 0.0
                car.update_pos()

        # Check SAT collisions across all pairs
        for i in range(len(cars)):
            for j in range(i + 1, len(cars)):
                c1, c2 = cars[i], cars[j]
                if abs(c1.x - c2.x) < 5.0 and abs(c1.y - c2.y) < 5.0:
                    if check_sat(c1.corners, c2.corners):
                        print(f'[Step {step}] COLLISION between Car {c1.id} and Car {c2.id}! Pos1=({c1.x:.1f},{c1.y:.1f}) Pos2=({c2.x:.1f},{c2.y:.1f})')
                        collision_events += 1

    print(f'Simulation of {ticks} seconds finished with {collision_events} collisions.')

run_simulation(60)
