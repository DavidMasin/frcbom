import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, camera, scene, controls;

window.showGLTFViewer = async function (blobUrl) {
    const canvas = document.getElementById("gltfCanvas");
    document.getElementById("viewerModal").classList.remove("hidden");

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const light = new THREE.AmbientLight(0xffffff);
    scene.add(light);

    controls = new OrbitControls(camera, renderer.domElement);

    const loader = new GLTFLoader();
    loader.load(blobUrl, function (gltf) {
        scene.add(gltf.scene);
    });

    camera.position.z = 5;

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
