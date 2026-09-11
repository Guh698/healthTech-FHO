import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

// ==========================================
// 0. SMART HEADSET DETECTION & SENSOR HANDLING
// ==========================================
const isQuestOrHeadset = /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
const sensorOverlay = document.getElementById("sensor-overlay");
const unlockBtn = document.getElementById("unlock-btn");

if (isQuestOrHeadset) {
  if (sensorOverlay) sensorOverlay.style.display = "none";
} else {
  if (window.WebXRPolyfill) {
    new window.WebXRPolyfill({ force: true });
  }
}

unlockBtn.addEventListener("click", async () => {
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
  sensorOverlay.style.display = "none";
});

// ==========================================
// 1. CORE SETUP & 360 UPA ROOM
// ==========================================
const scene = new THREE.Scene();

// Load the 360-degree equirectangular image
const textureLoader = new THREE.TextureLoader();
// Placeholder: A public domain 360 image. Replace with your AI-generated UPA room!
const roomTexture = textureLoader.load(
  "https://res.cloudinary.com/dabshzrnj/image/upload/v1788923901/Gemini_Generated_Image_ua25woua25woua25_zjl1ii.jpg",
);
roomTexture.colorSpace = THREE.SRGBColorSpace;

// Create a massive sphere and flip it inside out
const roomGeo = new THREE.SphereGeometry(50, 60, 40);
roomGeo.scale(-1, 1, 1);

// Use MeshBasicMaterial so the image isn't affected by our scene's lights
const roomMat = new THREE.MeshBasicMaterial({ map: roomTexture });
const environmentSphere = new THREE.Mesh(roomGeo, roomMat);
scene.add(environmentSphere);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
document.body.appendChild(renderer.domElement);

const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);

const cameraRig = new THREE.Group();
cameraRig.position.set(0, 1.2, 3);
scene.add(cameraRig);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
cameraRig.add(camera);

// ==========================================
// 2. GAZE RETICLE
// ==========================================
const reticleGeo = new THREE.RingGeometry(0.015, 0.025, 32);
const reticleMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.7,
  depthTest: false,
});
const reticle = new THREE.Mesh(reticleGeo, reticleMat);
reticle.position.set(0, 0, -2);
camera.add(reticle);

// ==========================================
// 3. WARM LIGHTING (Affects Luma, not the walls)
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e5, 1.0);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// ==========================================
// 4. LUMA & MAGICAL ENVIRONMENT
// ==========================================
const targets = [];

const lumaGroup = new THREE.Group();
lumaGroup.position.set(0, 1.4, 1.5);

const lumaGeo = new THREE.IcosahedronGeometry(0.15, 0);
const lumaMat = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  emissive: 0xffaa00,
  emissiveIntensity: 0.8,
  flatShading: true,
});
const lumaMesh = new THREE.Mesh(lumaGeo, lumaMat);
lumaMesh.name = "Luma";
lumaGroup.add(lumaMesh);

const lumaLight = new THREE.PointLight(0xffd700, 2, 5);
lumaGroup.add(lumaLight);

scene.add(lumaGroup);
targets.push(lumaMesh);

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

const shieldGeo = new THREE.SphereGeometry(2, 32, 32);
const shieldMat = new THREE.MeshBasicMaterial({
  color: 0xffd700,
  transparent: true,
  opacity: 0.0,
  side: THREE.BackSide,
});
const magicShield = new THREE.Mesh(shieldGeo, shieldMat);
cameraRig.add(magicShield);

// ==========================================
// 4.5 MAGICAL CREATURES (Bichinhos de Luz)
// ==========================================
const creaturesGroup = new THREE.Group();
scene.add(creaturesGroup);
const creatures = [];

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

// ==========================================
// 5. GAZE RAYCASTING & INTERACTION LOGIC
// ==========================================
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

let dwellTimer = 0;
const DWELL_THRESHOLD = 90;
let currentTarget = null;
let hasSpoken = false;

const lumaAudio = new Audio("./assets/luma-cinematic-voice.mp3");

function triggerLumaMagic() {
  if (hasSpoken) return;
  hasSpoken = true;

  lumaAudio
    .play()
    .catch((e) =>
      console.log(
        "Audio play requires user interaction first on some browsers.",
        e,
      ),
    );

  gsap.to(lumaMesh.rotation, {
    y: Math.PI * 2,
    duration: 1.5,
    ease: "power2.out",
  });
  gsap.to(shieldMat, { opacity: 0.15, duration: 2, ease: "sine.inOut" });

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

function handleGazeSuccess(target) {
  if (target.name === "Luma") {
    triggerLumaMagic();
  }
}

// ==========================================
// 6. MAIN ANIMATION LOOP
// ==========================================
renderer.setAnimationLoop(() => {
  lumaMesh.rotation.x += 0.005;
  lumaMesh.rotation.y += 0.005;

  raycaster.setFromCamera(centerScreen, camera);
  const intersects = raycaster.intersectObjects(targets);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (currentTarget !== hit) {
      currentTarget = hit;
      dwellTimer = 0;
    }
    dwellTimer++;

    const progress = Math.min(1.0, dwellTimer / DWELL_THRESHOLD);
    reticle.scale.set(1 + progress * 0.8, 1 + progress * 0.8, 1);
    reticleMat.color.setHex(progress >= 1.0 ? 0xffd700 : 0xffffff);

    if (dwellTimer >= DWELL_THRESHOLD) {
      handleGazeSuccess(hit);
      dwellTimer = 0;
    }
  } else {
    if (currentTarget) {
      currentTarget = null;
    }
    dwellTimer = 0;
    reticle.scale.set(1, 1, 1);
    reticleMat.color.setHex(0xffffff);
  }

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
