/**
 * Main Application Coordinator & Simulation Loop
 * Manages 20 active vehicles, 60 FPS physics integration, 1 Hz single batch LLM API calls,
 * OBB collision detection, HUD metrics, and UI event binding.
 */

class App {
  constructor() {
    this.intersection = new Intersection();
    this.trafficLights = new TrafficLightController();
    this.llmService = new LLMService();

    this.vehicles = [];
    this.collisionCount = 0;
    this.clearedVehiclesCount = 0;
    this.totalTicks = 0;

    this.isRunning = true;
    this.simSpeedMultiplier = 1.0;
    this.lastFrameTime = performance.now();
    this.lastDecisionTickTime = 0;

    this.selectedCarId = 0;
    this.viewMode = '3d'; // '3d' or '2d'

    // Initialize visualizers
    this.visualizer3D = new Visualizer3D(document.getElementById('viewport-3d'));
    this.visualizer2D = new Visualizer2D(document.getElementById('canvas-2d'));

    // Seamless fallback to 2D tactical radar if WebGL is unsupported
    if (!this.visualizer3D.webglAvailable) {
      this.viewMode = '2d';
      const vp3d = document.getElementById('viewport-3d');
      const c2d = document.getElementById('canvas-2d');
      if (vp3d) vp3d.style.display = 'none';
      if (c2d) c2d.style.display = 'block';
      const toggleBtn = document.getElementById('btn-toggle-view');
      if (toggleBtn) toggleBtn.innerText = 'Switch to 3D Scene';
    }

    // Populate initial 20 vehicles
    this.spawnInitialFleet();

    // Bind UI controls & event listeners
    this.bindEvents();

    // Start simulation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    // Initial batch decision trigger
    this.triggerDecisionTick();
  }

  /**
   * Spawns exactly 20 vehicles distributed safely across the 8 incoming lanes
   * Queued cleanly behind stop lines with zero initial collision overlap.
   */
  spawnInitialFleet() {
    this.vehicles = [];
    const laneConfigurations = [
      { approach: 'S', maneuver: 'STRAIGHT', count: 3 },
      { approach: 'S', maneuver: 'LEFT',     count: 3 },
      { approach: 'N', maneuver: 'STRAIGHT', count: 3 },
      { approach: 'N', maneuver: 'LEFT',     count: 3 },
      { approach: 'W', maneuver: 'STRAIGHT', count: 2 },
      { approach: 'W', maneuver: 'LEFT',     count: 2 },
      { approach: 'E', maneuver: 'STRAIGHT', count: 2 },
      { approach: 'E', maneuver: 'LEFT',     count: 2 }
    ];

    let carId = 0;
    laneConfigurations.forEach(cfg => {
      const pathKey = `${cfg.approach}_${cfg.maneuver}`;
      const path = this.intersection.paths[pathKey];
      const isGreenAtStart = (cfg.approach === 'S' || cfg.approach === 'N');

      for (let q = 0; q < cfg.count; q++) {
        // Queue safely before stop line: front car at 40m, second at 22m, third at 4m
        const initialDistance = 40.0 - q * 18.0;
        const initialSpeed = isGreenAtStart ? 4.5 : 0.0;

        const car = new Vehicle(carId++, cfg.approach, cfg.maneuver, path, initialDistance, initialSpeed);
        this.vehicles.push(car);
      }
    });
  }

  /**
   * Respawn a vehicle that has cleared the intersection
   * Chooses the incoming lane with maximum empty clearance at the entrance.
   */
  recycleVehicle(car) {
    this.clearedVehiclesCount++;

    const laneOptions = [
      { approach: 'S', maneuver: 'STRAIGHT' },
      { approach: 'S', maneuver: 'LEFT' },
      { approach: 'N', maneuver: 'STRAIGHT' },
      { approach: 'N', maneuver: 'LEFT' },
      { approach: 'W', maneuver: 'STRAIGHT' },
      { approach: 'W', maneuver: 'LEFT' },
      { approach: 'E', maneuver: 'STRAIGHT' },
      { approach: 'E', maneuver: 'LEFT' }
    ];

    // Find the lane with the largest empty distance from the entry (s = 0)
    let bestOption = laneOptions[0];
    let maxEntryGap = -1;

    for (const opt of laneOptions) {
      let minS = Infinity;
      for (const other of this.vehicles) {
        if (other.id !== car.id && other.approach === opt.approach) {
          const egoIsOuter = (opt.maneuver === 'STRAIGHT' || opt.maneuver === 'RIGHT');
          const otherIsOuter = (other.maneuver === 'STRAIGHT' || other.maneuver === 'RIGHT');
          if (egoIsOuter === otherIsOuter && other.pathDistance < minS) {
            minS = other.pathDistance;
          }
        }
      }
      if (minS > maxEntryGap) {
        maxEntryGap = minS;
        bestOption = opt;
      }
    }

    const pathKey = `${bestOption.approach}_${bestOption.maneuver}`;
    const path = this.intersection.paths[pathKey];
    const isSignalGreen = this.trafficLights.getSignal(bestOption.approach, bestOption.maneuver) === 'GREEN';

    car.approach = bestOption.approach;
    car.maneuver = bestOption.maneuver;
    car.path = path;
    car.pathDistance = 0.0;
    car.speed = isSignalGreen ? 4.0 : 0.0;
    car.acceleration = 0.0;
    car.isCleared = false;
    car.collisionDetected = false;
    car.currentAction = { action: isSignalGreen ? 'ACCELERATE' : 'MAINTAIN', throttle: 0.7, timestamp: Date.now() };
    car.syncWorldPosition();
  }

  /**
   * Main 60 FPS animation & physics loop
   */
  animate(currentTime) {
    requestAnimationFrame(this.animate);

    const deltaMs = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    if (!this.isRunning) return;

    // Fixed or capped dt for stable numerical integration
    const dt = Math.min(0.1, (deltaMs / 1000) * this.simSpeedMultiplier);

    // 1. Advance traffic lights state machine
    this.trafficLights.update(dt);

    // 2. Continuous vehicle physics integration (60 FPS)
    this.updatePhysics(dt);

    // 3. Exact OBB collision detection across all vehicle pairs
    this.checkCollisions();

    // 4. Batch LLM Decision Loop (1 Hz)
    if (currentTime - this.lastDecisionTickTime >= (CONFIG.SIMULATION.DECISION_TICK_INTERVAL_MS / this.simSpeedMultiplier)) {
      this.lastDecisionTickTime = currentTime;
      this.triggerDecisionTick();
    }

    // 5. Update Visualizers
    if (this.viewMode === '3d') {
      this.visualizer3D.update(this.vehicles, this.trafficLights);
    } else {
      this.visualizer2D.render(this.vehicles, this.trafficLights, this.selectedCarId);
    }

    // 6. Update HUD
    this.updateHUD();
  }

  /**
   * Integrate kinematics and recycle cleared cars
   */
  updatePhysics(dt) {
    for (const car of this.vehicles) {
      car.update(dt);
      if (car.isCleared) {
        this.recycleVehicle(car);
      }
    }
  }

  /**
   * Rigorous Oriented Bounding Box (OBB) collision detection
   * NO ARTIFICIAL COLLISION OVERRIDES. Vehicle motion strictly reflects LLM commands.
   */
  checkCollisions() {
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const carA = this.vehicles[i];
        const carB = this.vehicles[j];

        if (carA.isCleared || carB.isCleared) continue;

        // Quick distance culling before exact SAT check
        const dx = carA.x - carB.x;
        const dy = carA.y - carB.y;
        if (Math.hypot(dx, dy) > (CONFIG.CAR_LENGTH + CONFIG.CAR_WIDTH)) continue;

        // Exact Separating Axis Theorem (SAT) collision test
        const isColliding = Physics.checkOBBCollision(carA.corners, carB.corners);
        if (isColliding && !carA.collisionDetected) {
          carA.collisionDetected = true;
          carB.collisionDetected = true;
          this.collisionCount++;
          console.error(`COLLISION DETECTED between Car #${carA.id} and Car #${carB.id}!`);
          this.triggerCollisionAlert(carA, carB);
        }
      }
    }
  }

  /**
   * Executes ONE SINGLE BATCH LLM API CALL for all 20 vehicles
   */
  async triggerDecisionTick() {
    this.totalTicks++;

    // 1. Extract local sensor telemetry for all 20 cars (NO GLOBAL COORDINATES)
    const batchTelemetry = TelemetryExtractor.extractBatchTelemetry(this.vehicles, this.trafficLights);

    // Save telemetry on car objects for visualizer and inspector
    batchTelemetry.forEach(t => {
      const car = this.vehicles.find(c => c.id === t.id);
      if (car) car.localTelemetry = t;
    });

    // 2. Make ONE single batch API call
    const actionsMap = await this.llmService.requestBatchDecisions(batchTelemetry);

    // 3. Apply returned LLM driving actions directly to vehicle kinematics
    if (actionsMap && actionsMap.size > 0) {
      this.vehicles.forEach(car => {
        if (actionsMap.has(car.id)) {
          car.currentAction = actionsMap.get(car.id);
        }
      });
    }

    // Refresh Inspector if open
    this.updateVehicleInspector();
  }

  triggerCollisionAlert(carA, carB) {
    const banner = document.getElementById('collision-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.innerText = `CRASH DETECTED: Car #${carA.id} & Car #${carB.id}`;
      setTimeout(() => { banner.style.display = 'none'; }, 4000);
    }
  }

  updateHUD() {
    // Collision Counter (Target: 0)
    const collisionEl = document.getElementById('hud-collisions');
    if (collisionEl) {
      collisionEl.innerText = this.collisionCount;
      if (this.collisionCount > 0) {
        collisionEl.classList.add('danger-text');
      }
    }

    // Cleared Vehicles
    const clearedEl = document.getElementById('hud-cleared');
    if (clearedEl) clearedEl.innerText = this.clearedVehiclesCount;

    // LLM Latency
    const latencyEl = document.getElementById('hud-latency');
    if (latencyEl) latencyEl.innerText = `${this.llmService.lastLatencyMs} ms`;

    // Traffic Signal Phase
    const phaseEl = document.getElementById('hud-signal-phase');
    if (phaseEl) {
      phaseEl.innerText = `${this.trafficLights.getPhaseName()} (${this.trafficLights.phaseTimeRemaining.toFixed(1)}s)`;
    }

    // Throughput rate (cars/min)
    const throughputEl = document.getElementById('hud-throughput');
    if (throughputEl) {
      const simMinutes = (this.totalTicks * CONFIG.SIMULATION.DECISION_TICK_INTERVAL_MS) / 60000;
      const rate = simMinutes > 0 ? (this.clearedVehiclesCount / simMinutes).toFixed(1) : '0.0';
      throughputEl.innerText = `${rate} cars/min`;
    }

    // Active Provider
    const providerBadge = document.getElementById('hud-provider-badge');
    if (providerBadge) {
      providerBadge.innerText = this.llmService.provider.toUpperCase();
    }
  }

  updateVehicleInspector() {
    const inspectorEl = document.getElementById('inspector-content');
    if (!inspectorEl) return;

    const car = this.vehicles.find(c => c.id === this.selectedCarId);
    if (!car || !car.localTelemetry) {
      inspectorEl.innerHTML = `<p class="dimmed">No car selected</p>`;
      return;
    }

    const t = car.localTelemetry;
    const action = car.currentAction ? car.currentAction.action : 'MAINTAIN';
    const actionParam = action === 'ACCELERATE'
      ? `Throttle: ${car.currentAction.throttle}`
      : (action === 'BRAKE' ? `Intensity: ${car.currentAction.intensity}` : 'Coasting');

    inspectorEl.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <span class="car-badge" style="background:${car.color}">Car #${car.id}</span>
          <span class="action-tag action-${action.toLowerCase()}">${action} (${actionParam})</span>
        </div>
        <div class="inspector-grid">
          <div><strong>Speed:</strong> ${t.speed_mps} m/s (${(t.speed_mps * 3.6).toFixed(1)} km/h)</div>
          <div><strong>Approach:</strong> ${car.approach} (${car.maneuver})</div>
          <div><strong>Signal State:</strong> <span class="signal-${t.signal_sensor.state.toLowerCase()}">${t.signal_sensor.state}</span></div>
          <div><strong>Dist to Stop Line:</strong> ${t.signal_sensor.distance_to_stop_line_m} m</div>
          <div><strong>Front Obstacle:</strong> ${t.front_sensor.distance_m !== null ? `${t.front_sensor.distance_m} m (dv: ${t.front_sensor.relative_speed_mps} m/s)` : 'CLEAR'}</div>
          <div><strong>Rear Follower:</strong> ${t.rear_sensor.distance_m !== null ? `${t.rear_sensor.distance_m} m` : 'CLEAR'}</div>
          <div><strong>Side Proximity:</strong> L: ${t.side_sensor.left_proximity_m ?? 'None'} | R: ${t.side_sensor.right_proximity_m ?? 'None'}</div>
          <div><strong>Crossing Conflict:</strong> ${t.side_sensor.crossing_conflict_detected ? '⚠️ HAZARD' : 'SAFE'}</div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Play / Pause
    const playBtn = document.getElementById('btn-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.isRunning = !this.isRunning;
        playBtn.innerText = this.isRunning ? '⏸ Pause' : '▶ Play';
      });
    }

    // Reset Simulation
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.collisionCount = 0;
        this.clearedVehiclesCount = 0;
        this.spawnInitialFleet();
      });
    }

    // View Mode Toggle (3D WebGL vs 2D Canvas)
    const toggleViewBtn = document.getElementById('btn-toggle-view');
    if (toggleViewBtn) {
      toggleViewBtn.addEventListener('click', () => {
        this.viewMode = this.viewMode === '3d' ? '2d' : '3d';
        document.getElementById('viewport-3d').style.display = this.viewMode === '3d' ? 'block' : 'none';
        document.getElementById('canvas-2d').style.display = this.viewMode === '2d' ? 'block' : 'none';
        toggleViewBtn.innerText = this.viewMode === '3d' ? 'Switch to 2D Radar' : 'Switch to 3D Scene';
      });
    }

    // Camera Mode Buttons
    const camOrbit = document.getElementById('cam-orbit');
    const camIntersection = document.getElementById('cam-intersection');
    const camChase = document.getElementById('cam-chase');
    const camCockpit = document.getElementById('cam-cockpit');

    if (camOrbit) camOrbit.addEventListener('click', () => this.visualizer3D.setCameraMode('orbit'));
    if (camIntersection) camIntersection.addEventListener('click', () => this.visualizer3D.setCameraMode('intersection'));
    if (camChase) camChase.addEventListener('click', () => this.visualizer3D.setCameraMode('chase', this.selectedCarId));
    if (camCockpit) camCockpit.addEventListener('click', () => this.visualizer3D.setCameraMode('cockpit', this.selectedCarId));

    // Vehicle Select Dropdown
    const carSelect = document.getElementById('select-car');
    if (carSelect) {
      for (let i = 0; i < CONFIG.NUM_VEHICLES; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = `Vehicle #${i}`;
        carSelect.appendChild(opt);
      }
      carSelect.addEventListener('change', (e) => {
        this.selectedCarId = parseInt(e.target.value);
        if (this.visualizer3D.cameraMode === 'chase' || this.visualizer3D.cameraMode === 'cockpit') {
          this.visualizer3D.setCameraMode(this.visualizer3D.cameraMode, this.selectedCarId);
        }
        this.updateVehicleInspector();
      });
    }

    // Toggle Sensor Cones
    const sensorBtn = document.getElementById('btn-toggle-sensors');
    if (sensorBtn) {
      sensorBtn.addEventListener('click', () => {
        const active = this.visualizer3D.toggleSensorRays();
        sensorBtn.classList.toggle('active', active);
      });
    }

    // Trigger Yellow Dilemma Stress Test
    const yellowBtn = document.getElementById('btn-stress-yellow');
    if (yellowBtn) {
      yellowBtn.addEventListener('click', () => {
        this.trafficLights.forceYellow('N');
      });
    }

    // Simulation Speed Control
    const speedSelect = document.getElementById('select-speed');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.simSpeedMultiplier = parseFloat(e.target.value);
      });
    }

    // LLM Provider Select & Key Modal
    const providerSelect = document.getElementById('select-provider');
    const apiKeyInput = document.getElementById('input-api-key');
    const btnSaveKey = document.getElementById('btn-save-key');
    const labelApiKey = document.getElementById('label-api-key');
    const keyGroup = document.getElementById('api-key-group');

    if (apiKeyInput && this.llmService.apiKey) {
      apiKeyInput.value = this.llmService.apiKey;
    }

    if (providerSelect) {
      providerSelect.value = this.llmService.provider;
      const updateKeyLabels = (prov) => {
        if (!labelApiKey || !keyGroup) return;
        if (prov === 'gemini') {
          keyGroup.style.display = 'block';
          labelApiKey.innerHTML = `Gemini API Key (<a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent-cyan);text-decoration:underline;">Get free key</a>):`;
        } else if (prov === 'groq') {
          keyGroup.style.display = 'block';
          labelApiKey.innerHTML = `Groq API Key (<a href="https://console.groq.com/keys" target="_blank" style="color:var(--accent-cyan);text-decoration:underline;">Get free key</a>):`;
        } else if (prov === 'openai') {
          keyGroup.style.display = 'block';
          labelApiKey.innerHTML = `OpenAI API Key:`;
        } else if (prov === 'ollama') {
          keyGroup.style.display = 'block';
          labelApiKey.innerHTML = `Ollama Endpoint (default http://localhost:11434):`;
        } else {
          keyGroup.style.display = 'none';
        }
      };

      updateKeyLabels(providerSelect.value);

      providerSelect.addEventListener('change', (e) => {
        const prov = e.target.value;
        this.llmService.setProvider(prov);
        updateKeyLabels(prov);
      });
    }

    if (btnSaveKey && apiKeyInput) {
      btnSaveKey.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
          this.llmService.setProvider(providerSelect.value, key);
          alert(`Connected to ${providerSelect.value.toUpperCase()} API! Driving decisions are now 100% LLM generated.`);
        }
      });
    }

    // Raw Prompt & Response Modal / Tabs
    const btnViewPrompt = document.getElementById('btn-view-prompt');
    const modalPrompt = document.getElementById('modal-prompt');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const promptTextEl = document.getElementById('raw-prompt-text');
    const responseTextEl = document.getElementById('raw-response-text');

    if (btnViewPrompt && modalPrompt) {
      btnViewPrompt.addEventListener('click', () => {
        promptTextEl.innerText = this.llmService.lastPrompt || 'No batch request generated yet.';
        responseTextEl.innerText = this.llmService.lastResponse || 'No response received yet.';
        modalPrompt.style.display = 'flex';
      });
    }

    if (btnCloseModal && modalPrompt) {
      btnCloseModal.addEventListener('click', () => {
        modalPrompt.style.display = 'none';
      });
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
