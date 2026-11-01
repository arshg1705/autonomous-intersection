/**
 * 4-Way Intersection Geometry & Trajectory Spline Engine
 * Defines lanes, stop lines, crosswalks, and realistic turning paths.
 */

class Intersection {
  constructor() {
    this.laneWidth = CONFIG.INTERSECTION.LANE_WIDTH;
    this.halfBox = CONFIG.INTERSECTION.INTERSECTION_RADIUS;
    this.approachLength = CONFIG.INTERSECTION.APPROACH_LENGTH;
    this.stopLineOffset = CONFIG.INTERSECTION.STOP_LINE_OFFSET;

    // Build all precomputed trajectory paths for each approach and maneuver
    this.paths = this.buildAllPaths();
  }

  /**
   * Generates trajectory paths for all approaches and maneuvers:
   * Approaches: 'N', 'S', 'E', 'W'
   * Maneuvers: 'STRAIGHT', 'RIGHT', 'LEFT'
   */
  buildAllPaths() {
    const paths = {};
    const approaches = ['N', 'S', 'E', 'W'];
    const maneuvers = ['STRAIGHT', 'RIGHT', 'LEFT'];

    approaches.forEach(app => {
      maneuvers.forEach(man => {
        const key = `${app}_${man}`;
        paths[key] = this.createPath(app, man);
      });
    });

    return paths;
  }

  createPath(approach, maneuver) {
    const w = this.laneWidth;
    const box = this.halfBox;
    const len = this.approachLength;

    // Coordinates for lane centers:
    // Outer lane (offset = 1.5 * w), Inner lane (offset = 0.5 * w)
    const dOuter = 1.5 * w; // 5.25m
    const dInner = 0.5 * w; // 1.75m

    let start = { x: 0, y: 0 };
    let stopLineDist = 0;
    let controlPoints = [];

    if (approach === 'S') {
      // Approach from South moving North (+Y direction)
      const laneX = maneuver === 'LEFT' ? dInner : dOuter;
      start = { x: laneX, y: -len };
      stopLineDist = len - this.stopLineOffset;

      if (maneuver === 'STRAIGHT') {
        controlPoints = [
          start,
          { x: laneX, y: -this.stopLineOffset },
          { x: laneX, y: this.stopLineOffset },
          { x: laneX, y: len }
        ];
      } else if (maneuver === 'RIGHT') {
        // Turns East (+X direction, lane Y = -dOuter)
        controlPoints = [
          start,
          { x: laneX, y: -this.stopLineOffset },
          { x: laneX + 2.0, y: -dOuter - 2.0 },
          { x: this.stopLineOffset, y: -dOuter },
          { x: len, y: -dOuter }
        ];
      } else if (maneuver === 'LEFT') {
        // Turns West (-X direction, lane Y = dInner)
        controlPoints = [
          start,
          { x: laneX, y: -this.stopLineOffset },
          { x: laneX, y: 0.0 },
          { x: 0.0, y: dInner },
          { x: -this.stopLineOffset, y: dInner },
          { x: -len, y: dInner }
        ];
      }
    } else if (approach === 'N') {
      // Approach from North moving South (-Y direction)
      const laneX = maneuver === 'LEFT' ? -dInner : -dOuter;
      start = { x: laneX, y: len };
      stopLineDist = len - this.stopLineOffset;

      if (maneuver === 'STRAIGHT') {
        controlPoints = [
          start,
          { x: laneX, y: this.stopLineOffset },
          { x: laneX, y: -this.stopLineOffset },
          { x: laneX, y: -len }
        ];
      } else if (maneuver === 'RIGHT') {
        // Turns West (-X direction, lane Y = dOuter)
        controlPoints = [
          start,
          { x: laneX, y: this.stopLineOffset },
          { x: laneX - 2.0, y: dOuter + 2.0 },
          { x: -this.stopLineOffset, y: dOuter },
          { x: -len, y: dOuter }
        ];
      } else if (maneuver === 'LEFT') {
        // Turns East (+X direction, lane Y = -dInner)
        controlPoints = [
          start,
          { x: laneX, y: this.stopLineOffset },
          { x: laneX, y: 0.0 },
          { x: 0.0, y: -dInner },
          { x: this.stopLineOffset, y: -dInner },
          { x: len, y: -dInner }
        ];
      }
    } else if (approach === 'W') {
      // Approach from West moving East (+X direction)
      const laneY = maneuver === 'LEFT' ? -dInner : -dOuter;
      start = { x: -len, y: laneY };
      stopLineDist = len - this.stopLineOffset;

      if (maneuver === 'STRAIGHT') {
        controlPoints = [
          start,
          { x: -this.stopLineOffset, y: laneY },
          { x: this.stopLineOffset, y: laneY },
          { x: len, y: laneY }
        ];
      } else if (maneuver === 'RIGHT') {
        // Turns South (-Y direction, lane X = -dOuter)
        controlPoints = [
          start,
          { x: -this.stopLineOffset, y: laneY },
          { x: -dOuter - 2.0, y: laneY - 2.0 },
          { x: -dOuter, y: -this.stopLineOffset },
          { x: -dOuter, y: -len }
        ];
      } else if (maneuver === 'LEFT') {
        // Turns North (+Y direction, lane X = dInner)
        controlPoints = [
          start,
          { x: -this.stopLineOffset, y: laneY },
          { x: 0.0, y: laneY },
          { x: dInner, y: 0.0 },
          { x: dInner, y: this.stopLineOffset },
          { x: dInner, y: len }
        ];
      }
    } else if (approach === 'E') {
      // Approach from East moving West (-X direction)
      const laneY = maneuver === 'LEFT' ? dInner : dOuter;
      start = { x: len, y: laneY };
      stopLineDist = len - this.stopLineOffset;

      if (maneuver === 'STRAIGHT') {
        controlPoints = [
          start,
          { x: this.stopLineOffset, y: laneY },
          { x: -this.stopLineOffset, y: laneY },
          { x: -len, y: laneY }
        ];
      } else if (maneuver === 'RIGHT') {
        // Turns North (+Y direction, lane X = dOuter)
        controlPoints = [
          start,
          { x: this.stopLineOffset, y: laneY },
          { x: dOuter + 2.0, y: laneY + 2.0 },
          { x: dOuter, y: this.stopLineOffset },
          { x: dOuter, y: len }
        ];
      } else if (maneuver === 'LEFT') {
        // Turns South (-Y direction, lane X = -dInner)
        controlPoints = [
          start,
          { x: this.stopLineOffset, y: laneY },
          { x: 0.0, y: laneY },
          { x: -dInner, y: 0.0 },
          { x: -dInner, y: -this.stopLineOffset },
          { x: -dInner, y: -len }
        ];
      }
    }

    // Sample spline points densely for high accuracy arc-length parameterization
    const sampledPoints = this.sampleSpline(controlPoints, 0.25);
    const totalLength = sampledPoints[sampledPoints.length - 1].s;

    const res = {
      approach,
      maneuver,
      controlPoints,
      samples: sampledPoints,
      stopLineDistance: stopLineDist,
      totalLength
    };
    res.sampleSplinePoint = (s) => this.sampleAtDistance(res, s);
    return res;
  }

  /**
   * Piecewise linear/arc interpolation with cumulative distance 's'
   */
  sampleSpline(controlPoints, stepSize = 0.25) {
    const samples = [];
    let cumulativeS = 0;

    for (let i = 0; i < controlPoints.length - 1; i++) {
      const p0 = controlPoints[i];
      const p1 = controlPoints[i + 1];

      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const steps = Math.max(1, Math.ceil(segLen / stepSize));

      for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
        const t = s / steps;
        const x = p0.x + (p1.x - p0.x) * t;
        const y = p0.y + (p1.y - p0.y) * t;
        const heading = Math.atan2(p1.y - p0.y, p1.x - p0.x);

        if (samples.length > 0) {
          const prev = samples[samples.length - 1];
          cumulativeS += Math.hypot(x - prev.x, y - prev.y);
        }

        samples.push({ x, y, heading, s: cumulativeS });
      }
    }

    return samples;
  }

  /**
   * Get world position and heading given distance 's' along a path
   */
  sampleAtDistance(path, s) {
    const samples = path.samples;
    if (s <= 0) return { ...samples[0], s: 0 };
    if (s >= path.totalLength) return { ...samples[samples.length - 1], s: path.totalLength };

    // Binary search for efficiency
    let low = 0;
    let high = samples.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (samples[mid].s < s) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx0 = Math.max(0, low - 1);
    const idx1 = Math.min(samples.length - 1, low);

    if (idx0 === idx1) return samples[idx0];

    const p0 = samples[idx0];
    const p1 = samples[idx1];
    const ds = p1.s - p0.s;
    const factor = ds > 0.0001 ? (s - p0.s) / ds : 0;

    return {
      x: p0.x + (p1.x - p0.x) * factor,
      y: p0.y + (p1.y - p0.y) * factor,
      heading: p0.heading,
      s
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Intersection;
}
