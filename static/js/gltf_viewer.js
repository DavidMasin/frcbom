import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, camera, scene, controls;

window.showGLTFViewer = async function (blobUrl) {
    const canvas = document.getElementById("gltfCanvas");
    document.getElementById("viewerModal").classList.remove("hidden");

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    controls = new OrbitControls(camera, renderer.domElement);

    const loader = new GLTFLoader();
    loader.load(blobUrl, function (gltf) {
        const model = gltf.scene;
        scene.add(model);

        // 🧠 Compute bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // 🧭 Recenter model
        model.position.sub(center);

        // 🔍 Position camera to fit the model
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

        camera.position.set(0, 0, cameraZ);
        camera.lookAt(0, 0, 0);

        // 🛠 Update controls
        controls.target.set(0, 0, 0);
        controls.update();
    });

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    animate();
};


window.closeViewer = function () {
    document.getElementById("viewerModal").classList.add("hidden");
    document.getElementById("gltfCanvas").replaceWith(document.getElementById("gltfCanvas").cloneNode(true));
};
