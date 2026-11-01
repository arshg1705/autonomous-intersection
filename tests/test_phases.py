import math

# Test the protected phase controller
phases = [
    "NS_STRAIGHT_GREEN",
    "NS_LEFT_GREEN",
    "ALL_RED_CLEARANCE",
    "EW_STRAIGHT_GREEN",
    "EW_LEFT_GREEN",
    "ALL_RED_CLEARANCE"
]

def get_signal(phase_idx, approach, maneuver):
    is_ns = approach in ['S', 'N']
    is_left = maneuver == 'LEFT'
    
    if phase_idx == 0: # NS Straight Green
        if is_ns and not is_left: return 'GREEN'
        if is_ns and is_left: return 'RED'
        return 'RED'
    elif phase_idx == 1: # NS Left Green
        if is_ns and is_left: return 'GREEN'
        return 'RED'
    elif phase_idx == 2: # Clearance
        return 'RED'
    elif phase_idx == 3: # EW Straight Green
        if not is_ns and not is_left: return 'GREEN'
        return 'RED'
    elif phase_idx == 4: # EW Left Green
        if not is_ns and is_left: return 'GREEN'
        return 'RED'
    elif phase_idx == 5: # Clearance
        return 'RED'
    return 'RED'

for p in range(6):
    print(f"Phase {p} ({phases[p]}):")
    for app in ['S', 'N', 'W', 'E']:
        sig_str = get_signal(p, app, 'STRAIGHT')
        sig_left = get_signal(p, app, 'LEFT')
        print(f"  {app}: Straight={sig_str}, Left={sig_left}")
