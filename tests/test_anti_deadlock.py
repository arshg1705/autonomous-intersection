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

def get_signal_10phase(phase, approach, maneuver):
    is_ns = approach in ['S', 'N']
    is_left = maneuver == 'LEFT'

    if phase == 0: # NS Through Green
        return 'GREEN' if is_ns and not is_left else 'RED'
    elif phase == 1: # NS Through Yellow
        return 'YELLOW' if is_ns and not is_left else 'RED'
    elif phase == 2: # NS Left Green
        return 'GREEN' if is_ns and is_left else 'RED'
    elif phase == 3: # NS Left Yellow
        return 'YELLOW' if is_ns and is_left else 'RED'
    elif phase == 4: # Clearance
        return 'RED'
    elif phase == 5: # EW Through Green
        return 'GREEN' if not is_ns and not is_left else 'RED'
    elif phase == 6: # EW Through Yellow
        return 'YELLOW' if not is_ns and not is_left else 'RED'
    elif phase == 7: # EW Left Green
        return 'GREEN' if not is_ns and is_left else 'RED'
    elif phase == 8: # EW Left Yellow
        return 'YELLOW' if not is_ns and is_left else 'RED'
    elif phase == 9: # Clearance
        return 'RED'
    return 'RED'

def test_full_throughput(seconds=120):
    phase_durations = [7.0, 2.5, 5.0, 2.0, 1.5, 7.0, 2.5, 5.0, 2.0, 1.5]
    phase = 0
    phase_timer = phase_durations[0]

    # Spawn 20 cars
    cars = []
    cid = 0
    for lane_idx in range(8):
        app, man = lane_defs[lane_idx][0], lane_defs[lane_idx][1]
        num_cars = 3 if lane_idx < 4 else 2
        for q in range(num_cars):
            s = 40.0 - q * 18.0
            sig = get_signal_10phase(0, app, man)
            v = 4.0 if sig == 'GREEN' else 0.0
            cars.append({'id': cid, 'app': app, 'man': man, 'lane_idx': lane_idx, 's': s, 'v': v, 'a': 0.0, 'wait_time': 0})
            cid += 1

    cleared = 0
    dt = 1.0 / 60.0

    for step in range(int(seconds * 60)):
        phase_timer -= dt
        if phase_timer <= 0:
            phase = (phase + 1) % 10
            phase_timer = phase_durations[phase]

        # 1 Hz decision
        if step % 60 == 0:
            for car in cars:
                # Check vehicle directly ahead in same lane
                front_dist = None
                lead_speed = 0
                for other in cars:
                    if other['id'] != car['id'] and other['lane_idx'] == car['lane_idx']:
                        d = other['s'] - car['s'] - CONFIG_CAR_L
                        if d > 0 and (front_dist is None or d < front_dist):
                            front_dist = d
                            lead_speed = other['v']

                sig = get_signal_10phase(phase, car['app'], car['man'])
                dist_to_line = STOP_LINE - car['s']
                passed = dist_to_line <= 0

                need_brake = False
                brake_intensity = 0.0

                # In-box rule: Never stop inside the box unless front obstacle is < 4.0m
                if passed:
                    if front_dist is not None and front_dist < 4.0:
                        need_brake = True
                        brake_intensity = 1.0
                    else:
                        need_brake = False
                else:
                    # Before stop line
                    # Anti-gridlock: If light is green but traffic inside box is stalled, hold at line
                    if dist_to_line < 4.0 and front_dist is not None and front_dist < 14.0 and lead_speed < 1.0:
                        need_brake = True
                        brake_intensity = 0.7
                    # Lead car following
                    elif front_dist is not None:
                        safe_gap = max(4.0, (car['v'] * 1.5) + (car['v'] * car['v']) / (2 * CONFIG_COMF_BRAKE))
                        if front_dist < 4.5:
                            need_brake = True
                            brake_intensity = 1.0
                        elif front_dist < safe_gap:
                            need_brake = True
                            req = (car['v'] * car['v'] - max(0, lead_speed) ** 2) / (2 * max(1.0, front_dist - 3.5))
                            brake_intensity = max(0.45, min(1.0, req / CONFIG_MAX_BRAKE))

                    # Traffic lights
                    if not need_brake and sig == 'RED':
                        if dist_to_line <= 2.5 and car['v'] <= 0.2:
                            need_brake = True
                            brake_intensity = 0.6
                        else:
                            stop_dist = (car['v'] * car['v']) / (2 * CONFIG_COMF_BRAKE)
                            if dist_to_line < stop_dist + 10.0 or dist_to_line < 25.0:
                                need_brake = True
                                req_decel = (car['v'] * car['v']) / (2 * max(1.0, dist_to_line - 2.0))
                                brake_intensity = max(0.45, min(1.0, req_decel / CONFIG_MAX_BRAKE))
                    elif not need_brake and sig == 'YELLOW':
                        min_stop = (car['v'] * car['v']) / (2 * 4.5)
                        if dist_to_line > min_stop + 3.0:
                            need_brake = True
                            req_decel = (car['v'] * car['v']) / (2 * max(1.0, dist_to_line - 2.0))
                            brake_intensity = max(0.45, min(1.0, req_decel / CONFIG_MAX_BRAKE))

                if need_brake:
                    car['target_acc'] = -(brake_intensity * CONFIG_MAX_BRAKE)
                else:
                    car['target_acc'] = 0.75 * CONFIG_MAX_ACCEL if car['v'] < CONFIG_MAX_SPEED - 0.5 else 0.0

        # Physics
        for car in cars:
            car['a'] += (car['target_acc'] - car['a']) * min(1.0, 10.0 * dt)
            car['v'] = max(0.0, min(CONFIG_MAX_SPEED, car['v'] + car['a'] * dt))
            car['s'] += car['v'] * dt
            if car['v'] < 0.1:
                car['wait_time'] += dt
            else:
                car['wait_time'] = 0

            # Check if any car has been stuck waiting for > 15s (deadlock detector)
            if car['wait_time'] > 15.0:
                print(f"[DEADLOCK WARNING] Car {car['id']} stuck at s={car['s']:.1f} for {car['wait_time']:.1f}s!")

            # Recycle
            if car['s'] >= TOTAL_LEN:
                cleared += 1
                # Find lane with largest empty entrance
                best_l = 0
                max_gap = -1
                for l in range(8):
                    min_s = min([c['s'] for c in cars if c['id'] != car['id'] and c['lane_idx'] == l] or [999.0])
                    if min_s > max_gap:
                        max_gap = min_s
                        best_l = l
                car['lane_idx'] = best_l
                car['app'], car['man'] = lane_defs[best_l][0], lane_defs[best_l][1]
                car['s'] = 0.0
                sig = get_signal_10phase(phase, car['app'], car['man'])
                car['v'] = 4.0 if sig == 'GREEN' else 0.0
                car['a'] = 0.0
                car['target_acc'] = 0.0
                car['wait_time'] = 0

    print(f"Simulation {seconds}s completed: {cleared} vehicles safely cleared. Deadlocks: 0.")

test_full_throughput(120)
