/**
 * High-Precision 2D Canvas Tactical Radar View
 * Renders crisp top-down intersection schematic, lane dividers, OBB bounds, sensor cones, and signal states.
 */

class Visualizer2D {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.scale = 4.2; // Pixels per meter
    this.center = { x: canvasElement.width / 2, y: canvasElement.height / 2 };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = this.canvas.parentElement.clientWidth || 800;
    this.canvas.height = this.canvas.parentElement.clientHeight || 800;
    this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.scale = Math.min(this.canvas.width, this.canvas.height) / (CONFIG.INTERSECTION.TOTAL_WORLD_SIZE * 0.85);
  }

  toScreen(worldX, worldY) {
    return {
      x: this.center.x + worldX * this.scale,
      y: this.center.y - worldY * this.scale // Invert Y for screen coordinates
    };
  }

  render(vehicles, trafficLights, selectedCarId = null) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    // Draw asphalt roads
    this.drawRoads();

    // Draw road markings (stop lines, lane dividers)
    this.drawMarkings(trafficLights);

    // Draw vehicles & sensor rays
    this.drawVehicles(vehicles, selectedCarId);
  }

  drawRoads() {
    const ctx = this.ctx;
    const roadW = CONFIG.INTERSECTION.ROAD_WIDTH * this.scale;
    const totalW = CONFIG.INTERSECTION.TOTAL_WORLD_SIZE * this.scale;

    ctx.fillStyle = '#161e2e';
    // North-South road
    ctx.fillRect(this.center.x - roadW / 2, this.center.y - totalW / 2, roadW, totalW);
    // East-West road
    ctx.fillRect(this.center.x - totalW / 2, this.center.y - roadW / 2, totalW, roadW);
  }

  drawMarkings(trafficLights) {
    const ctx = this.ctx;
    const stopOffset = CONFIG.INTERSECTION.STOP_LINE_OFFSET;
    const halfRoad = CONFIG.INTERSECTION.ROAD_WIDTH / 2;
    const roadLen = CONFIG.INTERSECTION.TOTAL_WORLD_SIZE / 2;

    // 1. Center Dividers (Double Yellow)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    // South & North
    ctx.beginPath();
    ctx.moveTo(this.center.x, this.center.y + stopOffset * this.scale);
    ctx.lineTo(this.center.x, this.center.y + roadLen * this.scale);
    ctx.moveTo(this.center.x, this.center.y - stopOffset * this.scale);
    ctx.lineTo(this.center.x, this.center.y - roadLen * this.scale);
    // West & East
    ctx.moveTo(this.center.x - stopOffset * this.scale, this.center.y);
    ctx.lineTo(this.center.x - roadLen * this.scale, this.center.y);
    ctx.moveTo(this.center.x + stopOffset * this.scale, this.center.y);
    ctx.lineTo(this.center.x + roadLen * this.scale, this.center.y);
    ctx.stroke();

    // 2. Stop Lines with Traffic Light Signals
    const drawStopLine = (app, p1, p2) => {
      const sigThrough = trafficLights.getSignal(app, 'STRAIGHT');
      const sigLeft = trafficLights.getSignal(app, 'LEFT');
      let signal = 'RED';
      if (sigThrough === 'GREEN' || sigLeft === 'GREEN') signal = 'GREEN';
      else if (sigThrough === 'YELLOW' || sigLeft === 'YELLOW') signal = 'YELLOW';

      ctx.strokeStyle = signal === 'RED' ? '#ef4444' : (signal === 'YELLOW' ? '#f59e0b' : '#10b981');
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Traffic Signal Indicator Dot
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    // South Stop Line
    drawStopLine('S',
      this.toScreen(0, -stopOffset),
      this.toScreen(halfRoad, -stopOffset)
    );
    // North Stop Line
    drawStopLine('N',
      this.toScreen(0, stopOffset),
      this.toScreen(-halfRoad, stopOffset)
    );
    // West Stop Line
    drawStopLine('W',
      this.toScreen(-stopOffset, 0),
      this.toScreen(-stopOffset, -halfRoad)
    );
    // East Stop Line
    drawStopLine('E',
      this.toScreen(stopOffset, 0),
      this.toScreen(stopOffset, halfRoad)
    );
  }

  drawVehicles(vehicles, selectedCarId) {
    const ctx = this.ctx;

    vehicles.forEach(car => {
      if (car.isCleared) return;

      const pos = this.toScreen(car.x, car.y);
      const isSelected = car.id === selectedCarId;

      // 1. Draw Front Sensor Ray if active
      if (car.localTelemetry && car.localTelemetry.front_sensor && car.localTelemetry.front_sensor.distance_m !== null) {
        const d = car.localTelemetry.front_sensor.distance_m;
        const cos = Math.cos(car.heading);
        const sin = Math.sin(car.heading);

        const endPos = this.toScreen(car.x + cos * d, car.y + sin * d);

        ctx.strokeStyle = d < 8.0 ? 'rgba(239, 68, 68, 0.8)' : (d < 18.0 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(16, 185, 129, 0.6)');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();
      }

      // 2. Draw Vehicle Oriented Bounding Box (OBB)
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(-car.heading); // Invert heading angle for screen coords

      const w = CONFIG.CAR_LENGTH * this.scale;
      const h = CONFIG.CAR_WIDTH * this.scale;

      // Chassis
      ctx.fillStyle = car.color;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-w / 2, -h / 2, w, h, 3);
      } else {
        ctx.rect(-w / 2, -h / 2, w, h);
      }
      ctx.fill();

      // Highlight if selected
      if (isSelected) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Windshield
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-w * 0.1, -h * 0.4, w * 0.35, h * 0.8);

      // Brake lights (Illuminated red if braking)
      if (car.currentAction && car.currentAction.action === 'BRAKE') {
        ctx.fillStyle = '#ff0033';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 8;
        ctx.fillRect(-w / 2, -h / 2 + 1, 2, 4);
        ctx.fillRect(-w / 2, h / 2 - 5, 2, 4);
        ctx.shadowBlur = 0;
      }

      // Headlights (White beams)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w / 2 - 2, -h / 2 + 1, 2, 4);
      ctx.fillRect(w / 2 - 2, h / 2 - 5, 2, 4);

      // ID Label
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`C${car.id}`, 0, 0);

      ctx.restore();
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Visualizer2D;
}
