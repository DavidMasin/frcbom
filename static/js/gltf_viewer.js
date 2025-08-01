import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, camera, scene, controls;

window.showGLTFViewer = async function (blobUrl) {
    const canvas = document.getElementById("gltfCanvas");
    document.getElementById("viewerModal").classList.remove("hidden");

    // Clear previous WebGL context (in case of refresh)
    if (renderer) {
        renderer.dispose();
    }

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75,
        canvas.clientWidth / canvas.clientHeight,
        0.01,
        1000
    );

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lights
    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.enableZoom = true;
    controls.enablePan = true;

    // 🚨 Full orbit freedom
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    const loader = new GLTFLoader();
    loader.load(blobUrl, function (gltf) {
        const model = gltf.scene;
        scene.add(model);

        // Auto-center & scale
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.6;

        camera.position.set(distance, distance, distance);
        camera.lookAt(0, 0, 0);

        controls.target.set(0, 0, 0);
        controls.update();

        // Add outlines
        model.traverse((child) => {
            if (child.isMesh) {
                const edges = new THREE.EdgesGeometry(child.geometry);
                const line = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: 0x000000 })
                );
                child.add(line);
            }
        });
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    animate();
};

// 🧹 Cleanup + reload
window.closeViewer = function () {
    document.getElementById("viewerModal").classList.add("hidden");
    const canvas = document.getElementById("gltfCanvas");
    const clone = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(clone, canvas);
};
