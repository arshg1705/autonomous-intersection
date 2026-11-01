/**
 * Local Telemetry Extractor (Strict Local Observability)
 * Extracts ego-centric sensor readings for all 20 vehicles.
 * 
 * STRICT MANDATE:
 * - NO global (x, y) coordinates
 * - NO bird's-eye map matrices
 * - PURELY local Front, Rear, Side, and Signal sensor telemetry.
 */

class TelemetryExtractor {
  /**
   * Extract local sensor telemetry for all active vehicles
   * @param {Array<Vehicle>} vehicles - Active vehicles in simulation
   * @param {TrafficLightController} trafficLights - Traffic light state
   * @returns {Array<Object>} Batch telemetry array for LLM prompt
   */
  static extractBatchTelemetry(vehicles, trafficLights) {
    return vehicles.map(car => TelemetryExtractor.extractCarTelemetry(car, vehicles, trafficLights));
  }

  /**
   * Extract purely local sensor telemetry for a single vehicle
   */
  static extractCarTelemetry(car, allCars, trafficLights) {
    const frontSensor = TelemetryExtractor.getFrontSensor(car, allCars);
    const rearSensor = TelemetryExtractor.getRearSensor(car, allCars);
    const sideSensor = TelemetryExtractor.getSideSensors(car, allCars);
    const signalSensor = TelemetryExtractor.getSignalSensor(car, trafficLights);

    // Speedometer reading (local ego vehicle state)
    const speedMps = Number(car.speed.toFixed(1));

    return {
      id: car.id,
      speed_mps: speedMps,
      front_sensor: frontSensor,
      rear_sensor: rearSensor,
      side_sensor: sideSensor,
      signal_sensor: signalSensor
    };
  }

  /**
   * 1. FRONT SENSOR:
   * Distance and relative velocity (dv = v_front - v_ego) of the vehicle directly ahead.
   */
  static getFrontSensor(ego, allCars) {
    let closestDist = CONFIG.SENSOR.FRONT_RANGE;
    let closestCar = null;

    const egoIsOuter = (ego.maneuver === 'STRAIGHT' || ego.maneuver === 'RIGHT');
    const stopDist = ego.path ? ego.path.stopLineDistance : 75.5;

    for (const other of allCars) {
      if (other.id === ego.id || other.isCleared) continue;

      const otherIsOuter = (other.maneuver === 'STRAIGHT' || other.maneuver === 'RIGHT');
      const isSameApproach = (other.approach === ego.approach);
      const isSameLaneBeforeLine = isSameApproach && (egoIsOuter === otherIsOuter) && (ego.pathDistance < stopDist) && (other.pathDistance < stopDist);

      if (isSameLaneBeforeLine || (isSameApproach && other.maneuver === ego.maneuver)) {
        const distAlongPath = other.pathDistance - ego.pathDistance - CONFIG.CAR_LENGTH;
        if (distAlongPath > 0 && distAlongPath < closestDist) {
          closestDist = distAlongPath;
          closestCar = other;
        }
      } else {
        // Multi-beam raycast across vehicle front bumper width
        const cos = Math.cos(ego.heading);
        const sin = Math.sin(ego.heading);
        const normalX = -sin;
        const normalY = cos;

        const rayOffsets = [-0.75, 0.0, 0.75];
        for (const offset of rayOffsets) {
          const rayOrigin = {
            x: ego.x + (CONFIG.CAR_LENGTH / 2) * cos + offset * normalX,
            y: ego.y + (CONFIG.CAR_LENGTH / 2) * sin + offset * normalY
          };
          const rayDir = { x: cos, y: sin };

          const hitDist = Physics.raycastOBB(rayOrigin, rayDir, other.corners, CONFIG.SENSOR.FRONT_RANGE);
          if (hitDist !== null && hitDist > 0 && hitDist < closestDist) {
            const toOther = { x: other.x - ego.x, y: other.y - ego.y };
            const forwardDot = (toOther.x * cos + toOther.y * sin);
            if (forwardDot > 0) {
              closestDist = hitDist;
              closestCar = other;
            }
          }
        }
      }
    }

    if (closestCar) {
      const relSpeed = Number((closestCar.speed - ego.speed).toFixed(1));
      const dist = Number(closestDist.toFixed(1));
      return {
        distance_m: dist,
        relative_speed_mps: relSpeed
      };
    }

    return {
      distance_m: null, // Clear ahead
      relative_speed_mps: null
    };
  }

  /**
   * 2. REAR SENSOR:
   * Distance and relative velocity (dv = v_rear - v_ego) of the vehicle directly behind.
   */
  static getRearSensor(ego, allCars) {
    let closestDist = CONFIG.SENSOR.REAR_RANGE;
    let closestCar = null;

    for (const other of allCars) {
      if (other.id === ego.id || other.isCleared) continue;

      if (other.approach === ego.approach && other.maneuver === ego.maneuver) {
        const distBehind = ego.pathDistance - other.pathDistance - (CONFIG.CAR_LENGTH);
        if (distBehind > 0 && distBehind < closestDist) {
          closestDist = distBehind;
          closestCar = other;
        }
      }
    }

    if (closestCar) {
      const relSpeed = Number((closestCar.speed - ego.speed).toFixed(1));
      const dist = Number(closestDist.toFixed(1));
      return {
        distance_m: dist,
        relative_speed_mps: relSpeed
      };
    }

    return {
      distance_m: null, // Clear behind
      relative_speed_mps: null
    };
  }

  /**
   * 3. SIDE / BLIND-SPOT SENSORS:
   * Proximity of adjacent vehicles in left/right lanes or crossing trajectories.
   */
  static getSideSensors(ego, allCars) {
    let leftMin = CONFIG.SENSOR.SIDE_RANGE;
    let rightMin = CONFIG.SENSOR.SIDE_RANGE;
    let crossingConflict = false;

    const cos = Math.cos(ego.heading);
    const sin = Math.sin(ego.heading);

    // Left normal vector: (-sin, cos), Right normal vector: (sin, -cos)
    for (const other of allCars) {
      if (other.id === ego.id || other.isCleared) continue;

      const dx = other.x - ego.x;
      const dy = other.y - ego.y;

      // Project onto ego's longitudinal and lateral axes
      const longDist = dx * cos + dy * sin;
      const latDist = -dx * sin + dy * cos; // positive = left, negative = right

      // Check if in adjacent lateral zone (longitudinal within 6m)
      if (Math.abs(longDist) < 6.0) {
        if (latDist > 0.5 && latDist < leftMin) {
          leftMin = latDist;
        } else if (latDist < -0.5 && Math.abs(latDist) < rightMin) {
          rightMin = Math.abs(latDist);
        }
      }

      // Check for crossing path trajectory inside intersection box
      const euclideanDist = Math.hypot(dx, dy);
      if (euclideanDist < 9.0 && Math.abs(longDist) < 7.0 && ego.getDistanceToStopLine() <= 0) {
        // Vehicle is inside the intersection with nearby cross-traffic
        crossingConflict = true;
      }
    }

    return {
      left_proximity_m: leftMin < CONFIG.SENSOR.SIDE_RANGE ? Number(leftMin.toFixed(1)) : null,
      right_proximity_m: rightMin < CONFIG.SENSOR.SIDE_RANGE ? Number(rightMin.toFixed(1)) : null,
      crossing_conflict_detected: crossingConflict
    };
  }

  /**
   * 4. SIGNAL SENSOR:
   * Current state of the traffic light facing that car's lane (RED, YELLOW, or GREEN)
   * and distance to the stop line.
   */
  static getSignalSensor(car, trafficLights) {
    const signalState = trafficLights.getSignal(car.approach, car.maneuver);
    const distToLine = car.getDistanceToStopLine();
    const passedStopLine = distToLine <= 0;

    return {
      state: signalState,
      distance_to_stop_line_m: passedStopLine ? 0.0 : Number(distToLine.toFixed(1)),
      passed_stop_line: passedStopLine
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TelemetryExtractor;
}
