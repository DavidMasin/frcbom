const API_BASE_URL = '/'; // Use relative path for API requests

const socket = io(API_BASE_URL, {
    auth: {
        token: localStorage.getItem('jwt_token')
    }
});

// Listen for updates
socket.on('qty_update', ({ partId, field, newValue }) => {
    const part = window.bomData.find(p => p.partId === partId);
    if (part) {
        part[field] = newValue;
        renderBOM(window.bomData);  // or just update that one cell if you prefer
    }
});

/**
 * Main initialization function that runs when the DOM is fully loaded.
 * Sets up event listeners and handles page routing and data fetching.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const fetchBomBtn = document.getElementById("fetchBom");
    if (fetchBomBtn) {
        console.log("✅ fetchBom button found and event listener attached");

        fetchBomBtn.addEventListener("click", async () => {
            console.log("🔄 Fetch BOM clicked");

            const teamNumber = parseURL().teamNumber;
            const robotName = parseURL().robotName;
            const systemName = parseURL().system;

            const documentUrl = document.getElementById("assemblyUrl")?.value;
            const accessKey = document.getElementById("accessKey")?.value;
            const secretKey = document.getElementById("secretKey")?.value;

            const res = await fetch(`${API_BASE_URL}api/bom`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("jwt_token")}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    team_number: teamNumber,
                    robot: robotName,
                    system: systemName,
                    access_key: accessKey,
                    secret_key: secretKey,
                    document_url: documentUrl
                })
            });

            let data;
            try {
                data = await res.json();
            } catch (err) {
                console.error("❌ Server response is not valid JSON:", err);
                document.getElementById("settingsMessage").textContent = "⚠️ Unexpected server response.";
                return;
            }

            document.getElementById("settingsMessage").textContent =
                data.msg || data.error || "✅ BOM fetched successfully!";
        });
    } else {
        console.warn("⚠️ fetchBom button NOT found on this page");
    }

    // Page-specific initializations
    if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
    }
    if (document.getElementById('registerForm')) {
        document.getElementById('registerForm').addEventListener('submit', handleRegister);
    }
    if (document.getElementById('logoutButton')) {
        document.getElementById('logoutButton').addEventListener('click', handleLogout);
    }

    // Dashboard-specific logic
    if (window.location.pathname.includes('dashboard') || window.location.pathname.split('/').length > 1) {
        await initializeDashboard();
    }
});


function parseURL() {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const params = {
        teamNumber: null,
        robotName: null,
        system: 'Main',
        admin: false
    };

    if (pathSegments.length >= 1) {
        params.teamNumber = pathSegments[0];
    }

    if (pathSegments.length >= 2) {
        if (pathSegments[1] === 'Admin') {
            params.admin = true;
            params.robotName = pathSegments[2] || null;
            params.system = pathSegments[3] || 'Main';
        } else {
            params.robotName = pathSegments[1];
        }
    }

    return params;
}

/**
 * Initializes the main dashboard view.
 * It checks for user authentication, role, and fetches the necessary robot and BOM data.
 * It also handles routing based on the URL structure.
 */
async function initializeDashboard() {
    const { teamNumber, robotName, system, admin } = parseURL();
    const currentPath = window.location.pathname;
    if (teamNumber && robotName && system) {
        loadPartsFromBackend(teamNumber, robotName, system);
    }
    // 🚫 Avoid running this logic on pages where robotName isn't valid
    const excludedPaths = ["/new_robot", "/register", "/login", "/machines"];
    if (excludedPaths.some(path => currentPath.includes(path))) return;

    if (!teamNumber || !robotName) return;

    // 🌟 Try to load robot data to see if it exists
    const response = await fetch(`${API_BASE_URL}api/robot_exists`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("jwt_token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot_name: robotName
        })
    });

    const data = await response.json();
    if (currentPath.includes('/Admin') || currentPath.includes('/machines')) return;

    if (!data.exists) {
        if (confirm(`Robot "${robotName}" doesn't exist for Team ${teamNumber}. Do you want to construct it now?`)) {
            window.location.href = `/${teamNumber}/new_robot`;
        } else {
            window.location.href = `/${teamNumber}`;
        }
    }
}


// --- Authentication and User Management ---

async function handleLogin(event) {
    event.preventDefault();
    const teamNum = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;
    const loginMessage = document.getElementById('loginMessage');
    if (!teamNum || !password) {
        loginMessage.textContent = "Please enter both team number and password.";
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNum, password: password})
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNum);
            localStorage.setItem('role', data.isAdmin ? 'Admin' : 'User');
            // Redirect based on role
            window.location.href = `${API_BASE_URL.replace('/api/', '')}${data.isAdmin ? `/${teamNum}/Admin` : `/${teamNum}`}`;
        } else {
            loginMessage.textContent = data.error || 'Login failed.';
        }
    } catch (error) {
        console.error('Login Error:', error);
        loginMessage.textContent = 'An error occurred during login.';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    // Simplified registration logic
    const teamNum = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const adminPassword = document.getElementById('registerAdminPassword').value;
    const registerMessage = document.getElementById('registerMessage');

    if (!isPasswordStrong(password) || !isPasswordStrong(adminPassword)) {
        registerMessage.textContent = 'Passwords must be at least 8 characters long and contain uppercase, lowercase, and a number.';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                team_number: teamNum,
                password: password,
                adminPassword: adminPassword
            })
        });
        const data = await response.json();
        if (response.ok) {
            registerMessage.textContent = 'Registration successful! Redirecting to login...';
            setTimeout(() => window.location.href = '/', 2000);
        } else {
            registerMessage.textContent = `Error: ${data.error}`;
        }
    } catch (error) {
        console.error('Registration Error:', error);
        registerMessage.textContent = 'Registration failed due to a server error.';
    }
}

function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
}


async function savePartQuantities(part) {
    const modal = document.getElementById('editModal');
    const teamNumber = localStorage.getItem('team_number');
    const robotName = localStorage.getItem('robot_name');
    const path = window.location.pathname.split('/').filter(Boolean);
    const isAdminPage = path[1] === 'Admin';
    const systemName = (isAdminPage ? path[3] : path[2]) || 'Main';

    const updates = {};
    const preProcessQtyEl = document.getElementById('preProcessQty');
    if (preProcessQtyEl) updates.preProcessQuantity = preProcessQtyEl.value;

    const process1QtyEl = document.getElementById('process1Qty');
    if (process1QtyEl) updates.process1Quantity = process1QtyEl.value;

    const process2QtyEl = document.getElementById('process2Qty');
    if (process2QtyEl) updates.process2Quantity = process2QtyEl.value;

    const payload = {
        team_number: teamNumber,
        robot: robotName,
        system: systemName,
        part_name: part["Part Name"],
        updates: updates
    };

    // Yellow when started locally
    highlightPartRow(part.partId, 'yellow');

    try {
        const response = await fetch(`${API_BASE_URL}api/update_part`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            // Green if update successful
            highlightPartRow(part.partId, 'green');
            socket.emit('qty_update', {
                team_number: teamNumber,
                robot_name: robotName,
                system_name: systemName,
                partId: part.partId,
                updates: updates
            });
            modal.style.display = 'none';
        } else {
            alert(`Error updating part: ${data.error}`);
            highlightPartRow(part.partId, 'red');
        }
    } catch (error) {
        console.error('Error saving part quantities:', error);
        alert('An error occurred while saving the part quantities.');
        highlightPartRow(part.partId, 'red');
    }
}

// Live update receiver
socket.on('qty_update', ({ partId, updates }) => {
    const part = window.bomData.find(p => p.partId === partId);
    if (part) {
        Object.assign(part, updates);
        highlightPartRow(partId, 'green');
        renderBOM(window.bomData);
    }
});

// Color highlight
function highlightPartRow(partId, color) {
    const row = document.querySelector(`[data-part-id="${partId}"]`);
    if (row) {
        row.style.backgroundColor = color;
        setTimeout(() => {
            row.style.backgroundColor = '';
        }, 1000);
    }
}
function applyFilter(name) {
    currentFilter = name;
    renderBOM();
}

function getCurrentProcessStatus(part, qty) {
    const donePre = parseInt(part.done_preprocess || 0);
    const doneP1 = parseInt(part.done_process1 || 0);
    const doneP2 = parseInt(part.done_process2 || 0);
    const pp = part["Pre Process"]?.trim();
    const p1 = part["Process 1"]?.trim();
    const p2 = part["Process 2"]?.trim();

    if (pp && donePre < qty) return pp;
    if (p1 && (!pp || donePre >= qty) && doneP1 < qty) return p1;
    if (p2 && (!p1 || doneP1 >= qty) && doneP2 < qty) return p2;
    return null;
}


function getStatusColor(part, qty) {
    const donePre = parseInt(part.done_preprocess || 0);
    const doneP1 = parseInt(part.done_process1 || 0);
    const doneP2 = parseInt(part.done_process2 || 0);
    const pp = part["Pre Process"]?.trim();
    const p1 = part["Process 1"]?.trim();
    const p2 = part["Process 2"]?.trim();

    if (pp || p1 || p2) {
        if ((p2 && doneP2 >= qty) || (!p2 && p1 && doneP1 >= qty) || (!p2 && !p1 && donePre >= qty)) {
            return "bg-green-100";
        } else if (donePre > 0 || doneP1 > 0 || doneP2 > 0) {
            return "bg-yellow-100";
        }
    }
    return "bg-white";
}
document.getElementById("materialDropdown")?.addEventListener("change", function () {
    const selectedMaterial = this.value;
    if (selectedMaterial) {
        downloadAllOfMaterial(selectedMaterial);
        this.value = ""; // Reset dropdown after download starts
    }
});

function populateMaterialDropdown() {
    const dropdown = document.getElementById("materialDropdown");
    dropdown.innerHTML = `<option value="">-- Select Material --</option>`;

    const shownParts = fullBOM.filter(part => {
        const p1 = part["Process 1"]?.trim();
        const p2 = part["Process 2"]?.trim();
        const clean = str => !str || str.trim().toUpperCase() === "N/A";

        const isCOTS = clean(part["Pre Process"]) && clean(p1) && clean(p2);
        const isInHouse = !isCOTS;

        if (!currentFilter) return true;
        if (currentFilter === "COTS") return isCOTS;
        if (currentFilter === "InHouse") return isInHouse;
        return [part["Pre Process"], p1, p2].includes(currentFilter);
    });

    const materials = new Set();
    shownParts.forEach(part => {
        const mat = part.materialBOM || part.Material || null;
        if (mat) materials.add(mat.trim());
    });

    [...materials].sort().forEach(mat => {
        const option = document.createElement("option");
        option.value = mat;
        option.textContent = mat;
        dropdown.appendChild(option);
    });
}

async function downloadAllOfMaterial(materialName) {
    if (!materialName) return;

    const shownParts = fullBOM.filter(part => {
        const p1 = part["Process 1"]?.trim();
        const p2 = part["Process 2"]?.trim();
        const isCOTS = !part["Pre Process"] && !p1 && !p2;
        const isInHouse = !isCOTS;

        if (!currentFilter) return true;
        if (currentFilter === "COTS") return isCOTS;
        if (currentFilter === "InHouse") return isInHouse;
        return [part["Pre Process"], p1, p2].includes(currentFilter);
    });

    const filtered = shownParts.filter(p => {
        const mat = p.materialBOM || p.Material || "";
        return mat.trim() === materialName.trim();
    });

    for (const part of filtered) {
        const partId = part.partId;
        const qty = parseInt(part.Quantity || 1);
        const name = part["Part Name"]?.trim().replace(/[^a-zA-Z0-9-_]/g, "_") || "Unnamed";
        const mat = materialName.replace(/[^a-zA-Z0-9-_]/g, "_");
        const curProcess = getCurrentProcessStatus(part, qty);
        const fileType = (machineMap[curProcess] || "STEP").toUpperCase();

        const filename = `${name}x${qty}-${mat}.${fileType.toLowerCase()}`;

        const res = await fetch("/api/download_cad", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                team_number: teamNumber,
                robot: robotName,
                system: systemName,
                id: partId,
                format: fileType
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || "Download failed");
            return;
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const sanitizedName = name.replace(/[<>:"/\\|?*\n\r]+/g, "_"); // Avoid illegal characters
        const fileName = `${sanitizedName} x${qty} - ${mat}.${fileType.toLowerCase()}`;

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

function updateProcessQty(partId, key, newQty) {
    const part = fullBOM.find(p => p.partId === partId);
    if (part) part[key] = newQty;
    fetch("/api/save_bom_for_robot_system", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot_name: robotName,
            system_name: systemName,
            bom_data: fullBOM
        })
    });
}

async function downloadPartCad(partId, fileType, partName = "Part", qty = 1, material = "Material") {
    if (!partId) return alert("Part ID missing");

    const res = await fetch("/api/download_cad", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot: robotName,
            system: systemName,
            id: partId,
            format: fileType
        })
    });

    if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Download failed");
        return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const sanitizedName = partName.replace(/[<>:"/\\|?*\n\r]+/g, "_"); // Avoid illegal characters
    const fileName = `${sanitizedName} x${qty} - ${material}.${fileType.toLowerCase()}`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}


function renderCard(part) {
    const partId = part.partId;
    const qty = parseInt(part.Quantity || 0);
    const curProcess = getCurrentProcessStatus(part, qty);
    const bg = getStatusColor(part, qty);
    const p1 = part["Process 1"]?.trim();
    const p2 = part["Process 2"]?.trim();

    const fileType = machineMap[curProcess] || "STEP";
    const name = part["Part Name"] || "Unnamed";
    const mat = part.materialBOM || part.Material || "N/A";
    const desc = part.Description || "N/A";
    const donePre = part.done_preprocess || 0;
    const doneP1 = part.done_process1 || 0;
    const doneP2 = part.done_process2 || 0;
    const avail = part.available_qty || 0;

    const clean = str => !str || str.trim().toUpperCase() === "N/A";
    const isCOTS = clean(part["Pre Process"]) && clean(p1) && clean(p2);
    const isInHouse = !isCOTS;

    return `
        <div class="rounded border shadow-md p-4 relative hover:shadow-lg transition ${bg}">
            <h3 class="text-lg font-bold text-blue-700">${name}</h3>
            <p><strong>Material:</strong> ${mat}</p>
            <p><strong>Description:</strong> ${desc}</p>
            <p><strong>Quantity Needed:</strong> ${qty}</p>
            ${isInHouse && curProcess ? `<p class="text-sm text-gray-600 italic">🔧 Current Process: ${curProcess}</p>` : ""}
            ${part["Pre Process"] ? `<label>✅ Done ${part["Pre Process"]}: <input type="number" value="${donePre}" onchange="updateProcessQty('${partId}', 'done_preprocess', this.value)" class="border px-2 py-1 rounded w-20" /></label><br/>` : ""}
            ${p1 ? `<label>✅ Done ${p1}: <input type="number" value="${doneP1}" onchange="updateProcessQty('${partId}', 'done_process1', this.value)" class="border px-2 py-1 rounded w-20" /></label><br/>` : ""}
            ${p2 ? `<label>✅ Done ${p2}: <input type="number" value="${doneP2}" onchange="updateProcessQty('${partId}', 'done_process2', this.value)" class="border px-2 py-1 rounded w-20" /></label><br/>` : ""}
            ${isCOTS ? `<label>📦 Qty In Stock: <input type="number" value="${avail}" onchange="updateProcessQty('${partId}', 'available_qty', this.value)" class="border px-2 py-1 rounded w-20" /></label>` : ""}
            <button title="Download CAD" class="absolute top-2 right-2 text-blue-600 hover:text-blue-900" <button onclick="downloadPartCad('${partId}', '${fileType}', '${name}', '${part.materialBOM}')">
                <i class="fas fa-download fa-lg"></i>
            </button>
            <button class="text-green-600 hover:text-green-900" onclick="loadPartViewer('${partId}')">
                <i class="fas fa-eye fa-lg"></i>
            </button>
        </div>
    `;
}

function renderBOM() {
    const grid = document.getElementById("bomPartsGrid");
    const noMsg = document.getElementById("noPartsMessage");
    grid.innerHTML = '';

    const shownParts = fullBOM
        .filter(part => {
            const p1 = part["Process 1"]?.trim();
            const p2 = part["Process 2"]?.trim();
            const isCOTS = !part["Pre Process"] && !p1 && !p2;
            const isInHouse = !isCOTS;

            if (!currentFilter) return true;
            if (currentFilter === "COTS") return isCOTS;
            if (currentFilter === "InHouse") return isInHouse;
            return [part["Pre Process"], p1, p2].includes(currentFilter);
        })
        .sort((a, b) => (a["Part Name"] || "").localeCompare(b["Part Name"] || ""));

    shownParts.forEach(part => {
        grid.innerHTML += renderCard(part);
    });

    noMsg.style.display = shownParts.length === 0 ? "block" : "none";
    populateMaterialDropdown();
}

async function loadAndRenderBOM() {
    const res = await fetch(`/api/get_bom?team_number=${teamNumber}&robot=${robotName}&system=${systemName}`, {
        headers: {Authorization: `Bearer ${token}`}
    });
    const data = await res.json();
    if (!res.ok || !data.bom_data) return;
    fullBOM = data.bom_data;
    renderBOM();
    populateMaterialDropdown();
}

// --- BOM Display and Filtering ---

function handleFilterBOM(filter) {
    localStorage.setItem('current_filter', filter);
    const bomDataString = localStorage.getItem('current_bom');
    if (!bomDataString) return;
    const bomData = JSON.parse(bomDataString);

    let filteredData = bomData.map(item => checkProcessProgress(item)); // Add progress info
    const normalizedFilter = filter.trim().toLowerCase();

    if (normalizedFilter !== 'all') {
        // Apply filter logic
        filteredData = filteredData.filter(item => {
            switch (normalizedFilter) {
                case 'cots':
                    return !item.preProcess && !item["Process 1"] && !item["Process 2"];
                case 'inhouse':
                    return item.preProcess || item["Process 1"] || item["Process 2"];
                case 'pre-process':
                    return item.preProcess && !item.preProcessCompleted;
                case 'process1':
                    return item["Process 1"] && item.preProcessCompleted && !item.process1Completed;
                case 'process2':
                    return item["Process 2"] && item.process1Completed && !item.process2Completed;
                default:
                    return false; // Or handle other specific filters
            }
        });
    }

    displayBOMAsButtons(filteredData);
}

function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    if (!bomData || bomData.length === 0) {
        gridContainer.innerHTML = '<p class="text-center text-gray-500 mt-4">No parts match the current filter.</p>';
        return;
    }
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(part => {
        const statusClass = getPartStatus(part);
        const button = document.createElement('div');
        button.className = `part-button ${statusClass}`;
        button.dataset.partName = part["Part Name"] || '';
        button.innerHTML = `
            <h3>${part["Part Name"]}</h3>
            <p><strong>Material:</strong> ${part.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${part.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${part.remaining ?? part.Quantity ?? 'N/A'}</p>
            <p><strong>Current Process:</strong> ${part.currentProcess || 'Completed'}</p>
        `;
        button.addEventListener('click', () => openEditModal(part));
        gridContainer.appendChild(button);
    });
}


// --- Modal and Part Editing ---

function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveButton = document.getElementById('saveButton');
    if (!modal || !modalBody || !saveButton) return;

    modalBody.innerHTML = ''; // Clear previous content

    if (part.preProcess && part.preProcess !== "Unknown") {
        modalBody.innerHTML += createQuantityCounterHTML('preProcess', `Pre-Process (${part.preProcess})`, part.preProcessQuantity || 0, part.Quantity);
    }
    if (part.Process1 && part.Process1 !== "Unknown") {
        modalBody.innerHTML += createQuantityCounterHTML('process1', `Process 1 (${part.Process1})`, part.process1Quantity || 0, part.Quantity);
    }
    if (part.Process2 && part.Process2 !== "Unknown") {
        modalBody.innerHTML += createQuantityCounterHTML('process2', `Process 2 (${part.Process2})`, part.process2Quantity || 0, part.Quantity);
    }

    attachCounterListeners();
    modal.style.display = 'flex';
    saveButton.onclick = () => savePartQuantities(part); // Re-bind save button
}

function createQuantityCounterHTML(id, label, value, max) {
    return `
        <div class="mb-4">
            <label for="${id}Qty" class="block mb-1">${label}:</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="${id}Qty">-</button>
                <input type="number" id="${id}Qty" value="${value}" min="0" max="${max}">
                <button class="increment" data-target="${id}Qty">+</button>
            </div>
        </div>
    `;
}

function attachCounterListeners() {
    document.querySelectorAll('.increment, .decrement').forEach(btn => {
        // Remove old listeners to prevent duplicates
        btn.replaceWith(btn.cloneNode(true));
    });

    document.querySelectorAll('.increment').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                let max = parseInt(target.max);
                let currentVal = parseInt(target.value);
                if (currentVal < max) target.value = currentVal + 1;
            }
        });
    });

    document.querySelectorAll('.decrement').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                let currentVal = parseInt(target.value);
                if (currentVal > 0) target.value = currentVal - 1;
            }
        });
    });
}


// --- Utility Functions ---

function getAuthToken() {
    return localStorage.getItem('jwt_token');
}

function isPasswordStrong(password) {
    return password && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function getPartStatus(part) {
    if (part.isCompleted) return 'completed';
    if (part.isNotStarted) return 'not-started';
    return 'in-progress';
}

function checkProcessProgress(item) {
    const qty = parseInt(item.Quantity, 10);
    if (isNaN(qty)) { // If quantity is not a number, can't determine progress
        return {...item, isCompleted: false, isNotStarted: true, currentProcess: "N/A", remaining: "N/A"};
    }

    const preProcessQty = parseInt(item.preProcessQuantity, 10) || 0;
    const process1Qty = parseInt(item.process1Quantity, 10) || 0;
    const process2Qty = parseInt(item.process2Quantity, 10) || 0;

    item.preProcessCompleted = !item.preProcess || item.preProcess === "Unknown" || preProcessQty >= qty;
    item.process1Completed = !item.Process1 || item.Process1 === "Unknown" || process1Qty >= qty;
    item.process2Completed = !item.Process2 || item.Process2 === "Unknown" || process2Qty >= qty;

    item.isNotStarted = preProcessQty === 0 && process1Qty === 0 && process2Qty === 0;
    item.isCompleted = item.preProcessCompleted && item.process1Completed && item.process2Completed;

    if (item.isCompleted) {
        item.currentProcess = "Completed";
        item.remaining = 0;
    } else if (!item.preProcessCompleted) {
        item.currentProcess = item.preProcess;
        item.remaining = qty - preProcessQty;
    } else if (!item.process1Completed) {
        item.currentProcess = item.Process1;
        item.remaining = qty - process1Qty;
    } else {
        item.currentProcess = item.Process2;
        item.remaining = qty - process2Qty;
    }
    return item;
}

document.getElementById("saveSystemSettings")?.addEventListener("click", async () => {
    const teamNumber = parseURL().teamNumber;
    const robotName = parseURL().robotName;
    const systemName = parseURL().system;

    const accessKey = document.getElementById("accessKey")?.value;
    const secretKey = document.getElementById("secretKey")?.value;
    const assemblyUrl = document.getElementById("assemblyUrl")?.value;
    const partStudioUrls = document.getElementById("partStudioUrls")?.value.split(",").map(x => x.trim());

    const res = await fetch(`${API_BASE_URL}api/system_settings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("jwt_token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot_name: robotName,
            system_name: systemName,
            access_key: accessKey,
            secret_key: secretKey,
            assembly_url: assemblyUrl,
            partstudio_urls: partStudioUrls
        })
    });

    const data = await res.json();
    document.getElementById("settingsMessage").textContent =
        data.msg || data.error || "✅ Settings saved!";
});

let allParts = [];

function renderParts(parts) {
    const container = document.getElementById("bomPartsGrid");
    const noParts = document.getElementById("noPartsMessage");

    container.innerHTML = "";

    if (!parts || parts.length === 0) {
        noParts.style.display = "block";
        return;
    }

    noParts.style.display = "none";

    parts.forEach(part => {
        const card = document.createElement("div");
        card.className = "bg-gray-800 p-4 rounded-lg shadow";

        card.innerHTML = `
            <h3 class="text-lg font-bold">${part["Part Name"] || "Unnamed"}</h3>
            <p class="text-sm text-gray-400">${part.Description || ""}</p>
            <p class="text-sm">Qty: <strong>${part.Quantity}</strong></p>
            <p class="text-sm">Process 1: ${part["Process 1"] || "-"}</p>
            <p class="text-sm">Pre-Process: ${part["Pre Process"] || "-"}</p>
        `;

        container.appendChild(card);
    });
}

// Called after fetching the BOM
function loadPartsFromBackend(teamNumber, robotName, systemName) {
    const token = localStorage.getItem("jwt_token");

    fetch(`${API_BASE_URL}api/robot_data?team_number=${teamNumber}&robot=${robotName}&system=${systemName}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
        .then(res => res.json())
        .then(data => {
            allParts = data.bom_data || [];
            renderParts(allParts);
            populateFilterDropdown();
        })
        .catch(err => {
            console.error("Error loading BOM data:", err);
        });
}

// Optional: dynamically populate the machine types dropdown
function populateFilterDropdown() {
    const filter = document.getElementById("machineFilter");
    const machines = new Set(["All"]);

    allParts.forEach(p => {
        if (p["Process 1"]) machines.add(p["Process 1"]);
        if (p["Process 2"]) machines.add(p["Process 2"]);
    });

    filter.innerHTML = "";
    machines.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        filter.appendChild(opt);
    });
}

// Filtering logic
document.getElementById("machineFilter").addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected === "All") {
        renderParts(allParts);
    } else {
        const filtered = allParts.filter(p =>
            p["Process 1"] === selected || p["Process 2"] === selected
        );
        renderParts(filtered);
    }
});

