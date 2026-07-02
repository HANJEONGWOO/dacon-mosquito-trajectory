import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  createIcons,
} from "lucide";
import "./style.css";

const START_TIME = -400;
const OBSERVED_END = 0;
const FORECAST_END = 80;
const BASE_SIMULATION_RATE = 100;
const HIT_RADIUS_METERS = 0.01;
const LEADER_DRONE_DAMAGE = 20;
const STANDARD_DRONE_DAMAGE = 10;
const COLORS = {
  background: 0x07110f,
  cyan: 0x4ce3ce,
  cyanDim: 0x237f73,
  amber: 0xffca62,
  coral: 0xff796b,
  red: 0xff3d32,
  green: 0x78db8d,
  grid: 0x253d36,
  gridCenter: 0x557168,
  white: 0xeef8f4,
};
const ICONS = {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
};

const HEROES = {
  junwoo: {
    name: "이준우",
    role: "아크 엔지니어",
    battleCry: "가자!",
    pitch: 0.82,
    color: 0x8f292d,
    accent: 0x4ce3ce,
    attack: "REPULSOR BURST",
  },
  chaeeun: {
    name: "이채은",
    role: "스텔스 오퍼레이터",
    battleCry: "준비 완료!",
    pitch: 1.16,
    color: 0x172723,
    accent: 0xff796b,
    attack: "WIDOW PULSE",
  },
  youngbeom: {
    name: "차영범",
    role: "썬더 가디언",
    battleCry: "받아라!",
    pitch: 0.72,
    color: 0x263f6b,
    accent: 0x8fc7ff,
    attack: "THUNDER STRIKE",
  },
  jungwoo: {
    name: "한정우",
    role: "실드 커맨더",
    battleCry: "방어 개시!",
    pitch: 0.88,
    color: 0x28563d,
    accent: 0x78db8d,
    attack: "AEGIS CHARGE",
  },
};

let selectionAudioContext = null;

const elements = {
  app: document.querySelector("#app"),
  scene: document.querySelector("#scene"),
  introScreen: document.querySelector("#intro-screen"),
  enterGame: document.querySelector("#enter-game"),
  introStatus: document.querySelector("#intro-status"),
  heroSelect: document.querySelector("#hero-select"),
  heroGrid: document.querySelector("#hero-grid"),
  heroBack: document.querySelector("#hero-back"),
  confirmHero: document.querySelector("#confirm-hero"),
  heroSelectionStatus: document.querySelector("#hero-selection-status"),
  selectAllHeroes: document.querySelector("#select-all-heroes"),
  clearHeroes: document.querySelector("#clear-heroes"),
  loading: document.querySelector("#loading-state"),
  error: document.querySelector("#error-state"),
  systemStatus: document.querySelector("#system-status"),
  activeAgent: document.querySelector("#active-agent"),
  sampleCount: document.querySelector("#sample-count"),
  trackId: document.querySelector("#track-id"),
  phaseBadge: document.querySelector("#phase-badge"),
  coordX: document.querySelector("#coord-x"),
  coordY: document.querySelector("#coord-y"),
  coordZ: document.querySelector("#coord-z"),
  simTime: document.querySelector("#sim-time"),
  visualScale: document.querySelector("#visual-scale"),
  forecastDistance: document.querySelector("#forecast-distance"),
  distanceLabel: document.querySelector("#distance-label"),
  sampleInput: document.querySelector("#sample-input"),
  previousSample: document.querySelector("#previous-sample"),
  nextSample: document.querySelector("#next-sample"),
  randomSample: document.querySelector("#random-sample"),
  datasetControl: document.querySelector("#dataset-control"),
  autoAdvance: document.querySelector("#auto-advance"),
  modelControl: document.querySelector("#model-control"),
  speedControl: document.querySelector("#speed-control"),
  resetCamera: document.querySelector("#reset-camera"),
  playToggle: document.querySelector("#play-toggle"),
  restart: document.querySelector("#restart"),
  timelineProgress: document.querySelector("#timeline-progress"),
  timelineCursor: document.querySelector("#timeline-cursor"),
  frameNumber: document.querySelector("#frame-number"),
  actualLegend: document.querySelector("#actual-legend"),
  impactFlash: document.querySelector("#impact-flash"),
  outcomeOverlay: document.querySelector("#outcome-overlay"),
  outcomeKicker: document.querySelector("#outcome-kicker"),
  outcomeTitle: document.querySelector("#outcome-title"),
  outcomeDetail: document.querySelector("#outcome-detail"),
  baseStatus: document.querySelector("#base-status"),
  baseHealth: document.querySelector("#base-health"),
  healthFill: document.querySelector("#health-fill"),
  healthTrack: document.querySelector(".health-track"),
  resetBaseHealth: document.querySelector("#reset-base-health"),
  destroyedCount: document.querySelector("#destroyed-count"),
  victoryTargetDisplay: document.querySelector("#victory-target-display"),
  missionTrack: document.querySelector(".mission-track"),
  missionFill: document.querySelector("#mission-fill"),
  decreaseFleet: document.querySelector("#decrease-fleet"),
  increaseFleet: document.querySelector("#increase-fleet"),
  fleetSize: document.querySelector("#fleet-size"),
  decreaseVictoryTarget: document.querySelector("#decrease-victory-target"),
  increaseVictoryTarget: document.querySelector("#increase-victory-target"),
  victoryTarget: document.querySelector("#victory-target"),
  victoryOutro: document.querySelector("#victory-outro"),
  victoryDestroyed: document.querySelector("#victory-destroyed"),
  victoryBaseHealth: document.querySelector("#victory-base-health"),
  restartDefense: document.querySelector("#restart-defense"),
};

const state = {
  data: null,
  samplesById: new Map(),
  sampleIndex: 0,
  dataset: "validation",
  method: "best",
  speed: 2,
  autoAdvance: true,
  playing: true,
  currentTime: START_TIME,
  loopHoldUntil: null,
  lastFrameAt: performance.now(),
  center: [0, 0, 0],
  sceneScale: 1,
  floorY: -2,
  outcome: null,
  baseHealth: 100,
  fleetSize: 5,
  started: false,
  selectedHeroes: [],
  destroyedDrones: 0,
  victoryTarget: 50,
  victory: false,
};

let victoryTimer = null;

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
controls.enabled = false;

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

const defenseBase = createDefenseBase();
scene.add(defenseBase.group);

const trajectoryGroup = new THREE.Group();
scene.add(trajectoryGroup);

const drone = createDrone();
scene.add(drone.group);

const targetMarker = createTargetMarker();
targetMarker.visible = false;
scene.add(targetMarker);

const effectsGroup = new THREE.Group();
scene.add(effectsGroup);

const companionGroup = new THREE.Group();
scene.add(companionGroup);

const heroFlightGroup = new THREE.Group();
scene.add(heroFlightGroup);

let fullObservedLine = null;
let traversedLine = null;
let forecastLine = null;
let actualLine = null;
let hitRadius = null;
let errorLine = null;
let observedMarkers = [];
let companionTracks = [];
let heroUnits = [];

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

function createDefenseBase() {
  const group = new THREE.Group();
  group.name = "suwon-digital-city-dx";

  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x52605c,
    roughness: 0.72,
    metalness: 0.18,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x173f4a,
    roughness: 0.18,
    metalness: 0.74,
    emissive: 0x09252b,
    emissiveIntensity: 0.55,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8e5e7,
    roughness: 0.25,
    metalness: 0.46,
    emissive: 0x3d878b,
    emissiveIntensity: 0.72,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.white,
    roughness: 0.52,
    metalness: 0.34,
    emissive: 0x1b3230,
    emissiveIntensity: 0.25,
  });

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(3.15, 0.09, 2.15),
    concreteMaterial,
  );
  platform.position.y = 0.045;
  platform.receiveShadow = true;
  group.add(platform);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(1.08, 48),
    new THREE.MeshStandardMaterial({
      color: 0x24332f,
      roughness: 0.88,
      metalness: 0.08,
    }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.095, 0.2);
  plaza.receiveShadow = true;
  group.add(plaza);

  function addTower(x, z, width, depth, height, floors) {
    const tower = new THREE.Group();
    tower.position.set(x, 0.09, z);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      glassMaterial,
    );
    shell.position.y = height / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    tower.add(shell);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.08, 0.055, depth + 0.08),
      accentMaterial,
    );
    crown.position.y = height + 0.025;
    tower.add(crown);

    for (let floor = 1; floor < floors; floor += 1) {
      const y = (height * floor) / floors;
      const frontStrip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.82, 0.018, 0.012),
        windowMaterial,
      );
      frontStrip.position.set(0, y, depth / 2 + 0.008);
      const backStrip = frontStrip.clone();
      backStrip.position.z = -depth / 2 - 0.008;
      tower.add(frontStrip, backStrip);
    }

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, height + 0.04, depth + 0.06),
        accentMaterial,
      );
      fin.position.set(side * width / 2, height / 2, 0);
      tower.add(fin);
    }

    group.add(tower);
    return tower;
  }

  addTower(0, 0.12, 0.78, 0.54, 1.18, 9);
  addTower(-0.72, 0.22, 0.48, 0.42, 0.88, 7);
  addTower(0.72, 0.22, 0.48, 0.42, 0.98, 8);

  const researchWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 0.32, 0.58),
    accentMaterial,
  );
  researchWing.position.set(0, 0.25, -0.48);
  researchWing.castShadow = true;
  group.add(researchWing);

  const wingGlass = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 0.13, 0.012),
    windowMaterial,
  );
  wingGlass.position.set(0, 0.26, -0.776);
  group.add(wingGlass);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.018, 0.35, 8),
    accentMaterial,
  );
  antenna.position.set(0, 1.44, 0.12);
  group.add(antenna);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshBasicMaterial({ color: COLORS.green }),
  );
  beacon.position.set(0, 1.63, 0.12);
  group.add(beacon);

  const perimeter = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.49, 64),
    new THREE.MeshBasicMaterial({
      color: COLORS.green,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    }),
  );
  perimeter.rotation.x = -Math.PI / 2;
  perimeter.position.y = 0.105;
  group.add(perimeter);

  const label = makeTextSprite("SAMSUNG DIGITAL CITY · DX", "#78db8d");
  label.position.set(0, 1.43, 0.42);
  label.scale.set(1.4, 0.35, 1);
  group.add(label);

  group.scale.setScalar(0.82);
  return {
    group,
    glassMaterial,
    windowMaterial,
    accentMaterial,
    perimeter,
    beacon,
    attackPoint: new THREE.Vector3(0, 0.78, 0.08),
    launchPoint: new THREE.Vector3(0, 1.68, 0.12),
  };
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
  return { group, rotorGroups, bodyMaterial, rotorMaterial, glow };
}

function createFleetDrone(color) {
  const group = new THREE.Group();
  const rotorGroups = [];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.46,
    metalness: 0.42,
    emissive: 0x103a33,
    emissiveIntensity: 0.45,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x24332f,
    roughness: 0.62,
    metalness: 0.46,
  });
  const rotorMaterial = new THREE.MeshBasicMaterial({ color: COLORS.cyan });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 0.13, 8),
    bodyMaterial,
  );
  const armX = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.06), frameMaterial);
  const armZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.86), frameMaterial);
  group.add(body, armX, armZ);

  for (const [x, z] of [
    [-0.42, -0.42],
    [-0.42, 0.42],
    [0.42, -0.42],
    [0.42, 0.42],
  ]) {
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(x, 0.03, z);
    const rotor = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 6, 18),
      rotorMaterial,
    );
    rotor.rotation.x = Math.PI / 2;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.012, 0.028),
      rotorMaterial,
    );
    rotorGroup.add(rotor, blade);
    rotorGroups.push(rotorGroup);
    group.add(rotorGroup);
  }

  group.scale.setScalar(0.5);
  return { group, rotorGroups, bodyMaterial, rotorMaterial };
}

function createHeroUnit(heroId, slot) {
  const config = HEROES[heroId];
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);

  const armor = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: 0.42,
    metalness: 0.62,
    emissive: config.color,
    emissiveIntensity: 0.16,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x101916,
    roughness: 0.58,
    metalness: 0.48,
  });
  const lightArmor = new THREE.MeshStandardMaterial({
    color: heroId === "jungwoo" ? 0xd7ded7 : 0x596963,
    roughness: 0.38,
    metalness: 0.56,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xb8795d,
    roughness: 0.72,
  });
  const energy = new THREE.MeshBasicMaterial({
    color: config.accent,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const torsoWidth = heroId === "chaeeun" ? 0.28 : heroId === "youngbeom" ? 0.42 : 0.34;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth, 0.52, 0.2),
    armor,
  );
  torso.position.y = 0.48;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin);
  head.position.y = 0.88;
  head.scale.z = 0.9;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.18), dark);
  hips.position.y = 0.16;
  model.add(torso, head, hips);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.068, 0.44, 8),
      side > 0 && heroId === "junwoo" ? armor : dark,
    );
    arm.position.set(side * (torsoWidth / 2 + 0.09), 0.49, 0);
    arm.rotation.z = side * -0.08;
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.073, 0.46, 8),
      armor,
    );
    leg.position.set(side * 0.085, -0.11, 0);
    model.add(arm, leg);
  }

  const chestCore = new THREE.Mesh(
    heroId === "junwoo"
      ? new THREE.CylinderGeometry(0.075, 0.075, 0.025, 6)
      : new THREE.BoxGeometry(0.12, 0.05, 0.025),
    energy,
  );
  chestCore.position.set(0, 0.53, 0.115);
  chestCore.rotation.x = Math.PI / 2;
  model.add(chestCore);

  if (heroId === "chaeeun") {
    for (const side of [-1, 1]) {
      const baton = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8),
        energy,
      );
      baton.position.set(side * 0.23, 0.34, 0.1);
      baton.rotation.z = side * 0.24;
      model.add(baton);
    }
  } else if (heroId === "youngbeom") {
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, 0.26),
        lightArmor,
      );
      shoulder.position.set(side * 0.3, 0.66, 0);
      model.add(shoulder);
    }
    const gauntlet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), energy);
    gauntlet.position.set(0.29, 0.38, 0.08);
    model.add(gauntlet);
  } else if (heroId === "jungwoo") {
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.52, 0.36),
      lightArmor,
    );
    shield.position.set(-0.34, 0.48, 0.08);
    shield.rotation.z = -0.12;
    const shieldCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.39, 0.23),
      energy,
    );
    shieldCore.position.set(-0.39, 0.48, 0.08);
    shieldCore.rotation.z = -0.12;
    model.add(shield, shieldCore);
  } else {
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.13, 0.24),
        armor,
      );
      shoulder.position.set(side * 0.26, 0.66, 0);
      model.add(shoulder);
    }
  }

  const jets = [];
  for (const side of [-1, 1]) {
    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.28, 10),
      energy.clone(),
    );
    jet.position.set(side * 0.085, -0.41, 0);
    jet.rotation.z = Math.PI;
    jets.push(jet);
    model.add(jet);
  }

  const flightRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.014, 6, 36),
    energy.clone(),
  );
  flightRing.rotation.x = Math.PI / 2;
  flightRing.position.y = -0.42;
  model.add(flightRing);

  const label = makeTextSprite(config.name, `#${config.accent.toString(16).padStart(6, "0")}`);
  label.position.set(0, 1.16, 0);
  label.scale.set(0.72, 0.18, 1);
  model.add(label);

  model.scale.setScalar(heroId === "youngbeom" ? 0.78 : 0.72);
  return {
    id: heroId,
    slot,
    group,
    model,
    armor,
    energy,
    jets,
    flightRing,
    attacking: false,
  };
}

function clearHeroUnits() {
  while (heroFlightGroup.children.length) {
    const child = heroFlightGroup.children.pop();
    disposeHierarchy(child);
  }
  heroUnits = [];
}

function heroFormationOffset(index, total) {
  const angle = -Math.PI * 0.9 + (Math.PI * 1.8 * index) / Math.max(total - 1, 1);
  const radius = total === 1 ? 1.45 : 1.65;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    0.72 + (index % 2) * 0.34,
    Math.sin(angle) * radius,
  );
}

function rebuildHeroUnits() {
  clearHeroUnits();
  state.selectedHeroes.forEach((heroId, index) => {
    const unit = createHeroUnit(heroId, index);
    unit.offset = heroFormationOffset(index, state.selectedHeroes.length);
    unit.group.position.copy(drone.group.position).add(unit.offset);
    heroUnits.push(unit);
    heroFlightGroup.add(unit.group);
  });
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

function clearCompanionTracks() {
  while (companionGroup.children.length) {
    const child = companionGroup.children.pop();
    disposeHierarchy(child);
  }
  companionTracks = [];
}

function companionFormationOffset(ordinal, totalCompanions) {
  const slot = ordinal - 1;
  const compact = window.innerWidth <= 760;
  if (compact) {
    const row = Math.floor(slot / 5);
    const rowStart = row * 5;
    const rowCount = Math.min(5, totalCompanions - rowStart);
    const column = slot - rowStart;
    const spread = (column - (rowCount - 1) / 2) * 1.05;
    const depth = 1.75 - row * 1.45;
    const nearX = 0.67;
    const nearZ = 0.74;
    const rightX = nearZ;
    const rightZ = -nearX;
    return new THREE.Vector3(
      nearX * depth + rightX * spread,
      0.22,
      nearZ * depth + rightZ * spread,
    );
  }

  const ring = Math.floor(slot / 6);
  const ringStart = ring * 6;
  const ringCount = Math.min(6, totalCompanions - ringStart);
  const ringSlot = slot - ringStart;
  const angle = -Math.PI / 2 + (Math.PI * 2 * ringSlot) / Math.max(ringCount, 1);
  const radius = 3.4 + ring * 2.1;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    0.25,
    Math.sin(angle) * radius,
  );
}

function companionToWorld(point, track) {
  return new THREE.Vector3(
    (point[0] - track.center[0]) * track.scale + track.offset.x,
    (point[2] - track.center[2]) * track.scale + track.offset.y,
    -(point[1] - track.center[1]) * track.scale + track.offset.z,
  );
}

function companionLine(group, points, material) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  group.add(line);
  return line;
}

function buildCompanionTracks() {
  clearCompanionTracks();
  const samples = activeSamples();
  const companionCount = Math.min(state.fleetSize - 1, samples.length - 1);
  const colors = [COLORS.green, COLORS.cyan, 0x8fc7ff, 0xa6ead0, 0xffd58a];

  for (let ordinal = 1; ordinal <= companionCount; ordinal += 1) {
    const sample = samples[(state.sampleIndex + ordinal) % samples.length];
    const allPoints = [...sample.observed, ...Object.values(sample.predictions)];
    if (sample.actual) {
      allPoints.push(sample.actual);
    }
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    for (const point of allPoints) {
      for (let axis = 0; axis < 3; axis += 1) {
        mins[axis] = Math.min(mins[axis], point[axis]);
        maxs[axis] = Math.max(maxs[axis], point[axis]);
      }
    }
    const center = mins.map((value, axis) => (value + maxs[axis]) / 2);
    const span = Math.max(
      maxs[0] - mins[0],
      maxs[1] - mins[1],
      maxs[2] - mins[2],
      0.025,
    );
    const track = {
      sample,
      ordinal,
      center,
      scale: THREE.MathUtils.clamp(
        (window.innerWidth <= 760 ? 1.45 : 2.2) / span,
        16,
        window.innerWidth <= 760 ? 72 : 100,
      ),
      offset: companionFormationOffset(ordinal, companionCount),
      group: new THREE.Group(),
      outcomeShown: false,
    };
    const color = colors[(ordinal - 1) % colors.length];
    const observedWorld = sample.observed.map((point) => companionToWorld(point, track));

    track.observedLine = companionLine(
      track.group,
      observedWorld,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.52,
      }),
    );
    track.forecastLine = companionLine(
      track.group,
      [observedWorld.at(-1), companionToWorld(sample.predictions[state.method], track)],
      new THREE.LineDashedMaterial({
        color: COLORS.amber,
        dashSize: 0.12,
        gapSize: 0.09,
        transparent: true,
        opacity: 0.78,
      }),
    );
    track.forecastLine.computeLineDistances();
    track.forecastLine.visible = false;

    if (sample.actual) {
      track.actualLine = companionLine(
        track.group,
        [observedWorld.at(-1), observedWorld.at(-1)],
        new THREE.LineBasicMaterial({
          color: COLORS.coral,
          transparent: true,
          opacity: 0.72,
        }),
      );
      track.actualLine.visible = false;
    } else {
      track.actualLine = null;
    }

    track.drone = createFleetDrone(color);
    track.group.add(track.drone.group);

    track.targetMarker = createTargetMarker();
    track.targetMarker.scale.setScalar(0.62);
    track.targetMarker.visible = false;
    track.group.add(track.targetMarker);

    companionTracks.push(track);
    companionGroup.add(track.group);
  }
}

function setMarkerColor(marker, color) {
  marker.traverse((child) => {
    if (child.material?.color) {
      child.material.color.setHex(color);
    }
  });
}

function resetCompanionOutcomeStates() {
  for (const track of companionTracks) {
    track.outcomeShown = false;
    track.drone.group.visible = true;
    track.drone.bodyMaterial.color.setHex(
      [COLORS.green, COLORS.cyan, 0x8fc7ff, 0xa6ead0, 0xffd58a][
        (track.ordinal - 1) % 5
      ],
    );
    track.drone.bodyMaterial.emissive.setHex(0x103a33);
    track.drone.bodyMaterial.emissiveIntensity = 0.45;
    setMarkerColor(track.targetMarker, COLORS.coral);
  }
}

function disposeHierarchy(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  });
}

function clearOutcomeEffects() {
  while (effectsGroup.children.length) {
    const child = effectsGroup.children.pop();
    disposeHierarchy(child);
  }
  state.outcome = null;
  elements.outcomeOverlay.hidden = true;
  elements.outcomeOverlay.classList.remove("hit", "miss", "hero-save");
  elements.impactFlash.classList.remove("hit", "miss");
  drone.bodyMaterial.color.setHex(COLORS.amber);
  drone.bodyMaterial.emissive.setHex(0x3f2c08);
  drone.bodyMaterial.emissiveIntensity = 0.45;
  drone.rotorMaterial.color.setHex(COLORS.cyan);
  drone.rotorMaterial.emissive.setHex(0x123f38);
  drone.glow.color.setHex(COLORS.amber);
  drone.glow.intensity = 1.1;
  drone.group.visible = true;
  setTargetColor(COLORS.coral);
  defenseBase.group.position.x = 0;
  defenseBase.group.position.z = 0;
  setBaseAlert(false);
  heroUnits.forEach((unit) => {
    unit.attacking = false;
    unit.group.visible = true;
  });
}

function baseTargetWorld() {
  defenseBase.group.updateMatrixWorld(true);
  return defenseBase.group.localToWorld(defenseBase.attackPoint.clone());
}

function baseLaunchWorld() {
  defenseBase.group.updateMatrixWorld(true);
  return defenseBase.group.localToWorld(defenseBase.launchPoint.clone());
}

function setBaseFiring(firing) {
  if (!firing) {
    setBaseAlert(false);
    return;
  }
  defenseBase.glassMaterial.emissive.setHex(0x0e554a);
  defenseBase.glassMaterial.emissiveIntensity = 0.95;
  defenseBase.windowMaterial.color.setHex(COLORS.green);
  defenseBase.windowMaterial.emissive.setHex(0x2d8c5a);
  defenseBase.windowMaterial.emissiveIntensity = 1.45;
  defenseBase.perimeter.material.color.setHex(COLORS.cyan);
  defenseBase.beacon.material.color.setHex(COLORS.amber);
}

function setBaseAlert(alert) {
  if (alert) {
    defenseBase.glassMaterial.emissive.setHex(0x7f0804);
    defenseBase.glassMaterial.emissiveIntensity = 1.15;
    defenseBase.windowMaterial.color.setHex(COLORS.coral);
    defenseBase.windowMaterial.emissive.setHex(0x8f0905);
    defenseBase.windowMaterial.emissiveIntensity = 1.5;
    defenseBase.perimeter.material.color.setHex(COLORS.red);
    defenseBase.beacon.material.color.setHex(COLORS.red);
    return;
  }

  defenseBase.glassMaterial.emissive.setHex(0x09252b);
  defenseBase.glassMaterial.emissiveIntensity = 0.55;
  defenseBase.windowMaterial.color.setHex(0xa8e5e7);
  defenseBase.windowMaterial.emissive.setHex(0x3d878b);
  defenseBase.windowMaterial.emissiveIntensity = 0.72;
  defenseBase.perimeter.material.color.setHex(COLORS.green);
  defenseBase.beacon.material.color.setHex(COLORS.green);
}

function updateBaseHealth() {
  const health = THREE.MathUtils.clamp(state.baseHealth, 0, 100);
  elements.baseHealth.textContent = String(health);
  elements.healthFill.style.width = `${health}%`;
  elements.healthTrack.setAttribute("aria-valuenow", String(health));
  elements.baseStatus.classList.toggle("warning", health <= 50 && health > 20);
  elements.baseStatus.classList.toggle("critical", health <= 20);
}

function formatDroneCount(count) {
  return `${count} ${count === 1 ? "DRONE" : "DRONES"}`;
}

function updateMissionProgress() {
  const progress = Math.min(state.destroyedDrones / state.victoryTarget, 1);
  elements.destroyedCount.textContent = String(state.destroyedDrones);
  elements.victoryTargetDisplay.textContent = String(state.victoryTarget);
  elements.victoryTarget.textContent = formatDroneCount(state.victoryTarget);
  elements.missionFill.style.width = `${progress * 100}%`;
  elements.missionTrack.setAttribute("aria-valuemax", String(state.victoryTarget));
  elements.missionTrack.setAttribute("aria-valuenow", String(state.destroyedDrones));
  elements.decreaseVictoryTarget.disabled = state.victoryTarget <= 1;
  elements.increaseVictoryTarget.disabled = state.victoryTarget >= 250;
}

function showVictoryOutro() {
  if (!state.victory) {
    return;
  }
  state.playing = false;
  state.loopHoldUntil = null;
  controls.enabled = false;
  elements.victoryDestroyed.textContent = formatDroneCount(state.destroyedDrones);
  elements.victoryBaseHealth.textContent = `HP ${state.baseHealth}`;
  elements.app.classList.add("victory-active");
  elements.victoryOutro.hidden = false;
  window.requestAnimationFrame(() => {
    elements.victoryOutro.classList.add("active");
  });
  camera.position.set(8.2, 5.3, 9.5);
  controls.target.set(0, state.floorY + 0.85, 0);
  controls.update();
}

function scheduleVictory() {
  if (state.victory || state.destroyedDrones < state.victoryTarget) {
    return;
  }
  state.victory = true;
  window.clearTimeout(victoryTimer);
  victoryTimer = window.setTimeout(showVictoryOutro, 1050);
}

function recordDroneDestroyed(result = state.outcome) {
  if (!result || result.destroyedRecorded) {
    return;
  }
  result.destroyedRecorded = true;
  state.destroyedDrones += 1;
  updateMissionProgress();
  scheduleVictory();
}

function setVictoryTarget(target) {
  state.victoryTarget = THREE.MathUtils.clamp(Math.round(target), 1, 250);
  updateMissionProgress();
  scheduleVictory();
}

function restartDefense() {
  window.clearTimeout(victoryTimer);
  victoryTimer = null;
  state.victory = false;
  state.destroyedDrones = 0;
  updateMissionProgress();
  resetBaseHealth();
  elements.victoryOutro.classList.remove("active");
  elements.app.classList.remove("victory-active");
  controls.enabled = true;
  window.setTimeout(() => {
    elements.victoryOutro.hidden = true;
  }, 420);
  resetCamera();
  restartPlayback();
}

function damageBase(amount) {
  state.baseHealth = Math.max(0, state.baseHealth - amount);
  updateBaseHealth();
  elements.baseStatus.classList.remove("damaged");
  void elements.baseStatus.offsetWidth;
  elements.baseStatus.classList.add("damaged");
  window.setTimeout(() => elements.baseStatus.classList.remove("damaged"), 460);
}

function resetBaseHealth() {
  state.baseHealth = 100;
  updateBaseHealth();
}

function calculateViewTransform(sample) {
  const allPoints = [
    ...sample.observed,
    ...Object.values(sample.predictions),
  ];
  if (sample.actual) {
    allPoints.push(sample.actual);
  }
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
  defenseBase.group.position.set(0, state.floorY, 0);
  if (window.innerWidth <= 760) {
    controls.target.y = state.floorY + 0.95;
  }
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
  return activeSamples()[state.sampleIndex];
}

function activeDataset() {
  return state.data.datasets[state.dataset];
}

function activeSamples() {
  return activeDataset().samples;
}

function activePrediction() {
  return activeSample().predictions[state.method];
}

function futureDestination() {
  return activeSample().actual ?? activePrediction();
}

function predictionErrorMeters() {
  const sample = activeSample();
  if (!sample.actual) {
    return null;
  }
  const prediction = activePrediction();
  return Math.hypot(
    prediction[0] - sample.actual[0],
    prediction[1] - sample.actual[1],
    prediction[2] - sample.actual[2],
  );
}

function setTargetColor(color) {
  targetMarker.traverse((child) => {
    if (child.material?.color) {
      child.material.color.setHex(color);
    }
  });
}

function createHitExplosion(origin) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const launch = baseLaunchWorld().sub(origin);
  const impact = new THREE.Vector3(0, 0, 0);
  const flightDuration = 1.05;
  const flightDirection = impact.clone().sub(launch).normalize();

  const interceptor = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.52, 8),
    new THREE.MeshBasicMaterial({
      color: COLORS.green,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  interceptor.position.copy(launch);
  interceptor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), flightDirection);
  const interceptorLight = new THREE.PointLight(COLORS.amber, 4.5, 4);
  interceptor.add(interceptorLight);
  group.add(interceptor);

  const launchBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.045, 1, 8),
    new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  launchBeam.position.copy(launch).multiplyScalar(0.5);
  launchBeam.quaternion.copy(interceptor.quaternion);
  launchBeam.scale.y = launch.length();
  group.add(launchBeam);

  const launchGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 1, 10),
    new THREE.MeshBasicMaterial({
      color: COLORS.green,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  launchGlow.position.copy(launchBeam.position);
  launchGlow.quaternion.copy(launchBeam.quaternion);
  launchGlow.scale.y = launch.length();
  group.add(launchGlow);

  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([launch, launch]),
    new THREE.LineBasicMaterial({
      color: COLORS.green,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(trail);

  const launchLight = new THREE.PointLight(COLORS.green, 5, 7);
  launchLight.position.copy(launch);
  group.add(launchLight);

  const particleCount = 180;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = [
    new THREE.Color(COLORS.amber),
    new THREE.Color(COLORS.coral),
    new THREE.Color(COLORS.white),
  ];
  for (let index = 0; index < particleCount; index += 1) {
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.28,
      Math.random() - 0.5,
    ).normalize();
    const speed = 1.8 + Math.random() * 4.8;
    velocities[index * 3] = direction.x * speed;
    velocities[index * 3 + 1] = direction.y * speed;
    velocities[index * 3 + 2] = direction.z * speed;
    const color = palette[index % palette.length];
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.13,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.visible = false;
  group.add(particles);

  const shockwaveCurve = new THREE.EllipseCurve(0, 0, 0.5, 0.5, 0, Math.PI * 2);
  const shockwave = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(shockwaveCurve.getPoints(72)),
    new THREE.LineBasicMaterial({
      color: COLORS.amber,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }),
  );
  shockwave.quaternion.copy(camera.quaternion);
  shockwave.visible = false;
  group.add(shockwave);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 1),
    new THREE.MeshBasicMaterial({
      color: COLORS.white,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  core.visible = false;
  group.add(core);

  const light = new THREE.PointLight(COLORS.amber, 0, 10);
  group.add(light);
  effectsGroup.add(group);
  return {
    group,
    interceptor,
    interceptorLight,
    launch,
    launchBeam,
    launchGlow,
    trail,
    launchLight,
    flightDuration,
    particles,
    velocities,
    shockwave,
    core,
    light,
  };
}

function createCounterattack(origin) {
  const group = new THREE.Group();
  const projectiles = [];
  const target = baseTargetWorld();
  const forward = target.clone().sub(origin).normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();
  if (right.lengthSq() < 0.001) {
    right.set(1, 0, 0);
  }
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  for (let index = 0; index < 5; index += 1) {
    const delay = index * 0.13;
    const spread = (index - 2) * 0.045;
    const end = target
      .clone()
      .addScaledVector(right, spread)
      .addScaledVector(up, ((index % 2) - 0.5) * 0.06);
    const projectile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.055, 0.52, 8),
      new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? COLORS.red : COLORS.coral,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const direction = end.clone().sub(origin).normalize();
    projectile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    projectile.position.copy(origin);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.03, 1, 6),
      new THREE.MeshBasicMaterial({
        color: COLORS.red,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.copy(origin).add(end).multiplyScalar(0.5);
    beam.quaternion.copy(projectile.quaternion);
    beam.scale.y = origin.distanceTo(end);
    beam.visible = false;

    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, origin]),
      new THREE.LineBasicMaterial({
        color: COLORS.red,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
      }),
    );
    projectile.userData = { start: origin.clone(), end, delay, trail, beam };
    group.add(projectile, trail, beam);
    projectiles.push(projectile);
  }

  const muzzle = new THREE.PointLight(COLORS.red, 5, 8);
  muzzle.position.copy(origin);
  group.add(muzzle);

  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 12),
    new THREE.MeshBasicMaterial({
      color: COLORS.red,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  impact.position.copy(target);
  impact.visible = false;
  group.add(impact);

  const impactRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.25, 40),
    new THREE.MeshBasicMaterial({
      color: COLORS.coral,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  impactRing.position.copy(target);
  impactRing.visible = false;
  group.add(impactRing);

  const impactLight = new THREE.PointLight(COLORS.red, 0, 7);
  impactLight.position.copy(target);
  group.add(impactLight);
  effectsGroup.add(group);
  return { group, projectiles, muzzle, impact, impactRing, impactLight, target };
}

function createHeroInterception(origin, unit) {
  const config = HEROES[unit.id];
  const group = new THREE.Group();
  const start = unit.group.position.clone();
  const side = unit.slot % 2 === 0 ? -1 : 1;
  const approach = origin.clone().add(new THREE.Vector3(side * 1.05, 0.52, 0.72));
  const flightDuration = 0.68;
  const attackDuration = 0.4;

  const flightTrail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start, start]),
    new THREE.LineBasicMaterial({
      color: config.accent,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(flightTrail);

  const attack = new THREE.Group();
  const attackMaterial = new THREE.MeshBasicMaterial({
    color: config.accent,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (unit.id === "junwoo") {
    attack.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), attackMaterial),
      new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.026, 8, 32),
        attackMaterial.clone(),
      ),
    );
  } else if (unit.id === "chaeeun") {
    for (const offset of [-0.1, 0.1]) {
      const pulse = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.38, 8),
        attackMaterial.clone(),
      );
      pulse.position.x = offset;
      pulse.rotation.z = Math.PI / 2;
      attack.add(pulse);
    }
  } else if (unit.id === "youngbeom") {
    attack.add(
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 1), attackMaterial),
      new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.03, 8, 36),
        attackMaterial.clone(),
      ),
    );
  } else {
    const shieldStrike = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.48, 0.34),
      attackMaterial,
    );
    shieldStrike.rotation.z = 0.24;
    attack.add(shieldStrike);
  }
  attack.visible = false;
  group.add(attack);

  const attackBeam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([approach, approach]),
    new THREE.LineBasicMaterial({
      color: config.accent,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(attackBeam);

  const particleCount = 120;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.35,
      Math.random() - 0.5,
    ).normalize();
    const speed = 1.6 + Math.random() * 4.2;
    velocities[index * 3] = direction.x * speed;
    velocities[index * 3 + 1] = direction.y * speed;
    velocities[index * 3 + 2] = direction.z * speed;
  }
  const particles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    ),
    new THREE.PointsMaterial({
      color: config.accent,
      size: 0.12,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  particles.position.copy(origin);
  particles.visible = false;
  group.add(particles);

  const shockwave = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.26, 48),
    new THREE.MeshBasicMaterial({
      color: config.accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  shockwave.position.copy(origin);
  shockwave.quaternion.copy(camera.quaternion);
  shockwave.visible = false;
  group.add(shockwave);

  const impactLight = new THREE.PointLight(config.accent, 0, 9);
  impactLight.position.copy(origin);
  group.add(impactLight);

  unit.attacking = true;
  effectsGroup.add(group);
  return {
    kind: "hero-intercept",
    heroId: unit.id,
    unit,
    group,
    start,
    approach,
    origin,
    flightDuration,
    attackDuration,
    flightTrail,
    attack,
    attackBeam,
    particles,
    velocities,
    shockwave,
    impactLight,
    returned: false,
  };
}

function createSupportProjectile(mode, heroId, color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (mode === "hero-support" && heroId === "chaeeun") {
    const group = new THREE.Group();
    for (const offset of [-0.08, 0.08]) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 10, 8),
        material.clone(),
      );
      pulse.position.x = offset;
      group.add(pulse);
    }
    return group;
  }
  if (mode === "hero-support" && heroId === "youngbeom") {
    return new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), material);
  }
  if (mode === "hero-support" && heroId === "jungwoo") {
    return new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.22), material);
  }
  if (mode === "hero-support") {
    return new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), material);
  }
  return new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 8), material);
}

function createFleetSupportOutcomes() {
  return companionTracks
    .filter((track) => track.sample.actual)
    .map((track, index) => {
      const prediction = track.sample.predictions[state.method];
      const actual = track.sample.actual;
      const errorMeters = Math.hypot(
        prediction[0] - actual[0],
        prediction[1] - actual[1],
        prediction[2] - actual[2],
      );
      const hit = errorMeters <= HIT_RADIUS_METERS;
      const heroUnit =
        !hit && heroUnits.length > 0
          ? heroUnits[Math.floor(Math.random() * heroUnits.length)]
          : null;
      const mode = hit ? "base-defense" : heroUnit ? "hero-support" : "base-attack";
      const color =
        mode === "base-defense"
          ? COLORS.green
          : mode === "hero-support"
            ? HEROES[heroUnit.id].accent
            : COLORS.red;
      const target = companionToWorld(actual, track);
      const start =
        mode === "base-defense"
          ? baseLaunchWorld()
          : mode === "hero-support"
            ? heroUnit.group.position.clone()
            : target.clone();
      const end = mode === "base-attack" ? baseTargetWorld() : target.clone();
      const group = new THREE.Group();
      const projectile = createSupportProjectile(mode, heroUnit?.id ?? null, color);
      projectile.position.copy(start);
      projectile.visible = false;
      group.add(projectile);

      const beam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, start]),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
        }),
      );
      group.add(beam);

      const impactRing = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.22, 36),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      impactRing.position.copy(end);
      impactRing.visible = false;
      group.add(impactRing);

      const impactLight = new THREE.PointLight(color, 0, 5);
      impactLight.position.copy(end);
      group.add(impactLight);
      effectsGroup.add(group);

      return {
        track,
        mode,
        heroId: heroUnit?.id ?? null,
        errorMeters,
        group,
        projectile,
        beam,
        impactRing,
        impactLight,
        start,
        end,
        delay: 0.12 + index * 0.1,
        duration: mode === "base-attack" ? 0.78 : 0.66,
        resolved: false,
        destroyedRecorded: false,
      };
    });
}

function updateFleetSupportOutcomes(elapsed) {
  const supportEffects = state.outcome?.supportEffects ?? [];
  if (supportEffects.length === 0) {
    return;
  }

  for (const support of supportEffects) {
    const localTime = elapsed - support.delay;
    if (localTime < 0) {
      continue;
    }
    const progress = THREE.MathUtils.clamp(localTime / support.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    support.projectile.visible = progress < 1;
    support.projectile.position.lerpVectors(support.start, support.end, eased);
    support.projectile.rotation.x += 0.16;
    support.projectile.rotation.z += 0.12;
    support.beam.geometry.dispose();
    support.beam.geometry = new THREE.BufferGeometry().setFromPoints([
      support.start,
      support.projectile.position,
    ]);
    support.beam.material.opacity = Math.sin(progress * Math.PI) * 0.72;

    if (progress >= 1 && !support.resolved) {
      support.resolved = true;
      support.projectile.visible = false;
      support.beam.material.opacity = 0;
      support.impactRing.visible = true;
      support.impactLight.intensity = 4.5;
      if (support.mode === "base-attack") {
        damageBase(STANDARD_DRONE_DAMAGE);
        setBaseAlert(true);
      } else {
        support.track.drone.group.visible = false;
        recordDroneDestroyed(support);
      }
    }

    if (support.resolved) {
      const impactElapsed = Math.max(0, localTime - support.duration);
      support.impactRing.quaternion.copy(camera.quaternion);
      support.impactRing.scale.setScalar(1 + impactElapsed * 4.2);
      support.impactRing.material.opacity = Math.max(0, 0.9 - impactElapsed * 1.4);
      support.impactLight.intensity = Math.max(0, 4.5 - impactElapsed * 6);
    }
  }

  if (
    supportEffects.every((support) => support.resolved)
    && !state.outcome.supportSummaryShown
  ) {
    state.outcome.supportSummaryShown = true;
    const primaryDestroyed = state.outcome.type === "hit" || state.outcome.heroId ? 1 : 0;
    const supportDestroyed = supportEffects.filter(
      (support) => support.mode !== "base-attack",
    ).length;
    const breached = supportEffects.filter(
      (support) => support.mode === "base-attack",
    ).length + (primaryDestroyed ? 0 : 1);
    elements.outcomeKicker.textContent = "FLEET RESOLUTION COMPLETE";
    elements.outcomeDetail.textContent =
      `${primaryDestroyed + supportDestroyed} DESTROYED · ${breached} BREACHED`;
  }
}

function showOutcomeOverlay(type, errorMeters, heroId = null) {
  const hit = type === "hit";
  const hero = heroId ? HEROES[heroId] : null;
  elements.outcomeOverlay.hidden = false;
  elements.outcomeOverlay.classList.toggle("hit", hit);
  elements.outcomeOverlay.classList.toggle("miss", !hit);
  elements.outcomeKicker.textContent = hit
    ? "TARGET WITHIN R-HIT@1CM"
    : hero
      ? "R-HIT@1CM FAILED · HERO RESPONSE"
      : "R-HIT@1CM FAILED";
  elements.outcomeTitle.textContent = hit ? "LOCKED" : hero ? "HERO INTERCEPT" : "MISS";
  elements.outcomeDetail.textContent = hit
    ? `ERROR ${(errorMeters * 100).toFixed(2)} cm · BASE INTERCEPTOR LAUNCHED`
    : hero
      ? `${hero.name} DEPLOYED · ${hero.attack}`
      : `ERROR ${(errorMeters * 100).toFixed(2)} cm · BASE UNDER ATTACK`;

  if (!hit) {
    triggerImpactFlash(type);
  }
}

function triggerImpactFlash(type) {
  elements.impactFlash.classList.remove("hit", "miss");
  void elements.impactFlash.offsetWidth;
  elements.impactFlash.classList.add(type);
}

function triggerOutcome(now) {
  const errorMeters = predictionErrorMeters();
  if (errorMeters === null || state.outcome) {
    return;
  }

  const type = errorMeters <= HIT_RADIUS_METERS ? "hit" : "miss";
  const origin = toWorld(activeSample().actual);
  const heroUnit =
    type === "miss" && heroUnits.length > 0
      ? heroUnits[Math.floor(Math.random() * heroUnits.length)]
      : null;
  const effect =
    type === "hit"
      ? createHitExplosion(origin)
      : heroUnit
        ? createHeroInterception(origin, heroUnit)
        : createCounterattack(origin);
  state.outcome = {
    type,
    errorMeters,
    start: now,
    effect,
    heroId: heroUnit?.id ?? null,
    damageApplied: false,
    impactApplied: false,
  };
  state.outcome.supportEffects = createFleetSupportOutcomes();
  showOutcomeOverlay(type, errorMeters, heroUnit?.id);
  setTargetColor(type === "hit" ? COLORS.amber : COLORS.red);
  errorLine.visible = true;
  elements.forecastDistance.textContent = `${(errorMeters * 100).toFixed(2)} cm`;

  if (type === "hit") {
    setBaseFiring(true);
    drone.bodyMaterial.emissive.setHex(COLORS.amber);
    drone.bodyMaterial.emissiveIntensity = 2;
  } else if (heroUnit) {
    elements.outcomeOverlay.classList.add("hero-save");
    drone.bodyMaterial.color.setHex(COLORS.red);
    drone.bodyMaterial.emissive.setHex(0x8f0804);
    drone.bodyMaterial.emissiveIntensity = 1.5;
    playSelectionImpact(heroUnit.id);
  } else {
    drone.bodyMaterial.color.setHex(COLORS.red);
    drone.bodyMaterial.emissive.setHex(0x8f0804);
    drone.bodyMaterial.emissiveIntensity = 1.4;
    drone.rotorMaterial.color.setHex(COLORS.red);
    drone.rotorMaterial.emissive.setHex(0x6f0905);
    drone.glow.color.setHex(COLORS.red);
    drone.glow.intensity = 4;
  }
}

function updateHeroUnits(now) {
  const elapsed = now * 0.001;
  const rotationAxis = new THREE.Vector3(0, 1, 0);
  const escortDrones = [
    drone.group,
    ...companionTracks.map((track) => track.drone.group),
  ];

  for (const unit of heroUnits) {
    const pulse = 0.82 + Math.sin(elapsed * 8 + unit.slot) * 0.18;
    unit.energy.opacity = 0.76 + pulse * 0.2;
    unit.flightRing.rotation.z = elapsed * (unit.slot % 2 === 0 ? 1.8 : -1.8);
    for (const [index, jet] of unit.jets.entries()) {
      jet.scale.y = 0.78 + Math.sin(elapsed * 14 + index + unit.slot) * 0.22;
    }
    if (unit.attacking) {
      continue;
    }

    const escort = escortDrones[unit.slot % escortDrones.length];
    const offset = unit.offset
      .clone()
      .multiplyScalar(0.72)
      .applyAxisAngle(rotationAxis, escort.rotation.y * 0.4);
    const desired = escort.position.clone().add(offset);
    desired.y += Math.sin(elapsed * 3.4 + unit.slot * 1.7) * 0.12;
    unit.group.position.lerp(desired, 0.1);
    unit.group.rotation.y = escort.rotation.y + Math.PI;
    unit.model.rotation.z = Math.sin(elapsed * 2.2 + unit.slot) * 0.055;
    unit.model.rotation.x = -0.1 + Math.sin(elapsed * 2.8 + unit.slot) * 0.025;
  }
}

function updateHeroInterception(effect, elapsed) {
  const hero = HEROES[effect.heroId];
  const flightProgress = THREE.MathUtils.clamp(elapsed / effect.flightDuration, 0, 1);
  const easedFlight = 1 - Math.pow(1 - flightProgress, 3);
  effect.unit.group.position.lerpVectors(effect.start, effect.approach, easedFlight);
  effect.unit.group.rotation.y = Math.atan2(
    effect.origin.x - effect.unit.group.position.x,
    effect.origin.z - effect.unit.group.position.z,
  );
  effect.unit.model.rotation.x = -0.28 * Math.sin(flightProgress * Math.PI);
  effect.flightTrail.geometry.dispose();
  effect.flightTrail.geometry = new THREE.BufferGeometry().setFromPoints([
    effect.start,
    effect.unit.group.position,
  ]);
  effect.flightTrail.material.opacity = Math.max(0.18, 0.86 - flightProgress * 0.34);

  const attackElapsed = elapsed - effect.flightDuration;
  const attackProgress = THREE.MathUtils.clamp(
    attackElapsed / effect.attackDuration,
    0,
    1,
  );
  if (attackElapsed >= 0 && !state.outcome.impactApplied) {
    const easedAttack = 1 - Math.pow(1 - attackProgress, 2);
    effect.attack.visible = true;
    effect.attack.position.lerpVectors(effect.approach, effect.origin, easedAttack);
    effect.attack.rotation.x += 0.18;
    effect.attack.rotation.z += effect.heroId === "jungwoo" ? 0.08 : 0.22;

    let beamPoints = [effect.approach, effect.attack.position];
    if (effect.heroId === "youngbeom") {
      beamPoints = Array.from({ length: 8 }, (_, index) => {
        const ratio = index / 7;
        const point = effect.approach.clone().lerp(effect.attack.position, ratio);
        if (index > 0 && index < 7) {
          point.x += (Math.random() - 0.5) * 0.16;
          point.y += (Math.random() - 0.5) * 0.16;
          point.z += (Math.random() - 0.5) * 0.16;
        }
        return point;
      });
    }
    effect.attackBeam.geometry.dispose();
    effect.attackBeam.geometry = new THREE.BufferGeometry().setFromPoints(beamPoints);
    effect.attackBeam.material.opacity = Math.sin(attackProgress * Math.PI) * 0.92;
  }

  if (attackProgress >= 1 && !state.outcome.impactApplied) {
    state.outcome.impactApplied = true;
    recordDroneDestroyed();
    effect.attack.visible = false;
    effect.attackBeam.material.opacity = 0;
    effect.particles.visible = true;
    effect.shockwave.visible = true;
    effect.impactLight.intensity = 7;
    drone.group.visible = false;
    setBaseAlert(false);
    triggerImpactFlash("hit");
    elements.outcomeKicker.textContent = "HERO INTERCEPTION SUCCESS";
    elements.outcomeTitle.textContent = "DRONE DESTROYED";
    elements.outcomeDetail.textContent = `${hero.name} · ${hero.attack}`;
  }

  const impactElapsed = Math.max(
    0,
    attackElapsed - effect.attackDuration,
  );
  if (state.outcome.impactApplied) {
    const positions = effect.particles.geometry.attributes.position.array;
    for (let index = 0; index < positions.length / 3; index += 1) {
      positions[index * 3] = effect.velocities[index * 3] * impactElapsed;
      positions[index * 3 + 1] =
        effect.velocities[index * 3 + 1] * impactElapsed
        - 1.7 * impactElapsed * impactElapsed;
      positions[index * 3 + 2] = effect.velocities[index * 3 + 2] * impactElapsed;
    }
    effect.particles.geometry.attributes.position.needsUpdate = true;
    effect.particles.material.opacity = Math.max(0, 1 - impactElapsed / 1.5);
    effect.shockwave.scale.setScalar(1 + impactElapsed * 5.2);
    effect.shockwave.material.opacity = Math.max(0, 0.95 - impactElapsed / 0.9);
    effect.shockwave.quaternion.copy(camera.quaternion);
    effect.impactLight.intensity = Math.max(0, 7 - impactElapsed * 7);
  }

  if (state.outcome.impactApplied && impactElapsed > 0.42 && !effect.returned) {
    effect.returned = true;
    effect.unit.attacking = false;
    effect.unit.model.rotation.x = 0;
  }
}

function updateOutcomeEffect(now) {
  if (!state.outcome) {
    return;
  }
  const elapsed = (now - state.outcome.start) / 1000;
  const { type, effect } = state.outcome;

  if (type === "hit") {
    const flightProgress = THREE.MathUtils.clamp(elapsed / effect.flightDuration, 0, 1);
    const easedFlight = 1 - Math.pow(1 - flightProgress, 3);
    effect.interceptor.position.lerpVectors(
      effect.launch,
      new THREE.Vector3(0, 0, 0),
      easedFlight,
    );
    effect.interceptor.visible = flightProgress < 1;
    effect.launchBeam.material.opacity = Math.sin(flightProgress * Math.PI) * 0.92;
    effect.launchBeam.visible = elapsed < effect.flightDuration + 0.12;
    effect.launchGlow.material.opacity = Math.sin(flightProgress * Math.PI) * 0.2;
    effect.launchGlow.visible = elapsed < effect.flightDuration + 0.12;
    effect.trail.geometry.dispose();
    effect.trail.geometry = new THREE.BufferGeometry().setFromPoints([
      effect.launch,
      effect.interceptor.position,
    ]);
    effect.trail.material.opacity = Math.max(0, 0.9 - flightProgress * 0.45);
    effect.launchLight.intensity = Math.max(0, 5 - elapsed * 5.5);

    if (elapsed >= effect.flightDuration && !state.outcome.impactApplied) {
      state.outcome.impactApplied = true;
      recordDroneDestroyed();
      effect.particles.visible = true;
      effect.shockwave.visible = true;
      effect.core.visible = true;
      elements.outcomeKicker.textContent = "R-HIT@1CM CONFIRMED";
      elements.outcomeTitle.textContent = "HIT";
      elements.outcomeDetail.textContent =
        `ERROR ${(state.outcome.errorMeters * 100).toFixed(2)} cm · TARGET DESTROYED`;
      setBaseFiring(false);
    }

    const explosionElapsed = Math.max(0, elapsed - effect.flightDuration);
    if (state.outcome.impactApplied) {
      const positions = effect.particles.geometry.attributes.position.array;
      for (let index = 0; index < positions.length / 3; index += 1) {
        positions[index * 3] = effect.velocities[index * 3] * explosionElapsed;
        positions[index * 3 + 1] =
          effect.velocities[index * 3 + 1] * explosionElapsed
          - 1.8 * explosionElapsed * explosionElapsed;
        positions[index * 3 + 2] = effect.velocities[index * 3 + 2] * explosionElapsed;
      }
      effect.particles.geometry.attributes.position.needsUpdate = true;
      effect.particles.material.opacity = Math.max(0, 1 - explosionElapsed / 2.2);
      const shockScale = 1 + explosionElapsed * 5.5;
      effect.shockwave.scale.setScalar(shockScale);
      effect.shockwave.material.opacity = Math.max(0, 0.95 - explosionElapsed / 1.2);
      effect.core.scale.setScalar(1 + explosionElapsed * 2.2);
      effect.core.visible = explosionElapsed < 0.48;
      effect.light.intensity = Math.max(0, 6 - explosionElapsed * 5);
      drone.group.visible = explosionElapsed < 0.18;
    }
  } else if (effect.kind === "hero-intercept") {
    updateHeroInterception(effect, elapsed);
  } else {
    for (const projectile of effect.projectiles) {
      const localTime = Math.max(0, elapsed - projectile.userData.delay);
      const progress = THREE.MathUtils.clamp(localTime * 1.25, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      projectile.position.lerpVectors(
        projectile.userData.start,
        projectile.userData.end,
        eased,
      );
      projectile.visible = localTime > 0 && progress < 1;
      projectile.userData.beam.visible = localTime > 0 && localTime < 1.05;
      projectile.userData.beam.material.opacity =
        Math.sin(Math.min(progress, 1) * Math.PI) * 0.52;
      projectile.userData.trail.geometry.dispose();
      projectile.userData.trail.geometry = new THREE.BufferGeometry().setFromPoints([
        projectile.userData.start,
        projectile.position,
      ]);
      projectile.userData.trail.material.opacity = Math.max(0, 0.72 - progress * 0.5);
    }
    effect.muzzle.intensity = 2.5 + Math.sin(elapsed * 34) * 2.5;
    drone.group.rotation.y += Math.sin(elapsed * 24) * 0.012;

    if (elapsed >= 0.8 && !state.outcome.damageApplied) {
      state.outcome.damageApplied = true;
      damageBase(LEADER_DRONE_DAMAGE);
      setBaseAlert(true);
    }

    const impactElapsed = Math.max(0, elapsed - 0.8);
    if (impactElapsed > 0 && impactElapsed < 1.35) {
      effect.impact.visible = true;
      effect.impactRing.visible = true;
      effect.impactRing.quaternion.copy(camera.quaternion);
      effect.impact.scale.setScalar(1 + impactElapsed * 1.8);
      effect.impact.material.opacity = Math.max(0, 0.9 - impactElapsed * 0.72);
      effect.impactRing.scale.setScalar(1 + impactElapsed * 2.8);
      effect.impactRing.material.opacity = Math.max(0, 0.85 - impactElapsed * 0.65);
      effect.impactLight.intensity = Math.max(0, 6 - impactElapsed * 4.4);
      const shake = Math.max(0, 1 - impactElapsed / 0.75) * 0.055;
      defenseBase.group.position.x = Math.sin(elapsed * 58) * shake;
      defenseBase.group.position.z = Math.cos(elapsed * 47) * shake;
    } else if (impactElapsed >= 1.35) {
      defenseBase.group.position.x = 0;
      defenseBase.group.position.z = 0;
      effect.impact.visible = false;
      effect.impactRing.visible = false;
      effect.impactLight.intensity = 0;
    }
  }
  updateFleetSupportOutcomes(elapsed);
}

function rebuildTrajectory() {
  const sample = activeSample();
  calculateViewTransform(sample);
  clearOutcomeEffects();
  clearTrajectory();
  actualLine = null;
  hitRadius = null;
  errorLine = null;

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

  if (sample.actual) {
    actualLine = makeLine(
      [observedWorld.at(-1), observedWorld.at(-1)],
      new THREE.LineBasicMaterial({
        color: COLORS.coral,
        transparent: true,
        opacity: 0.92,
      }),
    );
    actualLine.visible = state.currentTime >= OBSERVED_END;

    const hitRadiusWorld = Math.max(HIT_RADIUS_METERS * state.sceneScale, 0.08);
    hitRadius = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadiusWorld, 20, 14),
      new THREE.MeshBasicMaterial({
        color: COLORS.amber,
        wireframe: true,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      }),
    );
    hitRadius.position.copy(toWorld(activePrediction()));
    hitRadius.visible = state.currentTime >= OBSERVED_END;
    trajectoryGroup.add(hitRadius);

    errorLine = makeLine(
      [toWorld(activePrediction()), toWorld(sample.actual)],
      new THREE.LineBasicMaterial({
        color: COLORS.red,
        transparent: true,
        opacity: 0.94,
      }),
    );
    errorLine.visible = false;
  }

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
  elements.actualLegend.hidden = !sample.actual;
  buildCompanionTracks();
  updateForecastDistance();
  updateSceneForTime();
}

function interpolateSamplePoint(sample, time) {
  if (time <= START_TIME) {
    return [...sample.observed[0]];
  }
  if (time >= OBSERVED_END) {
    const ratio = THREE.MathUtils.clamp(time / FORECAST_END, 0, 1);
    const destination = sample.actual ?? sample.predictions[state.method];
    return sample.observed.at(-1).map(
      (value, axis) => THREE.MathUtils.lerp(value, destination[axis], ratio),
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

function interpolateDataPoint(time) {
  return interpolateSamplePoint(activeSample(), time);
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

function updateCompanionsForTime() {
  const forecasting = state.currentTime >= OBSERVED_END;
  const animationTime = performance.now() * 0.001;

  for (const track of companionTracks) {
    const currentPoint = interpolateSamplePoint(track.sample, state.currentTime);
    const currentWorld = companionToWorld(currentPoint, track);
    track.drone.group.position.copy(currentWorld);
    track.drone.group.position.y +=
      0.07 + Math.sin(performance.now() * 0.004 + track.ordinal) * 0.035;

    const lookAheadTime = Math.min(state.currentTime + 3, FORECAST_END);
    const aheadWorld = companionToWorld(
      interpolateSamplePoint(track.sample, lookAheadTime),
      track,
    );
    const direction = aheadWorld.clone().sub(currentWorld);
    if (direction.lengthSq() > 0.00001) {
      track.drone.group.rotation.y = Math.atan2(-direction.z, direction.x);
    }

    for (const [index, rotor] of track.drone.rotorGroups.entries()) {
      rotor.rotation.y = animationTime * (index % 2 === 0 ? 15 : -15);
    }

    const predictionWorld = companionToWorld(
      track.sample.predictions[state.method],
      track,
    );
    track.forecastLine.visible = forecasting;
    track.targetMarker.visible = forecasting;
    track.targetMarker.position.copy(predictionWorld);
    track.targetMarker.quaternion.copy(camera.quaternion);

    if (track.actualLine) {
      track.actualLine.visible = forecasting;
      track.actualLine.geometry.dispose();
      track.actualLine.geometry = new THREE.BufferGeometry().setFromPoints([
        companionToWorld(track.sample.observed.at(-1), track),
        currentWorld,
      ]);
    }

    if (
      state.currentTime >= FORECAST_END
      && track.sample.actual
      && !track.outcomeShown
    ) {
      track.outcomeShown = true;
      const prediction = track.sample.predictions[state.method];
      const error = Math.hypot(
        prediction[0] - track.sample.actual[0],
        prediction[1] - track.sample.actual[1],
        prediction[2] - track.sample.actual[2],
      );
      const hit = error <= HIT_RADIUS_METERS;
      const outcomeColor = hit ? COLORS.green : COLORS.red;
      setMarkerColor(track.targetMarker, outcomeColor);
      track.drone.bodyMaterial.color.setHex(outcomeColor);
      track.drone.bodyMaterial.emissive.setHex(hit ? 0x145f36 : 0x7f0804);
      track.drone.bodyMaterial.emissiveIntensity = 1.15;
    }
  }
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
  if (actualLine) {
    actualLine.visible = forecasting;
    actualLine.geometry.dispose();
    actualLine.geometry = new THREE.BufferGeometry().setFromPoints([
      toWorld(activeSample().observed.at(-1)),
      currentWorld,
    ]);
    hitRadius.visible = forecasting;
    hitRadius.position.copy(toWorld(activePrediction()));
  }

  updateCompanionsForTime();
  updateTelemetry(currentPoint, forecasting);
}

function updateTelemetry(point, forecasting) {
  const phase = state.outcome
    ? state.outcome.type === "hit"
      ? state.outcome.impactApplied
        ? "성공"
        : "요격"
      : state.outcome.heroId
        ? state.outcome.impactApplied
          ? "구원"
          : "출격"
        : "실패"
    : forecasting
      ? "예측"
      : "관측";
  elements.phaseBadge.textContent = phase;
  elements.phaseBadge.classList.toggle("forecast", forecasting);
  elements.phaseBadge.classList.toggle("hit", state.outcome?.type === "hit");
  elements.phaseBadge.classList.toggle("miss", state.outcome?.type === "miss");
  elements.systemStatus.textContent = state.outcome
    ? state.outcome.type === "hit"
      ? state.outcome.impactApplied
        ? "HIT CONFIRMED"
        : "INTERCEPTOR LAUNCHED"
      : state.outcome.heroId
        ? state.outcome.impactApplied
          ? "DRONE DESTROYED"
          : `${HEROES[state.outcome.heroId].name} ENGAGING`
        : "BASE UNDER ATTACK"
    : forecasting
      ? "FORECAST LINK"
      : "TRACKING LIVE";
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
  const sampleCount = activeSamples().length;
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
  restartPlayback();
  rebuildTrajectory();
}

function updateFleetUi() {
  elements.fleetSize.textContent = String(state.fleetSize);
  elements.decreaseFleet.disabled = state.fleetSize <= 1;
  elements.increaseFleet.disabled = state.fleetSize >= 10;
  if (state.data) {
    elements.sampleCount.textContent =
      `${state.fleetSize} ACTIVE · ${activeSamples().length.toLocaleString()} TRACKS`;
  }
}

function setFleetSize(size) {
  const nextSize = THREE.MathUtils.clamp(Math.round(size), 1, 10);
  if (nextSize === state.fleetSize) {
    return;
  }
  state.fleetSize = nextSize;
  updateFleetUi();
  restartPlayback();
  rebuildTrajectory();
  resetCamera();
}

function setDataset(dataset) {
  if (!state.data.datasets[dataset]) {
    return;
  }
  state.dataset = dataset;
  state.samplesById = new Map(
    activeSamples().map((sample, index) => [sample.id, index]),
  );
  elements.datasetControl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.dataset === dataset);
  });
  updateFleetUi();
  elements.distanceLabel.textContent = activeDataset().hasGroundTruth ? "ERROR" : "FORECAST";
  setSample(0);
  resetCamera();
}

function updateForecastDistance() {
  const sample = activeSample();
  const prediction = activePrediction();
  if (sample.actual) {
    elements.distanceLabel.textContent = "ERROR";
    elements.forecastDistance.textContent = state.outcome
      ? `${(state.outcome.errorMeters * 100).toFixed(2)} cm`
      : "--";
    return;
  }

  const last = sample.observed.at(-1);
  const displacement = Math.hypot(
    prediction[0] - last[0],
    prediction[1] - last[1],
    prediction[2] - last[2],
  );
  elements.distanceLabel.textContent = "FORECAST";
  elements.forecastDistance.textContent = `${(displacement * 100).toFixed(2)} cm`;
}

function restartPlayback() {
  clearOutcomeEffects();
  resetCompanionOutcomeStates();
  state.currentTime = START_TIME;
  state.playing = true;
  state.loopHoldUntil = null;
  state.lastFrameAt = performance.now();
  if (errorLine) {
    errorLine.visible = false;
  }
  updateForecastDistance();
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
  camera.fov = window.innerWidth <= 760 ? 60 : 42;
  camera.updateProjectionMatrix();
  controls.target.set(0, window.innerWidth <= 760 ? state.floorY + 0.95 : 0, 0);
  controls.update();
}

function normalizeSampleId(value) {
  const trimmed = value.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) {
    const prefix = state.dataset === "validation" ? "TRAIN" : "TEST";
    return `${prefix}_${trimmed.padStart(5, "0")}`;
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

function showHeroSelect() {
  if (!state.data || state.started) {
    return;
  }
  elements.introScreen.classList.add("departing");
  elements.heroSelect.hidden = false;
  window.requestAnimationFrame(() => {
    elements.heroSelect.classList.add("active");
  });
  window.setTimeout(() => {
    elements.introScreen.hidden = true;
  }, 520);
}

function showIntro() {
  elements.introScreen.hidden = false;
  elements.introScreen.classList.remove("departing");
  elements.heroSelect.classList.add("departing");
  elements.heroSelect.classList.remove("active");
  window.setTimeout(() => {
    elements.heroSelect.hidden = true;
    elements.heroSelect.classList.remove("departing");
  }, 420);
}

function updateHeroSelection() {
  elements.heroGrid.querySelectorAll(".hero-card").forEach((card) => {
    const selected = state.selectedHeroes.includes(card.dataset.hero);
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-selected", String(selected));
  });

  const selected = state.selectedHeroes.map((heroId) => HEROES[heroId]);
  if (selected.length === 0) {
    elements.heroSelectionStatus.textContent = "선택 없음 · 자동 방어 시스템";
  } else {
    elements.heroSelectionStatus.textContent =
      `${selected.length}명 · ${selected.map((hero) => hero.name).join(", ")}`;
  }
}

function playSelectionImpact(heroId, squad = false) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    selectionAudioContext ??= new AudioContextClass();
    const context = selectionAudioContext;
    if (context.state === "suspended") {
      context.resume();
    }
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    master.connect(context.destination);

    const impact = context.createOscillator();
    impact.type = "sawtooth";
    impact.frequency.setValueAtTime(squad ? 150 : 190, now);
    impact.frequency.exponentialRampToValueAtTime(58, now + 0.28);
    impact.connect(master);
    impact.start(now);
    impact.stop(now + 0.35);

    const energyGain = context.createGain();
    energyGain.gain.setValueAtTime(0.0001, now);
    energyGain.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
    energyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    energyGain.connect(context.destination);
    const energy = context.createOscillator();
    energy.type = "sine";
    energy.frequency.setValueAtTime(squad ? 320 : 420, now);
    energy.frequency.exponentialRampToValueAtTime(squad ? 920 : 760, now + 0.24);
    energy.connect(energyGain);
    energy.start(now);
    energy.stop(now + 0.31);
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const hero = HEROES[heroId];
    const utterance = new SpeechSynthesisUtterance(
      squad ? "DX 디펜스, 출격!" : hero.battleCry,
    );
    utterance.lang = "ko-KR";
    utterance.rate = squad ? 1.18 : 1.32;
    utterance.pitch = squad ? 0.92 : hero.pitch;
    utterance.volume = 0.9;
    const koreanVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("ko"));
    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }
    window.setTimeout(() => window.speechSynthesis.speak(utterance), 35);
  }
}

function activateHeroCard(heroId) {
  const card = elements.heroGrid.querySelector(`[data-hero="${heroId}"]`);
  if (!card) {
    return;
  }
  card.classList.remove("activated");
  void card.offsetWidth;
  card.classList.add("activated");
}

function toggleHero(heroId) {
  if (!HEROES[heroId]) {
    return;
  }
  const wasSelected = state.selectedHeroes.includes(heroId);
  if (wasSelected) {
    state.selectedHeroes = state.selectedHeroes.filter((selected) => selected !== heroId);
  } else {
    state.selectedHeroes = [...state.selectedHeroes, heroId];
  }
  updateHeroSelection();
  if (!wasSelected) {
    activateHeroCard(heroId);
    playSelectionImpact(heroId);
  }
}

function startGame() {
  if (!state.data || state.started) {
    return;
  }
  const selected = state.selectedHeroes.map((heroId) => HEROES[heroId]);
  state.started = true;
  controls.enabled = true;
  elements.app.classList.add("game-started");
  elements.heroSelect.classList.add("departing");
  elements.activeAgent.textContent =
    selected.length === 0
      ? "AUTO DEFENSE"
      : selected.length === 1
        ? `AGENT · ${selected[0].name}`
        : `SQUAD · ${selected.length} AGENTS`;
  elements.activeAgent.title =
    selected.length === 0 ? "선택된 요원 없음" : selected.map((hero) => hero.name).join(", ");
  rebuildHeroUnits();
  restartPlayback();
  window.setTimeout(() => {
    elements.heroSelect.hidden = true;
  }, 520);
}

function bindEvents() {
  elements.enterGame.addEventListener("click", showHeroSelect);
  elements.heroBack.addEventListener("click", showIntro);
  elements.confirmHero.addEventListener("click", startGame);
  elements.selectAllHeroes.addEventListener("click", () => {
    state.selectedHeroes = Object.keys(HEROES);
    updateHeroSelection();
    state.selectedHeroes.forEach(activateHeroCard);
    playSelectionImpact(state.selectedHeroes[0], true);
  });
  elements.clearHeroes.addEventListener("click", () => {
    state.selectedHeroes = [];
    updateHeroSelection();
  });
  elements.heroGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".hero-card[data-hero]");
    if (card) {
      toggleHero(card.dataset.hero);
    }
  });
  elements.previousSample.addEventListener("click", () => setSample(state.sampleIndex - 1));
  elements.nextSample.addEventListener("click", () => setSample(state.sampleIndex + 1));
  elements.randomSample.addEventListener("click", () => {
    setSample(Math.floor(Math.random() * activeSamples().length));
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

  elements.datasetControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-dataset]");
    if (button) {
      setDataset(button.dataset.dataset);
    }
  });

  elements.autoAdvance.addEventListener("change", () => {
    state.autoAdvance = elements.autoAdvance.checked;
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
    if (!state.playing && state.currentTime >= FORECAST_END) {
      restartPlayback();
      return;
    }
    state.playing = !state.playing;
    state.loopHoldUntil = null;
    state.lastFrameAt = performance.now();
    updatePlayButton();
  });
  elements.restart.addEventListener("click", restartPlayback);
  elements.resetCamera.addEventListener("click", resetCamera);
  elements.resetBaseHealth.addEventListener("click", resetBaseHealth);
  elements.decreaseFleet.addEventListener("click", () => {
    setFleetSize(state.fleetSize - 1);
  });
  elements.increaseFleet.addEventListener("click", () => {
    setFleetSize(state.fleetSize + 1);
  });
  elements.decreaseVictoryTarget.addEventListener("click", () => {
    setVictoryTarget(state.victoryTarget - 1);
  });
  elements.increaseVictoryTarget.addEventListener("click", () => {
    setVictoryTarget(state.victoryTarget + 1);
  });
  elements.restartDefense.addEventListener("click", restartDefense);

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    if (!state.started) {
      if (event.key === "Escape" && !elements.heroSelect.hidden) {
        showIntro();
      } else if (
        !elements.enterGame.disabled
        && (event.key === "Enter" || event.code === "Space")
      ) {
        event.preventDefault();
        if (!elements.heroSelect.hidden) {
          startGame();
        } else {
          showHeroSelect();
        }
      }
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
    camera.fov = window.innerWidth <= 760 ? 60 : 42;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min((now - state.lastFrameAt) / 1000, 0.1);
  state.lastFrameAt = now;

  if (state.data && state.playing && state.started) {
    if (state.loopHoldUntil !== null) {
      if (now >= state.loopHoldUntil) {
        if (state.autoAdvance) {
          setSample(state.sampleIndex + state.fleetSize);
        } else {
          state.playing = false;
          state.loopHoldUntil = null;
          updatePlayButton();
        }
      }
    } else {
      state.currentTime += deltaSeconds * BASE_SIMULATION_RATE * state.speed;
      if (state.currentTime >= FORECAST_END) {
        state.currentTime = FORECAST_END;
        triggerOutcome(now);
        state.loopHoldUntil = now + (activeSample().actual ? 2600 : 1200);
      }
    }
    updateSceneForTime();
  }

  updateOutcomeEffect(now);
  updateHeroUnits(now);
  const elapsed = now * 0.001;
  radarGroup.rotation.y = elapsed * 0.22;
  for (const [index, rotor] of drone.rotorGroups.entries()) {
    rotor.rotation.y = elapsed * (index % 2 === 0 ? 15 : -15);
  }
  targetMarker.quaternion.copy(camera.quaternion);
  if (state.outcome?.type === "hit") {
    state.outcome.effect.shockwave.quaternion.copy(camera.quaternion);
  }
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
    if (
      !data.datasets ||
      !Array.isArray(data.datasets.validation?.samples) ||
      data.datasets.validation.samples.length === 0
    ) {
      throw new Error("No validation trajectory samples in data file");
    }

    state.data = data;
    elements.loading.hidden = true;
    elements.enterGame.disabled = false;
    elements.introScreen.classList.add("ready");
    elements.introStatus.textContent = "SYSTEM READY";
    elements.autoAdvance.checked = state.autoAdvance;
    bindEvents();

    const rawHashId = window.location.hash.slice(1).trim().toUpperCase();
    const initialDataset = rawHashId.startsWith("TEST_") ? "submission" : "validation";
    setDataset(initialDataset);
    const hashId = normalizeSampleId(rawHashId);
    const initialIndex = state.samplesById.get(hashId) ?? 0;
    if (initialIndex !== 0) {
      setSample(initialIndex);
    }
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.systemStatus.textContent = "DATA OFFLINE";
  }
}

createIcons({ icons: ICONS });
updateBaseHealth();
updateMissionProgress();
loadData();
requestAnimationFrame(animate);
