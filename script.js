import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ==========================================
// 1. CONFIGURATION & DOM ELEMENTS
// ==========================================
const CONFIG = {
  debugMode: false,
  dwellThreshold: 90,
  roomTextureUrl:
    "https://res.cloudinary.com/dabshzrnj/image/upload/v1788923901/Gemini_Generated_Image_ua25woua25woua25_zjl1ii.jpg",
};

const DOM = {
  sensorOverlay: document.getElementById("sensor-overlay"),
  unlockBtn: document.getElementById("unlock-btn"),
};

// ==========================================
// 2. GLOBAL STATE & THREE.JS CORE
// ==========================================
const state = {
  dwellTimer: 0,
  currentTarget: null,
  hasSpoken: false,
  mixer: null,
  animations: { idle: null, talk: null, walk: null, all: [], currentIndex: 0 },
};

let scene, camera, renderer, cameraRig, clock;
let reticle, reticleMat, raycaster;
const centerScreen = new THREE.Vector2(0, 0);

let lumaMesh, lumaGroup, magicShield;
const creatures = [];
const interactableTargets = [];
let tiaAnaModel;

// Audio Setup
const lumaAudio1 = new Audio("./assets/luma-1-phrase.mp3");
const lumaAudio2 = new Audio("./assets/luma-2-phrase.mp3");
const tiaAnaAudio1 = new Audio("./assets/tiaAna-1-phrase.mp3");
const tiaAnaAudio2 = new Audio("./assets/tiaAna-2-phrase.mp3");
const tiaAnaAudio3 = new Audio("./assets/tiaAna-3-phrase.mp3");
const tiaAnaAudio4 = new Audio("./assets/tiaAna-4-phrase.mp3");

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
  bgMusic.fade(bgMusic.volume(), 0.07, 700);
}

function turnUpVolume() {
  bgMusic.fade(bgMusic.volume(), 0.25, 1700);
}

function playDialogue() {
  if (bgMusic.playing()) {
    turnDownVolume();

    let DialogueTl = gsap.timeline({
      onComplete: () => {
        if (bgMusic.playing()) turnUpVolume; // I can do an onComplete for each phrase later.
      },
    });

    DialogueTl.call(() => {
      lumaAudio1.play().catch((e) => console.log("audio 1 blocked", e));
    })
      .to({}, { duration: 11.7 })
      .call(() => {
        lumaAudio2.play().catch((e) => console.log("audio 2 blocked", e));
      })
      .to({}, { duration: 17.13 })
      .call(() => {
        tiaAnaAudio1.play().catch((e) => console.log("audio 3 blocked", e));
      })
      .to({}, { duration: 5.7 })
      .call(() => {
        tiaAnaAudio2.play().catch((e) => console.log("audio 4 blocked", e));
      })
      .to({}, { duration: 13.3 });
  }
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
  loadTiaAnaModel();

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

  if (isQuestOrHeadset && DOM.sensorOverlay) {
    DOM.sensorOverlay.style.display = "none";
  } else if (isMobile) {
    if (window.WebXRPolyfill) {
      new window.WebXRPolyfill({ force: true });
    }
  } else {
    if (DOM.sensorOverlay) DOM.sensorOverlay.style.display = "none";
  }

  DOM.unlockBtn?.addEventListener("click", async () => {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          alert("Gyroscope permission denied!");
          return;
        }
      } catch (err) {
        console.error("Gyro error:", err);
      }
    }
    if (DOM.sensorOverlay) DOM.sensorOverlay.style.display = "none";
  });
}

function setupCoreEnvironment() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();

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
    tiaAnaModel.scale.setScalar(1.3);
    tiaAnaModel.position.set(1.3, -0.5, 3);
    tiaAnaModel.rotation.set(0, -2.3, 0);
    scene.add(tiaAnaModel);

    state.mixer = new THREE.AnimationMixer(tiaAnaModel);
    const clips = gltf.animations;

    if (clips.length > 0) {
      state.animations.all = clips.map((clip) => state.mixer.clipAction(clip));
      state.animations.all[state.animations.currentIndex].play();

      window.addEventListener("keydown", (event) => {
        if (event.code === "Space") {
          state.animations.all[state.animations.currentIndex].stop();
          state.animations.currentIndex =
            (state.animations.currentIndex + 1) % state.animations.all.length;
          state.animations.all[state.animations.currentIndex].play();
        }
      });
    }
  });
}

// ==========================================
// 5. INTERACTION & ANIMATION LOGIC
// ==========================================
function handleGazeSuccess(hitObject) {
  if (hitObject.name === "Luma") {
    triggerLumaMagic();
  }
}

function triggerLumaMagic() {
  if (state.hasSpoken) return;
  state.hasSpoken = true;

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

  //coloca em timeline gsap depois
  /*triggerTiaAnaEntrance();*/
}

function triggerTiaAnaEntrance() {
  if (!tiaAnaModel) return;

  const { idle, talk, walk } = state.animations;

  if (idle && talk && walk) {
    idle.crossFadeTo(walk, 0.5, false);
    walk.play();

    gsap.to(tiaAnaModel.position, {
      x: 0.8,
      y: -0.5,
      z: -1.5,
      duration: 3,
      ease: "none",
      onComplete: () => {
        walk.crossFadeTo(talk, 0.5, false);
        talk.play();
      },
    });
  } else {
    gsap.to(tiaAnaModel.position, {
      x: 0.8,
      y: -0.5,
      z: 1,
      duration: 3,
      ease: "none",
    });
    gsap.to(tiaAnaModel.rotation, {
      x: 0,
      y: -0.7,
      z: 0,
      duration: 3,
      ease: "none",
    });
  }
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

  updateRaycaster();
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
playAndFadeIn();
