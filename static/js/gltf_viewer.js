// gltf_viewer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import confetti from 'https://cdn.skypack.dev/canvas-confetti';

let scene, camera, renderer, controls, model, rotateModel = false, canvasEl;

function initViewer(canvasId = 'gltfCanvas', rotate = false) {
    canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvasEl.clientWidth / canvasEl.clientHeight, 0.1, 5000);
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(3, 6, 8);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    rotateModel = rotate;

    window.addEventListener('resize', onResize);
    animate();
}

function onResize() {
    if (!canvasEl || !camera || !renderer) return;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function fitCameraTo(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (maxDim / 2) / Math.tan(fov / 2);

    camera.position.copy(center).add(new THREE.Vector3(dist, dist, dist));
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.maxDistance = dist * 10;
    controls.update();
}

function animate() {
    requestAnimationFrame(animate);
    if (rotateModel && model) model.rotation.y += 0.01;
    controls.update();
    renderer.render(scene, camera);
}

export function showGLTFViewer(url, canvasId = 'gltfCanvas', rotate = false, launchConfetti = false) {
    initViewer(canvasId, rotate);
    const loader = new GLTFLoader();

    loader.load(
        url,
        (gltf) => {
            model = gltf.scene;
            scene.add(model);
            fitCameraTo(model);

            document.getElementById("viewerLoading")?.classList.add("hidden");
            if (launchConfetti) confetti({ particleCount: 220, spread: 85, origin: { y: 0.6 } });
        },
        undefined,
        (error) => {
            console.error('GLTF Load Failed:', error);
            document.getElementById("viewerLoading")?.classList.add("hidden");
        }
    );
}
