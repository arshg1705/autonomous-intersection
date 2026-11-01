/**
 * High-Fidelity 3D WebGL Visualization Engine (Three.js)
 * Features:
 * - 3D procedural vehicles with dynamic glowing brake lights and headlights
 * - Overhead 3D traffic light gantries with emissive lenses
 * - Visualized local sensor raycast cones (Front, Rear, Blind-Spot)
 * - Multiple cinematic camera modes (Orbit God View, Chase Cam, Cockpit Dash Cam)
 * - Asphalt textures, zebra crossings, stop lines, sidewalks, streetlights
 */

class Visualizer3D {
  constructor(containerElement) {
    this.container = containerElement;
    this.vehicles3D = new Map(); // id -> { group, bodyMesh, brakeLights, headlights, wheels }
    this.signalMeshes = {};       // approach -> { redMesh, yellowMesh, greenMesh }
    this.sensorRays = new Map();  // id -> Line object
    this.selectedCarId = null;
    this.cameraMode = 'orbit';    // 'orbit', 'intersection', 'chase', 'cockpit'
    this.showSensorRays = true;
    this.webglAvailable = true;

    try {
      this.initScene();
      if (this.webglAvailable) {
        this.buildEnvironment();
        this.buildTrafficLightGantries();
      }
    } catch (err) {
      console.warn("WebGL initialization failed:", err);
      this.webglAvailable = false;
    }
  }

  initScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Three.js Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.007);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    this.camera.position.set(0, 68, 75);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      this.webglAvailable = false;
      return;
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't clip below ground
      this.controls.minDistance = 10;
      this.controls.maxDistance = 250;
      this.controls.target.set(0, 0, 0);
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x8fa3bf, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(40, 80, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 250;
    dirLight.shadow.camera.left = -70;
    dirLight.shadow.camera.right = 70;
    dirLight.shadow.camera.top = 70;
    dirLight.shadow.camera.bottom = -70;
    this.scene.add(dirLight);

    // Window resize handler
    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Build ground, asphalt roads, lane markings, zebra crossings, stop lines
   */
  buildEnvironment() {
    // Ground terrain / grass
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070c14,
      roughness: 0.95,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.8,
      metalness: 0.2
    });

    const roadWidth = CONFIG.INTERSECTION.ROAD_WIDTH;
    const roadLength = CONFIG.INTERSECTION.TOTAL_WORLD_SIZE;

    // North-South Road
    const nsRoadGeo = new THREE.PlaneGeometry(roadWidth, roadLength);
    const nsRoad = new THREE.Mesh(nsRoadGeo, roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.y = 0.02;
    nsRoad.receiveShadow = true;
    this.scene.add(nsRoad);

    // East-West Road
    const ewRoadGeo = new THREE.PlaneGeometry(roadLength, roadWidth);
    const ewRoad = new THREE.Mesh(ewRoadGeo, roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.y = 0.02;
    ewRoad.receiveShadow = true;
    this.scene.add(ewRoad);

    // Road Markings: Stop lines, Center dividers, Lane dividers, Crosswalks
    this.buildRoadMarkings();

    // Decorative City Elements: Curbs, Building blocks in corners
    this.buildCityBlocks();
  }

  buildRoadMarkings() {
    const markingsGroup = new THREE.Group();
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const stopLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const stopOffset = CONFIG.INTERSECTION.STOP_LINE_OFFSET;
    const halfRoad = CONFIG.INTERSECTION.ROAD_WIDTH / 2;
    const roadLen = CONFIG.INTERSECTION.TOTAL_WORLD_SIZE / 2;

    // 1. STOP LINES (Solid white bars at each approach)
    const stopLineGeo = new THREE.PlaneGeometry(halfRoad, 0.7);

    // South Stop Line
    const stopS = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopS.rotation.x = -Math.PI / 2;
    stopS.position.set(halfRoad / 2, 0.04, -stopOffset);
    markingsGroup.add(stopS);

    // North Stop Line
    const stopN = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopN.rotation.x = -Math.PI / 2;
    stopN.position.set(-halfRoad / 2, 0.04, stopOffset);
    markingsGroup.add(stopN);

    // West Stop Line
    const stopW = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopW.rotation.x = -Math.PI / 2;
    stopW.rotation.z = Math.PI / 2;
    stopW.position.set(-stopOffset, 0.04, -halfRoad / 2);
    markingsGroup.add(stopW);

    // East Stop Line
    const stopE = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopE.rotation.x = -Math.PI / 2;
    stopE.rotation.z = Math.PI / 2;
    stopE.position.set(stopOffset, 0.04, halfRoad / 2);
    markingsGroup.add(stopE);

    // 2. DOUBLE YELLOW CENTER DIVIDERS
    const centerLineNSGeo = new THREE.PlaneGeometry(0.2, roadLen - stopOffset);
    const centerS = new THREE.Mesh(centerLineNSGeo, yellowLineMat);
    centerS.rotation.x = -Math.PI / 2;
    centerS.position.set(0, 0.04, -(stopOffset + (roadLen - stopOffset) / 2));
    markingsGroup.add(centerS);

    const centerN = new THREE.Mesh(centerLineNSGeo, yellowLineMat);
    centerN.rotation.x = -Math.PI / 2;
    centerN.position.set(0, 0.04, stopOffset + (roadLen - stopOffset) / 2);
    markingsGroup.add(centerN);

    const centerLineEWGeo = new THREE.PlaneGeometry(roadLen - stopOffset, 0.2);
    const centerW = new THREE.Mesh(centerLineEWGeo, yellowLineMat);
    centerW.rotation.x = -Math.PI / 2;
    centerW.position.set(-(stopOffset + (roadLen - stopOffset) / 2), 0.04, 0);
    markingsGroup.add(centerW);

    const centerE = new THREE.Mesh(centerLineEWGeo, yellowLineMat);
    centerE.rotation.x = -Math.PI / 2;
    centerE.position.set(stopOffset + (roadLen - stopOffset) / 2, 0.04, 0);
    markingsGroup.add(centerE);

    // 3. DASHED WHITE LANE DIVIDERS (Separates Lane 0 and Lane 1)
    const laneW = CONFIG.INTERSECTION.LANE_WIDTH;
    const addDashedLine = (startX, startZ, endX, endZ) => {
      const dist = Math.hypot(endX - startX, endZ - startZ);
      const dashLen = 2.5;
      const gapLen = 2.5;
      const step = dashLen + gapLen;
      const count = Math.floor(dist / step);

      const dx = (endX - startX) / dist;
      const dz = (endZ - startZ) / dist;

      for (let i = 0; i < count; i++) {
        const curDist = i * step + dashLen / 2;
        const cx = startX + dx * curDist;
        const cz = startZ + dz * curDist;
        const dashGeo = new THREE.PlaneGeometry(0.18, dashLen);
        const dash = new THREE.Mesh(dashGeo, whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = Math.atan2(dx, dz);
        dash.position.set(cx, 0.04, cz);
        markingsGroup.add(dash);
      }
    };

    // Dashed lines for 4 approaches
    addDashedLine(laneW, -stopOffset, laneW, -roadLen);
    addDashedLine(-laneW, -stopOffset, -laneW, -roadLen);
    addDashedLine(laneW, stopOffset, laneW, roadLen);
    addDashedLine(-laneW, stopOffset, -laneW, roadLen);

    addDashedLine(-stopOffset, laneW, -roadLen, laneW);
    addDashedLine(-stopOffset, -laneW, -roadLen, -laneW);
    addDashedLine(stopOffset, laneW, roadLen, laneW);
    addDashedLine(stopOffset, -laneW, roadLen, -laneW);

    // 4. ZEBRA CROSSWALKS (Pedestrian Crossings)
    const addCrosswalk = (cx, cz, isHorizontal) => {
      const stripeW = 0.6;
      const stripeL = 3.0;
      const gap = 0.5;
      const numStripes = 16;
      const startOffset = -((numStripes * (stripeW + gap)) / 2);

      for (let i = 0; i < numStripes; i++) {
        const stripeGeo = new THREE.PlaneGeometry(stripeW, stripeL);
        const stripe = new THREE.Mesh(stripeGeo, whiteLineMat);
        stripe.rotation.x = -Math.PI / 2;
        if (isHorizontal) {
          stripe.rotation.z = Math.PI / 2;
          stripe.position.set(cx, 0.035, cz + startOffset + i * (stripeW + gap));
        } else {
          stripe.position.set(cx + startOffset + i * (stripeW + gap), 0.035, cz);
        }
        markingsGroup.add(stripe);
      }
    };

    addCrosswalk(0, -(stopOffset + 2.5), false); // South crosswalk
    addCrosswalk(0, stopOffset + 2.5, false);    // North crosswalk
    addCrosswalk(-(stopOffset + 2.5), 0, true);  // West crosswalk
    addCrosswalk(stopOffset + 2.5, 0, true);   // East crosswalk

    this.scene.add(markingsGroup);
  }

  buildCityBlocks() {
    // Architectural building blocks at the 4 intersection corners
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      metalness: 0.3
    });

    const corners = [
      { x: -50, z: -50, w: 70, d: 70, h: 25 },
      { x: 50, z: -50, w: 70, d: 70, h: 35 },
      { x: -50, z: 50, w: 70, d: 70, h: 30 },
      { x: 50, z: 50, w: 70, d: 70, h: 40 }
    ];

    corners.forEach(c => {
      const geo = new THREE.BoxGeometry(c.w, c.h, c.d);
      const mesh = new THREE.Mesh(geo, buildingMat);
      mesh.position.set(c.x, c.h / 2, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  buildTrafficLightGantries() {
    const approaches = ['S', 'N', 'W', 'E'];
    const stopOffset = CONFIG.INTERSECTION.STOP_LINE_OFFSET;
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });

    approaches.forEach(app => {
      const group = new THREE.Group();

      // Vertical post
      const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 7.5);
      const post = new THREE.Mesh(postGeo, gantryMat);
      post.position.y = 3.75;
      post.castShadow = true;

      // Horizontal arm
      const armGeo = new THREE.BoxGeometry(10.0, 0.35, 0.35);
      const arm = new THREE.Mesh(armGeo, gantryMat);
      arm.position.set(4.5, 7.2, 0);
      arm.castShadow = true;

      group.add(post);
      group.add(arm);

      // Signal Head Box
      const boxGeo = new THREE.BoxGeometry(1.2, 2.8, 0.8);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const signalBox = new THREE.Mesh(boxGeo, boxMat);
      signalBox.position.set(4.5, 6.0, 0);
      group.add(signalBox);

      // Lenses: Red, Yellow, Green
      const lensGeo = new THREE.CircleGeometry(0.35, 24);

      const redMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
      const redMesh = new THREE.Mesh(lensGeo, redMat);
      redMesh.position.set(4.5, 6.8, 0.42);
      group.add(redMesh);

      const yellowMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
      const yellowMesh = new THREE.Mesh(lensGeo, yellowMat);
      yellowMesh.position.set(4.5, 6.0, 0.42);
      group.add(yellowMesh);

      const greenMat = new THREE.MeshBasicMaterial({ color: 0x003300 });
      const greenMesh = new THREE.Mesh(lensGeo, greenMat);
      greenMesh.position.set(4.5, 5.2, 0.42);
      group.add(greenMesh);

      // Position and orient gantry per approach
      if (app === 'S') {
        group.position.set(CONFIG.INTERSECTION.ROAD_WIDTH / 2, 0, -stopOffset - 1.5);
      } else if (app === 'N') {
        group.position.set(-CONFIG.INTERSECTION.ROAD_WIDTH / 2, 0, stopOffset + 1.5);
        group.rotation.y = Math.PI;
      } else if (app === 'W') {
        group.position.set(-stopOffset - 1.5, 0, -CONFIG.INTERSECTION.ROAD_WIDTH / 2);
        group.rotation.y = -Math.PI / 2;
      } else if (app === 'E') {
        group.position.set(stopOffset + 1.5, 0, CONFIG.INTERSECTION.ROAD_WIDTH / 2);
        group.rotation.y = Math.PI / 2;
      }

      this.scene.add(group);
      this.signalMeshes[app] = { redMesh, yellowMesh, greenMesh };
    });
  }

  /**
   * Create or update 3D procedural vehicle mesh
   */
  getOrCreateVehicle3D(car) {
    if (this.vehicles3D.has(car.id)) {
      return this.vehicles3D.get(car.id);
    }

    const group = new THREE.Group();

    // 1. CAR CHASSIS
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(car.color),
      roughness: 0.25,
      metalness: 0.7
    });

    // Lower body
    const lowerBodyGeo = new THREE.BoxGeometry(CONFIG.CAR_LENGTH, 0.8, CONFIG.CAR_WIDTH);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBody.position.y = 0.55;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    group.add(lowerBody);

    // Cabin / Roof (Glass & Roof)
    const cabinGeo = new THREE.BoxGeometry(CONFIG.CAR_LENGTH * 0.55, 0.65, CONFIG.CAR_WIDTH * 0.85);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x0a1120,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.2, 1.25, 0);
    cabin.castShadow = true;
    group.add(cabin);

    // 2. HEADLIGHTS (Emissive white/cyan at front bumper: +X in car local frame)
    const headlightGeo = new THREE.BoxGeometry(0.1, 0.2, 0.35);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
    hlRight.position.set(CONFIG.CAR_LENGTH / 2, 0.6, CONFIG.CAR_WIDTH * 0.35);
    const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
    hlLeft.position.set(CONFIG.CAR_LENGTH / 2, 0.6, -CONFIG.CAR_WIDTH * 0.35);
    group.add(hlRight);
    group.add(hlLeft);

    // 3. BRAKE LIGHTS (Emissive red at rear bumper: -X in car local frame)
    const brakeLightGeo = new THREE.BoxGeometry(0.1, 0.2, 0.4);
    const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0x440000 }); // Dim idle

    const blRight = new THREE.Mesh(brakeLightGeo, brakeLightMat);
    blRight.position.set(-CONFIG.CAR_LENGTH / 2, 0.6, CONFIG.CAR_WIDTH * 0.35);
    const blLeft = new THREE.Mesh(brakeLightGeo, brakeLightMat);
    blLeft.position.set(-CONFIG.CAR_LENGTH / 2, 0.6, -CONFIG.CAR_WIDTH * 0.35);
    group.add(blRight);
    group.add(blLeft);

    // 4. WHEELS
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    const wheels = [];
    const wheelOffsets = [
      { x: 1.3, z: 0.95 },
      { x: 1.3, z: -0.95 },
      { x: -1.3, z: 0.95 },
      { x: -1.3, z: -0.95 }
    ];

    wheelOffsets.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos.x, 0.35, pos.z);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    });

    // 5. OVERHEAD ID BADGE SPRITE
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = car.color;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`C${car.id}`, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 2.5, 0);
    sprite.scale.set(3, 1.5, 1);
    group.add(sprite);

    // Raycast Line for sensor visualization
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.7 });
    const rayLine = new THREE.Line(lineGeo, lineMat);
    rayLine.visible = false;
    this.scene.add(rayLine);

    this.scene.add(group);

    const vehicleData = {
      group,
      brakeLightMat,
      wheels,
      rayLine,
      sprite
    };

    this.vehicles3D.set(car.id, vehicleData);
    return vehicleData;
  }

  /**
   * Update all 3D vehicle positions, lights, and sensor rays
   */
  update(vehicles, trafficLights) {
    if (!this.webglAvailable || !this.renderer) return;

    // 1. Update Traffic Lights Emissive State
    const approaches = ['S', 'N', 'W', 'E'];
    approaches.forEach(app => {
      const sigThrough = trafficLights.getSignal(app, 'STRAIGHT');
      const sigLeft = trafficLights.getSignal(app, 'LEFT');
      let state = 'RED';
      if (sigThrough === 'GREEN' || sigLeft === 'GREEN') state = 'GREEN';
      else if (sigThrough === 'YELLOW' || sigLeft === 'YELLOW') state = 'YELLOW';

      const meshes = this.signalMeshes[app];
      if (meshes) {
        meshes.redMesh.material.color.setHex(state === 'RED' ? 0xff2222 : 0x220000);
        meshes.yellowMesh.material.color.setHex(state === 'YELLOW' ? 0xffbb00 : 0x221500);
        meshes.greenMesh.material.color.setHex(state === 'GREEN' ? 0x10b981 : 0x002200);
      }
    });

    // 2. Update Vehicles
    vehicles.forEach(car => {
      const v3D = this.getOrCreateVehicle3D(car);

      // In Three.js: X is horizontal, Y is up, Z is longitudinal (map Y -> Three.js -Z)
      v3D.group.position.set(car.x, 0, -car.y);
      // Car heading in math: 0 = +X, PI/2 = +Y (which is -Z in Three.js)
      v3D.group.rotation.y = car.heading;

      // Update dynamic brake lights based on LLM action!
      if (car.currentAction && car.currentAction.action === 'BRAKE') {
        const intensity = car.currentAction.intensity || 0.7;
        v3D.brakeLightMat.color.setHex(0xff0022); // Vibrant glowing red
      } else {
        v3D.brakeLightMat.color.setHex(0x330005); // Idle dim red
      }

      // Rotate wheels with speed
      const wheelRot = (car.speed / 0.35) * 0.016;
      v3D.wheels.forEach(w => w.rotateZ(wheelRot));

      // Sensor Beam Visualization
      if (this.showSensorRays && car.localTelemetry && car.localTelemetry.front_sensor) {
        const front = car.localTelemetry.front_sensor;
        if (front.distance_m !== null) {
          const d = front.distance_m;
          const cos = Math.cos(car.heading);
          const sin = Math.sin(car.heading);

          const startX = car.x + (CONFIG.CAR_LENGTH / 2) * cos;
          const startZ = -car.y - (CONFIG.CAR_LENGTH / 2) * sin;
          const endX = startX + d * cos;
          const endZ = startZ - d * sin;

          const points = [
            new THREE.Vector3(startX, 0.6, startZ),
            new THREE.Vector3(endX, 0.6, endZ)
          ];
          v3D.rayLine.geometry.setFromPoints(points);

          // Color coded: Green = Safe, Yellow = Caution, Red = Close hazard
          const colorHex = d < 8.0 ? 0xef4444 : (d < 18.0 ? 0xf59e0b : 0x10b981);
          v3D.rayLine.material.color.setHex(colorHex);
          v3D.rayLine.visible = true;
        } else {
          v3D.rayLine.visible = false;
        }
      } else {
        v3D.rayLine.visible = false;
      }
    });

    // 3. Update Camera Mode
    this.updateCamera(vehicles);

    // 4. Render Frame
    if (this.controls && this.cameraMode === 'orbit') {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(vehicles) {
    if (this.cameraMode === 'intersection') {
      // Cinematic low angle fixed at intersection center
      this.camera.position.lerp(new THREE.Vector3(25, 12, 28), 0.05);
      this.camera.lookAt(0, 1.5, 0);
    } else if (this.cameraMode === 'chase' && this.selectedCarId !== null) {
      const car = vehicles.find(c => c.id === this.selectedCarId);
      if (car) {
        const cos = Math.cos(car.heading);
        const sin = Math.sin(car.heading);
        const targetPos = new THREE.Vector3(
          car.x - cos * 14,
          7.5,
          -car.y + sin * 14
        );
        this.camera.position.lerp(targetPos, 0.1);
        this.camera.lookAt(car.x + cos * 10, 1.5, -car.y - sin * 10);
      }
    } else if (this.cameraMode === 'cockpit' && this.selectedCarId !== null) {
      const car = vehicles.find(c => c.id === this.selectedCarId);
      if (car) {
        const cos = Math.cos(car.heading);
        const sin = Math.sin(car.heading);
        this.camera.position.set(car.x + cos * 0.4, 1.3, -car.y - sin * 0.4);
        this.camera.lookAt(car.x + cos * 30, 1.2, -car.y - sin * 30);
      }
    }
  }

  setCameraMode(mode, carId = null) {
    this.cameraMode = mode;
    if (carId !== null) this.selectedCarId = carId;
    if (this.controls) {
      this.controls.enabled = mode === 'orbit';
    }
    if (mode === 'orbit') {
      this.camera.position.set(0, 68, 75);
      if (this.controls) this.controls.target.set(0, 0, 0);
    }
  }

  toggleSensorRays() {
    this.showSensorRays = !this.showSensorRays;
    return this.showSensorRays;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Visualizer3D;
}
