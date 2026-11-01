/**
 * Vehicle Entity Class
 * Maintains physical kinematics, trajectory progression, visual states, and local sensor readings.
 */

class Vehicle {
  constructor(id, approach, maneuver, path, initialDistance = 0, initialSpeed = 6.0) {
    this.id = id;
    this.approach = approach;     // 'N', 'S', 'E', 'W'
    this.maneuver = maneuver;     // 'STRAIGHT', 'RIGHT', 'LEFT'
    this.path = path;

    // Kinematics
    this.pathDistance = initialDistance; // Progression along spline path
    this.speed = initialSpeed;           // m/s
    this.acceleration = 0.0;             // m/s^2

    // Dimensions
    this.length = CONFIG.CAR_LENGTH;
    this.width = CONFIG.CAR_WIDTH;

    // Visual attributes
    this.color = this.assignColor(id);
    this.x = 0;
    this.y = 0;
    this.heading = 0;
    this.corners = [];

    // Current LLM command applied to this vehicle
    this.currentAction = {
      action: 'MAINTAIN',
      throttle: 0.0,
      intensity: 0.0,
      timestamp: Date.now()
    };

    // Local telemetry extracted for the LLM
    this.localTelemetry = null;

    // Lifecycle status
    this.isCleared = false;
    this.collisionDetected = false;

    // Update initial world position
    this.syncWorldPosition();
  }

  assignColor(id) {
    const palette = [
      '#3b82f6', // Electric Blue
      '#10b981', // Emerald Green
      '#f59e0b', // Amber Orange
      '#ec4899', // Hot Pink
      '#8b5cf6', // Violet
      '#06b6d4', // Cyan
      '#ef4444', // Crimson Red
      '#14b8a6', // Teal
      '#f97316', // Bright Orange
      '#6366f1', // Indigo
      '#84cc16', // Lime
      '#e11d48', // Ruby
      '#0ea5e9', // Sky Blue
      '#a855f7', // Purple
      '#d97706', // Gold
      '#22c55e', // Jade
      '#f43f5e', // Rose
      '#38bdf8', // Neon Sky
      '#4ade80', // Mint
      '#c084fc'  // Lavender
    ];
    return palette[id % palette.length];
  }

  /**
   * Synchronize (x, y, heading) from path distance
   */
  syncWorldPosition() {
    const sample = this.path ? this.path.sampleSplinePoint(this.pathDistance) : null;
    if (sample) {
      this.x = sample.x;
      this.y = sample.y;
      this.heading = sample.heading;
    }
    this.corners = Physics.getVehicleCorners(this.x, this.y, this.heading, this.length, this.width);
  }

  /**
   * Apply physics tick dt
   */
  update(dt) {
    Physics.updateKinematics(this, dt);
    this.syncWorldPosition();

    // Check if car has completed its path and cleared intersection
    if (this.path && this.pathDistance >= this.path.totalLength) {
      this.isCleared = true;
    }
  }

  /**
   * Distance from front bumper to stop line
   * Positive = before stop line
   * Negative = already inside/passed intersection box
   */
  getDistanceToStopLine() {
    if (!this.path) return 0;
    const stopDist = this.path.stopLineDistance;
    return stopDist - this.pathDistance;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Vehicle;
}
