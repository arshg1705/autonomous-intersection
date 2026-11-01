/**
 * Physics Engine & Precise Geometric Collision Detection
 * Implements 2D Kinematics and Oriented Bounding Box (OBB) Separating Axis Theorem (SAT).
 */

class Physics {
  /**
   * Integrate car kinematics over time step dt
   * Strictly adheres to physical acceleration limits and the active LLM command.
   * NO TELEPORTATION. NO INSTANT BRAKING. NO ARTIFICIAL COLLISION OVERRIDES.
   */
  static updateKinematics(car, dt) {
    let targetAcc = -CONFIG.COAST_DECELERATION;

    if (car.currentAction) {
      const action = car.currentAction.action;
      if (action === 'ACCELERATE') {
        const throttle = Math.max(0, Math.min(1.0, car.currentAction.throttle ?? 0.8));
        targetAcc = throttle * CONFIG.MAX_ACCELERATION;
      } else if (action === 'BRAKE') {
        const intensity = Math.max(0, Math.min(1.0, car.currentAction.intensity ?? 0.8));
        targetAcc = -(intensity * CONFIG.MAX_BRAKING);
      } else {
        // MAINTAIN
        targetAcc = -CONFIG.COAST_DECELERATION;
      }
    }

    // Smooth physical throttle/brake lag (actuator response time ~100ms)
    const lagFactor = 10.0 * dt;
    car.acceleration = car.acceleration + (targetAcc - car.acceleration) * Math.min(1.0, lagFactor);

    // Speed integration: v = v + a * dt
    car.speed += car.acceleration * dt;

    // Enforce non-negative speed and max speed
    if (car.speed < 0) {
      car.speed = 0;
      if (car.acceleration < 0) car.acceleration = 0;
    }
    if (car.speed > CONFIG.MAX_SPEED) {
      car.speed = CONFIG.MAX_SPEED;
    }

    // Distance progression along spline path: s = s + v * dt
    car.pathDistance += car.speed * dt;
  }

  /**
   * Computes the 4 corners of an Oriented Bounding Box (OBB) for a vehicle
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} heading - Heading angle in radians (0 = East, PI/2 = North)
   * @param {number} length - Length of vehicle
   * @param {number} width - Width of vehicle
   * @returns {Array<{x: number, y: number}>} 4 corner coordinates in world space
   */
  static getVehicleCorners(x, y, heading, length = CONFIG.CAR_LENGTH, width = CONFIG.CAR_WIDTH) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);

    const halfL = length / 2;
    const halfW = width / 2;

    // Local corner offsets: [Front-Right, Front-Left, Rear-Left, Rear-Right]
    const localOffsets = [
      { dx: halfL,  dy: halfW },
      { dx: halfL,  dy: -halfW },
      { dx: -halfL, dy: -halfW },
      { dx: -halfL, dy: halfW }
    ];

    return localOffsets.map(pt => ({
      x: x + pt.dx * cos - pt.dy * sin,
      y: y + pt.dx * sin + pt.dy * cos
    }));
  }

  /**
   * Separating Axis Theorem (SAT) collision test between two convex polygons
   * Used for exact 2D Oriented Bounding Box collision detection.
   * Returns true if vehicles intersect (collision).
   */
  static checkOBBCollision(cornersA, cornersB) {
    const polygons = [cornersA, cornersB];

    for (let p = 0; p < polygons.length; p++) {
      const polygon = polygons[p];

      for (let i = 0; i < polygon.length; i++) {
        const nextIdx = (i + 1) % polygon.length;
        const edge = {
          x: polygon[nextIdx].x - polygon[i].x,
          y: polygon[nextIdx].y - polygon[i].y
        };

        // Normal vector (perpendicular axis)
        const axis = { x: -edge.y, y: edge.x };

        // Normalize axis
        const length = Math.hypot(axis.x, axis.y);
        if (length === 0) continue;
        const normAxis = { x: axis.x / length, y: axis.y / length };

        // Project both polygons onto normAxis
        const projA = Physics.projectPolygon(cornersA, normAxis);
        const projB = Physics.projectPolygon(cornersB, normAxis);

        // If projections do not overlap, there is a separating axis -> NO collision!
        if (projA.max < projB.min || projB.max < projA.min) {
          return false;
        }
      }
    }

    // Overlap on ALL candidate axes -> Physical collision detected!
    return true;
  }

  /**
   * Project polygon vertices onto a 1D axis
   */
  static projectPolygon(vertices, axis) {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < vertices.length; i++) {
      const dot = vertices[i].x * axis.x + vertices[i].y * axis.y;
      if (dot < min) min = dot;
      if (dot > max) max = dot;
    }

    return { min, max };
  }

  /**
   * Raycast intersection between a ray and an Oriented Bounding Box
   * Used for local sensor distance measurement (Front/Rear/Side sensors).
   */
  static raycastOBB(rayOrigin, rayDir, corners, maxDistance = CONFIG.SENSOR.FRONT_RANGE) {
    let closestDist = maxDistance;

    for (let i = 0; i < corners.length; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % corners.length];

      const hit = Physics.raySegmentIntersection(rayOrigin, rayDir, p1, p2);
      if (hit !== null && hit >= 0 && hit < closestDist) {
        closestDist = hit;
      }
    }

    return closestDist < maxDistance ? closestDist : null;
  }

  /**
   * Ray vs Line Segment intersection
   */
  static raySegmentIntersection(rayOrigin, rayDir, segA, segB) {
    const v1 = { x: rayOrigin.x - segA.x, y: rayOrigin.y - segA.y };
    const v2 = { x: segB.x - segA.x, y: segB.y - segA.y };
    const v3 = { x: -rayDir.y, y: rayDir.x };

    const dot = v2.x * v3.x + v2.y * v3.y;
    if (Math.abs(dot) < 0.000001) return null;

    const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

    if (t1 >= 0.0 && t2 >= 0.0 && t2 <= 1.0) {
      return t1; // Distance along ray
    }

    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Physics;
}
