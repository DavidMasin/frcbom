const API_BASE_URL = 'https://frcbom-production.up.railway.app/';  // Base URL for API requests

// Retrieve stored team number from localStorage (if any)
let teamNumber = localStorage.getItem('team_number');

/**
 * Parse the current URL path to extract team number, robot name, system, and admin flag.
 * Returns an object: { teamNumber, robotName, system, admin (boolean) }
 */
function parseURL() {
    const pathSegments = window.location.pathname.split('/').filter(seg => seg !== '');
    const params = { teamNumber: null, robotName: null, system: 'Main', admin: false };
    if (pathSegments.length >= 1) {
        params.teamNumber = pathSegments[0];
    }
    if (pathSegments.length >= 2) {
        if (pathSegments[1] === "Admin") {
            params.admin = true;
            // URL format: /<team_number>/Admin/<robot_name>/<system>
            params.robotName = pathSegments[2] || null;
            params.system = pathSegments[3] || 'Main';
        } else {
            // URL format: /<team_number>/<robot_name>/<system>
            params.robotName = pathSegments[1] || null;
            params.system = pathSegments[2] || 'Main';
        }
    }
    return params;
}
function getCurrentSystem() {
    const path = window.location.pathname.split('/').filter(Boolean);
    if (path[1] === 'Admin' && path.length >= 4) return path[3]; // /<team>/Admin/<robot>/<system>
    if (path.length >= 3) return path[2];                        // /<team>/<robot>/<system>
    return localStorage.getItem('system') || 'Main';
}

/**
 * Display a modal prompting the user for their password (used when accessing a dashboard via direct URL without a token).
 * Returns a Promise that resolves when login is successful, or rejects if login fails or is canceled.
 */
function showPasswordPrompt() {
    return new Promise((resolve, reject) => {
        // Create overlay and modal elements
        const overlay = document.createElement('div');
        overlay.id = 'passwordOverlay';
        overlay.className = 'modal';
        overlay.style.display = 'flex';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        const closeButton = document.createElement('span');
        closeButton.className = 'close';
        closeButton.innerHTML = '&times;';
        closeButton.onclick = () => {
            overlay.remove();
            document.body.style.filter = 'none';
            reject();  // user closed the prompt
        };

        const promptText = document.createElement('h2');
        promptText.textContent = 'Please enter your password to access the dashboard';

        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'passwordPromptInput';
        passwordInput.placeholder = 'Password';

        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit';
        submitButton.className = 'button-primary';

        // Handler for submitting password
        async function handlePasswordSubmit() {
            const password = document.getElementById('passwordPromptInput').value;
            const teamNum = localStorage.getItem('team_number');
            if (!password || !teamNum) {
                alert('Please enter your password');
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
                    // Save JWT token and role
                    localStorage.setItem('jwt_token', data.access_token);
                    localStorage.setItem('role', data.isAdmin ? 'Admin' : 'User');
                    // Clean up modal and return success
                    overlay.remove();
                    document.body.style.filter = 'none';
                    resolve();
                } else {
                    alert(data.error || 'Incorrect password');
                }
            } catch (error) {
                console.error('Login Error:', error);
                alert('An error occurred while logging in.');
            }
        }

        // Assemble modal content and show it
        modalContent.appendChild(closeButton);
        modalContent.appendChild(promptText);
        modalContent.appendChild(passwordInput);
        modalContent.appendChild(submitButton);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);
        document.body.style.filter = 'blur(5px)';  // blur background

        submitButton.addEventListener('click', handlePasswordSubmit);
        // Allow pressing Enter to submit
        passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handlePasswordSubmit(); });
    });
}

/**
 * Handle the login form submission. Sends login request to API and redirects based on role.
 */
async function handleLogin(event) {
    event.preventDefault();
    const teamNum = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;
    if (!teamNum || !password) {
        document.getElementById('loginMessage').textContent = "Please enter team number and password";
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
            // Store token and team info
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNum);
            // Determine role and redirect accordingly
            if (teamNum === "0000") {
                // Global admin (team 0000) -> general admin dashboard
                localStorage.setItem('role', 'Admin');
                window.location.href = '/admin_dashboard.html';
            } else if (data.isAdmin) {
                // Team admin -> team admin dashboard
                localStorage.setItem('role', 'Admin');
                window.location.href = `/${teamNum}/Admin`;
            } else {
                // Regular team user -> user dashboard
                localStorage.setItem('role', 'User');
                window.location.href = `/${teamNum}`;
            }
        } else {
            // Display error message on login form
            document.getElementById('loginMessage').textContent = data.error || 'Login failed.';
        }
    } catch (error) {
        console.error('Login Error:', error);
        document.getElementById('loginMessage').textContent = 'Login failed due to an error.';
    }
}
function handleLogout() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('team_number');
    localStorage.removeItem('robot_name');
    localStorage.removeItem('system');
    localStorage.removeItem('role');
    localStorage.removeItem('bom_data');
    localStorage.removeItem('current_filter');

    window.location.href = '/';  // Redirect to login
}

/**
 * Determine the current status of a part based on its process completion flags.
 * Returns a status string: 'not-started', 'in-progress', or 'completed'.
 */
function getPartStatus(part) {
    const notStarted = (!part.preProcessQuantity && !part.process1Quantity && !part.process2Quantity);
    const completed = (part.preProcessCompleted && part.process1Completed && part.process2Completed);
    if (notStarted) {
        return 'not-started';   // Red status
    } else if (completed) {
        return 'completed';     // Green status
    } else {
        return 'in-progress';   // Yellow status
    }
}


function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;
    if (requiredQuantity && !isNaN(requiredQuantity)) {
        const reqQty = parseInt(requiredQuantity);
        // Determine completion of each process stage based on quantities
        item.preProcessCompleted = item.preProcessQuantity ? (item.preProcessQuantity >= reqQty) : false;
        item.process1Completed = item.process1Quantity ? (item.process1Quantity >= reqQty) : false;
        item.process2Completed = item.process2Quantity ? (item.process2Quantity >= reqQty) : false;
    } else {
        // If total Quantity is not a number, mark all processes as not completed
        item.preProcessCompleted = false;
        item.process1Completed = false;
        item.process2Completed = false;
    }
    // Mark processes with no defined stage as completed (skip unused stages)
    if (!item.preProcess || item.preProcess === "Unknown") {
        item.preProcessCompleted = true;
    }
    if (!item.Process1 || item.Process1 === "Unknown") {
        item.process1Completed = true;
    }
    if (!item.Process2 || item.Process2 === "Unknown") {
        item.process2Completed = true;
    }
    // Determine the current process and quantity remaining
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
        currentProcess = null;  // All processes completed
        remaining = 0;
    }
    item.currentProcess = currentProcess;
    item.remaining = remaining;
    return item;
}

function handleFilterBOM(filter) {
    const robotName = localStorage.getItem('robot_name');
    let currentSystem = "Main";
    if (document.getElementById("systemSelect")) {
        currentSystem = document.getElementById("systemSelect").value;
    }
    const bomData = getBOMDataFromLocal(robotName, currentSystem) || [];
    bomData.forEach(item => checkProcessProgress(item));
    localStorage.setItem('current_filter', filter);
    const normalized = filter.trim().toLowerCase();
    let filteredData;
    switch (normalized) {
        case 'all':
            filteredData = bomData;
            break;
        case 'cots':
            // COTS parts: no custom processes defined (all process fields empty or "Unknown")
            filteredData = bomData.filter(item =>
                (!item.preProcess && !item.Process1 && !item.Process2) ||
                (item.preProcess === "Unknown" && item.Process1 === "Unknown" && item.Process2 === "Unknown")
            );
            break;
        case 'inhouse':
            // In-house parts: at least one process defined (not all Unknown)
            filteredData = bomData.filter(item =>
                (item.preProcess || item.Process1 || item.Process2) &&
                !(item.preProcess === "Unknown" && item.Process1 === "Unknown" && item.Process2 === "Unknown")
            );
            break;
        case 'pre-process':
            filteredData = bomData.filter(item =>
                item.preProcess && !item.preProcessCompleted
            );
            break;
        case 'process1':
            filteredData = bomData.filter(item =>
                item.Process1 && (!item.preProcess || item.preProcessCompleted) && !item.process1Completed
            );
            break;
        case 'process2':
            filteredData = bomData.filter(item =>
                item.Process2 && ((!item.Process1 && (!item.preProcess || item.preProcessCompleted)) || (item.Process1 && item.process1Completed)) && !item.process2Completed
            );
            break;
        default:
            // Filter by specific process/machine name (e.g., "CNC", "Lathe", etc.)
            filteredData = bomData.filter(item =>
                (item.preProcess && item.preProcess.toLowerCase() === normalized && !item.preProcessCompleted) ||
                (item.Process1 && item.Process1.toLowerCase() === normalized && (!item.preProcess || item.preProcessCompleted) && !item.process1Completed) ||
                (item.Process2 && item.Process2.toLowerCase() === normalized && ((!item.Process1 && (!item.preProcess || item.preProcessCompleted)) || (item.Process1 && item.process1Completed)) && !item.process2Completed)
            );
            break;
    }
    displayBOMAsButtons(filteredData);
}

async function downloadPartCAD(part) {
    const teamNum = localStorage.getItem('team_number');
    const robotName = localStorage.getItem('robot_name');
    let system = 'Main';
    if (document.getElementById('systemSelect')) {
        system = document.getElementById('systemSelect').value;
    }
    if (!teamNum || !part.ID) {
        alert("Missing team or part identification for CAD download.");
        return;
    }
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${API_BASE_URL}api/download_cad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ team_number: teamNum, robot: robotName, system: system, id: part.ID })
        });
        const data = await response.json();
        if (response.ok && data.redirect_url) {
            // Open the Parasolid file download in a new tab/window
            window.open(data.redirect_url, '_blank');
        } else {
            alert(data.error || 'CAD download failed.');
        }
    } catch (error) {
        console.error('Error downloading CAD:', error);
        alert('Error downloading CAD file.');
    }
}

function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveButton = document.getElementById('saveButton');
    if (!modal || !modalBody || !saveButton) return;
    // Populate modal inputs for each process
    modalBody.innerHTML = '';
    if (part.preProcess) {
        modalBody.innerHTML += `
            <label for="preProcessQty">Pre-Process (${part.preProcess}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="preProcessQty">-</button>
                <input type="number" id="preProcessQty" value="${part.preProcessQuantity || 0}" min="0">
                <button class="increment" data-target="preProcessQty">+</button>
            </div>
        `;
    }
    if (part.Process1) {
        modalBody.innerHTML += `
            <label for="process1Qty">Process 1 (${part.Process1}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="process1Qty">-</button>
                <input type="number" id="process1Qty" value="${part.process1Quantity || 0}" min="0">
                <button class="increment" data-target="process1Qty">+</button>
            </div>
        `;
    }
    if (part.Process2) {
        modalBody.innerHTML += `
            <label for="process2Qty">Process 2 (${part.Process2}):</label>
            <div class="quantity-counter">
                <button class="decrement" data-target="process2Qty">-</button>
                <input type="number" id="process2Qty" value="${part.process2Quantity || 0}" min="0">
                <button class="increment" data-target="process2Qty">+</button>
            </div>
        `;
    }
    attachCounterListeners();
    // Attach Download CAD button handler
    const downloadButton = document.getElementById('downloadCADButton');
    if (downloadButton) {
        downloadButton.onclick = () => downloadPartCAD(part);
    }
    // Show the modal
    modal.style.display = 'flex';
    // Save button updates the part quantities
    saveButton.onclick = () => savePartQuantities(part);
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
 * Show a message on the registration form.
 */
function showRegisterMessage(message, type) {
    const registerMessage = document.getElementById('registerMessage');
    registerMessage.textContent = message;
    registerMessage.className = `alert alert-${type} mt-3`;
    registerMessage.classList.remove('d-none');
}

// Handle registration form submission
async function handleRegister(event) {
    event.preventDefault();
    const teamNum = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const adminPassword = document.getElementById('registerAdminPassword').value;
    const adminPasswordConfirm = document.getElementById('registerAdminPasswordConfirm').value;

    // Basic validation of inputs
    if (password !== confirmPassword) {
        showRegisterMessage('User Passwords do not match.', 'danger');
        return;
    }
    if (adminPassword !== adminPasswordConfirm) {
        showRegisterMessage('Admin Passwords do not match.', 'danger');
        return;
    }
    if (!isPasswordStrong(password)) {
        showRegisterMessage('User Password is not strong enough. Please meet the requirements.', 'danger');
        return;
    }
    if (!isPasswordStrong(adminPassword)) {
        showRegisterMessage('Admin Password is not strong enough. Please meet the requirements.', 'danger');
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
            showRegisterMessage('Registration successful!', 'success');
            // Optionally, redirect to login or automatically log the user in
            // window.location.href = '/';
        } else {
            showRegisterMessage(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        console.error('Registration Error:', error);
        showRegisterMessage('Registration failed due to an error.', 'danger');
    }
}

/**
 * Initialize the dashboard page (user or team admin) after DOM is loaded.
 * Ensures the user is logged in (otherwise prompts for password), then loads robot list or BOM data.
 */
async function initializeDashboard() {
    const { teamNumber, robotName, system, admin } = parseURL();
    if (!teamNumber) {
        alert('Invalid team number in URL. Redirecting to home page.');
        window.location.href = '/';
        return;
    }
    // Check that the team exists (to catch any invalid URL with non-existent team)
    const exists = await checkTeamExists(teamNumber);
    if (!exists) {
        alert('Team does not exist. Redirecting to home page.');
        window.location.href = '/';
        return;
    }
    // Save the team number in local storage for later use
    localStorage.setItem('team_number', teamNumber);

    // Ensure we have a valid JWT token; if not, prompt for password
    let token = localStorage.getItem('jwt_token');
    if (!token) {
        try {
            await showPasswordPrompt();
            token = localStorage.getItem('jwt_token');
        } catch {
            alert('You must be logged in to access the dashboard.');
            window.location.href = '/';
            return;
        }
    }
    // If this is a team admin URL, ensure the logged-in role is Admin
    if (admin && localStorage.getItem('role') !== 'Admin') {
        alert('Admin access required for this page. Redirecting to user dashboard.');
        window.location.href = `/${teamNumber}`;
        return;
    }

    // Load the list of robots for this team and handle accordingly
    const robots = await getTeamRobots(teamNumber);
    if (!robotName) {
        // If no specific robot in URL, show robot selection or prompt to create one if none exist
        if (robots.length > 0) {
            showRobotSelectionDashboard(robots);
        } else {
            promptNewRobotCreation(teamNumber);
        }
    } else {
        // If a robot is specified in URL, verify it exists or offer to create it
        if (!robots.includes(robotName)) {
            const createRobot = confirm(`Robot "${robotName}" does not exist. Would you like to create it?`);
            if (createRobot) {
                await createNewRobot(teamNumber, robotName);
            } else {
                window.location.href = `/${teamNumber}`;
                return;
            }
        }
        // Set current robot and fetch its BOM data for the specified system
        localStorage.setItem('robot_name', robotName);
        document.getElementById('teamNumber').textContent = teamNumber;
        const currentSystem = getCurrentSystem();
        localStorage.setItem('system', currentSystem);
        await fetchBOMDataFromServer(robotName, currentSystem);
        // Apply the last used filter or default to 'All'
        const currentFilter = localStorage.getItem('current_filter') || 'All';
        handleFilterBOM(currentFilter);
    }

    // Attach logout button handler (if present)
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
}

/**
 * Show the robot selection interface (when a user logs in and has multiple robots or none specified).
 */
function showRobotSelectionDashboard(robots) {
    const selectionSection = document.getElementById('robotSelection');
    const robotListContainer = document.getElementById('robotList');
    robotListContainer.innerHTML = '';  // clear any existing entries
    if (!robots || robots.length === 0) {
        robotListContainer.innerHTML = 'No robots available. Please create a new robot.';
    } else {
        robots.forEach(robot => {
            const btn = document.createElement('button');
            btn.className = 'robot-button';
            btn.textContent = robot;
            btn.addEventListener('click', async () => {
                const teamNum = localStorage.getItem('team_number');
                const role = localStorage.getItem('role');
                // Redirect based on role
                if (role === 'Admin') {
                    window.location.href = `/${teamNum}/Admin/${robot}/Main`;
                } else {
                    window.location.href = `/${teamNum}/${robot}/Main`;
                }
                // Attempt to fetch BOM data for the robot's Main system (if this code executes before redirect)
                await fetchBOMDataFromServer(robot, "Main");
            });
            robotListContainer.appendChild(btn);
        });
    }
    selectionSection.style.display = 'block';
}

/**
 * Fetch the list of robots for a team from the server.
 * Returns an array of robot names.
 */
async function getTeamRobots(teamNum) {
    const token = localStorage.getItem('jwt_token');
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
 * Check if a team exists on the server (for validation).
 * Returns true if team exists, false otherwise.
 */
async function checkTeamExists(teamNum) {
    try {
        const response = await fetch(`${API_BASE_URL}api/team_exists?team_number=${teamNum}`);
        const data = await response.json();
        return response.ok ? data.exists : false;
    } catch (error) {
        console.error('Error checking team existence:', error);
        return false;
    }
}

/**
 * Prompt the user to enter a name for a new robot, then create it.
 */
function promptNewRobotCreation(teamNum) {
    const robotName = prompt('Please enter a name for your new robot:');
    if (!robotName) {
        alert('Robot name is required to proceed.');
    } else {
        createNewRobot(teamNum, robotName);
    }
}

/**
 * Create a new robot for the team by calling the API.
 * If the user is not logged in (no token), it will prompt for login first.
 */
async function createNewRobot(teamNum, robotName) {
    let token = localStorage.getItem('jwt_token');
    if (!token) {
        // Ensure user is logged in
        try {
            await showPasswordPrompt();
            token = localStorage.getItem('jwt_token');
            if (!token) throw new Error("Login failed");
        } catch {
            alert('Login is required to create a new robot.');
            return;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}api/new_robot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ team_number: teamNum, robot_name: robotName })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            // After creating, redirect to the new robot's dashboard
            if (localStorage.getItem('role') === 'Admin') {
                window.location.href = `/${teamNum}/Admin/${robotName}/Main`;
            } else {
                window.location.href = `/${teamNum}/${robotName}/Main`;
            }
        } else {
            alert(data.error || 'Failed to create robot.');
        }
    } catch (error) {
        console.error('Error creating robot:', error);
        alert('An error occurred while creating the robot.');
    }
}

/**
 * Rename a robot by calling the API.
 */
async function renameRobot(teamNum, oldName, newName) {
    const token = localStorage.getItem('jwt_token');
    try {
        const response = await fetch(`${API_BASE_URL}api/rename_robot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ team_number: teamNum, old_robot_name: oldName, new_robot_name: newName })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            window.location.reload();
        } else {
            alert(data.error || 'Failed to rename robot.');
        }
    } catch (error) {
        console.error('Error renaming robot:', error);
        alert('An error occurred while renaming the robot.');
    }
}

/**
 * Delete a robot by calling the API.
 */
async function deleteRobot(teamNum, robotName) {
    const token = localStorage.getItem('jwt_token');
    try {
        const response = await fetch(`${API_BASE_URL}api/delete_robot`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ team_number: teamNum, robot_name: robotName })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            window.location.reload();
        } else {
            alert(data.error || 'Failed to delete robot.');
        }
    } catch (error) {
        console.error('Error deleting robot:', error);
        alert('An error occurred while deleting the robot.');
    }
}

/**
 * Save updated part quantities from the edit modal and update the local BOM data and server.
 */
async function savePartQuantities(part) {
    // Get updated values from modal inputs (or use part's existing values if input not present)
    const updatedPreQty = document.getElementById('preProcessQty')?.value;
    const updatedProc1Qty = document.getElementById('process1Qty')?.value;
    const updatedProc2Qty = document.getElementById('process2Qty')?.value;
    part.preProcessQuantity = updatedPreQty !== undefined ? parseInt(updatedPreQty) || 0 : (part.preProcessQuantity || 0);
    part.process1Quantity = updatedProc1Qty !== undefined ? parseInt(updatedProc1Qty) || 0 : (part.process1Quantity || 0);
    part.process2Quantity = updatedProc2Qty !== undefined ? parseInt(updatedProc2Qty) || 0 : (part.process2Quantity || 0);

    const robotName = localStorage.getItem('robot_name');
    const teamNum = localStorage.getItem('team_number');
    if (!robotName || !teamNum) {
        console.error("Missing team or robot context for saving part quantities.");
        return;
    }
    // Update the part in local BOM data
    let currentSystem = "Main";
    if (document.getElementById("systemSelect")) {
        currentSystem = document.getElementById("systemSelect").value;
    }
    let bomData = getBOMDataFromLocal(robotName, currentSystem);
    const idx = bomData.findIndex(item => item["Part Name"] === part["Part Name"]);
    if (idx !== -1) {
        bomData[idx] = part;
    } else {
        console.error("Part not found in local BOM data:", part);
        return;
    }
    saveBOMDataToLocal(bomData, robotName, currentSystem);
    // Re-apply the current filter to refresh the display
    const currentFilter = localStorage.getItem('current_filter') || 'All';
    handleFilterBOM(currentFilter);
    closeModal();

    // Save the updated BOM data to the server
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${API_BASE_URL}api/save_bom_for_robot_system`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                team_number: teamNum,
                robot_name: robotName,
                system: currentSystem,
                bom_data: bomData
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("Error saving BOM data to server:", data.error);
            alert(`Failed to save BOM data: ${data.error}`);
        } else {
            console.log(data.message);
        }
    } catch (error) {
        console.error("Error saving BOM data to server:", error);
        alert('An error occurred while saving BOM data to the server.');
    }
}

/**
 * Close the part edit modal.
 */
function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

/**
 * Display BOM data as a grid of part buttons on the dashboard.
 */
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    // Sort parts alphabetically by part name for consistent ordering
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));
    bomData.forEach(part => {
        const statusClass = getPartStatus(part);
        // Create a part button element
        const button = document.createElement('div');
        button.classList.add('part-button', statusClass);
        button.dataset.partName = part["Part Name"] || '';
        // Ensure process progress is up-to-date
        const updatedPart = checkProcessProgress(part);
        // Set inner HTML for the part button
        button.innerHTML = `
            <h3>${updatedPart["Part Name"]}</h3>
            <p><strong>Material:</strong> ${updatedPart.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${updatedPart.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${updatedPart.remaining ?? updatedPart.Quantity ?? 'N/A'}</p>
            <p><strong>Current Process:</strong> ${updatedPart.currentProcess || 'Completed'}</p>
        `;
        // Clicking a part opens the edit modal
        button.addEventListener('click', () => openEditModal(updatedPart));
        gridContainer.appendChild(button);
    });
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


// Event Listeners and Initialization
document.addEventListener('DOMContentLoaded', () => {
    // If on a dashboard page, initialize it
    if (document.getElementById('dashboard')) {
        initializeDashboard();
    }
    const dropdown = document.getElementById("systemSelect");
    if (dropdown) {
        dropdown.value = getCurrentSystem();
    }
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", openSettingsModal);
    }
    // Attach event handlers for login and registration forms if present
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    // Link for switching to registration page
    document.getElementById('registerButton')?.addEventListener('click', () => {
        window.location.href = '/register';
    });
    // Link for going back to login
    document.getElementById('backToLogin')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    // Logout button for pages with one
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    // Display team number in header if applicable
    if (document.getElementById('teamNumber')) {
        document.getElementById('teamNumber').textContent = teamNumber || '';
    }
    // System dropdown change handler (navigates to selected system view)
    document.getElementById('systemSelect')?.addEventListener('change', (event) => {
        const selectedSystem = event.target.value;
        const teamNum = localStorage.getItem('team_number');
        const robot = localStorage.getItem('robot_name');
        const role = localStorage.getItem('role');
        if (teamNum && robot) {
            if (role === 'Admin') {
                window.location.href = `/${teamNum}/Admin/${robot}/${selectedSystem}`;
            } else {
                window.location.href = `/${teamNum}/${robot}/${selectedSystem}`;
            }
        }
    });
    // Filter buttons event listeners
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter') || 'All';
            handleFilterBOM(filter);
        });
    });
    // If on admin dashboard page, attach admin-specific event handlers
    if (document.getElementById('uploadBOMDataForm')) {
        // Upload BOM JSON file
        document.getElementById('uploadBOMDataForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = document.getElementById('bomDataFileInput').files[0];
            if (!file) { alert('Please select a file to upload.'); return; }
            try {
                const text = await file.text();
                const token = localStorage.getItem('jwt_token');
                const response = await fetch(`${API_BASE_URL}api/admin/upload_bom_dict`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ bom_data_dict: JSON.parse(text) })
                });
                const result = await response.json();
                if (response.ok) {
                    alert('BOM data uploaded successfully!');
                } else {
                    alert(`Error: ${result.error || 'Failed to upload BOM data.'}`);
                }
            } catch (error) {
                console.error('Error uploading BOM data:', error);
                alert('An error occurred while uploading the BOM data.');
            }
        });
    }
    if (document.getElementById('uploadSettingsDataForm')) {
        // Upload Settings JSON file
        document.getElementById('uploadSettingsDataForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = document.getElementById('settingsDataFileInput').files[0];
            if (!file) { alert('Please select a file to upload.'); return; }
            try {
                const text = await file.text();
                const token = localStorage.getItem('jwt_token');
                const response = await fetch(`${API_BASE_URL}api/admin/upload_settings_dict`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ settings_data_dict: JSON.parse(text) })
                });
                const result = await response.json();
                if (response.ok) {
                    alert('Settings data uploaded successfully!');
                } else {
                    alert(`Error: ${result.error || 'Failed to upload settings data.'}`);
                }
            } catch (error) {
                console.error('Error uploading settings data:', error);
                alert('An error occurred while uploading the settings data.');
            }
        });
    }
    if (document.getElementById('uploadTeamsDBForm')) {
        // Upload teams.db file (not supported in this refactor, will receive error)
        document.getElementById('uploadTeamsDBForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = document.getElementById('teamsDBFileInput').files[0];
            if (!file) { alert('Please select a file to upload.'); return; }
            try {
                const formData = new FormData();
                formData.append('file', file);
                const token = localStorage.getItem('jwt_token');
                const response = await fetch(`${API_BASE_URL}api/admin/upload_teams_db`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const result = await response.json();
                if (response.ok) {
                    alert('teams.db uploaded successfully!');
                } else {
                    alert(`Error: ${result.error || 'Failed to upload teams.db.'}`);
                }
            } catch (error) {
                console.error('Error uploading teams.db file:', error);
                alert('An error occurred while uploading the file.');
            }
        });
    }
    function initializeSettingsModal() {
        const settingsBtn = document.getElementById("settingsButton");
        const settingsModal = document.getElementById("settingsModal");
        if (!settingsBtn || !settingsModal) return;
        const closeBtn = settingsModal.querySelector(".close");

        // Open the Settings modal when Settings button is clicked
        settingsBtn.addEventListener("click", () => {
            settingsModal.style.display = "block";
        });
        // Close the modal when the close (X) button is clicked
        closeBtn?.addEventListener("click", () => {
            settingsModal.style.display = "none";
        });
        // Close the modal if clicking outside of its content
        window.addEventListener("click", event => {
            if (event.target === settingsModal) {
                settingsModal.style.display = "none";
            }
        });
    }
    initializeSettingsModal();
});

/**
 * Fetch BOM data from the server for a given robot and system, then save to local storage and display.
 */
async function fetchBOMDataFromServer(robotName, system = 'Main') {
    const teamNum = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');
    if (!teamNum || !robotName) return;
    try {
        const response = await fetch(`${API_BASE_URL}api/get_bom?team_number=${teamNum}&robot=${robotName}&system=${system}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data, robotName, system);
            // displayBOMAsButtons(data.bom_data);
        } else {
            console.error(`Failed to retrieve BOM for ${robotName}/${system}:`, data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error(`Fetch BOM Data Error for ${robotName}/${system}:`, error);
    }
}

/**
 * Save BOM data for a given robot and system into localStorage (under key 'bom_data').
 */
function saveBOMDataToLocal(bomData, robotName, system) {
    const teamNum = localStorage.getItem('team_number');
    if (!teamNum || !robotName) return;
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    if (!bomDict[teamNum]) bomDict[teamNum] = {};
    if (!bomDict[teamNum][robotName]) bomDict[teamNum][robotName] = {};
    bomDict[teamNum][robotName][system] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
}

/**
 * Retrieve BOM data from localStorage for a given robot and system.
 * Returns an array of BOM items (or an empty array if none found).
 */
function getBOMDataFromLocal(robotName, system) {
    const teamNum = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNum]?.[robotName]?.[system] || [];
}

// --- Fetch BOM functionality ---
const fetchButton = document.getElementById('fetchBOMButton');
if (fetchButton) {
    fetchButton.addEventListener('click', async () => {
        // Collect input values from the Settings modal
        const documentUrl = document.getElementById('onshapeDocumentUrl').value.trim();
        const accessKey   = document.getElementById('accessKey').value.trim();
        const secretKey   = document.getElementById('secretKey').value.trim();
        const system      = document.getElementById('systemSelect').value;
        const teamNumber  = localStorage.getItem('team_number');   // assuming team number was stored on login
        const robotName   = localStorage.getItem('robot_name');    // assuming robot name is stored when selected

        if (!documentUrl || !teamNumber) {
            alert('Please enter the Onshape Document URL (and ensure a team is selected).');
            return;
        }

        try {
            // Send a request to the server to fetch the BOM from Onshape
            const response = await fetch(`${API_BASE_URL}api/bom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_url: documentUrl,
                    team_number: teamNumber,
                    robot: robotName,
                    system: system,
                    access_key: accessKey,
                    secret_key: secretKey
                })
            });

            const data = await response.json();
            if (response.ok) {
                // Successfully got BOM data back from server:
                saveBOMDataToLocal(data.bom_data, robotName, system);  // save data to local storage or state
                localStorage.setItem('current_filter', 'All');
                handleFilterBOM('All');
                settingsModal.style.display = 'none';                  // (optional) close the modal after fetching
            } else {
                console.error('Error fetching BOM:', data.error);
                alert(`Error fetching BOM: ${data.error}`);
            }
        } catch (error) {
            console.error('Fetch BOM request failed:', error);
            alert('An error occurred while fetching the BOM data.');
        }
    });
}

