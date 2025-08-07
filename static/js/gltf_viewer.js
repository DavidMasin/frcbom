import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import confetti from 'https://cdn.skypack.dev/canvas-confetti';

let scene, camera, renderer, controls, model, animateRotation = false;

function initViewer(canvasId = 'gltfCanvas', rotate = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const light1 = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    const light2 = new THREE.DirectionalLight(0xffffff, 0.8);
    light2.position.set(1, 1, 1);
    scene.add(light1);
    scene.add(light2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    animateRotation = rotate;
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (animateRotation && model) {
        model.rotation.y += 0.01;
    }
    controls.update();
    renderer.render(scene, camera);
}

export function showGLTFViewer(url, canvasId = 'gltfCanvas', rotate = false, launchConfetti = false) {
    initViewer(canvasId, rotate);

    const loader = new GLTFLoader();
    loader.load(
        url,
        function (gltf) {
            model = gltf.scene;
            scene.add(model);

            // Center and scale model
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3()).length();
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);  // center the model

            camera.position.set(0, 0, size * 1.5);
            controls.target.set(0, 0, 0);
            controls.update();

            document.getElementById("viewerLoading")?.classList.add("hidden");

            if (launchConfetti) {
                confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
            }
        },
        undefined,
        function (error) {
            console.error('GLTF Load Failed:', error);
            document.getElementById("viewerLoading")?.classList.add("hidden");
        }
    );
}