# Pediatric UPA VR Experience

> An immersive, WebXR-powered spatial computing prototype designed to reduce anxiety in pediatric patients (ages 5-7) during clinical procedures. Developed as a HealthTech initiative at FHO (Fundação Hermínio Ometto).

**Live Prototype:** [https://healthtech-fho.netlify.app](https://healthtech-fho.netlify.app)

## Executive Overview

Medical trauma and needle phobia in early childhood can lead to lifelong healthcare avoidance. This prototype reimagines the standard Unidade de Pronto Atendimento (UPA) environment as an interactive, safe, and magical space.

By leveraging WebXR and Three.js, the application provides a browser-based virtual reality experience that requires no dedicated app installation, making it highly accessible for public health infrastructure.

## Core Features

- **Gaze-Based Interaction:** Engineered for minimal friction. Children interact with the environment entirely through a dwell-time raycaster reticle, eliminating the need for complex physical controllers.
- **Procedural Environment Transition:** The clinical 360-degree room dynamically transforms into a protective, comforting space driven by GSAP animation sequences and particle physics.
- **Virtual Guide (Luma):** A 3D companion that validates the child's fear and establishes a visual "safe zone" using glowing geometries and ambient light adjustments.
- **Character Kinematics:** Features "Tia Ana," a fully rigged and animated 3D nurse model (driven by `THREE.AnimationMixer`). She seamlessly transitions between walking, talking, and idle states to explain procedures using child-friendly metaphors.
- **Smart Device Routing:** Implements custom user-agent sniffing to natively support Android WebXR while gracefully applying a gyroscope polyfill fallback for iOS.

## Technical Stack

- **Core Engine:** Three.js (WebGL)
- **Spatial Computing:** WebXR Device API
- **Animation & Sequencing:** GSAP (GreenSock Animation Platform)
- **Asset Pipeline:** Blender (NLA tracks, GLTF 2.0), Mixamo
- **Deployment:** Netlify

---

**Luiz Gustavo** | Creative Developer
