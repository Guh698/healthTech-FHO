import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ==========================================
// 1. CONFIGURATION & DOM ELEMENTS
// ==========================================
const CONFIG = {
  debugMode: false,
  invertAudio: false,
  voiceVolume: 2.5,
  voiceRefDistance: 3.5,
  voiceRolloff: 1.0,
  dwellThreshold: 90,
  walkSpeed: 1.5,
  walkRamp: 0.25,
  blendTime: 0.8,
  turnTime: 0.8,
  stopFacingOffset: -0.4,
  walkDirection: 1,
  lookPointPosition: { x: -3, y: 1.4, z: -1.5 },
  vaccineDistance: 0.9,
  lockBlendTime: 0.8,
  walkPlan: {
    phrase3: [0.25],
    phrase4: [0, -0.25],
  },
  roomTextureUrl:
    "https://res.cloudinary.com/dabshzrnj/image/upload/v1788923901/Gemini_Generated_Image_ua25woua25woua25_zjl1ii.jpg",
};

const DOM = {
  startScreen: document.getElementById("start-screen"),
  startBtn: document.getElementById("start-btn"),
  startStatus: document.getElementById("start-status"),
  instructions: document.getElementById("instructions"),
};

// ==========================================
// 2. GLOBAL STATE & THREE.JS CORE
// ==========================================
const state = {
  started: false,
  gyroDenied: false,
  dwellTimer: 0,
  currentTarget: null,
  hasSpoken: false,
  vaccineStarted: false,
  lookPointActive: false,
  viewLockOn: false,
  viewLockWeight: 0,
  viewLockQuat: null,
  mixer: null,
  animations: { idle: null, talk: null, walk: null, all: [], currentIndex: 0 },
};

function fadeToAction(nextAction, duration = 0.5) {
  if (!nextAction) {
    console.warn("Animation action is missing/null!");
    return;
  }

  const previousAction = state.animations.activeAction;

  if (previousAction && previousAction !== nextAction) {
    previousAction.fadeOut(duration);
  }

  nextAction
    .reset()
    .setEffectiveTimeScale(1)
    .setEffectiveWeight(1)
    .fadeIn(duration)
    .play();

  state.animations.activeAction = nextAction;
}

let scene, camera, renderer, cameraRig, clock;
let reticle, reticleMat, raycaster;
const centerScreen = new THREE.Vector2(0, 0);

let lumaMesh, lumaGroup, magicShield;
const creatures = [];
const interactableTargets = [];
let tiaAnaModel;

let listener;
let lumaSound1, lumaSound2;
let tiaAnaSound1, tiaAnaSound2, tiaAnaSound3, tiaAnaSound4;
let tiaAnaSound5, tiaAnaSound6;
let lookPoint, lookRing, lookHit;
const lockTarget = new THREE.Quaternion();
const headInverse = new THREE.Quaternion();

const bgMusic = new Howl({
  src: "./assets/fluteMusic.mp3",
  loop: true,
  volume: 0.0,
  preload: true,
});

function playAndFadeIn() {
  if (!bgMusic.playing()) {
    bgMusic.play();
    bgMusic.fade(0.0, 0.25, 1700);
  }
}

function turnDownVolume() {
  bgMusic.fade(bgMusic.volume(), 0.05, 700);
}

function turnUpVolume() {
  bgMusic.fade(bgMusic.volume(), 0.25, 1700);
}

function configureVoiceAudio(positionalAudio) {
  positionalAudio.setRefDistance(CONFIG.voiceRefDistance);
  positionalAudio.setRolloffFactor(CONFIG.voiceRolloff);
  positionalAudio.setVolume(CONFIG.voiceVolume);
}

function voiceLength(sound, fallback) {
  return sound?.buffer?.duration ?? fallback;
}

function playDialogue() {
  const musicWasOn = bgMusic.playing();
  if (musicWasOn) turnDownVolume();

  const DialogueTl = gsap.timeline({
    onComplete: () => {
      if (bgMusic.playing()) turnUpVolume(); // I can do an onComplete for each phrase later.
    },
  });

  DialogueTl.call(() => {
    if (lumaSound1.buffer && !lumaSound1.isPlaying) lumaSound1.play();
  })
    .to({}, { duration: 11.7 })
    .call(() => {
      if (lumaSound2.buffer && !lumaSound2.isPlaying) lumaSound2.play();
    })
    .to({}, { duration: 17.13 })
    .call(() => {
      if (!tiaAnaModel) return;

      DialogueTl.pause();

      triggerTiaAnaEntrance(() => {
        if (tiaAnaSound1.buffer && !tiaAnaSound1.isPlaying) tiaAnaSound1.play();
        DialogueTl.resume();
      });
    })
    .to({}, { duration: 5.7 })
    .call(() => {
      if (tiaAnaSound2.buffer && !tiaAnaSound2.isPlaying) tiaAnaSound2.play();
    })
    .to({}, { duration: voiceLength(tiaAnaSound2, 13.87) + 0.3 })
    .call(() => {
      walkAroundWhileTalking(
        CONFIG.walkPlan.phrase3,
        voiceLength(tiaAnaSound3, 10.61),
      );
      if (tiaAnaSound3.buffer && !tiaAnaSound3.isPlaying) tiaAnaSound3.play();
    })
    .to({}, { duration: voiceLength(tiaAnaSound3, 10.61) + 0.3 })
    .call(() => {
      walkAroundWhileTalking(
        CONFIG.walkPlan.phrase4,
        voiceLength(tiaAnaSound4, 16.51),
      );
      if (tiaAnaSound4.buffer && !tiaAnaSound4.isPlaying) tiaAnaSound4.play();
    })
    .to({}, { duration: voiceLength(tiaAnaSound4, 16.51) })
    .call(() => {
      settleIdle();
      showLookPoint();
    });
}

// ==========================================
// 3. INITIALIZATION
// ==========================================
function init() {
  setupDeviceSensors();
  setupCoreEnvironment();
  setupLighting();
  setupReticle();
  setupLumaAndMagic();
  setupLookPoint();
  loadTiaAnaModel();
  setupSpatialAudio();
  setupStartScreen();

  renderer.setAnimationLoop(animate);
  window.addEventListener("resize", onWindowResize);
}

// ==========================================
// 4. SETUP FUNCTIONS
// ==========================================

function setupDeviceSensors() {
  const isQuestOrHeadset = /OculusBrowser|Quest|Pico/i.test(
    navigator.userAgent,
  );
  const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);

  if (!isQuestOrHeadset && isMobile && window.WebXRPolyfill) {
    new window.WebXRPolyfill({ force: true });
  }
}

function needsGyroPermission() {
  return (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  );
}

function setupStartScreen() {
  DOM.startBtn?.addEventListener("click", async () => {
    if (state.started) return;

    unlockAudio();

    if (needsGyroPermission() && !state.gyroDenied) {
      DOM.startBtn.disabled = true;
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          state.gyroDenied = true;
          DOM.startBtn.disabled = false;
          DOM.startBtn.textContent = "CONTINUE WITHOUT GYROSCOPE";
          DOM.startStatus.textContent =
            "Gyroscope was denied, so looking around won't work. You can continue anyway.";
          return;
        }
      } catch (err) {
        console.error("Gyro error:", err);
      }
      DOM.startBtn.disabled = false;
    }

    startExperience();
  });
}

function unlockAudio() {
  try {
    const ctx = THREE.AudioContext.getContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch (err) {
    console.warn("Could not resume Three.js audio context:", err);
  }

  try {
    if (window.Howler?.ctx && window.Howler.ctx.state === "suspended") {
      window.Howler.ctx.resume();
    }
  } catch (err) {
    console.warn("Could not resume Howler audio context:", err);
  }
}

function startExperience() {
  state.started = true;

  playAndFadeIn();

  DOM.startScreen.classList.add("fade-out");
  setTimeout(() => {
    DOM.startScreen.style.display = "none";
  }, 750);

  DOM.instructions?.classList.remove("hidden");
}

function setupCoreEnvironment() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  listener = new THREE.AudioListener();

  if (CONFIG.invertAudio) {
    listener.rotation.y = Math.PI;
  }

  if (CONFIG.debugMode) {
    scene.background = new THREE.Color("#121418");
    const grid = new THREE.GridHelper(20, 20, 0x00ffff, 0x333333);
    grid.position.y = -0.5;
    scene.add(grid);
  } else {
    const textureLoader = new THREE.TextureLoader();
    const roomTexture = textureLoader.load(CONFIG.roomTextureUrl);
    roomTexture.colorSpace = THREE.SRGBColorSpace;

    const roomGeo = new THREE.SphereGeometry(50, 60, 40);
    roomGeo.scale(-1, 1, 1);
    const roomMat = new THREE.MeshBasicMaterial({ map: roomTexture });
    scene.add(new THREE.Mesh(roomGeo, roomMat));
  }

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  cameraRig = new THREE.Group();
  cameraRig.position.set(0, 0.7, 2.5);
  scene.add(cameraRig);

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  cameraRig.add(camera);

  camera.add(listener);
}

function setupLighting() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xfff4e5, 1.0);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);
}

function setupReticle() {
  raycaster = new THREE.Raycaster();

  const reticleGeo = new THREE.RingGeometry(0.015, 0.025, 32);
  reticleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  });
  reticle = new THREE.Mesh(reticleGeo, reticleMat);
  reticle.position.set(0, 0, -2);
  camera.add(reticle);
}

function setupLumaAndMagic() {
  lumaGroup = new THREE.Group();
  lumaGroup.position.set(0, 1.4, 1.5);

  const lumaGeo = new THREE.IcosahedronGeometry(0.15, 0);
  const lumaMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 0.8,
    flatShading: true,
  });

  lumaMesh = new THREE.Mesh(lumaGeo, lumaMat);
  lumaMesh.name = "Luma";
  lumaGroup.add(lumaMesh);
  lumaGroup.add(new THREE.PointLight(0xffd700, 2, 5));

  scene.add(lumaGroup);
  interactableTargets.push(lumaMesh);

  const shieldGeo = new THREE.SphereGeometry(2, 32, 32);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0.0,
    side: THREE.BackSide,
  });
  magicShield = new THREE.Mesh(shieldGeo, shieldMat);
  cameraRig.add(magicShield);

  const creaturesGroup = new THREE.Group();
  scene.add(creaturesGroup);

  const creatureGeo = new THREE.TetrahedronGeometry(0.05, 1);
  const creatureMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x0088ff,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0,
    flatShading: true,
  });

  for (let i = 0; i < 5; i++) {
    const creature = new THREE.Mesh(creatureGeo, creatureMat.clone());
    creature.position.set(
      (Math.random() - 0.5) * 2,
      1.0 + Math.random() * 0.5,
      -1.5 + (Math.random() - 0.5),
    );
    creature.scale.setScalar(0.1);
    creaturesGroup.add(creature);
    creatures.push(creature);
  }

  gsap.to(lumaMesh.scale, {
    x: 1.15,
    y: 1.15,
    z: 1.15,
    duration: 2,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
  gsap.to(lumaGroup.position, {
    y: 1.5,
    duration: 2.5,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
}

function loadTiaAnaModel() {
  const gltfLoader = new GLTFLoader();

  gltfLoader.load("./assets/tia-ana.glb", (gltf) => {
    tiaAnaModel = gltf.scene;
    tiaAnaModel.scale.setScalar(1.7);
    tiaAnaModel.position.set(3, -2, -3);
    tiaAnaModel.rotation.set(0, -2.3, 0);
    scene.add(tiaAnaModel);

    const audioLoader = new THREE.AudioLoader();
    tiaAnaSound1 = new THREE.PositionalAudio(listener);
    tiaAnaSound2 = new THREE.PositionalAudio(listener);
    tiaAnaSound3 = new THREE.PositionalAudio(listener);
    tiaAnaSound4 = new THREE.PositionalAudio(listener);
    tiaAnaSound5 = new THREE.PositionalAudio(listener);
    tiaAnaSound6 = new THREE.PositionalAudio(listener);

    [
      tiaAnaSound1,
      tiaAnaSound2,
      tiaAnaSound3,
      tiaAnaSound4,
      tiaAnaSound5,
      tiaAnaSound6,
    ].forEach((s) => configureVoiceAudio(s));

    audioLoader.load("./assets/tiaAna-1-phrase.mp3", (buffer) =>
      tiaAnaSound1.setBuffer(buffer),
    );
    audioLoader.load("./assets/tiaAna-2-phrase.mp3", (buffer) =>
      tiaAnaSound2.setBuffer(buffer),
    );
    audioLoader.load("./assets/tiaAna-3-phrase.mp3", (buffer) =>
      tiaAnaSound3.setBuffer(buffer),
    );
    audioLoader.load("./assets/tiaAna-4-phrase.mp3", (buffer) =>
      tiaAnaSound4.setBuffer(buffer),
    );
    loadVoice(audioLoader, tiaAnaSound5, "./assets/tiaAna-5-phrase.mp3");
    loadVoice(audioLoader, tiaAnaSound6, "./assets/tiaAna-6-phrase.mp3");

    tiaAnaModel.add(tiaAnaSound1);
    tiaAnaModel.add(tiaAnaSound2);
    tiaAnaModel.add(tiaAnaSound3);
    tiaAnaModel.add(tiaAnaSound4);
    tiaAnaModel.add(tiaAnaSound5);
    tiaAnaModel.add(tiaAnaSound6);

    state.mixer = new THREE.AnimationMixer(tiaAnaModel);

    state.animations.activeAction = null;

    const clips = gltf.animations;

    if (clips.length > 0) {
      console.log(
        "Animation clips found in GLB:",
        clips.map((c) => c.name),
      );

      clips.forEach((clip) => {
        const action = state.mixer.clipAction(clip);
        const name = clip.name.toLowerCase();

        if (name.includes("idle")) state.animations.idle = action;
        if (name.includes("walk")) state.animations.walk = action;
        if (name.includes("talk")) state.animations.talk = action;

        state.animations.all.push(action);
      });

      if (!state.animations.idle && state.animations.all[0]) {
        state.animations.idle = state.animations.all[0];
      }
      if (!state.animations.walk && state.animations.all[1]) {
        state.animations.walk = state.animations.all[1];
      }
      if (!state.animations.talk && state.animations.all[2]) {
        state.animations.talk = state.animations.all[2];
      }

      if (state.animations.idle) {
        state.animations.idle.play();
        state.animations.activeAction = state.animations.idle;
      }
    }
  });
}

function setupSpatialAudio() {
  const audioLoader = new THREE.AudioLoader();

  lumaSound1 = new THREE.PositionalAudio(listener);
  lumaSound2 = new THREE.PositionalAudio(listener);

  [lumaSound1, lumaSound2].forEach((s) => configureVoiceAudio(s));

  audioLoader.load("./assets/luma-1-phrase.mp3", (buffer) =>
    lumaSound1.setBuffer(buffer),
  );
  audioLoader.load("./assets/luma-2-phrase.mp3", (buffer) =>
    lumaSound2.setBuffer(buffer),
  );

  lumaGroup.add(lumaSound1);
  lumaGroup.add(lumaSound2);
}

function loadVoice(audioLoader, sound, url) {
  audioLoader.load(
    url,
    (buffer) => sound.setBuffer(buffer),
    undefined,
    () => console.warn(`Audio not found yet: ${url}`),
  );
}

function setupLookPoint() {
  const p = CONFIG.lookPointPosition;
  lookPoint = new THREE.Group();
  lookPoint.position.set(p.x, p.y, p.z);
  lookPoint.scale.setScalar(0);
  lookPoint.visible = false;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.9,
    }),
  );

  lookRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.26, 48),
    new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    }),
  );

  lookHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  lookHit.name = "LookPoint";

  lookPoint.add(core, lookRing, lookHit);
  scene.add(lookPoint);

  gsap.to(lookRing.scale, {
    x: 1.3,
    y: 1.3,
    z: 1.3,
    duration: 1.2,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
}

// ==========================================
// 5. INTERACTION & ANIMATION LOGIC
// ==========================================
function handleGazeSuccess(hitObject) {
  if (hitObject.name === "Luma") {
    triggerLumaMagic();
  }
  if (hitObject.name === "LookPoint") {
    startVaccineSequence();
  }
}

function triggerLumaMagic() {
  if (state.hasSpoken) return;
  state.hasSpoken = true;

  DOM.instructions?.classList.add("hidden");

  playDialogue();

  gsap.to(lumaMesh.rotation, {
    y: Math.PI * 2,
    duration: 1.5,
    ease: "power2.out",
  });

  gsap.to(magicShield.material, {
    opacity: 0.0, //so weird yet haha
    duration: 2,
    ease: "sine.inOut",
  });

  creatures.forEach((creature, index) => {
    gsap.to(creature.material, {
      opacity: 1,
      emissiveIntensity: 1.5,
      duration: 1,
      delay: index * 0.2,
    });
    gsap.to(creature.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 1,
      delay: index * 0.2,
      ease: "back.out(1.7)",
    });
    gsap.to(creature.position, {
      y: creature.position.y + 0.2,
      duration: 1.5 + Math.random(),
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  });
}

function triggerTiaAnaEntrance(onArrive) {
  if (!tiaAnaModel) {
    console.warn("Tia Ana model not loaded yet, entrance skipped.");
    return;
  }

  const entranceTimeline = gsap.timeline();

  entranceTimeline.call(() => {
    fadeToAction(state.animations.walk, 0.5);
  });

  entranceTimeline.to(
    tiaAnaModel.rotation,
    {
      y: Math.PI,
      duration: 0.5,
      ease: "power2.inOut",
    },
    "<",
  );

  entranceTimeline.to(tiaAnaModel.rotation, {
    y: -0.5,
    duration: 0.3,
    ease: "none",
  });

  entranceTimeline.to(tiaAnaModel.position, {
    x: 1, //3
    z: 1, //-4
    y: -0.5,
    duration: 2,
    ease: "none",
    onComplete: () => {
      fadeToAction(state.animations.talk, 0.5);
      if (onArrive) onArrive();

      gsap.to(tiaAnaModel.rotation, {
        y: -1,
        duration: 0.5,
        ease: "power2.inOut",
      });
    },
  });

  entranceTimeline.to(
    tiaAnaModel.scale,
    {
      x: 1.3,
      y: 1.3,
      z: 1.3,
      duration: 2,
      ease: "none",
    },
    "<",
  );
}

let orbit = null;

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function walkEase(t, ramp = CONFIG.walkRamp) {
  if (ramp <= 0) return t;
  const v = 1 / (1 - ramp);
  if (t < ramp) return (v * t * t) / (2 * ramp);
  if (t > 1 - ramp) {
    const u = 1 - t;
    return 1 - (v * u * u) / (2 * ramp);
  }
  return v * (t - ramp / 2);
}

function initOrbit() {
  const center = cameraRig.position;
  const dx = tiaAnaModel.position.x - center.x;
  const dz = tiaAnaModel.position.z - center.z;
  const angle = Math.atan2(dx, dz);
  orbit = {
    angle,
    base: angle,
    radius: Math.hypot(dx, dz),
    sign: 1,
    steer: false,
    tl: null,
    lastTime: performance.now(),
  };
}

function walkHeadingAt(angle, sign) {
  return Math.atan2(sign * Math.cos(angle), -sign * Math.sin(angle));
}

function viewerHeadingAt(angle) {
  return (
    Math.atan2(-Math.sin(angle), -Math.cos(angle)) + CONFIG.stopFacingOffset
  );
}

function turnTo(targetY, duration, onComplete) {
  gsap.killTweensOf(tiaAnaModel.rotation);
  gsap.to(tiaAnaModel.rotation, {
    y: tiaAnaModel.rotation.y + wrapAngle(targetY - tiaAnaModel.rotation.y),
    duration,
    ease: "power2.inOut",
    onComplete,
  });
}

function applyOrbitPose() {
  const center = cameraRig.position;
  const a = orbit.angle;
  tiaAnaModel.position.x = center.x + Math.sin(a) * orbit.radius;
  tiaAnaModel.position.z = center.z + Math.cos(a) * orbit.radius;

  const now = performance.now();
  const dt = (now - orbit.lastTime) / 1000;
  orbit.lastTime = now;

  if (orbit.steer) {
    const target = walkHeadingAt(a, orbit.sign);
    const k = 1 - Math.exp(-10 * dt);
    tiaAnaModel.rotation.y += wrapAngle(target - tiaAnaModel.rotation.y) * k;
  }
}

function startWalking(leg) {
  orbit.steer = false;
  orbit.sign = leg.sign;
  fadeToAction(state.animations.walk, CONFIG.blendTime);
  turnTo(walkHeadingAt(orbit.angle, leg.sign), CONFIG.turnTime, () => {
    orbit.steer = true;
    orbit.lastTime = performance.now();
  });
}

function stopAndTalk(stopAngle) {
  orbit.steer = false;
  turnTo(viewerHeadingAt(stopAngle), CONFIG.turnTime);
  fadeToAction(state.animations.talk, CONFIG.blendTime);
}

function settleIdle() {
  if (!tiaAnaModel) return;
  orbit?.tl?.kill();
  if (orbit) {
    orbit.steer = false;
    turnTo(viewerHeadingAt(orbit.angle), CONFIG.turnTime);
  }
  fadeToAction(state.animations.idle, CONFIG.blendTime);
}

function walkAroundWhileTalking(fractions, phraseDuration) {
  if (!tiaAnaModel) {
    console.warn("Tia Ana model not loaded yet, walk skipped.");
    return;
  }
  if (!orbit) initOrbit();
  orbit.tl?.kill();
  orbit.steer = false;

  const legs = [];
  let from = orbit.angle;
  for (const f of fractions) {
    const to = orbit.base + CONFIG.walkDirection * f * Math.PI * 2;
    const distance = Math.abs(to - from) * orbit.radius;
    if (distance > 0.01) {
      legs.push({
        to,
        sign: Math.sign(to - from),
        duration: distance / (CONFIG.walkSpeed * (1 - CONFIG.walkRamp)),
      });
    }
    from = to;
  }

  if (legs.length === 0) {
    stopAndTalk(orbit.angle);
    return;
  }

  const lead = CONFIG.turnTime * 0.5;
  const busy = legs.reduce((sum, leg) => sum + lead + leg.duration, 0);
  const talkPause = Math.max(0, (phraseDuration - busy) / legs.length);

  const tl = gsap.timeline();
  orbit.tl = tl;

  let t = 0;
  legs.forEach((leg) => {
    tl.call(() => startWalking(leg), null, t);
    tl.to(
      orbit,
      {
        angle: leg.to,
        duration: leg.duration,
        ease: (p) => walkEase(p),
        onStart: () => {
          orbit.lastTime = performance.now();
        },
        onUpdate: applyOrbitPose,
      },
      t + lead,
    );
    tl.call(
      () => stopAndTalk(leg.to),
      null,
      t + lead + leg.duration * (1 - CONFIG.walkRamp),
    );
    t += lead + leg.duration + talkPause;
  });
}

function showLookPoint() {
  if (!lookPoint || state.lookPointActive) return;
  state.lookPointActive = true;
  lookPoint.visible = true;
  interactableTargets.push(lookHit);

  gsap.to(lookPoint.scale, {
    x: 1,
    y: 1,
    z: 1,
    duration: 1.2,
    ease: "back.out(1.7)",
  });

  if (tiaAnaSound5?.buffer && !tiaAnaSound5.isPlaying) tiaAnaSound5.play();
}

function hideLookPoint() {
  const i = interactableTargets.indexOf(lookHit);
  if (i !== -1) interactableTargets.splice(i, 1);

  gsap.to(lookPoint.scale, {
    x: 0,
    y: 0,
    z: 0,
    duration: 0.8,
    ease: "power2.in",
    onComplete: () => {
      lookPoint.visible = false;
    },
  });
}

function setViewLock(on) {
  if (on)
    state.viewLockQuat = camera.getWorldQuaternion(new THREE.Quaternion());
  state.viewLockOn = on;
  gsap.killTweensOf(state);
  gsap.to(state, {
    viewLockWeight: on ? 1 : 0,
    duration: CONFIG.lockBlendTime,
    ease: "sine.inOut",
  });
}

function updateViewLock() {
  if (!state.viewLockQuat) return;

  if (!state.viewLockOn && state.viewLockWeight <= 0) {
    cameraRig.quaternion.identity();
    state.viewLockQuat = null;
    return;
  }

  const head = renderer.xr.isPresenting
    ? renderer.xr.getCamera().quaternion
    : camera.quaternion;
  lockTarget.copy(state.viewLockQuat).multiply(headInverse.copy(head).invert());
  cameraRig.quaternion.identity().slerp(lockTarget, state.viewLockWeight);
}

function walkBehindViewer(onArrive) {
  if (!tiaAnaModel) {
    console.warn("Tia Ana model not loaded yet, walk skipped.");
    onArrive?.();
    return;
  }
  if (!orbit) initOrbit();
  orbit.tl?.kill();
  orbit.steer = false;

  const look = camera.getWorldDirection(new THREE.Vector3());
  const frontAngle = Math.atan2(look.x, look.z);
  const backAngle = frontAngle + Math.PI;

  const delta = wrapAngle(backAngle - orbit.angle);

  const distance = Math.hypot(
    delta * orbit.radius,
    orbit.radius - CONFIG.vaccineDistance,
  );
  const leg = {
    to: orbit.angle + delta,
    sign: Math.sign(delta) || 1,
    duration: Math.max(
      0.5,
      distance / (CONFIG.walkSpeed * (1 - CONFIG.walkRamp)),
    ),
  };
  const lead = CONFIG.turnTime * 0.5;

  const tl = gsap.timeline();
  orbit.tl = tl;

  tl.call(() => startWalking(leg), null, 0)
    .to(
      orbit,
      {
        angle: leg.to,
        radius: CONFIG.vaccineDistance,
        duration: leg.duration,
        ease: (p) => walkEase(p),
        onStart: () => {
          orbit.lastTime = performance.now();
        },
        onUpdate: applyOrbitPose,
      },
      lead,
    )
    .call(
      () => stopAndTalk(leg.to),
      null,
      lead + leg.duration * (1 - CONFIG.walkRamp),
    )
    .call(
      () => onArrive?.(),
      null,
      lead + leg.duration + CONFIG.turnTime * 0.5,
    );
}

function startVaccineSequence() {
  if (state.vaccineStarted) return;
  state.vaccineStarted = true;

  hideLookPoint();
  setViewLock(true);
  if (bgMusic.playing()) turnDownVolume();

  walkBehindViewer(() => {
    if (tiaAnaSound6?.buffer && !tiaAnaSound6.isPlaying) tiaAnaSound6.play();
    gsap.delayedCall(voiceLength(tiaAnaSound6, 12), finishVaccine);
  });
}

function finishVaccine() {
  setViewLock(false);
  settleIdle();
  if (bgMusic.playing()) turnUpVolume();
}

// ==========================================
// 6. MAIN RENDER LOOP & EVENT HANDLERS
// ==========================================
function animate() {
  const delta = clock.getDelta();
  if (state.mixer) state.mixer.update(delta);

  if (lumaMesh) {
    lumaMesh.rotation.x += 0.005;
    lumaMesh.rotation.y += 0.005;
  }

  updateViewLock();
  if (lookPoint?.visible) lookPoint.lookAt(cameraRig.position);

  if (state.started) updateRaycaster();

  renderer.render(scene, camera);
}

function updateRaycaster() {
  raycaster.setFromCamera(centerScreen, camera);
  const intersects = raycaster.intersectObjects(interactableTargets);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (state.currentTarget !== hit) {
      state.currentTarget = hit;
      state.dwellTimer = 0;
    }
    state.dwellTimer++;

    const progress = Math.min(1.0, state.dwellTimer / CONFIG.dwellThreshold);
    reticle.scale.set(1 + progress * 0.8, 1 + progress * 0.8, 1);
    reticleMat.color.setHex(progress >= 1.0 ? 0xffd700 : 0xffffff);

    if (state.dwellTimer >= CONFIG.dwellThreshold) {
      handleGazeSuccess(hit);
      state.dwellTimer = 0;
    }
  } else {
    if (state.currentTarget) state.currentTarget = null;
    state.dwellTimer = 0;
    reticle.scale.set(1, 1, 1);
    reticleMat.color.setHex(0xffffff);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
