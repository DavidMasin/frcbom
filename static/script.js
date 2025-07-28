const API_BASE_URL = '/'; // Use relative path for API requests

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

            const res = await fetch(`${API_BASE_URL}api/bom`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    team_number: teamNumber,
                    robot: robotName,
                    system: systemName,
                    access_key: document.getElementById("accessKey")?.value,
                    secret_key: document.getElementById("secretKey")?.value,
                    document_url: document.getElementById("documentUrl")?.value
                })
            });

            const data = await res.json();
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

    // 🚫 Avoid running this logic on pages where robotName isn't valid
    const excludedPaths = ["/new_robot", "/register", "/login"];
    if (excludedPaths.some(path => currentPath.includes(path))) return;

    if (!teamNumber || !robotName) return;

    // 🌟 Try to load robot data to see if it exists
    const response = await fetch(`${API_BASE_URL}api/robot_exists`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot_name: robotName
        })
    });

    const data = await response.json();

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
            window.location.href = data.isAdmin ? `/${teamNum}/Admin` : `/${teamNum}`;
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




async function setupBOMView(robotName, systemName) {
    const bomData = await fetchBOMDataFromServer(robotName, systemName);
    if (bomData) {
        localStorage.setItem('current_bom', JSON.stringify(bomData));
        const currentFilter = localStorage.getItem('current_filter') || 'All';
        handleFilterBOM(currentFilter);
    }
}


async function fetchBOMDataFromServer(robotName, system = 'Main') {
    const teamNum = localStorage.getItem('team_number');
    const token = getAuthToken();
    if (!teamNum || !robotName) return null;
    try {
        const response = await fetch(`${API_BASE_URL}api/get_bom?team_number=${teamNum}&robot=${robotName}&system=${system}`, {
            headers: {'Authorization': `Bearer ${token}`}
        });
        const data = await response.json();
        if (response.ok) {
            return data.bom_data;
        }
        console.error(`Failed to get BOM for ${robotName}/${system}:`, data.error);
        return null;
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
        return null;
    }
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
            alert('Part updated successfully!');
            modal.style.display = 'none';
            // Refresh BOM view
            await setupBOMView(robotName, systemName);
        } else {
            alert(`Error updating part: ${data.error}`);
        }
    } catch (error) {
        console.error('Error saving part quantities:', error);
        alert('An error occurred while saving the part quantities.');
    }
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

    const accessKey = document.getElementById("accessKey").value;
    const secretKey = document.getElementById("secretKey").value;
    const assemblyUrl = document.getElementById("assemblyUrl").value;
    const partStudioUrls = document.getElementById("partStudioUrls").value.split(",").map(x => x.trim());

    const res = await fetch(`${API_BASE_URL}api/system_settings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
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
    document.getElementById("settingsMessage").textContent = data.msg || "Saved!";
});

document.getElementById("saveSystemSettings")?.addEventListener("click", async () => {
    const teamNumber = parseURL().teamNumber;
    const robotName = parseURL().robotName;
    const systemName = parseURL().system;

    const accessKey = document.getElementById("accessKey").value;
    const secretKey = document.getElementById("secretKey").value;
    const assemblyUrl = document.getElementById("assemblyUrl").value;
    const partStudioUrls = document.getElementById("partStudioUrls").value.split(",").map(x => x.trim());

    const res = await fetch(`${API_BASE_URL}api/system_settings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
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
    document.getElementById("settingsMessage").textContent = data.msg || "Saved!";
});

document.getElementById("fetchBom")?.addEventListener("click", async () => {
    const teamNumber = parseURL().teamNumber;
    const robotName = parseURL().robotName;
    const systemName = parseURL().system;

    const res = await fetch(`${API_BASE_URL}api/fetch_bom`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            team_number: teamNumber,
            robot_name: robotName,
            system_name: systemName
        })
    });

    const data = await res.json();
    document.getElementById("settingsMessage").textContent =
        data.msg || data.error || "✅ BOM fetched successfully!";
});
