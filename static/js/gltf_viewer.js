import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, camera, scene, controls;

window.showGLTFViewer = async function (blobUrl) {
    const canvas = document.getElementById("gltfCanvas");
    const viewerModal = document.getElementById("viewerModal");
    const loadingOverlay = document.getElementById("viewerLoading");

    // 🔄 Show loader and modal
    loadingOverlay.classList.remove("hidden");
    viewerModal.classList.remove("hidden");

    // Clean up old scene/renderer
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer = null;
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

    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    const loader = new GLTFLoader();

    loader.load(blobUrl, function (gltf) {
        const model = gltf.scene;
        scene.add(model);
        if (window.visiblePartIds && window.visiblePartIds.length > 0) {
            gltf.scene.traverse((obj) => {
                if (obj.userData && obj.userData.partId) {
                    if (!window.visiblePartIds.includes(obj.userData.partId)) {
                        obj.visible = false;
                    }
                }
            });
        }
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

        model.traverse(child => {
            if (child.isMesh) {
                const edges = new THREE.EdgesGeometry(child.geometry);
                const line = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: 0x000000 })
                );
                child.add(line);
            }
        });

        // ✅ Hide loading when ready
        loadingOverlay.classList.add("hidden");

        animate();
    }, undefined, (error) => {
        console.error("❌ GLTF Load Failed:", error);
        loadingOverlay.classList.add("hidden");
        alert("Failed to load 3D model.");
        viewerModal.classList.add("hidden");
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

};
window.closeViewer = function () {
    document.getElementById("viewerModal").classList.add("hidden");
    document.getElementById("viewerLoading").classList.add("hidden");

    // Reset canvas cleanly
    const canvas = document.getElementById("gltfCanvas");
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
};
