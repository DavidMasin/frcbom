const API_BASE_URL = '/'; // Use relative path for API requests

document.addEventListener('DOMContentLoaded', async () => {
    const teamNumber = localStorage.getItem('team_number');
    const role = localStorage.getItem('role');
    const path = window.location.pathname.split('/').filter(Boolean);
    const admin = path[1] === 'Admin';
    const robotName = admin ? path[2] : path[1];
    const systemName = (admin ? path[3] : path[2]) || 'Main';

    if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
    }
    if (document.getElementById('registerForm')) {
        document.getElementById('registerForm').addEventListener('submit', handleRegister);
    }
    if (document.getElementById('logoutButton')) {
        document.getElementById('logoutButton').addEventListener('click', handleLogout);
    }

    if (window.location.pathname.includes('dashboard') || admin) {
        if (!teamNumber) return;
        if (admin && role !== 'Admin') {
            alert('Admin access required for this page. Redirecting to user dashboard.');
            window.location.href = `/${teamNumber}`;
            return;
        }

        const robots = await getTeamRobots(teamNumber);
        if (!robotName) {
            if (robots.length > 0) {
                showRobotSelectionDashboard(robots);
            } else {
                promptNewRobotCreation(teamNumber);
            }
        } else {
            if (!robots.includes(robotName)) {
                const createRobot = confirm(`Robot "${robotName}" does not exist. Create it?`);
                if (createRobot) {
                    await createNewRobot(teamNumber, robotName);
                } else {
                    window.location.href = `/${teamNumber}`;
                    return;
                }
            }
            localStorage.setItem('robot_name', robotName);
            const el = document.getElementById('teamNumber');
            if (el) el.textContent = teamNumber;
            const currentSystem = document.getElementById("systemSelect") ? document.getElementById("systemSelect").value : 'Main';
            localStorage.setItem('system', currentSystem);
            await fetchBOMDataFromServer(robotName, currentSystem);
            const currentFilter = localStorage.getItem('current_filter') || 'All';
            handleFilterBOM(currentFilter);
        }
    }

    // Event listeners for dashboard controls
    if (document.getElementById('dashboard')) {
        initializeDashboard();
    }
    const dropdown = document.getElementById("systemSelect");
    if (dropdown) {
        dropdown.value = systemName;
        dropdown.addEventListener('change', (event) => {
            const selectedSystem = event.target.value;
            if (teamNumber && robotName) {
                if (role === 'Admin') {
                    window.location.href = `/${teamNumber}/Admin/${robotName}/${selectedSystem}`;
                } else {
                    window.location.href = `/${teamNumber}/${robotName}/${selectedSystem}`;
                }
            }
        });
    }

    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter') || 'All';
            handleFilterBOM(filter);
        });
    });

    document.querySelectorAll('.delete-button[data-robot-name]').forEach(button => {
        button.addEventListener('click', async () => {
            const robotNameToDelete = button.getAttribute('data-robot-name');
            if (!robotNameToDelete) return;
            if (!confirm(`Delete robot "${robotNameToDelete}" and all its data?`)) {
                return;
            }
            try {
                const token = getAuthToken();
                const response = await fetch(`${API_BASE_URL}api/delete_robot`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        team_number: teamNumber,
                        robot_name: robotNameToDelete
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message || `Robot "${robotNameToDelete}" deleted.`);
                    window.location.reload();
                } else {
                    alert(data.error || 'Failed to delete robot.');
                }
            } catch (error) {
                console.error('Error deleting robot:', error);
                alert('An error occurred while deleting the robot.');
            }
        });
    });
});


/**
 * Handle the login form submission. Sends login request to API and redirects based on role.
 */
async function handleLogin(event) {
    event.preventDefault();
    const teamNum = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;
    const loginMessage = document.getElementById('loginMessage');
    if (!teamNum || !password) {
        loginMessage.textContent = "Please enter team number and password";
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNum, password: password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNum);
            localStorage.setItem('role', data.isAdmin ? 'Admin' : 'User');

            if (teamNum === "0000") {
                window.location.href = '/admin_dashboard.html';
            } else if (data.isAdmin) {
                window.location.href = `/${teamNum}/Admin`;
            } else {
                window.location.href = `/${teamNum}`;
            }
        } else {
            loginMessage.textContent = data.error || 'Login failed.';
        }
    } catch (error) {
        console.error('Login Error:', error);
        loginMessage.textContent = 'Login failed due to an error.';
    }
}

/**
 * Handle user logout.
 */
function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
}
/**
 * Handle the registration form submission.
 */
async function handleRegister(event) {
    event.preventDefault();
    const teamNum = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;
    const adminPassword = document.getElementById('registerAdminPassword').value;
    const adminPasswordConfirm = document.getElementById('registerAdminPasswordConfirm').value;
    const registerMessage = document.getElementById('registerMessage');

    if (password !== confirmPassword) {
        registerMessage.textContent = 'User Passwords do not match.';
        return;
    }
    if (adminPassword !== adminPasswordConfirm) {
        registerMessage.textContent = 'Admin Passwords do not match.';
        return;
    }
    if (!isPasswordStrong(password)) {
        registerMessage.textContent = 'User Password is not strong enough. Please meet the requirements.';
        return;
    }
    if (!isPasswordStrong(adminPassword)) {
        registerMessage.textContent = 'Admin Password is not strong enough. Please meet the requirements.';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNum, password: password, adminPassword: adminPassword })
        });
        const data = await response.json();
        if (response.ok) {
            registerMessage.textContent = 'Registration successful!';
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            registerMessage.textContent = `Error: ${data.error}`;
        }
    } catch (error) {
        console.error('Registration Error:', error);
        registerMessage.textContent = 'Registration failed due to an error.';
    }
}


/**
 * Fetch the list of robots for a team
 */
async function getTeamRobots(teamNum) {
    const token = getAuthToken();
    try {
        const response = await fetch(`${API_BASE_URL}api/get_robots?team_number=${teamNum}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        return response.ok ? data.robots : [];
    } catch (error) {
        console.error('Error getting robots:', error);
        return [];
    }
}

/**
 * Fetch BOM data from server and update currentBOM
 */
async function fetchBOMDataFromServer(robotName, system = 'Main') {
    const teamNum = localStorage.getItem('team_number');
    const token = getAuthToken();
    if (!teamNum || !robotName) return;
    try {
        const response = await fetch(`${API_BASE_URL}api/get_bom?team_number=${teamNum}&robot=${robotName}&system=${system}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            return data.bom_data;
        } else {
            console.error(`Failed to retrieve BOM for ${robotName}/${system}:`, data.error);
            alert(`Error: ${data.error}`);
            return [];
        }
    } catch (error) {
        console.error(`Fetch BOM Data Error for ${robotName}/${system}:`, error);
        return [];
    }
}


/**
 * Filter and display BOM parts based on filter criteria
 */
function handleFilterBOM(filter) {
    const robotName = localStorage.getItem('robot_name');
    const path = window.location.pathname.split('/').filter(Boolean);
    const admin = path[1] === 'Admin';
    const currentSystem = (admin ? path[3] : path[2]) || 'Main';

    fetchBOMDataFromServer(robotName, currentSystem).then(bomData => {
        if (bomData) {
            bomData.forEach(item => checkProcessProgress(item));
            localStorage.setItem('current_filter', filter);
            const normalized = filter.trim().toLowerCase();
            let filteredData;
            switch (normalized) {
                case 'all':
                    filteredData = bomData;
                    break;
                case 'cots':
                    filteredData = bomData.filter(item =>
                        (!item.preProcess && !item["Process 1"] && !item["Process 2"]) ||
                        (item.preProcess === "Unknown" && item["Process 1"] === "Unknown" && item["Process 2"] === "Unknown")
                    );
                    break;
                case 'inhouse':
                    filteredData = bomData.filter(item =>
                        (item.preProcess || item["Process 1"] || item["Process 2"]) &&
                        !(item.preProcess === "Unknown" && item["Process 1"] === "Unknown" && item["Process 2"] === "Unknown")
                    );
                    break;
                case 'pre-process':
                    filteredData = bomData.filter(item => item.preProcess && !item.preProcessCompleted);
                    break;
                case 'process1':
                    filteredData = bomData.filter(item =>
                        item["Process 1"] && (!item.preProcess || item.preProcessCompleted) && !item.process1Completed
                    );
                    break;
                case 'process2':
                    filteredData = bomData.filter(item =>
                        item["Process 2"] && ((!item["Process 1"] && (!item.preProcess || item.preProcessCompleted)) ||
                            (item["Process 1"] && item.process1Completed)) && !item.process2Completed
                    );
                    break;
                default:
                    filteredData = bomData.filter(item =>
                        (item.preProcess && item.preProcess.toLowerCase() === normalized && !item.preProcessCompleted) ||
                        (item["Process 1"] && item["Process 1"].toLowerCase() === normalized && (!item.preProcess || item.preProcessCompleted) && !item.process1Completed) ||
                        (item["Process 2"] && item["Process 2"].toLowerCase() === normalized && ((!item["Process 1"] && (!item.preProcess || item.preProcessCompleted)) || (item["Process 1"] && item.process1Completed)) && !item.process2Completed)
                    );
                    break;
            }
            displayBOMAsButtons(filteredData);
        }
    });
}


/**
 * Display BOM data as a grid of part buttons on the dashboard.
 */
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    if (bomData.length === 0) {
        gridContainer.innerHTML = '<p class="text-center text-gray-500 mt-4">No parts to display.</p>';
        return;
    }
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));
    bomData.forEach(part => {
        const statusClass = getPartStatus(part);
        const button = document.createElement('div');
        button.classList.add('part-button', statusClass);
        button.dataset.partName = part["Part Name"] || '';
        const updatedPart = checkProcessProgress(part);
        button.innerHTML = `
            <h3>${updatedPart["Part Name"]}</h3>
            <p><strong>Material:</strong> ${updatedPart.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${updatedPart.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${updatedPart.remaining ?? updatedPart.Quantity ?? 'N/A'}</p>
            <p><strong>Current Process:</strong> ${updatedPart.currentProcess || 'Completed'}</p>
        `;
        button.addEventListener('click', () => openEditModal(updatedPart));
        gridContainer.appendChild(button);
    });
}


function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveButton = document.getElementById('saveButton');
    if (!modal || !modalBody || !saveButton) return;
    modalBody.innerHTML = '';
    if (part.preProcess) {
        modalBody.innerHTML += `
            <label for="preProcessQty">Pre-Process (${part.preProcess}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="preProcessQty">-</button>
                <input type="number" id="preProcessQty" value="${part.preProcessQuantity || 0}" min="0" max="${part.Quantity || 0}">
                <button class="increment" data-target="preProcessQty">+</button>
            </div>
        `;
    }
    if (part.Process1) {
        modalBody.innerHTML += `
            <label for="process1Qty">Process 1 (${part.Process1}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="process1Qty">-</button>
                <input type="number" id="process1Qty" value="${part.process1Quantity || 0}" min="0" max="${part.preProcessQuantity || part.Quantity || 0}">
                <button class="increment" data-target="process1Qty">+</button>
            </div>
        `;
    }
    if (part.Process2) {
        modalBody.innerHTML += `
            <label for="process2Qty">Process 2 (${part.Process2}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="process2Qty">-</button>
                <input type="number" id="process2Qty" value="${part.process2Quantity || 0}" min="0" max="${part.process1Quantity || part.Quantity || 0}">
                <button class="increment" data-target="process2Qty">+</button>
            </div>
        `;
    }
    attachCounterListeners();
    const downloadButton = document.getElementById('downloadCADButton');
    if (downloadButton) {
        downloadButton.onclick = () => downloadPartCAD(part);
    }
    modal.style.display = 'flex';
    saveButton.onclick = () => savePartQuantities(part);
}


function downloadPartCAD(part) {
    const path = window.location.pathname.split('/').filter(Boolean);
    const admin = path[1] === 'Admin';
    const systemName = (admin ? path[3] : path[2]) || 'Main';
    const payload = {
        team_number: localStorage.getItem("team_number"),
        robot: localStorage.getItem("robot_name"),
        system: systemName,
        id: part.ID
    };

    const jwt = getAuthToken();

    if (!jwt) {
        alert("You must be logged in to download CAD.");
        return;
    }

    fetch(`${API_BASE_URL}api/download_cad`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`
        },
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            if (data.redirect_url) {
                window.location.href = data.redirect_url;
            } else if (data.error) {
                alert("Export failed: " + data.error);
            }
        })
        .catch(err => {
            console.error("Error during CAD download:", err);
            alert("An error occurred during CAD export.");
        });
}
/**
 * Utility to get auth token
 */
function getAuthToken() {
    return localStorage.getItem('jwt_token');
}

/**
 * Validate password strength (minimum length and containing uppercase, lowercase, and number).
 */
function isPasswordStrong(password) {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return password.length >= minLength && hasUpper && hasLower && hasNumber;
}


/**
 * Determine the current status of a part based on its process completion flags.
 */
function getPartStatus(part) {
    const notStarted = (!part.preProcessQuantity && !part.process1Quantity && !part.process2Quantity);
    const completed = (part.preProcessCompleted && part.process1Completed && part.process2Completed);
    if (notStarted) {
        return 'not-started';
    } else if (completed) {
        return 'completed';
    } else {
        return 'in-progress';
    }
}


function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;
    if (requiredQuantity && !isNaN(requiredQuantity)) {
        const reqQty = parseInt(requiredQuantity);
        item.preProcessCompleted = item.preProcessQuantity ? (item.preProcessQuantity >= reqQty) : false;
        item.process1Completed = item.process1Quantity ? (item.process1Quantity >= reqQty) : false;
        item.process2Completed = item.process2Quantity ? (item.process2Quantity >= reqQty) : false;
    } else {
        item.preProcessCompleted = false;
        item.process1Completed = false;
        item.process2Completed = false;
    }
    if (!item.preProcess || item.preProcess === "Unknown") {
        item.preProcessCompleted = true;
    }
    if (!item.Process1 || item.Process1 === "Unknown") {
        item.process1Completed = true;
    }
    if (!item.Process2 || item.Process2 === "Unknown") {
        item.process2Completed = true;
    }
    let remaining = item.Quantity;
    let currentProcess = null;
    if (!item.preProcessCompleted && item.preProcess) {
        currentProcess = item.preProcess;
        remaining = item.preProcessQuantity ? (item.Quantity - item.preProcessQuantity) : item.Quantity;
    } else if (!item.process1Completed && item.Process1) {
        currentProcess = item.Process1;
        remaining = item.process1Quantity ? (item.Quantity - item.process1Quantity) : item.Quantity;
    } else if (!item.process2Completed && item.Process2) {
        currentProcess = item.Process2;
        remaining = item.process2Quantity ? (item.Quantity - item.process2Quantity) : item.Quantity;
    } else {
        currentProcess = null;
        remaining = 0;
    }
    item.currentProcess = currentProcess;
    item.remaining = remaining;
    return item;
}

/**
 * Attach click handlers to increment/decrement buttons in the edit modal (to adjust quantities).
 */
function attachCounterListeners() {
    document.querySelectorAll('.increment').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.getAttribute('data-target'));
            if (target) target.value = parseInt(target.value || "0") + 1;
        });
    });
    document.querySelectorAll('.decrement').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.getAttribute('data-target'));
            if (target) {
                target.value = Math.max(0, parseInt(target.value || "0") - 1);
            }
        });
    });
}