import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  createIcons,
} from "lucide";
import "./style.css";

const START_TIME = -400;
const OBSERVED_END = 0;
const FORECAST_END = 80;
const BASE_SIMULATION_RATE = 100;
const COLORS = {
  background: 0x07110f,
  cyan: 0x4ce3ce,
  cyanDim: 0x237f73,
  amber: 0xffca62,
  coral: 0xff796b,
  green: 0x78db8d,
  grid: 0x253d36,
  gridCenter: 0x557168,
  white: 0xeef8f4,
};
const ICONS = {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
};

const elements = {
  scene: document.querySelector("#scene"),
  loading: document.querySelector("#loading-state"),
  error: document.querySelector("#error-state"),
  systemStatus: document.querySelector("#system-status"),
  sampleCount: document.querySelector("#sample-count"),
  trackId: document.querySelector("#track-id"),
  phaseBadge: document.querySelector("#phase-badge"),
  coordX: document.querySelector("#coord-x"),
  coordY: document.querySelector("#coord-y"),
  coordZ: document.querySelector("#coord-z"),
  simTime: document.querySelector("#sim-time"),
  visualScale: document.querySelector("#visual-scale"),
  forecastDistance: document.querySelector("#forecast-distance"),
  sampleInput: document.querySelector("#sample-input"),
  previousSample: document.querySelector("#previous-sample"),
  nextSample: document.querySelector("#next-sample"),
  randomSample: document.querySelector("#random-sample"),
  modelControl: document.querySelector("#model-control"),
  speedControl: document.querySelector("#speed-control"),
  resetCamera: document.querySelector("#reset-camera"),
  playToggle: document.querySelector("#play-toggle"),
  restart: document.querySelector("#restart"),
  timelineProgress: document.querySelector("#timeline-progress"),
  timelineCursor: document.querySelector("#timeline-cursor"),
  frameNumber: document.querySelector("#frame-number"),
};

const state = {
  data: null,
  samplesById: new Map(),
  sampleIndex: 0,
  method: "best",
  speed: 1,
  playing: true,
  currentTime: START_TIME,
  loopHoldUntil: null,
  lastFrameAt: performance.now(),
  center: [0, 0, 0],
  sceneScale: 1,
  floorY: -2,
};

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(COLORS.background, 1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
elements.scene.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
scene.fog = new THREE.Fog(COLORS.background, 18, 34);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.05,
  100,
);
camera.position.set(10, 7.5, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.86;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbde7dc, 0x1b261f, 1.15));
const keyLight = new THREE.DirectionalLight(0xffe1a8, 1.35);
keyLight.position.set(6, 10, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const fillLight = new THREE.PointLight(COLORS.cyan, 0.85, 18);
fillLight.position.set(-5, 3, -4);
scene.add(fillLight);

const grid = new THREE.GridHelper(16, 16, COLORS.gridCenter, COLORS.grid);
grid.material.transparent = true;
grid.material.opacity = 0.52;
scene.add(grid);

const radarGroup = createRadarFloor();
scene.add(radarGroup);

const axesGroup = createAxes();
scene.add(axesGroup);

const trajectoryGroup = new THREE.Group();
scene.add(trajectoryGroup);

const drone = createDrone();
scene.add(drone.group);

const targetMarker = createTargetMarker();
targetMarker.visible = false;
scene.add(targetMarker);

let fullObservedLine = null;
let traversedLine = null;
let forecastLine = null;
let observedMarkers = [];

function createRadarFloor() {
  const group = new THREE.Group();
  const ringMaterial = new THREE.LineBasicMaterial({
    color: COLORS.cyanDim,
    transparent: true,
    opacity: 0.24,
  });

  for (const radius of [2, 4, 6]) {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
    const ring = new THREE.LineLoop(geometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  const sweepGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(6, 0, 0),
  ]);
  const sweepMaterial = new THREE.LineBasicMaterial({
    color: COLORS.green,
    transparent: true,
    opacity: 0.42,
  });
  const sweep = new THREE.Line(sweepGeometry, sweepMaterial);
  sweep.name = "radar-sweep";
  group.add(sweep);
  return group;
}

function createAxes() {
  const group = new THREE.Group();
  const definitions = [
    {
      direction: new THREE.Vector3(1, 0, 0),
      color: COLORS.cyan,
      label: "X FORWARD",
      labelPosition: new THREE.Vector3(2.2, 0.1, 0),
    },
    {
      direction: new THREE.Vector3(0, 0, -1),
      color: COLORS.coral,
      label: "Y LEFT",
      labelPosition: new THREE.Vector3(0, 0.1, -2.2),
    },
    {
      direction: new THREE.Vector3(0, 1, 0),
      color: COLORS.amber,
      label: "Z UP",
      labelPosition: new THREE.Vector3(0, 2.25, 0),
    },
  ];

  for (const definition of definitions) {
    const arrow = new THREE.ArrowHelper(
      definition.direction,
      new THREE.Vector3(0, 0, 0),
      1.8,
      definition.color,
      0.18,
      0.09,
    );
    const label = makeTextSprite(definition.label, `#${definition.color.toString(16).padStart(6, "0")}`);
    label.position.copy(definition.labelPosition);
    group.add(arrow, label);
  }
  return group;
}

function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "700 31px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(4, 12, 10, 0.8)";
  context.fillRect(3, 13, canvas.width - 6, canvas.height - 26);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(3, 13, canvas.width - 6, canvas.height - 26);
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function createDrone() {
  const group = new THREE.Group();
  const rotorGroups = [];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.amber,
    roughness: 0.42,
    metalness: 0.52,
    emissive: 0x3f2c08,
    emissiveIntensity: 0.45,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x18231f,
    roughness: 0.56,
    metalness: 0.68,
  });
  const rotorMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    transparent: true,
    opacity: 0.72,
    emissive: 0x123f38,
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.31, 0.14, 8), bodyMaterial);
  body.castShadow = true;
  group.add(body);

  const armX = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.055, 0.08), darkMaterial);
  const armZ = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 1.0), darkMaterial);
  armX.castShadow = true;
  armZ.castShadow = true;
  group.add(armX, armZ);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), bodyMaterial);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 0.39;
  group.add(nose);

  for (const [x, z] of [
    [-0.5, -0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
  ]) {
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(x, 0.03, z);
    const rotor = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 24), rotorMaterial);
    rotor.rotation.x = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.014, 0.035), rotorMaterial);
    blade.position.y = 0.008;
    rotorGroup.add(rotor, blade);
    rotorGroups.push(rotorGroup);
    group.add(rotorGroup);
  }

  const glow = new THREE.PointLight(COLORS.amber, 1.1, 3);
  glow.position.y = -0.12;
  group.add(glow);
  group.scale.setScalar(0.72);
  return { group, rotorGroups };
}

function createTargetMarker() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: COLORS.coral,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 48), material);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 36), material);
  group.add(outer, inner);

  const crossMaterial = new THREE.LineBasicMaterial({
    color: COLORS.coral,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
  });
  const cross = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.54, 0, 0),
      new THREE.Vector3(-0.27, 0, 0),
      new THREE.Vector3(0.27, 0, 0),
      new THREE.Vector3(0.54, 0, 0),
      new THREE.Vector3(0, -0.54, 0),
      new THREE.Vector3(0, -0.27, 0),
      new THREE.Vector3(0, 0.27, 0),
      new THREE.Vector3(0, 0.54, 0),
    ]),
    crossMaterial,
  );
  group.add(cross);
  group.renderOrder = 8;
  return group;
}

function makeLine(points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  trajectoryGroup.add(line);
  return line;
}

function clearTrajectory() {
  while (trajectoryGroup.children.length) {
    const child = trajectoryGroup.children.pop();
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  }
  observedMarkers = [];
}

function calculateViewTransform(sample) {
  const allPoints = [
    ...sample.observed,
    ...Object.values(sample.predictions),
  ];
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];

  for (const point of allPoints) {
    for (let axis = 0; axis < 3; axis += 1) {
      mins[axis] = Math.min(mins[axis], point[axis]);
      maxs[axis] = Math.max(maxs[axis], point[axis]);
    }
  }

  state.center = mins.map((value, axis) => (value + maxs[axis]) / 2);
  const span = Math.max(
    maxs[0] - mins[0],
    maxs[1] - mins[1],
    maxs[2] - mins[2],
    0.025,
  );
  state.sceneScale = THREE.MathUtils.clamp(7.5 / span, 20, 220);

  const worldPoints = allPoints.map(toWorld);
  state.floorY = Math.min(...worldPoints.map((point) => point.y)) - 1.35;
  grid.position.y = state.floorY;
  radarGroup.position.y = state.floorY + 0.015;
  axesGroup.position.set(-5.2, state.floorY + 0.04, 4.6);
  elements.visualScale.textContent = `x${Math.round(state.sceneScale)}`;
}

function toWorld(point) {
  return new THREE.Vector3(
    (point[0] - state.center[0]) * state.sceneScale,
    (point[2] - state.center[2]) * state.sceneScale,
    -(point[1] - state.center[1]) * state.sceneScale,
  );
}

function activeSample() {
  return state.data.samples[state.sampleIndex];
}

function activePrediction() {
  return activeSample().predictions[state.method];
}

function rebuildTrajectory() {
  const sample = activeSample();
  calculateViewTransform(sample);
  clearTrajectory();

  const observedWorld = sample.observed.map(toWorld);
  fullObservedLine = makeLine(
    observedWorld,
    new THREE.LineBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.16,
    }),
  );
  traversedLine = makeLine(
    [observedWorld[0], observedWorld[0]],
    new THREE.LineBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.95,
    }),
  );

  forecastLine = makeLine(
    [observedWorld.at(-1), toWorld(activePrediction())],
    new THREE.LineDashedMaterial({
      color: COLORS.amber,
      dashSize: 0.18,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.9,
    }),
  );
  forecastLine.computeLineDistances();
  forecastLine.visible = state.currentTime >= OBSERVED_END;

  const markerGeometry = new THREE.SphereGeometry(0.075, 16, 12);
  for (const [index, point] of observedWorld.entries()) {
    const material = new THREE.MeshBasicMaterial({
      color: index === observedWorld.length - 1 ? COLORS.white : COLORS.cyan,
      transparent: true,
      opacity: 0.12,
    });
    const marker = new THREE.Mesh(markerGeometry.clone(), material);
    marker.position.copy(point);
    marker.userData.timestep = state.data.timesteps[index];
    trajectoryGroup.add(marker);
    observedMarkers.push(marker);
  }

  targetMarker.position.copy(toWorld(activePrediction()));
  targetMarker.visible = state.currentTime >= OBSERVED_END;
  updateSceneForTime();
}

function interpolateDataPoint(time) {
  const sample = activeSample();
  if (time <= START_TIME) {
    return [...sample.observed[0]];
  }
  if (time >= OBSERVED_END) {
    const ratio = THREE.MathUtils.clamp(time / FORECAST_END, 0, 1);
    return sample.observed.at(-1).map(
      (value, axis) => THREE.MathUtils.lerp(value, activePrediction()[axis], ratio),
    );
  }

  const segment = Math.min(
    Math.floor((time - START_TIME) / 40),
    sample.observed.length - 2,
  );
  const segmentStart = state.data.timesteps[segment];
  const ratio = (time - segmentStart) / 40;
  return sample.observed[segment].map(
    (value, axis) => THREE.MathUtils.lerp(value, sample.observed[segment + 1][axis], ratio),
  );
}

function traversedWorldPoints(time, currentPoint) {
  const sample = activeSample();
  if (time >= OBSERVED_END) {
    return sample.observed.map(toWorld);
  }

  const completeCount = Math.max(
    1,
    Math.min(sample.observed.length, Math.floor((time - START_TIME) / 40) + 1),
  );
  const points = sample.observed.slice(0, completeCount).map(toWorld);
  const lastPoint = points.at(-1);
  const currentWorld = toWorld(currentPoint);
  if (!lastPoint.equals(currentWorld)) {
    points.push(currentWorld);
  }
  if (points.length === 1) {
    points.push(points[0].clone());
  }
  return points;
}

function updateSceneForTime() {
  if (!state.data) {
    return;
  }

  const currentPoint = interpolateDataPoint(state.currentTime);
  const currentWorld = toWorld(currentPoint);
  drone.group.position.copy(currentWorld);
  drone.group.position.y += 0.08 + Math.sin(performance.now() * 0.004) * 0.045;

  const lookAheadTime = Math.min(state.currentTime + 3, FORECAST_END);
  const aheadWorld = toWorld(interpolateDataPoint(lookAheadTime));
  const direction = aheadWorld.clone().sub(currentWorld);
  if (direction.lengthSq() > 0.00001) {
    drone.group.rotation.y = Math.atan2(-direction.z, direction.x);
  }

  traversedLine.geometry.dispose();
  traversedLine.geometry = new THREE.BufferGeometry().setFromPoints(
    traversedWorldPoints(state.currentTime, currentPoint),
  );

  for (const marker of observedMarkers) {
    const reached = marker.userData.timestep <= state.currentTime;
    marker.material.opacity = reached ? 0.96 : 0.1;
    marker.scale.setScalar(reached ? 1 : 0.72);
  }

  const forecasting = state.currentTime >= OBSERVED_END;
  forecastLine.visible = forecasting;
  targetMarker.visible = forecasting;
  targetMarker.position.copy(toWorld(activePrediction()));

  updateTelemetry(currentPoint, forecasting);
}

function updateTelemetry(point, forecasting) {
  const phase = forecasting ? "예측" : "관측";
  elements.phaseBadge.textContent = phase;
  elements.phaseBadge.classList.toggle("forecast", forecasting);
  elements.systemStatus.textContent = forecasting ? "FORECAST LINK" : "TRACKING LIVE";
  elements.coordX.innerHTML = `${point[0].toFixed(6)} <small>m</small>`;
  elements.coordY.innerHTML = `${point[1].toFixed(6)} <small>m</small>`;
  elements.coordZ.innerHTML = `${point[2].toFixed(6)} <small>m</small>`;

  const roundedTime = Math.round(state.currentTime);
  elements.simTime.textContent = `${roundedTime > 0 ? "+" : ""}${roundedTime} ms`;

  const totalProgress = (state.currentTime - START_TIME) / (FORECAST_END - START_TIME);
  const progressPercent = THREE.MathUtils.clamp(totalProgress * 100, 0, 100);
  elements.timelineProgress.style.width = `${progressPercent}%`;
  elements.timelineCursor.style.left = `${progressPercent}%`;
  elements.timelineProgress.classList.toggle("forecast", forecasting);
  elements.timelineCursor.classList.toggle("forecast", forecasting);

  const observedFrame = Math.floor((Math.min(state.currentTime, 0) - START_TIME) / 40) + 1;
  const frame = forecasting ? 12 : THREE.MathUtils.clamp(observedFrame, 1, 11);
  elements.frameNumber.textContent = `${String(frame).padStart(2, "0")} / 12`;
}

function setSample(index) {
  const sampleCount = state.data.samples.length;
  state.sampleIndex = (index + sampleCount) % sampleCount;
  const sample = activeSample();
  elements.trackId.textContent = sample.id;
  elements.sampleInput.value = sample.id;
  window.history.replaceState(null, "", `#${sample.id}`);
  restartPlayback();
  rebuildTrajectory();
}

function setMethod(method) {
  if (!activeSample().predictions[method]) {
    return;
  }
  state.method = method;
  elements.modelControl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.method === method);
  });
  rebuildTrajectory();
  updateForecastDistance();
}

function updateForecastDistance() {
  const last = activeSample().observed.at(-1);
  const prediction = activePrediction();
  const distanceMeters = Math.hypot(
    prediction[0] - last[0],
    prediction[1] - last[1],
    prediction[2] - last[2],
  );
  elements.forecastDistance.textContent = `${(distanceMeters * 100).toFixed(2)} cm`;
}

function restartPlayback() {
  state.currentTime = START_TIME;
  state.playing = true;
  state.loopHoldUntil = null;
  state.lastFrameAt = performance.now();
  updatePlayButton();
}

function updatePlayButton() {
  const iconName = state.playing ? "pause" : "play";
  elements.playToggle.innerHTML = `<i data-lucide="${iconName}"></i>`;
  elements.playToggle.setAttribute("aria-label", state.playing ? "일시정지" : "재생");
  createIcons({ icons: ICONS });
}

function resetCamera() {
  camera.position.set(10, 7.5, 11);
  controls.target.set(0, 0, 0);
  controls.update();
}

function normalizeSampleId(value) {
  const trimmed = value.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) {
    return `TEST_${trimmed.padStart(5, "0")}`;
  }
  return trimmed;
}

function selectSampleFromInput() {
  const id = normalizeSampleId(elements.sampleInput.value);
  const index = state.samplesById.get(id);
  if (index === undefined) {
    elements.sampleInput.value = activeSample().id;
    return;
  }
  setSample(index);
}

function bindEvents() {
  elements.previousSample.addEventListener("click", () => setSample(state.sampleIndex - 1));
  elements.nextSample.addEventListener("click", () => setSample(state.sampleIndex + 1));
  elements.randomSample.addEventListener("click", () => {
    setSample(Math.floor(Math.random() * state.data.samples.length));
  });
  elements.sampleInput.addEventListener("change", selectSampleFromInput);
  elements.sampleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      selectSampleFromInput();
      elements.sampleInput.blur();
    }
  });

  elements.modelControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-method]");
    if (button) {
      setMethod(button.dataset.method);
    }
  });

  elements.speedControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-speed]");
    if (!button) {
      return;
    }
    state.speed = Number(button.dataset.speed);
    elements.speedControl.querySelectorAll("button").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
  });

  elements.playToggle.addEventListener("click", () => {
    state.playing = !state.playing;
    state.loopHoldUntil = null;
    if (state.currentTime >= FORECAST_END && state.playing) {
      state.currentTime = START_TIME;
    }
    state.lastFrameAt = performance.now();
    updatePlayButton();
  });
  elements.restart.addEventListener("click", restartPlayback);
  elements.resetCamera.addEventListener("click", resetCamera);

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      elements.playToggle.click();
    } else if (event.key === "ArrowLeft") {
      setSample(state.sampleIndex - 1);
    } else if (event.key === "ArrowRight") {
      setSample(state.sampleIndex + 1);
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min((now - state.lastFrameAt) / 1000, 0.1);
  state.lastFrameAt = now;

  if (state.data && state.playing) {
    if (state.loopHoldUntil !== null) {
      if (now >= state.loopHoldUntil) {
        state.currentTime = START_TIME;
        state.loopHoldUntil = null;
      }
    } else {
      state.currentTime += deltaSeconds * BASE_SIMULATION_RATE * state.speed;
      if (state.currentTime >= FORECAST_END) {
        state.currentTime = FORECAST_END;
        state.loopHoldUntil = now + 1300;
      }
    }
    updateSceneForTime();
  }

  const elapsed = now * 0.001;
  radarGroup.rotation.y = elapsed * 0.22;
  for (const [index, rotor] of drone.rotorGroups.entries()) {
    rotor.rotation.y = elapsed * (index % 2 === 0 ? 15 : -15);
  }
  targetMarker.quaternion.copy(camera.quaternion);
  const markerPulse = 1 + Math.sin(elapsed * 4.5) * 0.07;
  targetMarker.scale.setScalar(markerPulse);

  controls.update();
  renderer.render(scene, camera);
}

async function loadData() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/trajectories.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data.samples) || data.samples.length === 0) {
      throw new Error("No trajectory samples in data file");
    }

    state.data = data;
    state.samplesById = new Map(data.samples.map((sample, index) => [sample.id, index]));
    elements.sampleCount.textContent = `${data.samples.length.toLocaleString()} TRACKS`;
    elements.loading.hidden = true;

    const hashId = normalizeSampleId(window.location.hash.slice(1));
    const initialIndex = state.samplesById.get(hashId) ?? 0;
    setSample(initialIndex);
    updateForecastDistance();
    bindEvents();
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.systemStatus.textContent = "DATA OFFLINE";
  }
}

createIcons({ icons: ICONS });
loadData();
requestAnimationFrame(animate);
