import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';

// ============ SCENE SETUP ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6CB4EE);
scene.fog = new THREE.FogExp2(0x88CCF0, 0.008);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 14, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const root = document.getElementById('root') ?? document.body;
root.appendChild(renderer.domElement);

// ============ POST-PROCESSING ============
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Screen-Space Ambient Occlusion
const saoPass = new SAOPass(scene, camera);
saoPass.params.saoBias = 0.5;
saoPass.params.saoIntensity = 0.015;
saoPass.params.saoScale = 4;
saoPass.params.saoKernelRadius = 30;
saoPass.params.saoMinResolution = 0;
saoPass.params.saoBlur = true;
saoPass.params.saoBlurRadius = 6;
saoPass.params.saoBlurStdDev = 4;
saoPass.params.saoBlurDepthCutoff = 0.01;
composer.addPass(saoPass);

// Very subtle bloom — just a hint on emissives
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.1, 0.3, 0.95
);
composer.addPass(bloomPass);

// Custom color grading / vignette pass
const colorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteIntensity: { value: 0.35 },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
    brightness: { value: 0.02 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteIntensity;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.35, 0.85, dist) * vignetteIntensity;
      color.rgb *= vignette;
      // Saturation
      float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(lum), color.rgb, saturation);
      // Contrast + brightness
      color.rgb = (color.rgb - 0.5) * contrast + 0.5 + brightness;
      gl_FragColor = color;
    }
  `
};
const colorGradePass = new ShaderPass(colorGradeShader);
composer.addPass(colorGradePass);

// SMAA anti-aliasing (since we disabled built-in AA for composer)
const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
composer.addPass(smaaPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.3;
controls.minDistance = 8;
controls.maxDistance = 25;
controls.target.set(0, 0, 0);

// ============ LIGHTING (enhanced multi-light GI approximation) ============
// Hemisphere light replaces flat ambient — simulates sky/ground color bounce
const hemiLight = new THREE.HemisphereLight(0x88bbee, 0x445522, 0.7);
hemiLight.name = 'hemiLight';
scene.add(hemiLight);

// Subtle ambient fill to lift pure shadows
const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.15);
ambientLight.name = 'ambientLight';
scene.add(ambientLight);

// Main directional sunlight — warm, strong, with high-res shadow map
const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
sunLight.name = 'sunLight';
sunLight.position.set(8, 18, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.left = -14;
sunLight.shadow.camera.right = 14;
sunLight.shadow.camera.top = 14;
sunLight.shadow.camera.bottom = -14;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 50;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.03;
sunLight.shadow.radius = 2;
scene.add(sunLight);
scene.add(sunLight.target);

// Cool blue rim/back light — simulates sky bounce from behind
const rimLight = new THREE.DirectionalLight(0x6699cc, 0.5);
rimLight.name = 'rimLight';
rimLight.position.set(-6, 10, -6);
scene.add(rimLight);

// Warm fill light from the opposite side — reduces harsh shadow contrast
const fillLight = new THREE.DirectionalLight(0xffeedd, 0.35);
fillLight.name = 'fillLight';
fillLight.position.set(-8, 6, 4);
scene.add(fillLight);

// Board-focused point light (warm glow — like a nearby lantern)
const pointLight = new THREE.PointLight(0xffaa44, 0.4, 25);
pointLight.name = 'pointLight';
pointLight.position.set(0, 6, 0);
scene.add(pointLight);

// Subtle colored bounce light from below (ground bounce)
const groundBounce = new THREE.PointLight(0x88cc66, 0.15, 20);
groundBounce.name = 'groundBounce';
groundBounce.position.set(0, -0.3, 0);
scene.add(groundBounce);

// ============ MATERIALS (physically-based, subsurface-approximation for pieces) ============
const whitePieceMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff8e7, roughness: 0.22, metalness: 0.0,
  clearcoat: 0.15, clearcoatRoughness: 0.3,
  sheen: 0.25, sheenColor: new THREE.Color(0xffeedd), sheenRoughness: 0.4,
});
const blackPieceMat = new THREE.MeshPhysicalMaterial({
  color: 0x2a1a3e, roughness: 0.2, metalness: 0.02,
  clearcoat: 0.2, clearcoatRoughness: 0.25,
  sheen: 0.3, sheenColor: new THREE.Color(0x5533aa), sheenRoughness: 0.35,
});
const eyeWhiteMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.1 });
const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x080808, roughness: 0.05, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.05 });
const mouthMat = new THREE.MeshPhysicalMaterial({ color: 0xcc3333, roughness: 0.35, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.2 });
const crownMat = new THREE.MeshPhysicalMaterial({
  color: 0xffd700, roughness: 0.1, metalness: 0.85,
  clearcoat: 0.4, clearcoatRoughness: 0.1,
  emissive: 0xffaa00, emissiveIntensity: 0.06
});
const cheekMat = new THREE.MeshPhysicalMaterial({ color: 0xff9999, roughness: 0.55, transparent: true, opacity: 0.5 });
const highlightMat = new THREE.MeshStandardMaterial({ color: 0x44ff88, roughness: 0.5, transparent: true, opacity: 0.6, emissive: 0x22aa44, emissiveIntensity: 0.5 });
const selectedMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, roughness: 0.5, transparent: true, opacity: 0.7, emissive: 0xddaa22, emissiveIntensity: 0.6 });
const lastMoveMat = new THREE.MeshStandardMaterial({ color: 0x66aaff, roughness: 0.5, transparent: true, opacity: 0.4, emissive: 0x3366cc, emissiveIntensity: 0.3 });
const captureMat = new THREE.MeshStandardMaterial({ color: 0xff4466, roughness: 0.5, transparent: true, opacity: 0.6, emissive: 0xcc2244, emissiveIntensity: 0.5 });

// ============ PRISON AREAS ============
const prisonWhiteGroup = new THREE.Group();
prisonWhiteGroup.name = 'prisonWhite';
prisonWhiteGroup.position.set(0, 0, -7.5); // Behind black's side
scene.add(prisonWhiteGroup);

const prisonBlackGroup = new THREE.Group();
prisonBlackGroup.name = 'prisonBlack';
prisonBlackGroup.position.set(0, 0, 7.5); // Behind white's side
scene.add(prisonBlackGroup);

function buildPrison(group, label) {
  // Stone floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.12, 2.8),
    new THREE.MeshPhysicalMaterial({ color: 0x555566, roughness: 0.85, metalness: 0 })
  );
  floor.name = `${label}_floor`;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  group.add(floor);

  // Back wall
  const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x6a6a7a, roughness: 0.88, metalness: 0 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.15), wallMat);
  backWall.name = `${label}_backWall`;
  backWall.position.set(0, 0.24, label === 'prisonWhite' ? -1.3 : 1.3);
  backWall.castShadow = true;
  group.add(backWall);

  // Side walls
  for (let side = -1; side <= 1; side += 2) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 2.8), wallMat);
    sideWall.name = `${label}_sideWall_${side}`;
    sideWall.position.set(side * 3.5, 0.24, 0);
    sideWall.castShadow = true;
    group.add(sideWall);
  }

  // Iron bars across the front
  const barMat = new THREE.MeshPhysicalMaterial({ color: 0x3a3a3a, roughness: 0.25, metalness: 0.85, clearcoat: 0.1, clearcoatRoughness: 0.3 });
  for (let i = 0; i < 16; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), barMat);
    bar.name = `${label}_bar_${i}`;
    bar.position.set(-3.25 + i * 0.44, 0.24, label === 'prisonWhite' ? 1.3 : -1.3);
    group.add(bar);
  }

  // Horizontal bar top
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.08), barMat);
  topBar.name = `${label}_topBar`;
  topBar.position.set(0, 1.04, label === 'prisonWhite' ? 1.3 : -1.3);
  group.add(topBar);

  // Horizontal bar bottom
  const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.08), barMat);
  bottomBar.name = `${label}_bottomBar`;
  bottomBar.position.set(0, -0.44, label === 'prisonWhite' ? 1.3 : -1.3);
  group.add(bottomBar);

  // Horizontal bar mid
  const midBar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 0.06), barMat);
  midBar.name = `${label}_midBar`;
  midBar.position.set(0, 0.3, label === 'prisonWhite' ? 1.3 : -1.3);
  group.add(midBar);

  // Prison sign
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 64;
  const sCtx = signCanvas.getContext('2d');
  sCtx.fillStyle = '#444';
  sCtx.fillRect(0, 0, 256, 64);
  sCtx.fillStyle = '#ddd';
  sCtx.font = 'bold 28px Inter, sans-serif';
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.fillText('⛓ CAPTURED ⛓', 128, 32);
  const signTex = new THREE.CanvasTexture(signCanvas);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.35),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 })
  );
  sign.name = `${label}_sign`;
  sign.position.set(0, 1.2, label === 'prisonWhite' ? 1.32 : -1.32);
  if (label === 'prisonBlack') sign.rotation.y = Math.PI;
  group.add(sign);

  // Corner torches (with flickering point lights)
  for (let side = -1; side <= 1; side += 2) {
    const torchGroup = new THREE.Group();
    torchGroup.name = `${label}_torch_${side}`;

    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.3, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7 })
    );
    bracket.position.y = 0.7;
    torchGroup.add(bracket);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 6),
      new THREE.MeshPhysicalMaterial({ color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 2.0, transparent: true, opacity: 0.9 })
    );
    flame.name = 'flame';
    flame.position.y = 0.9;
    torchGroup.add(flame);

    const torchLight = new THREE.PointLight(0xff6633, 0.6, 5);
    torchLight.name = 'torchLight';
    torchLight.position.y = 0.9;
    torchGroup.add(torchLight);

    torchGroup.position.set(side * 3.35, 0, label === 'prisonWhite' ? 1.2 : -1.2);
    group.add(torchGroup);
  }

  // Ball and chain decoration on the floor
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.7 })
    );
    ball.name = `${label}_ball_${i}`;
    ball.position.set(-2 + i * 2, -0.43, 0);
    group.add(ball);

    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.008, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.8 })
    );
    chain.name = `${label}_chain_${i}`;
    chain.position.set(-2 + i * 2 + 0.1, -0.43, 0);
    chain.rotation.y = Math.PI / 2;
    group.add(chain);
  }
}

buildPrison(prisonWhiteGroup, 'prisonWhite');
buildPrison(prisonBlackGroup, 'prisonBlack');

// Track captured piece 3D objects in prison
let prisonPiecesWhite = []; // White pieces captured by black → go to prisonWhite
let prisonPiecesBlack = []; // Black pieces captured by white → go to prisonBlack

function addToPrison(pieceCode, isWhitePiece) {
  const prisonGroup = isWhitePiece ? prisonWhiteGroup : prisonBlackGroup;
  const prisonPieces = isWhitePiece ? prisonPiecesWhite : prisonPiecesBlack;
  const type = pieceCode[1];
  const idx = prisonPieces.length;

  const pieceObj = pieceCreators[type](isWhitePiece);
  pieceObj.name = `prisoner_${pieceCode}_${idx}_${Date.now()}`;
  pieceObj.scale.setScalar(0.7);

  // Arrange in rows: up to 8 per row
  const row = Math.floor(idx / 8);
  const col = idx % 8;
  const xPos = -2.8 + col * 0.8;
  const zPos = isWhitePiece ? 0.4 - row * 0.9 : -0.4 + row * 0.9;

  pieceObj.position.set(xPos, -0.44, zPos);

  // Face the bars (toward the viewer)
  if (isWhitePiece) {
    pieceObj.rotation.y = 0; // face toward +Z (bars side)
  } else {
    pieceObj.rotation.y = Math.PI; // face toward -Z (bars side)
  }

  pieceObj.userData = {
    piece: pieceCode,
    isWhite: isWhitePiece,
    type,
    idleOffset: Math.random() * Math.PI * 2,
    bounceSpeed: 0.4 + Math.random() * 0.3,
    isPrisoner: true,
    prisonBaseY: -0.44,
    sadPhase: Math.random() * Math.PI * 2,
  };

  prisonGroup.add(pieceObj);
  prisonPieces.push(pieceObj);

  // Dramatic entry: piece flies in from above
  const targetY = pieceObj.position.y;
  pieceObj.position.y = 3;
  pieceObj.scale.setScalar(0.01);
  const startTime = performance.now() / 1000;
  animations.push({
    update: (time) => {
      const t = Math.min(1, (time - startTime) / 0.6);
      const ease = 1 - Math.pow(1 - t, 3);
      pieceObj.position.y = 3 + (targetY - 3) * ease;
      pieceObj.scale.setScalar(0.01 + 0.69 * ease);
      pieceObj.rotation.y += (1 - t) * 0.15;
      return t >= 1;
    },
    onComplete: () => {
      pieceObj.position.y = targetY;
      pieceObj.scale.setScalar(0.7);
      // Landing bounce
      const landStart = performance.now() / 1000;
      animations.push({
        update: (time) => {
          const lt = Math.min(1, (time - landStart) / 0.35);
          const bounce = Math.sin(lt * Math.PI * 3) * (1 - lt) * 0.12;
          pieceObj.position.y = targetY + bounce;
          pieceObj.scale.set(0.7 + bounce * 0.3, 0.7 - bounce * 0.2, 0.7 + bounce * 0.3);
          return lt >= 1;
        },
        onComplete: () => {
          pieceObj.position.y = targetY;
          pieceObj.scale.setScalar(0.7);
        }
      });
    }
  });
}

function clearPrisons() {
  prisonPiecesWhite.forEach(p => prisonWhiteGroup.remove(p));
  prisonPiecesBlack.forEach(p => prisonBlackGroup.remove(p));
  prisonPiecesWhite = [];
  prisonPiecesBlack = [];
}

// ============ PROMOTION PICKER UI ============
let promotionResolve = null;
let pendingPromotionMove = null;

const promotionOverlay = document.createElement('div');
promotionOverlay.id = 'promotion-overlay';
promotionOverlay.style.cssText = `
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.45); z-index: 100; display: none;
  justify-content: center; align-items: center;
  pointer-events: all;
`;

const promotionDialog = document.createElement('div');
promotionDialog.style.cssText = `
  background: rgba(255,255,255,0.96); border: 1px solid rgba(0,0,0,0.12);
  border-radius: 14px; padding: 16px 20px; backdrop-filter: blur(12px);
  text-align: center; font-family: 'Inter', sans-serif;
  max-width: calc(100vw - 32px); width: auto;
`;
promotionDialog.innerHTML = `
  <div style="font-size:clamp(11px,3vw,13px);font-weight:700;color:#444;margin-bottom:12px;letter-spacing:0.5px;">PROMOTE PAWN</div>
  <div id="promo-buttons" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"></div>
`;
promotionOverlay.appendChild(promotionDialog);
document.body.appendChild(promotionOverlay);

const promoChoices = [
  { piece: 'Q', label: '♛', name: 'Queen' },
  { piece: 'R', label: '♜', name: 'Rook' },
  { piece: 'B', label: '♝', name: 'Bishop' },
  { piece: 'N', label: '♞', name: 'Knight' },
];

const promoButtonsContainer = document.getElementById('promo-buttons');
promoChoices.forEach(({ piece, label, name }) => {
  const btn = document.createElement('button');
  btn.dataset.piece = piece;
  btn.title = name;
  btn.style.cssText = `
    width: clamp(48px, 14vw, 60px); height: clamp(56px, 16vw, 68px); border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    background: #fff; cursor: pointer; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 2px;
    transition: all 0.15s; font-family: 'Inter', sans-serif;
  `;
  btn.innerHTML = `
    <span style="font-size:clamp(22px,7vw,30px);line-height:1;">${label}</span>
    <span style="font-size:clamp(8px,2.2vw,10px);font-weight:600;color:#888;">${name}</span>
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#1a1a2e'; btn.style.borderColor = '#1a1a2e';
    btn.querySelector('span').style.color = '#fff';
    btn.querySelectorAll('span')[1].style.color = '#ccc';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#fff'; btn.style.borderColor = 'rgba(0,0,0,0.12)';
    btn.querySelector('span').style.color = '';
    btn.querySelectorAll('span')[1].style.color = '#888';
  });
  btn.addEventListener('click', () => {
    if (promotionResolve) {
      promotionResolve(piece);
      promotionResolve = null;
    }
    promotionOverlay.style.display = 'none';
  });
  promoButtonsContainer.appendChild(btn);
});

function showPromotionPicker(isWhite) {
  return new Promise(resolve => {
    promotionResolve = resolve;
    // Tint pieces based on player color
    const tint = isWhite ? '#fff8e7' : '#2a1a3e';
    const textColor = isWhite ? '#333' : '#fff';
    promoButtonsContainer.querySelectorAll('button').forEach(btn => {
      btn.style.background = tint;
      btn.querySelector('span').style.color = textColor;
    });
    promotionOverlay.style.display = 'flex';
  });
}

// ============ BOARD ============
const boardGroup = new THREE.Group();
boardGroup.name = 'boardGroup';
scene.add(boardGroup);

const boardBaseMat = new THREE.MeshPhysicalMaterial({
  color: 0x8B6914, roughness: 0.45, metalness: 0.0,
  clearcoat: 0.2, clearcoatRoughness: 0.4,
  sheen: 0.15, sheenColor: new THREE.Color(0xddbb66), sheenRoughness: 0.6,
});
const boardBase = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.4, 9.2), boardBaseMat);
boardBase.name = 'boardBase';
boardBase.position.y = -0.25;
boardBase.receiveShadow = true;
boardBase.castShadow = true;
boardGroup.add(boardBase);

const boardTrimMat = new THREE.MeshPhysicalMaterial({
  color: 0x6B4F12, roughness: 0.4, metalness: 0.0,
  clearcoat: 0.25, clearcoatRoughness: 0.35,
});
const boardTrim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.15, 9.6), boardTrimMat);
boardTrim.name = 'boardTrim';
boardTrim.position.y = -0.48;
boardTrim.receiveShadow = true;
boardTrim.castShadow = true;
boardGroup.add(boardTrim);

// Rank/file labels
const labelCanvas = document.createElement('canvas');
labelCanvas.width = 64; labelCanvas.height = 64;
const labelCtx = labelCanvas.getContext('2d');
function makeLabel(text) {
  labelCtx.clearRect(0, 0, 64, 64);
  labelCtx.fillStyle = '#5a4520';
  labelCtx.font = 'bold 40px Inter, sans-serif';
  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';
  labelCtx.fillText(text, 32, 32);
  const tex = new THREE.CanvasTexture(labelCtx.getImageData(0, 0, 64, 64));
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const files = 'abcdefgh';
for (let i = 0; i < 8; i++) {
  // File labels (bottom)
  const filePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: makeLabel(files[i]), transparent: true, depthWrite: false })
  );
  filePlane.name = `fileLabel_${i}`;
  filePlane.position.set(i - 3.5, -0.04, 4.35);
  filePlane.rotation.x = -Math.PI / 2;
  boardGroup.add(filePlane);

  // Rank labels (left side)
  const rankPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: makeLabel(String(8 - i)), transparent: true, depthWrite: false })
  );
  rankPlane.name = `rankLabel_${i}`;
  rankPlane.position.set(-4.35, -0.04, i - 3.5);
  rankPlane.rotation.x = -Math.PI / 2;
  boardGroup.add(rankPlane);
}

const lightSquareMat = new THREE.MeshPhysicalMaterial({
  color: 0xF5E6CA, roughness: 0.3, metalness: 0.0,
  clearcoat: 0.12, clearcoatRoughness: 0.5,
  sheen: 0.1, sheenColor: new THREE.Color(0xfff4e8), sheenRoughness: 0.5,
});
const darkSquareMat = new THREE.MeshPhysicalMaterial({
  color: 0x6B8E5A, roughness: 0.3, metalness: 0.0,
  clearcoat: 0.12, clearcoatRoughness: 0.5,
  sheen: 0.1, sheenColor: new THREE.Color(0x88aa77), sheenRoughness: 0.5,
});

const squares = [];
const highlightSquares = [];

for (let row = 0; row < 8; row++) {
  squares[row] = [];
  for (let col = 0; col < 8; col++) {
    const isLight = (row + col) % 2 === 0;
    const sq = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.12, 1),
      isLight ? lightSquareMat : darkSquareMat
    );
    sq.name = `square_${row}_${col}`;
    sq.position.set(col - 3.5, -0.01, row - 3.5);
    sq.receiveShadow = true;
    boardGroup.add(sq);
    squares[row][col] = sq;

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.95), highlightMat.clone());
    hl.name = `highlight_${row}_${col}`;
    hl.position.set(col - 3.5, 0.02, row - 3.5);
    hl.visible = false;
    boardGroup.add(hl);
    highlightSquares.push(hl);
  }
}

// Corner decorations — glowing gems (bloom-reactive)
for (let i = 0; i < 4; i++) {
  const gemColor = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44][i];
  const gem = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshPhysicalMaterial({
      color: gemColor, roughness: 0.05, metalness: 0.0,
      emissive: gemColor, emissiveIntensity: 0.6,
      clearcoat: 0.9, clearcoatRoughness: 0.05,
      transmission: 0.3, thickness: 0.5, ior: 1.9,
    })
  );
  gem.name = `cornerGem_${i}`;
  gem.position.set((i < 2 ? -1 : 1) * 4.5, 0.1, (i % 2 === 0 ? -1 : 1) * 4.5);
  boardGroup.add(gem);
}

// ============ CHESS PIECE CREATION ============
function createFace(group, mat, yPos, scale = 1, options = {}) {
  const eyeGeo = new THREE.SphereGeometry(0.12 * scale, 14, 14);
  const pupilGeo = new THREE.SphereGeometry(0.065 * scale, 10, 10);
  const pupilHighlightGeo = new THREE.SphereGeometry(0.025 * scale, 8, 8);

  [-1, 1].forEach((side, idx) => {
    const eyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeWhite.position.set(side * 0.13 * scale, yPos, 0.22 * scale);
    eyeWhite.name = `eye_${idx}`;
    group.add(eyeWhite);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(side * 0.13 * scale, yPos, 0.30 * scale);
    pupil.name = `pupil_${idx}`;
    group.add(pupil);

    const highlight = new THREE.Mesh(pupilHighlightGeo, eyeWhiteMat);
    highlight.position.set(side * 0.13 * scale + 0.025 * scale, yPos + 0.03 * scale, 0.34 * scale);
    highlight.name = `pupilHighlight_${idx}`;
    group.add(highlight);
  });

  if (options.cheeks !== false) {
    [-1, 1].forEach((side, idx) => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 10, 10), cheekMat);
      cheek.position.set(side * 0.2 * scale, yPos - 0.08 * scale, 0.2 * scale);
      cheek.name = `cheek_${idx}`;
      group.add(cheek);
    });
  }

  if (options.smile) {
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.08 * scale, 0.02 * scale, 8, 12, Math.PI),
      mouthMat
    );
    smile.name = 'mouth';
    smile.position.set(0, yPos - 0.1 * scale, 0.24 * scale);
    smile.rotation.z = Math.PI;
    group.add(smile);
  } else {
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * scale, 10, 10),
      mouthMat
    );
    mouth.name = 'mouth';
    mouth.position.set(0, yPos - 0.09 * scale, 0.25 * scale);
    mouth.scale.set(1.2, 0.7, 0.6);
    group.add(mouth);
  }

  if (options.eyebrows !== false) {
    [-1, 1].forEach((side, idx) => {
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * scale, 0.02 * scale, 0.02 * scale),
        pupilMat
      );
      brow.position.set(side * 0.13 * scale, yPos + 0.12 * scale, 0.26 * scale);
      brow.rotation.z = side * (options.angryBrows ? 0.25 : -0.15);
      brow.name = `brow_${idx}`;
      group.add(brow);
    });
  }
}

function createPawn(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();

  // Pawn: small, round, bean-shaped soldier with a tiny wooden shield and helmet
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.08, 16), mat);
  base.name = 'base'; base.position.y = 0.06; base.castShadow = true; group.add(base);

  // Stubby round body — short and squat
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), mat);
  body.name = 'body'; body.position.y = 0.28; body.scale.set(1.1, 0.85, 1.0); body.castShadow = true; group.add(body);

  // Big round head (oversized for cuteness)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), mat);
  head.name = 'head'; head.position.y = 0.58; head.castShadow = true; group.add(head);

  // Simple soldier helmet (half-sphere on top)
  const helmetMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xccccbb : 0x444455, roughness: 0.35, metalness: 0.4 });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
  helmet.name = 'helmet'; helmet.position.y = 0.63; group.add(helmet);

  // Helmet brim
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 16), helmetMat);
  brim.name = 'helmetBrim'; brim.position.y = 0.58; brim.rotation.x = Math.PI / 2; group.add(brim);

  // Helmet spike (tiny)
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), helmetMat);
  spike.name = 'helmetSpike'; spike.position.y = 0.84; group.add(spike);

  // Tiny round wooden shield on one arm
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 12), shieldMat);
  shield.name = 'shield'; shield.position.set(-0.28, 0.3, 0.06); shield.rotation.z = Math.PI / 2; shield.rotation.x = 0.2; group.add(shield);
  const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), helmetMat);
  shieldBoss.name = 'shieldBoss'; shieldBoss.position.set(-0.29, 0.3, 0.08); group.add(shieldBoss);

  // Nervous wide eyes (bigger pupils)
  createFace(group, mat, 0.6, 0.72, { smile: false, eyebrows: false });

  // Worried eyebrows (raised in the middle)
  [-1, 1].forEach((side, idx) => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.018), pupilMat);
    brow.name = `worriedBrow_${idx}`;
    brow.position.set(side * 0.09, 0.7, 0.19);
    brow.rotation.z = side * 0.3; // raised in center = worried look
    group.add(brow);
  });

  // Tiny stubby arms
  [-1, 1].forEach((side, idx) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.08, 6, 8), mat);
    arm.name = `arm_${idx}`; arm.position.set(side * 0.24, 0.28, 0); arm.rotation.z = side * 0.7; group.add(arm);
  });

  // Little round feet
  [-1, 1].forEach((side, idx) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), mat);
    foot.name = `foot_${idx}`; foot.position.set(side * 0.1, 0.03, 0.05); foot.scale.set(1, 0.45, 1.3); group.add(foot);
  });

  return group;
}

function createRook(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();
  const stoneMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xe8ddd0 : 0x3a2a4e, roughness: 0.75, metalness: 0.05 });

  // Rook: chunky castle tower with a grumpy face embedded in the wall, brick texture lines, arrow slits
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.1, 8), stoneMat);
  base.name = 'base'; base.position.y = 0.07; base.castShadow = true; group.add(base);

  // Thick tower body — wider, more imposing
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.65, 8), stoneMat);
  body.name = 'body'; body.position.y = 0.46; body.castShadow = true; group.add(body);

  // Decorative brick lines (horizontal rings)
  for (let i = 0; i < 3; i++) {
    const brickLine = new THREE.Mesh(
      new THREE.TorusGeometry(0.325, 0.012, 6, 8),
      new THREE.MeshStandardMaterial({ color: isWhite ? 0xc8b8a0 : 0x2a1a3e, roughness: 0.8 })
    );
    brickLine.name = `brickLine_${i}`; brickLine.position.y = 0.25 + i * 0.2; brickLine.rotation.x = Math.PI / 2; group.add(brickLine);
  }

  // Battlement crown — wider spaced merlons
  const battleMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xd8cbb8 : 0x332244, roughness: 0.7 });
  const crownRing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 8), battleMat);
  crownRing.name = 'crownRing'; crownRing.position.y = 0.82; group.add(crownRing);

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const battlement = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.13), battleMat);
    battlement.name = `battlement_${i}`;
    battlement.position.set(Math.cos(angle) * 0.27, 0.96, Math.sin(angle) * 0.27);
    group.add(battlement);
  }

  // Arrow slits on sides
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x0a0a15, roughness: 0.9 });
  [-1, 1].forEach((side, idx) => {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.06), slitMat);
    slit.name = `arrowSlit_${idx}`;
    slit.position.set(side * 0.33, 0.5, 0);
    group.add(slit);
  });

  // Arched doorway at front
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x0a0a15, roughness: 0.9 })
  );
  door.name = 'door'; door.position.set(0, 0.28, 0.335); group.add(door);
  const doorArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.015, 6, 8, Math.PI),
    stoneMat
  );
  doorArch.name = 'doorArch'; doorArch.position.set(0, 0.38, 0.335); group.add(doorArch);

  // Grumpy face is higher up on the tower — "carved into stone"
  createFace(group, mat, 0.62, 0.85, { angryBrows: true, smile: false });

  // Heavy thick arms (like stone golem arms)
  [-1, 1].forEach((side, idx) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.22, 6, 8), stoneMat);
    arm.name = `arm_${idx}`; arm.position.set(side * 0.4, 0.42, 0); arm.rotation.z = side * 0.5; group.add(arm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), stoneMat);
    fist.name = `fist_${idx}`; fist.position.set(side * 0.54, 0.3, 0); group.add(fist);
  });

  // Tiny flag on top
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 }));
  flagPole.name = 'flagPole'; flagPole.position.set(0, 1.2, 0); group.add(flagPole);
  const flagColor = isWhite ? 0x4488cc : 0x882244;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), new THREE.MeshStandardMaterial({ color: flagColor, side: THREE.DoubleSide }));
  flag.name = 'flag'; flag.position.set(0.07, 1.3, 0); group.add(flag);

  return group;
}

function createKnight(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();

  // Knight: distinctly horse-shaped — tall curved neck, elongated snout, wild mane, no body sphere like others
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.08, 16), mat);
  base.name = 'base'; base.position.y = 0.06; base.castShadow = true; group.add(base);

  // Neck/body — tall curved cylinder leaning forward, very different from others
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 8, 12), mat);
  neck.name = 'body'; neck.position.set(0, 0.5, 0.05); neck.rotation.x = -0.2; neck.castShadow = true; group.add(neck);

  // Large horse head — elongated horizontally
  const headBase = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), mat);
  headBase.name = 'headBase'; headBase.position.set(0, 0.88, 0.08); headBase.scale.set(0.85, 1.05, 0.95); headBase.castShadow = true; group.add(headBase);

  // Long prominent snout (much more horse-like)
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 8, 10), mat);
  snout.name = 'snout'; snout.position.set(0, 0.68, 0.22); snout.rotation.x = Math.PI / 2.8; group.add(snout);

  // Rounded snout end (muzzle)
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), mat);
  muzzle.name = 'muzzle'; muzzle.position.set(0, 0.56, 0.36); muzzle.scale.set(1.1, 0.8, 0.9); group.add(muzzle);

  // Nostrils — bigger, more expressive
  [-1, 1].forEach((side, idx) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pupilMat);
    nostril.name = `nostril_${idx}`; nostril.position.set(side * 0.055, 0.54, 0.42); group.add(nostril);
  });

  // Tall pointy ears
  [-1, 1].forEach((side, idx) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 6), mat);
    ear.name = `ear_${idx}`; ear.position.set(side * 0.14, 1.18, -0.0); ear.rotation.z = side * 0.3; ear.rotation.x = -0.1; group.add(ear);
    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.5 }));
    innerEar.name = `innerEar_${idx}`; innerEar.position.set(side * 0.14, 1.16, 0.02); innerEar.rotation.z = side * 0.3; innerEar.rotation.x = -0.1; group.add(innerEar);
  });

  // Wild flowing mane — larger, more dramatic, down the back of the neck
  const maneMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xdaa520 : 0x8844aa, roughness: 0.4, metalness: 0.2 });
  for (let i = 0; i < 9; i++) {
    const maneSize = 0.06 + Math.sin(i * 0.4) * 0.025;
    const mane = new THREE.Mesh(new THREE.SphereGeometry(maneSize, 8, 8), maneMat);
    mane.name = `mane_${i}`;
    mane.position.set(
      Math.sin(i * 0.8) * 0.03,
      1.1 - i * 0.075,
      -0.2 - i * 0.02
    );
    group.add(mane);
  }

  // Eyes — set wider apart and higher on the head (horse-like)
  const eyeScale = 0.95;
  [-1, 1].forEach((side, idx) => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 14), eyeWhiteMat);
    eyeWhite.position.set(side * 0.17, 0.9, 0.18);
    eyeWhite.name = `eye_${idx}`;
    group.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), pupilMat);
    pupil.position.set(side * 0.17, 0.9, 0.26);
    pupil.name = `pupil_${idx}`;
    group.add(pupil);

    const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeWhiteMat);
    highlight.position.set(side * 0.17 + 0.02, 0.93, 0.29);
    highlight.name = `pupilHighlight_${idx}`;
    group.add(highlight);
  });

  // Big toothy grin
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 10, Math.PI), mouthMat);
  grin.name = 'mouth'; grin.position.set(0, 0.55, 0.4); grin.rotation.z = Math.PI; group.add(grin);

  // Teeth showing
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.015), eyeWhiteMat);
    tooth.name = `tooth_${i}`;
    tooth.position.set(-0.035 + i * 0.024, 0.535, 0.4);
    group.add(tooth);
  }

  // Front hooves instead of arms (to look distinctly horse)
  [-1, 1].forEach((side, idx) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.15, 6, 8), mat);
    leg.name = `arm_${idx}`; leg.position.set(side * 0.22, 0.2, 0.08); leg.rotation.z = side * 0.3; group.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5 }));
    hoof.name = `hoof_${idx}`; hoof.position.set(side * 0.26, 0.1, 0.1); group.add(hoof);
  });

  return group;
}

function createBishop(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();
  const robeMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0x7744aa : 0x225533, roughness: 0.5 });

  // Bishop: tall, thin, wizard/cleric figure with robes, tall pointed mitre, staff, very vertical silhouette
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.08, 16), mat);
  base.name = 'base'; base.position.y = 0.06; base.castShadow = true; group.add(base);

  // Long flowing robe (wider at bottom, narrow at top — cone shape)
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.55, 12), robeMat);
  robe.name = 'body'; robe.position.y = 0.37; robe.castShadow = true; group.add(robe);

  // Rope belt
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 16), crownMat);
  belt.name = 'belt'; belt.position.y = 0.52; belt.rotation.x = Math.PI / 2; group.add(belt);

  // Upper body — narrow, thin
  const upperBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.18, 8, 10), mat);
  upperBody.name = 'upperBody'; upperBody.position.y = 0.72; upperBody.castShadow = true; group.add(upperBody);

  // Ornate collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 16), robeMat);
  collar.name = 'collar'; collar.position.y = 0.82; collar.rotation.x = Math.PI / 2; group.add(collar);

  // Smaller rounder head (wise old face)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 14), mat);
  head.name = 'head'; head.position.y = 0.98; head.castShadow = true; group.add(head);

  // Tall pointed mitre (very tall to distinguish from queen/king crown)
  const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 4), mat);
  mitre.name = 'mitre'; mitre.position.y = 1.38; mitre.rotation.y = Math.PI / 4; group.add(mitre);

  // Mitre cross band
  const mitreBandV = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), crownMat);
  mitreBandV.name = 'mitreBandV'; mitreBandV.position.y = 1.35; group.add(mitreBandV);
  const mitreBandH = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), crownMat);
  mitreBandH.name = 'mitreBandH'; mitreBandH.position.y = 1.25; group.add(mitreBandH);

  // Mitre top jewel
  const mitreGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.03, 0),
    new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x22aa44, emissiveIntensity: 0.6 })
  );
  mitreGem.name = 'mitreGem'; mitreGem.position.y = 1.65; group.add(mitreGem);

  // Wise face with half-closed eyes and serene smile
  createFace(group, mat, 1.0, 0.7, { smile: true, eyebrows: true });

  // Spectacles / round glasses
  [-1, 1].forEach((side, idx) => {
    const lens = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.008, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.3, metalness: 0.5 })
    );
    lens.name = `glasses_${idx}`;
    lens.position.set(side * 0.085, 1.0, 0.17);
    group.add(lens);
  });
  // Bridge of glasses
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 4),
    new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.3, metalness: 0.5 })
  );
  bridge.name = 'glassesBridge'; bridge.position.set(0, 1.0, 0.19); bridge.rotation.z = Math.PI / 2; group.add(bridge);

  // Staff in one hand
  const staffMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.5 });
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.2, 6), staffMat);
  staff.name = 'staff'; staff.position.set(0.32, 0.55, 0.05); group.add(staff);
  const staffOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x2266cc, emissiveIntensity: 0.5 })
  );
  staffOrb.name = 'staffOrb'; staffOrb.position.set(0.32, 1.18, 0.05); group.add(staffOrb);

  // Thin arms (one holding staff)
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 6, 8), mat);
  armR.name = 'arm_0'; armR.position.set(0.22, 0.6, 0.04); armR.rotation.z = 0.5; group.add(armR);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 6, 8), mat);
  armL.name = 'arm_1'; armL.position.set(-0.2, 0.6, 0.08); armL.rotation.z = -0.6; armL.rotation.x = -0.3; group.add(armL);

  // Small round feet peaking under robe
  [-1, 1].forEach((side, idx) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat);
    foot.name = `foot_${idx}`; foot.position.set(side * 0.08, 0.04, 0.1); foot.scale.set(1, 0.5, 1.3); group.add(foot);
  });

  return group;
}

function createQueen(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();
  const dressMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xeeddff : 0x331155, roughness: 0.3 });

  // Queen: elegant, curvy, ball-gown dress, tiara with heart shapes, beauty mark, very feminine silhouette
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.06, 16), mat);
  base.name = 'base'; base.position.y = 0.05; base.castShadow = true; group.add(base);

  // Big puffy ball gown (very wide at the bottom — distinctive silhouette)
  const gownBottom = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), dressMat);
  gownBottom.name = 'dress'; gownBottom.position.y = 0.22; gownBottom.scale.set(1, 0.6, 1); gownBottom.castShadow = true; group.add(gownBottom);

  // Waist (very narrow — hourglass shape)
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 12), mat);
  waist.name = 'waist'; waist.position.y = 0.52; waist.castShadow = true; group.add(waist);

  // Upper body
  const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), mat);
  upperBody.name = 'body'; upperBody.position.y = 0.7; upperBody.scale.set(1.1, 0.85, 0.9); upperBody.castShadow = true; group.add(upperBody);

  // Puffy sleeves
  [-1, 1].forEach((side, idx) => {
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), dressMat);
    sleeve.name = `sleeve_${idx}`; sleeve.position.set(side * 0.22, 0.72, 0); group.add(sleeve);
  });

  // Pearl necklace (multiple small pearls)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI + Math.PI;
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeWhiteMat);
    pearl.name = `pearl_${i}`;
    pearl.position.set(Math.sin(angle) * 0.14, 0.78, Math.cos(angle) * 0.14);
    group.add(pearl);
  }

  // Head (slightly smaller, more delicate)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat);
  head.name = 'head'; head.position.y = 0.95; head.castShadow = true; group.add(head);

  // Elegant tiara (delicate arches instead of spikes)
  const tiaraMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.1, metalness: 0.8 });
  const tiaraBase = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 24), tiaraMat);
  tiaraBase.name = 'tiaraBase'; tiaraBase.position.y = 1.12; tiaraBase.rotation.x = Math.PI / 2; group.add(tiaraBase);

  // Heart-shaped tiara points
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const height = i === 0 || i === 2 || i === 4 ? 0.18 : 0.12;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, height, 6), tiaraMat);
    spike.name = `tiaraPoint_${i}`;
    spike.position.set(Math.cos(angle) * 0.14, 1.18 + height * 0.4, Math.sin(angle) * 0.14);
    group.add(spike);

    // Colored gems
    const gemColors = [0xff4488, 0x44ddff, 0xff4488, 0xaa44ff, 0xff4488];
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.025, 0),
      new THREE.MeshStandardMaterial({ color: gemColors[i], emissive: gemColors[i], emissiveIntensity: 0.5 })
    );
    gem.name = `tiaraGem_${i}`;
    gem.position.set(Math.cos(angle) * 0.14, 1.18 + height * 0.75, Math.sin(angle) * 0.14);
    group.add(gem);
  }

  // Face with lashes, beauty mark
  createFace(group, mat, 0.97, 0.8, { smile: true, eyebrows: false });

  // Long dramatic eyelashes
  [-1, 1].forEach((side, idx) => {
    for (let l = 0; l < 4; l++) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.006), pupilMat);
      lash.name = `lash_${idx}_${l}`;
      const lAngle = (l - 1.5) * 0.12;
      lash.position.set(
        side * 0.1 + Math.sin(lAngle) * 0.035,
        0.97 + 0.1 + 0.018,
        0.2 + Math.cos(lAngle) * 0.01
      );
      lash.rotation.z = side * (-0.35 + l * 0.12);
      group.add(lash);
    }
  });

  // Beauty mark
  const beautyMark = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), pupilMat);
  beautyMark.name = 'beautyMark'; beautyMark.position.set(0.1, 0.9, 0.19); group.add(beautyMark);

  // Graceful thin arms
  [-1, 1].forEach((side, idx) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 6, 8), mat);
    arm.name = `arm_${idx}`; arm.position.set(side * 0.26, 0.6, 0.04); arm.rotation.z = side * 0.65; group.add(arm);
    // Delicate hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), mat);
    hand.name = `hand_${idx}`; hand.position.set(side * 0.38, 0.48, 0.06); group.add(hand);
  });

  // Fan in one hand
  const fanMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xffccdd : 0x663366, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12, 0, Math.PI * 0.6), fanMat);
  fan.name = 'fan'; fan.position.set(-0.4, 0.52, 0.12); fan.rotation.y = 0.5; fan.rotation.z = 0.3; group.add(fan);

  return group;
}

function createKing(isWhite) {
  const group = new THREE.Group();
  const mat = isWhite ? whitePieceMat.clone() : blackPieceMat.clone();
  const capeMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xcc2222 : 0x661133, roughness: 0.45 });
  const furMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.7 });

  // King: rotund, jolly, barrel-shaped body with huge cape, big bushy beard, massive ornate crown, scepter
  // Very different from queen's hourglass — this is a wide barrel
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 16), mat);
  base.name = 'base'; base.position.y = 0.07; base.castShadow = true; group.add(base);

  // Big round belly (barrel shaped, wider than tall)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), mat);
  belly.name = 'body'; belly.position.y = 0.42; belly.scale.set(1.1, 1.0, 1.05); belly.castShadow = true; group.add(belly);

  // Royal cape — flowing behind
  const cape = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 12, Math.PI * 0.25, Math.PI * 1.5, 0, Math.PI / 1.7),
    capeMat
  );
  cape.name = 'cape'; cape.position.set(0, 0.42, 0); cape.scale.set(1.1, 1.15, 1.1); cape.rotation.y = Math.PI; group.add(cape);

  // Fur trim at cape collar
  const furTrim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 8, 16), furMat);
  furTrim.name = 'furTrim'; furTrim.position.y = 0.74; furTrim.rotation.x = Math.PI / 2; group.add(furTrim);

  // Ermine spots on fur
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), pupilMat);
    spot.name = `ermineSpot_${i}`;
    spot.position.set(Math.cos(angle) * 0.24, 0.74, Math.sin(angle) * 0.24);
    group.add(spot);
  }

  // Head — big and round
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), mat);
  head.name = 'head'; head.position.y = 0.98; head.castShadow = true; group.add(head);

  // Big bushy beard
  const beardMat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xddddcc : 0x555566, roughness: 0.8 });
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), beardMat);
  beard.name = 'beard'; beard.position.set(0, 0.82, 0.12); beard.scale.set(1.1, 1.3, 0.8); group.add(beard);
  // Beard tip
  const beardTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 8), beardMat);
  beardTip.name = 'beardTip'; beardTip.position.set(0, 0.68, 0.16); beardTip.rotation.x = 0.2; group.add(beardTip);

  // Bushy eyebrows
  [-1, 1].forEach((side, idx) => {
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), beardMat);
    brow.name = `bushyBrow_${idx}`;
    brow.position.set(side * 0.12, 1.11, 0.22);
    brow.scale.set(1.8, 0.6, 0.7);
    group.add(brow);
  });

  // Curly mustache
  [-1, 1].forEach((side, idx) => {
    const stache = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.14, 6, 6), beardMat);
    stache.name = `stache_${idx}`; stache.position.set(side * 0.1, 0.9, 0.24); stache.rotation.z = side * 1.2; group.add(stache);
    const curl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), beardMat);
    curl.name = `stacheCurl_${idx}`; curl.position.set(side * 0.2, 0.86, 0.22); group.add(curl);
  });

  // Big round nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshStandardMaterial({ color: isWhite ? 0xffccbb : 0x442244, roughness: 0.5 }));
  nose.name = 'bigNose'; nose.position.set(0, 0.96, 0.26); group.add(nose);

  // Massive ornate crown (much bigger than queen's tiara)
  const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 16), crownMat);
  crownBase.name = 'crownBase'; crownBase.position.y = 1.24; group.add(crownBase);

  // Red velvet inside crown
  const crownVelvet = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 16), capeMat);
  crownVelvet.name = 'crownVelvet'; crownVelvet.position.y = 1.32; group.add(crownVelvet);

  // Fur brim on crown
  const crownFur = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 16), furMat);
  crownFur.name = 'crownFur'; crownFur.position.y = 1.17; crownFur.rotation.x = Math.PI / 2; group.add(crownFur);

  // Crown spikes with gems
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 6), crownMat);
    spike.name = `crownSpike_${i}`; spike.position.set(Math.cos(angle) * 0.2, 1.45, Math.sin(angle) * 0.2); group.add(spike);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.025, 0),
      new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xff2244, emissiveIntensity: 0.4 })
    );
    gem.name = `spikeGem_${i}`; gem.position.set(Math.cos(angle) * 0.2, 1.58, Math.sin(angle) * 0.2); group.add(gem);
  }

  // Grand cross on top (taller than queen's)
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), crownMat);
  crossV.name = 'kingCrossV'; crossV.position.y = 1.72; group.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, 0.065), crownMat);
  crossH.name = 'kingCrossH'; crossH.position.y = 1.68; group.add(crossH);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), crownMat);
  orb.name = 'crossOrb'; orb.position.y = 1.58; group.add(orb);

  // Eyes (smaller, peering over beard)
  createFace(group, mat, 1.02, 0.8, { smile: false, angryBrows: false, eyebrows: false, cheeks: false });

  // Royal scepter in one hand
  const scepterMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.6 });
  const scepter = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.9, 6), scepterMat);
  scepter.name = 'scepter'; scepter.position.set(0.42, 0.5, 0.05); scepter.rotation.z = 0.15; group.add(scepter);
  const scepterOrb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), scepterMat);
  scepterOrb.name = 'scepterOrb'; scepterOrb.position.set(0.44, 0.98, 0.05); group.add(scepterOrb);
  const scepterCross = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), scepterMat);
  scepterCross.name = 'scepterCross'; scepterCross.position.set(0.44, 1.04, 0.05); group.add(scepterCross);

  // Thick arms
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 8), mat);
  armR.name = 'arm_0'; armR.position.set(0.36, 0.55, 0.05); armR.rotation.z = 0.5; group.add(armR);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 8), mat);
  armL.name = 'arm_1'; armL.position.set(-0.36, 0.55, 0.05); armL.rotation.z = -0.5; group.add(armL);

  // Big round feet
  [-1, 1].forEach((side, idx) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), mat);
    foot.name = `foot_${idx}`; foot.position.set(side * 0.15, 0.04, 0.08); foot.scale.set(1, 0.4, 1.4); group.add(foot);
  });

  return group;
}

const pieceCreators = {
  'P': createPawn, 'R': createRook, 'N': createKnight,
  'B': createBishop, 'Q': createQueen, 'K': createKing
};

// ============ FULL CHESS ENGINE (no external deps) ============
// Complete chess logic with proper FEN, move generation, validation

class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    // Board: array of 64, index = row*8+col, row 0 = rank 8 (black side)
    // Pieces: 'wP','wR','wN','wB','wQ','wK','bP','bR','bN','bB','bQ','bK' or null
    this.board = new Array(64).fill(null);
    this.turn = 'w'; // 'w' or 'b'
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassantTarget = null; // index or null
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.history = []; // stack of undo info
    this.setupInitial();
  }

  setupInitial() {
    const backRank = ['R','N','B','Q','K','B','N','R'];
    for (let c = 0; c < 8; c++) {
      this.board[0 * 8 + c] = 'b' + backRank[c]; // rank 8
      this.board[1 * 8 + c] = 'bP'; // rank 7
      this.board[6 * 8 + c] = 'wP'; // rank 2
      this.board[7 * 8 + c] = 'w' + backRank[c]; // rank 1
    }
  }

  clone() {
    const e = new ChessEngine();
    e.board = [...this.board];
    e.turn = this.turn;
    e.castling = { ...this.castling };
    e.enPassantTarget = this.enPassantTarget;
    e.halfmoveClock = this.halfmoveClock;
    e.fullmoveNumber = this.fullmoveNumber;
    e.history = []; // don't clone history for search
    return e;
  }

  idx(row, col) { return row * 8 + col; }
  rowCol(idx) { return [Math.floor(idx / 8), idx % 8]; }
  onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  get(r, c) { return this.onBoard(r, c) ? this.board[this.idx(r, c)] : null; }
  set(r, c, v) { if (this.onBoard(r, c)) this.board[this.idx(r, c)] = v; }

  // Convert between our row,col and algebraic
  toAlgebraic(r, c) { return 'abcdefgh'[c] + (8 - r); }
  fromAlgebraic(sq) { return [8 - parseInt(sq[1]), 'abcdefgh'.indexOf(sq[0])]; }

  // Generate all pseudo-legal moves for a color (doesn't filter for leaving king in check)
  pseudoMoves(color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (!p || p[0] !== color) continue;
        const type = p[1];
        const dir = color === 'w' ? -1 : 1;

        const addSlide = (dr, dc) => {
          for (let i = 1; i < 8; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (!this.onBoard(nr, nc)) break;
            const t = this.get(nr, nc);
            if (!t) { moves.push({ from: [r, c], to: [nr, nc] }); continue; }
            if (t[0] !== color) moves.push({ from: [r, c], to: [nr, nc], capture: t });
            break;
          }
        };

        const addJump = (dr, dc) => {
          const nr = r + dr, nc = c + dc;
          if (!this.onBoard(nr, nc)) return;
          const t = this.get(nr, nc);
          if (!t || t[0] !== color) moves.push({ from: [r, c], to: [nr, nc], capture: t || undefined });
        };

        switch (type) {
          case 'P': {
            // Forward
            const nr = r + dir;
            if (this.onBoard(nr, c) && !this.get(nr, c)) {
              if (nr === 0 || nr === 7) {
                for (const promo of ['Q', 'R', 'B', 'N']) moves.push({ from: [r, c], to: [nr, c], promotion: promo });
              } else {
                moves.push({ from: [r, c], to: [nr, c] });
              }
              // Double push
              const startRow = color === 'w' ? 6 : 1;
              const nr2 = r + dir * 2;
              if (r === startRow && !this.get(nr2, c)) {
                moves.push({ from: [r, c], to: [nr2, c] });
              }
            }
            // Captures
            for (const dc of [-1, 1]) {
              const nc = c + dc;
              if (!this.onBoard(nr, nc)) continue;
              const t = this.get(nr, nc);
              if (t && t[0] !== color) {
                if (nr === 0 || nr === 7) {
                  for (const promo of ['Q', 'R', 'B', 'N']) moves.push({ from: [r, c], to: [nr, nc], capture: t, promotion: promo });
                } else {
                  moves.push({ from: [r, c], to: [nr, nc], capture: t });
                }
              }
              // En passant
              if (this.enPassantTarget !== null) {
                const [epr, epc] = this.rowCol(this.enPassantTarget);
                if (nr === epr && nc === epc) {
                  moves.push({ from: [r, c], to: [nr, nc], enPassant: true, capture: (color === 'w' ? 'b' : 'w') + 'P' });
                }
              }
            }
            break;
          }
          case 'R':
            addSlide(1, 0); addSlide(-1, 0); addSlide(0, 1); addSlide(0, -1);
            break;
          case 'B':
            addSlide(1, 1); addSlide(1, -1); addSlide(-1, 1); addSlide(-1, -1);
            break;
          case 'Q':
            addSlide(1, 0); addSlide(-1, 0); addSlide(0, 1); addSlide(0, -1);
            addSlide(1, 1); addSlide(1, -1); addSlide(-1, 1); addSlide(-1, -1);
            break;
          case 'N':
            for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) addJump(dr, dc);
            break;
          case 'K':
            for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) addJump(dr, dc);
            // Castling
            if (color === 'w') {
              if (this.castling.wK && !this.get(7, 5) && !this.get(7, 6) && this.get(7, 7) === 'wR')
                moves.push({ from: [7, 4], to: [7, 6], castle: 'K' });
              if (this.castling.wQ && !this.get(7, 3) && !this.get(7, 2) && !this.get(7, 1) && this.get(7, 0) === 'wR')
                moves.push({ from: [7, 4], to: [7, 2], castle: 'Q' });
            } else {
              if (this.castling.bK && !this.get(0, 5) && !this.get(0, 6) && this.get(0, 7) === 'bR')
                moves.push({ from: [0, 4], to: [0, 6], castle: 'K' });
              if (this.castling.bQ && !this.get(0, 3) && !this.get(0, 2) && !this.get(0, 1) && this.get(0, 0) === 'bR')
                moves.push({ from: [0, 4], to: [0, 2], castle: 'Q' });
            }
            break;
        }
      }
    }
    return moves;
  }

  findKing(color) {
    const target = color + 'K';
    for (let i = 0; i < 64; i++) if (this.board[i] === target) return this.rowCol(i);
    return null;
  }

  isAttacked(r, c, byColor) {
    // Check if square (r,c) is attacked by 'byColor'
    // Knight attacks
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const p = this.get(r + dr, c + dc);
      if (p === byColor + 'N') return true;
    }
    // King attacks
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const p = this.get(r + dr, c + dc);
      if (p === byColor + 'K') return true;
    }
    // Pawn attacks
    const pawnDir = byColor === 'w' ? 1 : -1; // pawns attack upward if white
    for (const dc of [-1, 1]) {
      const p = this.get(r + pawnDir, c + dc);
      if (p === byColor + 'P') return true;
    }
    // Rook/Queen (straight lines)
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!this.onBoard(nr, nc)) break;
        const p = this.get(nr, nc);
        if (!p) continue;
        if (p[0] === byColor && (p[1] === 'R' || p[1] === 'Q')) return true;
        break;
      }
    }
    // Bishop/Queen (diagonals)
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!this.onBoard(nr, nc)) break;
        const p = this.get(nr, nc);
        if (!p) continue;
        if (p[0] === byColor && (p[1] === 'B' || p[1] === 'Q')) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color) {
    const kp = this.findKing(color);
    if (!kp) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return this.isAttacked(kp[0], kp[1], enemy);
  }

  // Make a move (mutates state, pushes undo info)
  makeMove(move) {
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = this.get(fr, fc);
    const captured = this.get(tr, tc);

    const undo = {
      move,
      piece,
      captured,
      castling: { ...this.castling },
      enPassantTarget: this.enPassantTarget,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
      epCapturedIdx: null,
    };

    // En passant capture
    if (move.enPassant) {
      const epCapturedRow = fr; // same row as attacker
      undo.epCapturedIdx = this.idx(epCapturedRow, tc);
      undo.epCaptured = this.board[undo.epCapturedIdx];
      this.board[undo.epCapturedIdx] = null;
    }

    // Move piece
    this.set(tr, tc, piece);
    this.set(fr, fc, null);

    // Promotion
    if (move.promotion) {
      this.set(tr, tc, piece[0] + move.promotion);
    }

    // Castling rook move
    if (move.castle) {
      const row = fr;
      if (move.castle === 'K') {
        this.set(row, 5, this.get(row, 7));
        this.set(row, 7, null);
      } else {
        this.set(row, 3, this.get(row, 0));
        this.set(row, 0, null);
      }
    }

    // Update castling rights
    if (piece === 'wK') { this.castling.wK = false; this.castling.wQ = false; }
    if (piece === 'bK') { this.castling.bK = false; this.castling.bQ = false; }
    if (piece === 'wR' && fr === 7 && fc === 0) this.castling.wQ = false;
    if (piece === 'wR' && fr === 7 && fc === 7) this.castling.wK = false;
    if (piece === 'bR' && fr === 0 && fc === 0) this.castling.bQ = false;
    if (piece === 'bR' && fr === 0 && fc === 7) this.castling.bK = false;
    // If a rook is captured
    if (tr === 7 && tc === 0) this.castling.wQ = false;
    if (tr === 7 && tc === 7) this.castling.wK = false;
    if (tr === 0 && tc === 0) this.castling.bQ = false;
    if (tr === 0 && tc === 7) this.castling.bK = false;

    // En passant target
    if (piece[1] === 'P' && Math.abs(tr - fr) === 2) {
      this.enPassantTarget = this.idx((fr + tr) / 2, fc);
    } else {
      this.enPassantTarget = null;
    }

    // Halfmove clock
    if (piece[1] === 'P' || captured || move.enPassant) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock++;
    }

    if (this.turn === 'b') this.fullmoveNumber++;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this.history.push(undo);
  }

  unmakeMove() {
    if (this.history.length === 0) return;
    const undo = this.history.pop();
    const { move, piece, captured, castling, enPassantTarget, halfmoveClock, fullmoveNumber } = undo;
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;

    this.set(fr, fc, piece);
    this.set(tr, tc, captured);

    if (move.enPassant && undo.epCapturedIdx !== null) {
      this.board[undo.epCapturedIdx] = undo.epCaptured;
    }

    if (move.castle) {
      const row = fr;
      if (move.castle === 'K') {
        this.set(row, 7, this.get(row, 5));
        this.set(row, 5, null);
      } else {
        this.set(row, 0, this.get(row, 3));
        this.set(row, 3, null);
      }
    }

    this.castling = castling;
    this.enPassantTarget = enPassantTarget;
    this.halfmoveClock = halfmoveClock;
    this.fullmoveNumber = fullmoveNumber;
    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  // Generate legal moves for current turn
  legalMoves() {
    const color = this.turn;
    const enemy = color === 'w' ? 'b' : 'w';
    const pseudo = this.pseudoMoves(color);
    const legal = [];

    for (const move of pseudo) {
      // Filter castling through check
      if (move.castle) {
        const [fr, fc] = move.from;
        if (this.inCheck(color)) continue;
        if (move.castle === 'K') {
          if (this.isAttacked(fr, 5, enemy) || this.isAttacked(fr, 6, enemy)) continue;
        } else {
          if (this.isAttacked(fr, 3, enemy) || this.isAttacked(fr, 2, enemy)) continue;
        }
      }

      this.makeMove(move);
      if (!this.inCheck(color)) {
        legal.push(move);
      }
      this.unmakeMove();
    }
    return legal;
  }

  // Get legal moves from a specific square
  legalMovesFrom(r, c) {
    return this.legalMoves().filter(m => m.from[0] === r && m.from[1] === c);
  }

  isCheckmate() {
    return this.inCheck(this.turn) && this.legalMoves().length === 0;
  }

  isStalemate() {
    return !this.inCheck(this.turn) && this.legalMoves().length === 0;
  }

  isDraw() {
    if (this.isStalemate()) return true;
    if (this.halfmoveClock >= 100) return true; // 50-move rule
    // Insufficient material
    const pieces = this.board.filter(p => p !== null);
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      const nonKings = pieces.filter(p => p[1] !== 'K');
      if (nonKings.length === 1 && (nonKings[0][1] === 'B' || nonKings[0][1] === 'N')) return true;
    }
    return false;
  }

  // ============ AI EVALUATION ============
  static PieceValues = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  static PST = {
    P: [
      0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
      5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
      5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0
    ],
    N: [
      -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
      -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
      -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50
    ],
    B: [
      -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
      -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
      -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20
    ],
    R: [
      0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0
    ],
    Q: [
      -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
      -5,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10,
      -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20
    ],
    Km: [
      -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
      20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20
    ],
    Ke: [
      -50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30,
      -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
      -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
      -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50
    ]
  };

  evaluate() {
    let score = 0;
    let whiteQueens = 0, blackQueens = 0, whiteMinors = 0, blackMinors = 0;
    let whiteBishops = 0, blackBishops = 0;

    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      if (p[1] === 'Q') { if (p[0] === 'w') whiteQueens++; else blackQueens++; }
      if (p[1] === 'N' || p[1] === 'B') { if (p[0] === 'w') whiteMinors++; else blackMinors++; }
      if (p[1] === 'B') { if (p[0] === 'w') whiteBishops++; else blackBishops++; }
    }

    const endgame = (whiteQueens + blackQueens) === 0 || ((whiteQueens + blackQueens) <= 2 && (whiteMinors + blackMinors) <= 2);

    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      const isW = p[0] === 'w';
      const type = p[1];
      let val = ChessEngine.PieceValues[type];
      const tableIdx = isW ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);

      if (type === 'K') {
        val += endgame ? ChessEngine.PST.Ke[tableIdx] : ChessEngine.PST.Km[tableIdx];
      } else if (ChessEngine.PST[type]) {
        val += ChessEngine.PST[type][tableIdx];
      }

      score += isW ? val : -val;
    }

    // Bishop pair
    if (whiteBishops >= 2) score += 30;
    if (blackBishops >= 2) score -= 30;

    // Mobility (lightweight)
    const wMoves = this.pseudoMoves('w').length;
    const bMoves = this.pseudoMoves('b').length;
    score += (wMoves - bMoves) * 3;

    // King safety in middlegame
    if (!endgame) {
      for (const col of ['w', 'b']) {
        const kp = this.findKing(col);
        if (!kp) continue;
        let shield = 0;
        const pDir = col === 'w' ? -1 : 1;
        for (const dc of [-1, 0, 1]) {
          const sr = kp[0] + pDir, sc = kp[1] + dc;
          if (this.onBoard(sr, sc)) {
            const sp = this.get(sr, sc);
            if (sp && sp[0] === col && sp[1] === 'P') shield++;
          }
        }
        const bonus = shield * 15;
        score += col === 'w' ? bonus : -bonus;
      }
    }

    return score;
  }

  // Alpha-beta with quiescence search
  search(depth, alpha, beta, maximizing) {
    if (depth === 0) return this.quiesce(alpha, beta, maximizing, 4);

    const moves = this.legalMoves();
    if (moves.length === 0) {
      if (this.inCheck(this.turn)) return maximizing ? -99999 + depth : 99999 - depth;
      return 0; // stalemate
    }

    // Move ordering: captures first (MVV-LVA), promotions, then rest
    moves.sort((a, b) => {
      let sa = 0, sb = 0;
      if (a.capture) sa += ChessEngine.PieceValues[a.capture[1]] * 10 - ChessEngine.PieceValues[this.get(a.from[0], a.from[1])?.[1] || 'P'];
      if (b.capture) sb += ChessEngine.PieceValues[b.capture[1]] * 10 - ChessEngine.PieceValues[this.get(b.from[0], b.from[1])?.[1] || 'P'];
      if (a.promotion) sa += 800;
      if (b.promotion) sb += 800;
      return sb - sa;
    });

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        this.makeMove(move);
        const ev = this.search(depth - 1, alpha, beta, false);
        this.unmakeMove();
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        this.makeMove(move);
        const ev = this.search(depth - 1, alpha, beta, true);
        this.unmakeMove();
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  quiesce(alpha, beta, maximizing, depth) {
    const standPat = this.evaluate();
    if (depth === 0) return standPat;

    if (maximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;
    }

    // Only search captures
    const captures = this.legalMoves().filter(m => m.capture || m.enPassant);
    captures.sort((a, b) => {
      const va = a.capture ? ChessEngine.PieceValues[a.capture[1]] : 0;
      const vb = b.capture ? ChessEngine.PieceValues[b.capture[1]] : 0;
      return vb - va;
    });

    for (const move of captures) {
      this.makeMove(move);
      const ev = this.quiesce(alpha, beta, !maximizing, depth - 1);
      this.unmakeMove();
      if (maximizing) {
        if (ev >= beta) return beta;
        if (ev > alpha) alpha = ev;
      } else {
        if (ev <= alpha) return alpha;
        if (ev < beta) beta = ev;
      }
    }

    return maximizing ? alpha : beta;
  }

  findBestMove(elo) {
    // Map ELO to search depth and blunder parameters
    // 200-400: depth 1, heavy blunders
    // 400-800: depth 2, frequent blunders
    // 800-1200: depth 2-3, occasional mistakes
    // 1200-1600: depth 3, rare mistakes
    // 1600-2000: depth 3-4, very few mistakes
    // 2000-2500: depth 4, almost perfect
    // 2500-3200: depth 4-5, near perfect

    let depth, blunderChance, randomMoveChance, topNFraction;

    if (elo <= 400) {
      depth = 1; blunderChance = 0.5; randomMoveChance = 0.35; topNFraction = 0.7;
    } else if (elo <= 600) {
      depth = 1; blunderChance = 0.35; randomMoveChance = 0.2; topNFraction = 0.6;
    } else if (elo <= 800) {
      depth = 2; blunderChance = 0.25; randomMoveChance = 0.12; topNFraction = 0.5;
    } else if (elo <= 1000) {
      depth = 2; blunderChance = 0.15; randomMoveChance = 0.06; topNFraction = 0.4;
    } else if (elo <= 1200) {
      depth = 3; blunderChance = 0.08; randomMoveChance = 0.03; topNFraction = 0.3;
    } else if (elo <= 1400) {
      depth = 3; blunderChance = 0.04; randomMoveChance = 0.01; topNFraction = 0.25;
    } else if (elo <= 1600) {
      depth = 3; blunderChance = 0.02; randomMoveChance = 0; topNFraction = 0.2;
    } else if (elo <= 1800) {
      depth = 4; blunderChance = 0.01; randomMoveChance = 0; topNFraction = 0.15;
    } else if (elo <= 2000) {
      depth = 4; blunderChance = 0.005; randomMoveChance = 0; topNFraction = 0.1;
    } else if (elo <= 2400) {
      depth = 4; blunderChance = 0; randomMoveChance = 0; topNFraction = 0;
    } else {
      depth = 5; blunderChance = 0; randomMoveChance = 0; topNFraction = 0;
    }

    const maximizing = this.turn === 'w';
    const moves = this.legalMoves();
    if (moves.length === 0) return null;

    // Pure random move (very low ELO behavior)
    if (Math.random() < randomMoveChance) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Move ordering for root
    moves.sort((a, b) => {
      let sa = 0, sb = 0;
      if (a.capture) sa += ChessEngine.PieceValues[a.capture[1]] * 10;
      if (b.capture) sb += ChessEngine.PieceValues[b.capture[1]] * 10;
      if (a.promotion) sa += 800;
      if (b.promotion) sb += 800;
      return sb - sa;
    });

    // Score all moves
    const scored = [];
    for (const move of moves) {
      this.makeMove(move);
      const ev = this.search(depth - 1, -Infinity, Infinity, !maximizing);
      this.unmakeMove();
      scored.push({ move, score: ev });
    }

    scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);

    // Blunder: pick from a wider pool of suboptimal moves
    if (topNFraction > 0 && Math.random() < blunderChance && scored.length > 1) {
      const poolSize = Math.max(2, Math.floor(scored.length * topNFraction));
      const pool = scored.slice(0, poolSize);
      // Weighted random — better moves still more likely
      const weights = pool.map((_, i) => Math.pow(0.6, i));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i].move;
      }
      return pool[pool.length - 1].move;
    }

    return scored[0].move;
  }

  // Get board as 8x8 array matching the visual layout
  toArray() {
    const arr = [];
    for (let r = 0; r < 8; r++) {
      arr[r] = [];
      for (let c = 0; c < 8; c++) {
        arr[r][c] = this.board[r * 8 + c];
      }
    }
    return arr;
  }
}

// ============ GAME STATE ============
const engine = new ChessEngine();
let pieceObjects = {};
let selectedPiece = null;
let selectedPos = null;
let validMoves = [];
let gameOver = false;
let aiElo = 1200;
let lastMoveFrom = null;
let lastMoveTo = null;
let isAnimating = false;
let capturedWhite = [];
let capturedBlack = [];
let moveCount = 0;

function initBoard() {
  engine.reset();
  Object.values(pieceObjects).forEach(obj => scene.remove(obj));
  pieceObjects = {};
  selectedPiece = null;
  selectedPos = null;
  validMoves = [];
  gameOver = false;
  lastMoveFrom = null;
  lastMoveTo = null;
  isAnimating = false;
  capturedWhite = [];
  capturedBlack = [];
  moveCount = 0;
  clearHighlights();
  clearPrisons();

  const board = engine.toArray();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        createPieceAt(piece, row, col);
      }
    }
  }
  updateStatus();
  updateCapturedDisplay();
}

function createPieceAt(piece, row, col) {
  const isWhite = piece[0] === 'w';
  const type = piece[1];
  const group = pieceCreators[type](isWhite);
  const key = `${row}_${col}`;
  group.name = `piece_${piece}_${key}_${moveCount++}`;
  group.position.set(col - 3.5, 0.05, row - 3.5);
  group.userData = { piece, row, col, isWhite, type, idleOffset: Math.random() * Math.PI * 2, bounceSpeed: 0.8 + Math.random() * 0.4 };
  if (isWhite) group.rotation.y = Math.PI;
  group.castShadow = true;
  scene.add(group);
  pieceObjects[key] = group;
  return group;
}

// ============ ANIMATIONS ============
const animations = [];

function animateMovePiece(obj, toRow, toCol) {
  isAnimating = true;
  const startPos = obj.position.clone();
  const endPos = new THREE.Vector3(toCol - 3.5, 0.05, toRow - 3.5);
  const distance = startPos.distanceTo(endPos);
  const duration = Math.min(0.6, 0.2 + distance * 0.05);
  const startTime = performance.now() / 1000;

  animations.push({
    update: (time) => {
      const t = Math.min(1, (time - startTime) / duration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      obj.position.lerpVectors(startPos, endPos, ease);
      const arc = Math.sin(ease * Math.PI) * 0.4 * (distance / 5);
      obj.position.y = 0.05 + arc;
      const squash = 1 + Math.sin(ease * Math.PI) * 0.15;
      obj.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      if (t >= 0.95) {
        const landT = (t - 0.95) / 0.05;
        obj.scale.set(1 + landT * 0.1 * (1 - landT), 1 - landT * 0.1 * (1 - landT), 1 + landT * 0.1 * (1 - landT));
      }
      return t >= 1;
    },
    onComplete: () => {
      obj.position.copy(endPos);
      obj.scale.set(1, 1, 1);
      const landStart = performance.now() / 1000;
      animations.push({
        update: (time) => {
          const lt = Math.min(1, (time - landStart) / 0.2);
          const bounce = Math.sin(lt * Math.PI * 2) * (1 - lt) * 0.08;
          obj.scale.set(1 + bounce, 1 - bounce, 1 + bounce);
          return lt >= 1;
        },
        onComplete: () => { obj.scale.set(1, 1, 1); isAnimating = false; }
      });
    }
  });
}

function animateCapture(obj) {
  const startTime = performance.now() / 1000;
  const startPos = obj.position.clone();
  animations.push({
    update: (time) => {
      const t = Math.min(1, (time - startTime) / 0.4);
      obj.position.y = startPos.y + Math.sin(t * Math.PI) * 1.5;
      obj.scale.setScalar(1 - t);
      obj.rotation.x += 0.15;
      obj.rotation.z += 0.1;
      return t >= 1;
    },
    onComplete: () => { scene.remove(obj); }
  });
}

// ============ EXECUTE MOVE VISUALLY ============
function executeVisualMove(move) {
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const fromKey = `${fr}_${fc}`;
  const toKey = `${tr}_${tc}`;

  // Handle capture (remove target piece visually and send to prison)
  if (move.capture) {
    // Trigger camera shake based on captured piece value
    const capturedType = move.capture[1]; // e.g. 'P', 'Q', 'R', etc.
    cameraShake.trigger(capturedType);

    if (move.enPassant) {
      const epKey = `${fr}_${tc}`;
      if (pieceObjects[epKey]) {
        const cap = pieceObjects[epKey];
        const capPiece = cap.userData.piece;
        const capIsWhite = cap.userData.isWhite;
        if (capIsWhite) capturedBlack.push(capPiece);
        else capturedWhite.push(capPiece);
        animateCapture(cap);
        delete pieceObjects[epKey];
        // Send to prison after short delay
        setTimeout(() => addToPrison(capPiece, capIsWhite), 450);
      }
    } else {
      if (pieceObjects[toKey]) {
        const cap = pieceObjects[toKey];
        const capPiece = cap.userData.piece;
        const capIsWhite = cap.userData.isWhite;
        if (capIsWhite) capturedBlack.push(capPiece);
        else capturedWhite.push(capPiece);
        animateCapture(cap);
        delete pieceObjects[toKey];
        setTimeout(() => addToPrison(capPiece, capIsWhite), 450);
      }
    }
  }

  // Castling rook
  if (move.castle) {
    const row = fr;
    let rookFromKey, rookToKey, rookToCol;
    if (move.castle === 'K') {
      rookFromKey = `${row}_7`; rookToKey = `${row}_5`; rookToCol = 5;
    } else {
      rookFromKey = `${row}_0`; rookToKey = `${row}_3`; rookToCol = 3;
    }
    if (pieceObjects[rookFromKey]) {
      pieceObjects[rookToKey] = pieceObjects[rookFromKey];
      pieceObjects[rookToKey].userData.row = row;
      pieceObjects[rookToKey].userData.col = rookToCol;
      delete pieceObjects[rookFromKey];
      animateMovePiece(pieceObjects[rookToKey], row, rookToCol);
    }
  }

  // Move piece
  if (pieceObjects[fromKey]) {
    const obj = pieceObjects[fromKey];
    delete pieceObjects[fromKey];

    // Promotion: remove old piece, create new one after animation
    if (move.promotion) {
      const color = obj.userData.isWhite ? 'w' : 'b';
      const newPiece = color + move.promotion;
      animateMovePiece(obj, tr, tc);

      // After anim, swap visual
      const checkInterval = setInterval(() => {
        if (!isAnimating) {
          clearInterval(checkInterval);
          scene.remove(obj);
          delete pieceObjects[toKey];
          const newObj = createPieceAt(newPiece, tr, tc);
          pieceObjects[toKey] = newObj;
        }
      }, 50);
    } else {
      obj.userData.row = tr;
      obj.userData.col = tc;
      pieceObjects[toKey] = obj;
      animateMovePiece(obj, tr, tc);
    }
  }

  lastMoveFrom = [fr, fc];
  lastMoveTo = [tr, tc];
  updateCapturedDisplay();
}

// ============ INPUT ============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
  if (gameOver || engine.turn !== 'w' || isAnimating) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const allSquares = squares.flat();
  const intersects = raycaster.intersectObjects(allSquares);

  if (intersects.length === 0) {
    clearSelection();
    return;
  }

  const sq = intersects[0].object;
  const nameParts = sq.name.split('_');
  const row = parseInt(nameParts[1]);
  const col = parseInt(nameParts[2]);

  if (selectedPiece) {
    // Try to move
    const move = validMoves.find(m => m.to[0] === row && m.to[1] === col);
    if (move) {
      // If it's a promotion move, show the picker
      if (move.promotion) {
        // Disable further clicks while picking
        isAnimating = true;
        showPromotionPicker(true).then(chosenPiece => {
          const actualMove = validMoves.find(m => m.to[0] === row && m.to[1] === col && m.promotion === chosenPiece) || move;
          isAnimating = false;
          executeVisualMove(actualMove);
          engine.makeMove(actualMove);
          clearSelection();
          updateStatus();
          checkGameEnd();
          if (!gameOver) {
            const waitForAnim = () => {
              if (isAnimating) { setTimeout(waitForAnim, 50); return; }
              setTimeout(aiMove, 300);
            };
            waitForAnim();
          }
        });
      } else {
        executeVisualMove(move);
        engine.makeMove(move);
        clearSelection();
        updateStatus();
        checkGameEnd();
        if (!gameOver) {
          const waitForAnim = () => {
            if (isAnimating) { setTimeout(waitForAnim, 50); return; }
            setTimeout(aiMove, 300);
          };
          waitForAnim();
        }
      }
    } else {
      const piece = engine.get(row, col);
      if (piece && piece[0] === 'w') {
        selectPiece(row, col);
      } else {
        clearSelection();
      }
    }
  } else {
    const piece = engine.get(row, col);
    if (piece && piece[0] === 'w') {
      selectPiece(row, col);
    }
  }
}

function selectPiece(row, col) {
  selectedPiece = engine.get(row, col);
  selectedPos = [row, col];
  validMoves = engine.legalMovesFrom(row, col);
  showValidMoves(validMoves);

  const key = `${row}_${col}`;
  const obj = pieceObjects[key];
  if (obj) {
    const startTime = performance.now() / 1000;
    animations.push({
      update: (time) => {
        const t = Math.min(1, (time - startTime) / 0.25);
        obj.position.y = 0.05 + Math.sin(t * Math.PI) * 0.3;
        return t >= 1;
      },
      onComplete: () => { obj.position.y = 0.05; }
    });
  }
}

function clearSelection() {
  selectedPiece = null;
  selectedPos = null;
  validMoves = [];
  clearHighlights();
  if (lastMoveFrom) {
    const lf = highlightSquares.find(h => h.name === `highlight_${lastMoveFrom[0]}_${lastMoveFrom[1]}`);
    if (lf) { lf.visible = true; lf.material.copy(lastMoveMat); }
  }
  if (lastMoveTo) {
    const lt = highlightSquares.find(h => h.name === `highlight_${lastMoveTo[0]}_${lastMoveTo[1]}`);
    if (lt) { lt.visible = true; lt.material.copy(lastMoveMat); }
  }
}

renderer.domElement.addEventListener('click', onMouseClick);

// ============ AI ============
function aiMove() {
  if (gameOver || isAnimating || engine.turn !== 'b') return;
  isAnimating = true;

  setTimeout(() => {
    const bestMove = engine.findBestMove(aiElo);

    if (!bestMove) {
      isAnimating = false;
      checkGameEnd();
      return;
    }

    executeVisualMove(bestMove);
    engine.makeMove(bestMove);

    // Wait for animation to finish before checking game end
    const waitDone = () => {
      if (isAnimating) { setTimeout(waitDone, 50); return; }
      checkGameEnd();
      updateStatus();
    };
    setTimeout(waitDone, 100);
  }, 200);
}

function checkGameEnd() {
  if (engine.isCheckmate()) {
    gameOver = true;
    const winner = engine.turn === 'w' ? 'Black' : 'White';
    showMessage(winner === 'White' ? '🏳️ Checkmate! White wins!' : '🏴 Checkmate! Black wins!', winner === 'White' ? '#44cc66' : '#ff4466');
  } else if (engine.isDraw()) {
    gameOver = true;
    showMessage('🤝 Draw!', '#ffaa44');
  } else if (engine.inCheck(engine.turn)) {
    showMessage('⚠️ Check!', '#ffdd44');
    setTimeout(() => { if (!gameOver) hideMessage(); }, 1500);
  }
}

// ============ HIGHLIGHTS ============
function clearHighlights() {
  highlightSquares.forEach(h => { h.visible = false; h.material.copy(highlightMat); });
}

function showValidMoves(moves) {
  clearHighlights();
  if (selectedPos) {
    const selHL = highlightSquares.find(h => h.name === `highlight_${selectedPos[0]}_${selectedPos[1]}`);
    if (selHL) { selHL.visible = true; selHL.material.copy(selectedMat); }
  }
  moves.forEach(m => {
    const [r, c] = m.to;
    const hl = highlightSquares.find(h => h.name === `highlight_${r}_${c}`);
    if (hl) {
      hl.visible = true;
      if (m.capture) {
        hl.material.copy(captureMat);
      } else {
        hl.material.copy(highlightMat);
      }
    }
  });
  if (lastMoveFrom) {
    const lf = highlightSquares.find(h => h.name === `highlight_${lastMoveFrom[0]}_${lastMoveFrom[1]}`);
    if (lf && !lf.visible) { lf.visible = true; lf.material.copy(lastMoveMat); }
  }
  if (lastMoveTo) {
    const lt = highlightSquares.find(h => h.name === `highlight_${lastMoveTo[0]}_${lastMoveTo[1]}`);
    if (lt && selectedPos && !(lastMoveTo[0] === selectedPos[0] && lastMoveTo[1] === selectedPos[1])) { lt.visible = true; lt.material.copy(lastMoveMat); }
  }
}

// ============ UI ============
const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }

  .ui-panel {
    position: fixed; background: rgba(255,255,255,0.92); border: 1px solid rgba(0,0,0,0.1);
    border-radius: 10px; backdrop-filter: blur(8px); color: #1a1a2e; padding: 10px 14px;
    max-width: calc(100vw - 20px);
  }
  .btn {
    padding: 6px 12px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; background: #fff;
    cursor: pointer; font-size: clamp(10px, 2.5vw, 12px); font-weight: 500; color: #333; transition: all 0.15s;
    white-space: nowrap;
  }
  .btn:hover { background: #f0f0f0; border-color: rgba(0,0,0,0.25); }
  .btn.active { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }

  #status-bar {
    position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
    background: rgba(255,255,255,0.92); border: 1px solid rgba(0,0,0,0.1);
    border-radius: 10px; padding: 6px 16px; font-size: clamp(11px, 3vw, 14px); font-weight: 600;
    backdrop-filter: blur(8px); z-index: 10; white-space: nowrap;
    max-width: calc(100vw - 24px);
  }
  #message-popup {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.1);
    border-radius: 14px; padding: 16px 28px; font-size: clamp(16px, 4.5vw, 22px); font-weight: 700;
    backdrop-filter: blur(12px); z-index: 20; display: none; text-align: center;
    pointer-events: none; max-width: calc(100vw - 32px);
  }
  #controls-panel {
    position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; align-items: center; z-index: 10;
    max-width: calc(100vw - 20px);
  }
  #difficulty-panel {
    position: fixed; top: 10px; right: 10px; z-index: 10;
    width: clamp(160px, 28vw, 220px);
  }
  .elo-display {
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;
  }
  .elo-value {
    font-size: clamp(16px, 4vw, 22px); font-weight: 700; color: #1a1a2e; min-width: 42px; text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .elo-label-tag {
    font-size: clamp(8px, 2vw, 10px); font-weight: 600; padding: 2px 6px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;
  }
  .elo-slider {
    width: 100%; height: 6px; -webkit-appearance: none; appearance: none; border-radius: 3px;
    background: linear-gradient(to right, #4CAF50, #FFC107, #FF5722, #9C27B0);
    outline: none; cursor: pointer;
  }
  .elo-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
    background: #fff; border: 2px solid #1a1a2e; cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  .elo-slider::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff; border: 2px solid #1a1a2e; cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  .elo-presets { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 6px; }
  .elo-presets .btn { font-size: clamp(9px, 2vw, 10px); padding: 2px 6px; }
  .elo-range-labels {
    display: flex; justify-content: space-between; font-size: clamp(8px, 1.8vw, 9px); color: #999; margin-top: 2px;
  }

  .turn-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; border: 1px solid rgba(0,0,0,0.2); vertical-align: middle; }

  /* Settings button hidden on desktop — panel always visible */
  #btn-settings { display: none; }

  /* ---- Small screens (phones) ---- */
  @media (max-width: 560px) {
    #btn-settings { display: inline-block; }
    #status-bar {
      top: 6px; padding: 5px 10px; border-radius: 8px;
    }
    #difficulty-panel {
      top: auto; bottom: 52px; right: 6px; left: 6px; width: auto;
      display: none; /* collapsed by default on mobile */
      border-radius: 10px;
    }
    #difficulty-panel.open { display: block; }
    #controls-panel {
      bottom: 6px; gap: 4px; padding: 8px 10px;
    }
    .btn { padding: 5px 10px; }
    .elo-presets { gap: 2px; }
    .elo-presets .btn { padding: 2px 5px; font-size: 9px; }
    .ui-panel { padding: 8px 10px; }
  }

  /* ---- Medium screens (tablets, small laptops) ---- */
  @media (min-width: 561px) and (max-width: 900px) {
    #difficulty-panel { width: clamp(170px, 25vw, 200px); }
    #status-bar { padding: 6px 14px; max-width: calc(100vw - 220px); }
  }

  /* ---- Landscape phones ---- */
  @media (max-height: 420px) {
    #status-bar {
      top: 4px; padding: 4px 10px; font-size: 11px; border-radius: 7px;
    }
    #difficulty-panel {
      top: 4px; right: 4px; width: clamp(140px, 22vw, 180px); padding: 6px 8px;
    }
    #controls-panel {
      bottom: 4px; padding: 6px 10px;
    }
    .btn { padding: 4px 8px; font-size: 10px; }
    .elo-value { font-size: 15px; }
    .elo-presets .btn { font-size: 9px; padding: 2px 4px; }
    #message-popup { padding: 12px 20px; font-size: 16px; }
  }
`;
document.head.appendChild(style);

const statusBar = document.createElement('div');
statusBar.id = 'status-bar';
document.body.appendChild(statusBar);

const messagePopup = document.createElement('div');
messagePopup.id = 'message-popup';
document.body.appendChild(messagePopup);

const controlsPanel = document.createElement('div');
controlsPanel.id = 'controls-panel';
controlsPanel.className = 'ui-panel';
controlsPanel.innerHTML = `
  <button class="btn" id="btn-new" title="New Game">🔄 New Game</button>
  <button class="btn" id="btn-undo" title="Undo Move">↩️ Undo</button>
  <button class="btn" id="btn-settings" title="AI Settings">⚙️ AI</button>
`;
document.body.appendChild(controlsPanel);

const diffPanel = document.createElement('div');
diffPanel.id = 'difficulty-panel';
diffPanel.className = 'ui-panel';

function getEloTier(elo) {
  if (elo < 400) return { label: 'Beginner', color: '#4CAF50', bg: 'rgba(76,175,80,0.12)' };
  if (elo < 800) return { label: 'Novice', color: '#8BC34A', bg: 'rgba(139,195,74,0.12)' };
  if (elo < 1000) return { label: 'Intermediate', color: '#CDDC39', bg: 'rgba(205,220,57,0.15)' };
  if (elo < 1200) return { label: 'Club Player', color: '#FFC107', bg: 'rgba(255,193,7,0.12)' };
  if (elo < 1400) return { label: 'Strong Club', color: '#FF9800', bg: 'rgba(255,152,0,0.12)' };
  if (elo < 1600) return { label: 'Tournament', color: '#FF5722', bg: 'rgba(255,87,34,0.12)' };
  if (elo < 1800) return { label: 'Expert', color: '#f44336', bg: 'rgba(244,67,54,0.12)' };
  if (elo < 2000) return { label: 'Candidate Master', color: '#E91E63', bg: 'rgba(233,30,99,0.12)' };
  if (elo < 2200) return { label: 'Master', color: '#9C27B0', bg: 'rgba(156,39,176,0.12)' };
  if (elo < 2500) return { label: 'Int. Master', color: '#673AB7', bg: 'rgba(103,58,183,0.12)' };
  return { label: 'Grandmaster', color: '#311B92', bg: 'rgba(49,27,146,0.15)' };
}

function updateEloUI() {
  const tier = getEloTier(aiElo);
  document.getElementById('elo-value').textContent = aiElo;
  const tag = document.getElementById('elo-tier-tag');
  tag.textContent = tier.label;
  tag.style.color = tier.color;
  tag.style.background = tier.bg;
  // Update preset button active states
  diffPanel.querySelectorAll('[data-elo]').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.elo) === aiElo);
  });
}

diffPanel.innerHTML = `
  <div style="font-size:clamp(9px,2.5vw,11px);font-weight:600;margin-bottom:6px;color:#666;letter-spacing:0.5px;">AI STRENGTH</div>
  <div class="elo-display">
    <span id="elo-value" class="elo-value">${aiElo}</span>
    <span id="elo-tier-tag" class="elo-label-tag">Club Player</span>
  </div>
  <input type="range" class="elo-slider" id="elo-slider" min="200" max="3200" step="50" value="${aiElo}" />
  <div class="elo-range-labels">
    <span>200</span><span>ELO</span><span>3200</span>
  </div>
  <div class="elo-presets">
    <button class="btn" data-elo="400">Beginner</button>
    <button class="btn" data-elo="800">Novice</button>
    <button class="btn active" data-elo="1200">Club</button>
    <button class="btn" data-elo="1600">Expert</button>
    <button class="btn" data-elo="2000">Master</button>
    <button class="btn" data-elo="2800">GM</button>
  </div>
`;
document.body.appendChild(diffPanel);

function updateCapturedDisplay() {
  // Captured pieces shown in 3D prisons only
}

function updateStatus() {
  const color = engine.turn;
  const turnColor = color === 'w' ? '#fff8e7' : '#2a1a3e';
  const turnLabel = color === 'w' ? 'White' : 'Black';
  const checkText = !gameOver && engine.inCheck(color) ? ' — Check!' : '';
  const moveNum = engine.fullmoveNumber;
  statusBar.innerHTML = `<span class="turn-indicator" style="background:${turnColor}"></span>Move ${moveNum} · ${turnLabel}'s Turn${checkText}`;
}

function showMessage(text, color = '#333') {
  messagePopup.style.display = 'block';
  messagePopup.style.color = color;
  messagePopup.textContent = text;
}

function hideMessage() {
  messagePopup.style.display = 'none';
}

document.getElementById('btn-new').addEventListener('click', () => {
  hideMessage();
  initBoard();
});

document.getElementById('btn-undo').addEventListener('click', () => {
  if (engine.history.length < 2 || isAnimating || gameOver) return;
  hideMessage();
  // Undo AI move + player move
  engine.unmakeMove();
  engine.unmakeMove();
  // Rebuild visuals from engine state
  rebuildVisuals();
  updateStatus();
});

function rebuildVisuals() {
  Object.values(pieceObjects).forEach(obj => scene.remove(obj));
  pieceObjects = {};
  const board = engine.toArray();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]) createPieceAt(board[r][c], r, c);
    }
  }
  // Rebuild captured lists and prisons
  capturedWhite = [];
  capturedBlack = [];
  clearPrisons();
  for (const undo of engine.history) {
    if (undo.captured || undo.move.enPassant) {
      const cap = undo.captured || undo.epCaptured;
      if (cap) {
        if (cap[0] === 'w') {
          capturedBlack.push(cap);
          addToPrison(cap, true);
        } else {
          capturedWhite.push(cap);
          addToPrison(cap, false);
        }
      }
    }
  }
  lastMoveFrom = null;
  lastMoveTo = null;
  if (engine.history.length > 0) {
    const last = engine.history[engine.history.length - 1];
    lastMoveFrom = last.move.from;
    lastMoveTo = last.move.to;
  }
  clearSelection();
  updateCapturedDisplay();
}

// Settings toggle for mobile: show/hide difficulty panel
document.getElementById('btn-settings').addEventListener('click', () => {
  diffPanel.classList.toggle('open');
  // On larger screens the panel is always visible, this toggle is only useful on mobile
});
// Close difficulty panel when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 560 && diffPanel.classList.contains('open')) {
    if (!diffPanel.contains(e.target) && e.target.id !== 'btn-settings') {
      diffPanel.classList.remove('open');
    }
  }
});

// ELO slider interaction
const eloSlider = document.getElementById('elo-slider');
eloSlider.addEventListener('input', () => {
  aiElo = parseInt(eloSlider.value);
  updateEloUI();
});

// ELO preset buttons
diffPanel.querySelectorAll('[data-elo]').forEach(btn => {
  btn.addEventListener('click', () => {
    aiElo = parseInt(btn.dataset.elo);
    eloSlider.value = aiElo;
    updateEloUI();
  });
});

// Initialize the ELO UI display
updateEloUI();

// ============ ENVIRONMENT (advanced atmospheric sky shader) ============
const skyGeo = new THREE.SphereGeometry(90, 48, 48);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.55, -0.3).normalize() },
    uZenithColor: { value: new THREE.Color(0x2266aa) },
    uHorizonColor: { value: new THREE.Color(0xffeedd) },
    uGroundColor: { value: new THREE.Color(0x667744) },
    uSunColor: { value: new THREE.Color(0xfff4cc) },
    uSunGlowColor: { value: new THREE.Color(0xffcc88) },
  },
  vertexShader: `
    varying vec3 vWorldDir;
    varying vec2 vUv;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(wp.xyz);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uZenithColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uGroundColor;
    uniform vec3 uSunColor;
    uniform vec3 uSunGlowColor;
    varying vec3 vWorldDir;
    varying vec2 vUv;

    // Simple hash noise
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i); float b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0; float amp = 0.5;
      for(int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.1; amp *= 0.48; }
      return v;
    }

    void main() {
      vec3 dir = normalize(vWorldDir);
      float h = dir.y;

      // Atmospheric gradient with Rayleigh-like scatter
      float horizonFalloff = exp(-abs(h) * 4.0);
      float zenithT = pow(max(h, 0.0), 0.55);
      vec3 skyCol = mix(uHorizonColor, uZenithColor, zenithT);

      // Below horizon
      if (h < 0.0) {
        float groundT = smoothstep(0.0, -0.15, h);
        skyCol = mix(uHorizonColor, uGroundColor, groundT);
      }

      // Sun disc
      float sunAngle = acos(clamp(dot(dir, uSunDir), 0.0, 1.0));
      float sunDisc = smoothstep(0.025, 0.018, sunAngle);
      skyCol = mix(skyCol, uSunColor * 2.2, sunDisc);

      // Sun glow (multi-layer for realism)
      float glow1 = exp(-sunAngle * 6.0) * 0.45;
      float glow2 = exp(-sunAngle * 2.0) * 0.12;
      float glow3 = exp(-sunAngle * 20.0) * 0.8;
      skyCol += uSunGlowColor * (glow1 + glow2 + glow3);

      // Horizon haze
      float hazeMask = exp(-abs(h) * 8.0);
      skyCol += vec3(1.0, 0.92, 0.8) * hazeMask * 0.08;

      // Procedural wispy clouds
      if (h > 0.01) {
        vec2 cloudUV = dir.xz / max(dir.y, 0.01) * 1.2;
        float cloudDensity = fbm(cloudUV * 0.7 + uTime * 0.01);
        cloudDensity = smoothstep(0.38, 0.62, cloudDensity);
        // Sun-lit clouds
        float cloudSunLight = exp(-sunAngle * 2.0) * 0.3 + 0.7;
        vec3 cloudCol = mix(vec3(0.85, 0.88, 0.92), vec3(1.0, 0.98, 0.92), cloudSunLight);
        float cloudAlpha = cloudDensity * smoothstep(0.01, 0.12, h) * 0.55;
        skyCol = mix(skyCol, cloudCol, cloudAlpha);
      }

      gl_FragColor = vec4(skyCol, 1.0);
    }
  `
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.name = 'sky';
scene.add(sky);

// Volumetric 3D clouds (kept for nearby parallax depth)
const cloudMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 1.0, metalness: 0,
  transparent: true, opacity: 0.65,
  transmission: 0.1, thickness: 0.5,
});
for (let i = 0; i < 10; i++) {
  const cloud = new THREE.Group();
  cloud.name = `cloud_${i}`;
  const numPuffs = 5 + Math.floor(Math.random() * 4);
  for (let j = 0; j < numPuffs; j++) {
    const size = 0.8 + Math.random() * 1.2;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), cloudMat);
    puff.position.set(j * 1.1 - numPuffs * 0.55, Math.random() * 0.3 - (j === 0 || j === numPuffs - 1 ? 0.2 : 0), Math.random() * 0.5);
    puff.scale.y = 0.45 + Math.random() * 0.2;
    cloud.add(puff);
  }
  cloud.position.set(-35 + Math.random() * 70, 14 + Math.random() * 12, -30 + Math.random() * 60);
  cloud.userData.speed = 0.08 + Math.random() * 0.15;
  scene.add(cloud);
}

// Ground with subtle procedural detail
const groundMat = new THREE.MeshPhysicalMaterial({
  color: 0x5aaf5a, roughness: 0.92, metalness: 0,
  sheen: 0.08, sheenColor: new THREE.Color(0x88dd88), sheenRoughness: 0.8,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 32, 32), groundMat);
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.55;
ground.receiveShadow = true;
scene.add(ground);

// Subtle ground vertex displacement for gentle rolling terrain
{
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    if (dist > 8) { // outside the board area
      const h = (Math.sin(x * 0.15) * Math.cos(y * 0.12) + Math.sin(x * 0.08 + y * 0.1) * 0.5) * 0.25;
      pos.setZ(i, h * Math.min(1, (dist - 8) / 10));
    }
  }
  pos.needsUpdate = true;
  ground.geometry.computeVertexNormals();
}

// Rolling hills in the background
for (let i = 0; i < 12; i++) {
  const angle = (i / 12) * Math.PI * 2;
  const dist = 35 + Math.random() * 15;
  const hillSize = 4 + Math.random() * 8;
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(hillSize, 16, 16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.3 + Math.random() * 0.05, 0.4, 0.35 + Math.random() * 0.1), roughness: 0.95 })
  );
  hill.name = `hill_${i}`;
  hill.position.set(Math.cos(angle) * dist, -hillSize * 0.65, Math.sin(angle) * dist);
  hill.scale.y = 0.4 + Math.random() * 0.2;
  scene.add(hill);
}

// Grass tufts
const grassColors = [0x4a9e4a, 0x5cb85c, 0x6fcf6f, 0x3d8b3d];
for (let i = 0; i < 80; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 6 + Math.random() * 20;
  const grassBlade = new THREE.Mesh(
    new THREE.ConeGeometry(0.04 + Math.random() * 0.06, 0.15 + Math.random() * 0.25, 4),
    new THREE.MeshStandardMaterial({ color: grassColors[Math.floor(Math.random() * grassColors.length)], roughness: 0.9 })
  );
  grassBlade.name = `grass_${i}`;
  grassBlade.position.set(Math.cos(angle) * dist, -0.48, Math.sin(angle) * dist);
  grassBlade.rotation.set(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2);
  scene.add(grassBlade);
}

// Trees
for (let i = 0; i < 10; i++) {
  const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
  const dist = 14 + Math.random() * 12;
  const tree = new THREE.Group();
  tree.name = `tree_${i}`;

  const trunkH = 1.2 + Math.random() * 1.0;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.8 })
  );
  trunk.position.y = trunkH / 2 - 0.55;
  trunk.castShadow = true;
  tree.add(trunk);

  const foliageColor = [0x2d8a2d, 0x3ca03c, 0x228B22, 0x4CAF50][Math.floor(Math.random() * 4)];
  for (let f = 0; f < 4; f++) {
    const fSize = (1.0 + Math.random() * 0.5) - f * 0.15;
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(fSize, 8, 8),
      new THREE.MeshStandardMaterial({ color: foliageColor, roughness: 0.85 })
    );
    foliage.position.set(Math.random() * 0.3 - 0.15, trunkH - 0.3 + f * 0.4, Math.random() * 0.3 - 0.15);
    foliage.castShadow = true;
    tree.add(foliage);
  }

  tree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  scene.add(tree);
}

// Flowers
const flowerColors = [0xff6699, 0xffcc33, 0xff4444, 0xbb66ff, 0x66bbff, 0xff8855];
for (let i = 0; i < 50; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 5.5 + Math.random() * 18;
  const flower = new THREE.Group();
  flower.name = `flower_${i}`;

  const stemH = 0.2 + Math.random() * 0.15;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.015, stemH, 4),
    new THREE.MeshStandardMaterial({ color: 0x3d8b3d, roughness: 0.8 })
  );
  stem.position.y = -0.55 + stemH / 2;
  flower.add(stem);

  const petalColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
  // Flower head with multiple petals
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 })
  );
  center.position.y = -0.55 + stemH;
  flower.add(center);

  for (let p = 0; p < 5; p++) {
    const pAngle = (p / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 6),
      new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.5 })
    );
    petal.position.set(Math.cos(pAngle) * 0.03, -0.55 + stemH, Math.sin(pAngle) * 0.03);
    petal.scale.y = 0.5;
    flower.add(petal);
  }

  flower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  flower.userData.swayOffset = Math.random() * Math.PI * 2;
  scene.add(flower);
}

// Butterflies
for (let i = 0; i < 6; i++) {
  const butterfly = new THREE.Group();
  butterfly.name = `butterfly_${i}`;
  const bColor = [0xff88aa, 0xffcc44, 0x88ccff, 0xaa88ff, 0xff8844, 0x88ffaa][i];
  [-1, 1].forEach((side, idx) => {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.07),
      new THREE.MeshStandardMaterial({ color: bColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    wing.name = `wing_${idx}`;
    wing.position.set(side * 0.05, 0, 0);
    butterfly.add(wing);
  });
  // Tiny body
  const bBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.04, 4, 4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  bBody.name = 'bBody';
  butterfly.add(bBody);

  butterfly.position.set(-8 + Math.random() * 16, 1.5 + Math.random() * 3, -8 + Math.random() * 16);
  butterfly.userData = { phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.5, radius: 2 + Math.random() * 3, centerX: butterfly.position.x, centerZ: butterfly.position.z };
  scene.add(butterfly);
}

// Mushrooms near board
for (let i = 0; i < 6; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 5.5 + Math.random() * 2;
  const shroom = new THREE.Group();
  shroom.name = `mushroom_${i}`;

  const stipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.6 })
  );
  stipe.position.y = -0.49;
  shroom.add(stipe);

  const capColor = [0xff4444, 0xff8833, 0xcc44ff][i % 3];
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.5 })
  );
  cap.position.y = -0.43;
  shroom.add(cap);

  // Dots on cap
  for (let d = 0; d < 3; d++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    const dAngle = (d / 3) * Math.PI * 2 + Math.random();
    dot.position.set(Math.cos(dAngle) * 0.035, -0.41, Math.sin(dAngle) * 0.035);
    shroom.add(dot);
  }

  shroom.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  scene.add(shroom);
}

// Small rocks
for (let i = 0; i < 15; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 6 + Math.random() * 15;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.12, 0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0, 0, 0.4 + Math.random() * 0.2), roughness: 0.9 })
  );
  rock.name = `rock_${i}`;
  rock.position.set(Math.cos(angle) * dist, -0.52, Math.sin(angle) * dist);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.scale.y = 0.6;
  scene.add(rock);
}

// ============ CAMERA SHAKE ============
const cameraShake = {
  active: false,
  intensity: 0,
  startTime: 0,
  duration: 0.3,
  offset: new THREE.Vector3(),
  decay: 5, // exponential decay factor

  trigger(capturedPieceType) {
    // Scale intensity by piece value: Pawn=small, Queen=huge
    const shakeMap = { P: 0.04, N: 0.1, B: 0.1, R: 0.15, Q: 0.3, K: 0.35 };
    const durationMap = { P: 0.15, N: 0.2, B: 0.2, R: 0.25, Q: 0.35, K: 0.4 };
    this.intensity = shakeMap[capturedPieceType] || 0.08;
    this.duration = durationMap[capturedPieceType] || 0.2;
    this.startTime = performance.now() / 1000;
    this.active = true;
  },

  update(time) {
    if (!this.active) {
      this.offset.set(0, 0, 0);
      return;
    }
    const elapsed = time - this.startTime;
    if (elapsed > this.duration) {
      this.active = false;
      this.offset.set(0, 0, 0);
      return;
    }
    // Exponential decay envelope
    const progress = elapsed / this.duration;
    const envelope = (1 - progress) * Math.exp(-this.decay * progress);
    // High-frequency random displacement for rumble feel
    const freq = 25;
    const ox = Math.sin(elapsed * freq * 6.28 + 0) * this.intensity * envelope;
    const oy = Math.sin(elapsed * freq * 6.28 + 2.1) * this.intensity * envelope * 0.7;
    const oz = Math.sin(elapsed * freq * 6.28 + 4.2) * this.intensity * envelope * 0.5;
    this.offset.set(ox, oy, oz);
  }
};

// ============ ANIMATION LOOP ============
const clock = new THREE.Clock();

function animate() {
  const time = performance.now() / 1000;
  const delta = clock.getDelta();

  controls.update();

  // Idle animations for pieces
  Object.values(pieceObjects).forEach(obj => {
    const ud = obj.userData;
    const breathe = Math.sin(time * ud.bounceSpeed + ud.idleOffset) * 0.015;
    const baseY = 0.05;
    if (!animations.some(a => a.target === obj)) {
      obj.position.y = baseY + breathe;
    }
    obj.rotation.z = Math.sin(time * 0.5 + ud.idleOffset) * 0.03;

    // Eye tracking
    obj.children.forEach(child => {
      if (child.name && child.name.startsWith('pupil_') && !child.name.includes('Highlight')) {
        const side = child.name === 'pupil_0' ? -1 : 1;
        const lookX = Math.sin(time * 0.3 + ud.idleOffset * 2) * 0.02;
        const scaleF = ud.type === 'P' ? 0.75 : (ud.type === 'N' ? 1.0 : (ud.type === 'B' ? 0.85 : 0.95));
        const baseX = side * 0.13 * scaleF;
        child.position.x = baseX + lookX;
      }
    });
  });

  // Process animations
  for (let i = animations.length - 1; i >= 0; i--) {
    if (animations[i].update(time)) {
      if (animations[i].onComplete) animations[i].onComplete();
      animations.splice(i, 1);
    }
  }

  // Highlights pulse
  highlightSquares.forEach(hl => {
    if (hl.visible) {
      hl.position.y = 0.02 + Math.sin(time * 3) * 0.01;
      hl.material.opacity = 0.4 + Math.sin(time * 2.5) * 0.15;
    }
  });

  // Clouds
  scene.children.forEach(child => {
    if (child.name?.startsWith('cloud_')) {
      child.position.x += child.userData.speed * delta;
      if (child.position.x > 35) child.position.x = -35;
    }
  });

  // Corner gems
  boardGroup.children.forEach(child => {
    if (child.name?.startsWith('cornerGem_')) {
      child.position.y = 0.1 + Math.sin(time * 2 + parseInt(child.name.split('_')[1])) * 0.05;
    }
  });

  // Dynamic light — subtle time-of-day shift
  const sunAngle = time * 0.03;
  sunLight.position.x = 8 + Math.sin(sunAngle) * 3;
  sunLight.position.z = 8 + Math.cos(sunAngle) * 3;
  sunLight.position.y = 18 + Math.sin(sunAngle * 0.5) * 2;

  // Update sky shader time + sun direction
  skyMat.uniforms.uTime.value = time;
  const sunDir = sunLight.position.clone().normalize();
  skyMat.uniforms.uSunDir.value.copy(sunDir);

  // Warm-cool point light cycle
  const hue = (time * 0.012) % 1;
  pointLight.color.setHSL(hue, 0.2, 0.65);
  pointLight.intensity = 0.35 + Math.sin(time * 0.5) * 0.05;

  // Flowers sway
  scene.children.forEach(child => {
    if (child.name?.startsWith('flower_') && child.userData.swayOffset !== undefined) {
      child.rotation.z = Math.sin(time * 1.5 + child.userData.swayOffset) * 0.1;
    }
  });

  // Butterflies
  scene.children.forEach(child => {
    if (child.name?.startsWith('butterfly_')) {
      const ud = child.userData;
      const phase = ud.phase + time * ud.speed;
      child.position.x = ud.centerX + Math.sin(phase) * ud.radius;
      child.position.z = ud.centerZ + Math.cos(phase * 0.7) * ud.radius;
      child.position.y = 1.5 + Math.sin(phase * 2) * 0.5;
      child.rotation.y = Math.atan2(Math.cos(phase), -Math.sin(phase * 0.7));
      child.children.forEach((wing, idx) => {
        if (wing.name?.startsWith('wing_')) {
          const flapAngle = Math.sin(time * 12 + ud.phase) * 0.6;
          wing.rotation.y = idx === 0 ? flapAngle : -flapAngle;
        }
      });
    }
  });

  // Grass sway
  scene.children.forEach(child => {
    if (child.name?.startsWith('grass_')) {
      child.rotation.z = Math.sin(time * 1.2 + child.position.x * 0.5) * 0.12;
    }
  });

  // Prison torch flicker
  [prisonWhiteGroup, prisonBlackGroup].forEach(pg => {
    pg.children.forEach(child => {
      if (child.name?.includes('_torch_')) {
        child.children.forEach(c => {
          if (c.name === 'flame') {
            c.scale.y = 0.9 + Math.sin(time * 8 + parseFloat(child.name.slice(-2)) * 3) * 0.2;
            c.scale.x = 0.95 + Math.sin(time * 6.5) * 0.1;
            c.position.x = Math.sin(time * 5) * 0.008;
          }
          if (c.name === 'torchLight') {
            c.intensity = 0.5 + Math.sin(time * 7 + Math.random() * 0.3) * 0.25;
          }
        });
      }
    });
  });

  // Prison piece sad idle animations
  [...prisonPiecesWhite, ...prisonPiecesBlack].forEach(obj => {
    if (!obj || !obj.userData.isPrisoner) return;
    const ud = obj.userData;
    const baseY = ud.prisonBaseY;
    // Slow sad sway
    obj.position.y = baseY + Math.sin(time * 0.6 + ud.sadPhase) * 0.02;
    // Hang head forward slightly
    obj.rotation.x = Math.sin(time * 0.4 + ud.sadPhase) * 0.06 + 0.08;
    // Slight side-to-side wobble
    obj.rotation.z = Math.sin(time * 0.35 + ud.sadPhase * 1.5) * 0.04;
  });

  // Apply camera shake
  cameraShake.update(time);
  camera.position.add(cameraShake.offset);
  composer.render();
  camera.position.sub(cameraShake.offset);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  smaaPass.setSize(window.innerWidth, window.innerHeight);
});

// ============ INIT ============
initBoard();