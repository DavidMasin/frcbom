/**
 * Refactored script.js - Maintains all original functionality with improved organization and readability.
 *
 * Sections:
 * 1. Constants and Utility Functions
 * 2. Authentication & Authorization
 * 3. Dashboard Initialization & Navigation
 * 4. BOM Data Management & Display
 * 5. Modal Handling
 * 6. Admin Utilities (Upload/Download)
 * 7. Event Listeners (DOMContentLoaded)
 */

// ==================== 1. Constants and Utility Functions ====================

// Base API URL for all server requests
const API_BASE_URL = 'https://frcbom-production.up.railway.app/';

// Convenience getters for frequently used localStorage values
function getTeamNumber()  { return localStorage.getItem('team_number'); }
function getRobotName()   { return localStorage.getItem('robot_name'); }
function getAuthToken()   { return localStorage.getItem('jwt_token'); }
function getUserRole()    { return localStorage.getItem('role'); }
function isUserAdmin()    { return getUserRole() === 'Admin'; }

// Get currently selected system from dropdown (defaults to "Main" if none or not present)
function getSelectedSystem() {
    const selectElem = document.getElementById('systemSelect');
    return selectElem ? selectElem.value : 'Main';
}

// ==================== 2. Authentication & Authorization ====================

/**
 * Display a modal prompting the user for their password (for direct URL access without token).
 * Returns a Promise that resolves when login is successful or rejects if canceled/failed.
 */
function showPasswordPrompt() {
    return new Promise((resolve, reject) => {
        // Create overlay and modal structure
        const overlay = document.createElement('div');
        overlay.id = 'passwordOverlay';
        overlay.className = 'modal';
        overlay.style.display = 'flex';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => {
            // Cancel login prompt
            overlay.remove();
            document.body.style.filter = 'none';
            reject();
        };

        const promptText = document.createElement('h2');
        promptText.textContent = 'Please enter your password to access the dashboard';

        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'passwordPromptInput';
        passwordInput.placeholder = 'Password';

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Submit';
        submitBtn.className = 'button-primary';

        // Handle password submission within prompt
        async function handlePromptSubmit() {
            const enteredPassword = document.getElementById('passwordPromptInput').value;
            const teamNum = getTeamNumber();
            if (!enteredPassword || !teamNum) {
                alert('Please enter your password');
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ team_number: teamNum, password: enteredPassword })
                });
                const data = await response.json();
                if (response.ok) {
                    // Save JWT token and role in localStorage
                    localStorage.setItem('jwt_token', data.access_token);
                    localStorage.setItem('role', data.isAdmin ? 'Admin' : 'User');
                    // Clean up prompt modal and resolve Promise
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

        // Assemble modal content
        modalContent.appendChild(closeBtn);
        modalContent.appendChild(promptText);
        modalContent.appendChild(passwordInput);
        modalContent.appendChild(submitBtn);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);
        // Blur background behind the modal
        document.body.style.filter = 'blur(5px)';

        // Event bindings for prompt
        submitBtn.addEventListener('click', handlePromptSubmit);
        passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handlePromptSubmit(); });
    });
}

/**
 * Send login request to API and redirect user based on role. Called on login form submission.
 */
async function handleLogin(event) {
    event.preventDefault();
    const teamNumInput = document.getElementById('loginTeamNumber').value;
    const passwordInput = document.getElementById('loginPassword').value;
    const messageElem = document.getElementById('loginMessage');
    if (!teamNumInput || !passwordInput) {
        if (messageElem) messageElem.textContent = "Please enter team number and password";
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumInput, password: passwordInput })
        });
        const data = await response.json();
        if (response.ok) {
            // Login successful: store token, team, and role
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNumInput);
            if (teamNumInput === "0000") {
                // Global admin (team 0000)
                localStorage.setItem('role', 'Admin');
                window.location.href = '/admin_dashboard.html';
            } else if (data.isAdmin) {
                // Team admin user
                localStorage.setItem('role', 'Admin');
                window.location.href = `/${teamNumInput}/Admin`;
            } else {
                // Regular team user
                localStorage.setItem('role', 'User');
                window.location.href = `/${teamNumInput}`;
            }
        } else {
            // Display error from server (if any)
            if (messageElem) messageElem.textContent = data.error || 'Login failed.';
        }
    } catch (error) {
        console.error('Login Error:', error);
        if (messageElem) messageElem.textContent = 'Login failed due to an error.';
    }
}

/**
 * Validate password strength: at least 8 chars, contains uppercase, lowercase, and number.
 */
function isPasswordStrong(password) {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return password.length >= minLength && hasUpper && hasLower && hasNumber;
}

/**
 * Show a feedback message on the registration form (e.g., success or error).
 */
function showRegisterMessage(message, type) {
    const msgElem = document.getElementById('registerMessage');
    if (!msgElem) return;
    msgElem.textContent = message;
    msgElem.className = `alert alert-${type} mt-3`;
    msgElem.classList.remove('d-none');
}

/**
 * Handle registration form submission: validate inputs and call API to create a new team account.
 */
async function handleRegister(event) {
    event.preventDefault();
    const teamNum = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const adminPassword = document.getElementById('registerAdminPassword').value;
    const adminPasswordConfirm = document.getElementById('registerAdminPasswordConfirm').value;

    // Validate matching passwords and strength
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
            // Optionally, redirect to login page or auto-login
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
 * Clear stored credentials and return to the home (login) page.
 */
function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
}

// ==================== 3. Dashboard Initialization & Navigation ====================

/**
 * Parse the current URL path to extract team number, robot name, system, and admin flag.
 * Returns an object: { teamNumber, robotName, system, admin (boolean) }.
 */
function parseURL() {
    const segments = window.location.pathname.split('/').filter(seg => seg !== '');
    const params = { teamNumber: null, robotName: null, system: 'Main', admin: false };
    if (segments.length >= 1) {
        params.teamNumber = segments[0];
    }
    if (segments.length >= 2) {
        if (segments[1] === "Admin") {
            // URL format: /<team_number>/Admin/<robot_name>/<system>
            params.admin = true;
            params.robotName = segments[2] || null;
            params.system = segments[3] || 'Main';
        } else {
            // URL format: /<team_number>/<robot_name>/<system>
            params.robotName = segments[1] || null;
            params.system = segments[2] || 'Main';
        }
    }
    return params;
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
 * Create a new robot for the team by calling the API.
 * If not logged in (no token), prompts for login first.
 */
async function createNewRobot(teamNum, robotName) {
    let token = getAuthToken();
    if (!token) {
        try {
            await showPasswordPrompt();  // ensure the user is logged in
            token = getAuthToken();
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
            // Redirect to the new robot's dashboard page
            if (isUserAdmin()) {
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
 * Rename an existing robot by calling the API.
 */
async function renameRobot(teamNum, oldName, newName) {
    const token = getAuthToken();
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
            window.location.reload();  // refresh the page to reflect the change
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
    const token = getAuthToken();
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
            window.location.reload();  // refresh the page to update robot list
        } else {
            alert(data.error || 'Failed to delete robot.');
        }
    } catch (error) {
        console.error('Error deleting robot:', error);
        alert('An error occurred while deleting the robot.');
    }
}

/**
 * Fetch the list of robot names for a given team from the server.
 * Returns an array of robot name strings (or empty array on failure).
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
 * Show the robot selection interface for a team (list existing robots and allow creating new).
 */
function showRobotSelectionDashboard(robotNames) {
    const selectionSection = document.getElementById('robotSelection');
    const robotListContainer = document.getElementById('robotList');
    if (!selectionSection || !robotListContainer) return;
    robotListContainer.innerHTML = '';  // clear any existing entries

    if (!robotNames || robotNames.length === 0) {
        robotListContainer.textContent = 'No robots available. Please create a new robot.';
    } else {
        // Create a button for each robot name
        robotNames.forEach(robot => {
            const btn = document.createElement('button');
            btn.className = 'robot-button';
            btn.textContent = robot;
            btn.addEventListener('click', async () => {
                const teamNum = getTeamNumber();
                const role = getUserRole();
                if (teamNum && robot) {
                    // Redirect to selected robot's BOM dashboard (Admin or User path)
                    if (role === 'Admin') {
                        window.location.href = `/${teamNum}/Admin/${robot}/Main`;
                    } else {
                        window.location.href = `/${teamNum}/${robot}/Main`;
                    }
                    // Pre-fetch BOM data for Main system (optional, may not complete before navigation)
                    await fetchBOMDataFromServer(robot, "Main");
                }
            });
            robotListContainer.appendChild(btn);
        });
    }
    selectionSection.style.display = 'block';
}

/**
 * Initialize the dashboard page after DOM is loaded.
 * - Verifies team existence
 * - Ensures user is authenticated (prompts for password if needed)
 * - For team pages: loads or prompts robot selection / creation
 * - If a robot and system are specified in URL: fetches and displays that BOM.
 */
async function initializeDashboard() {
    const { teamNumber, robotName, system, admin } = parseURL();
    if (!teamNumber) {
        alert('Invalid team number in URL. Redirecting to home page.');
        window.location.href = '/';
        return;
    }
    // Validate that the team exists in the system
    const teamExists = await checkTeamExists(teamNumber);
    if (!teamExists) {
        alert('Team does not exist. Redirecting to home page.');
        window.location.href = '/';
        return;
    }
    // Store team number in localStorage for later use (if not already stored)
    localStorage.setItem('team_number', teamNumber);

    // Ensure we have a valid auth token; if not, prompt for login
    let token = getAuthToken();
    if (!token) {
        try {
            await showPasswordPrompt();
            token = getAuthToken();
        } catch {
            alert('You must be logged in to access the dashboard.');
            window.location.href = '/';
            return;
        }
    }
    // If this is a team admin page but the user isn't logged in as admin, block access
    if (admin && !isUserAdmin()) {
        alert('You must be logged in with an admin account to access this dashboard.');
        window.location.href = '/';
        return;
    }

    // Retrieve the list of robots for this team from server
    const robotList = await getTeamRobots(teamNumber);
    if (!robotName) {
        // No specific robot in URL: show selection or prompt creation if none exist
        if (robotList.length > 0) {
            showRobotSelectionDashboard(robotList);
        } else {
            // If no robots exist for this team, ask to create one
            promptNewRobotCreation(teamNumber);
        }
    } else {
        // A specific robot is in the URL - ensure it exists (or offer to create it)
        if (!robotList.includes(robotName)) {
            const createIt = confirm(`Robot "${robotName}" does not exist. Would you like to create it?`);
            if (createIt) {
                await createNewRobot(teamNumber, robotName);
            } else {
                window.location.href = `/${teamNumber}`;
                return;
            }
        }
        // Set current robot in localStorage and display team number in header
        localStorage.setItem('robot_name', robotName);
        const teamNumElem = document.getElementById('teamNumber');
        if (teamNumElem) teamNumElem.textContent = teamNumber;
        // Fetch the BOM data for this robot and system from server
        await fetchBOMDataFromServer(robotName, system);
    }
}

// ==================== 4. BOM Data Management & Display ====================

/**
 * Save BOM data for a given robot and system into localStorage.
 * Data is stored under a nested structure per team and robot.
 */
function saveBOMDataToLocal(bomData, robotName, system) {
    const teamNum = getTeamNumber();
    if (!teamNum || !robotName) return;
    const allBomData = JSON.parse(localStorage.getItem('bom_data')) || {};
    if (!allBomData[teamNum]) allBomData[teamNum] = {};
    if (!allBomData[teamNum][robotName]) allBomData[teamNum][robotName] = {};
    allBomData[teamNum][robotName][system] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(allBomData));
}

/**
 * Retrieve BOM data from localStorage for a given robot and system.
 * Returns an array of BOM items or an empty array if none is found.
 */
function getBOMDataFromLocal(robotName, system) {
    const teamNum = getTeamNumber();
    const allBomData = JSON.parse(localStorage.getItem('bom_data')) || {};
    return allBomData[teamNum]?.[robotName]?.[system] || [];
}

/**
 * Determine the status of a part based on completion flags and quantities.
 * Returns 'not-started', 'in-progress', or 'completed'.
 */
function getPartStatus(part) {
    const notStarted = (!part.preProcessQuantity && !part.process1Quantity && !part.process2Quantity);
    const completed = (part.preProcessCompleted && part.process1Completed && part.process2Completed);
    if (notStarted) {
        return 'not-started';   // Red status (no work done yet)
    } else if (completed) {
        return 'completed';     // Green status (all processes completed)
    } else {
        return 'in-progress';   // Yellow status (some work done, not all complete)
    }
}

/**
 * Update a BOM item's process completion flags based on quantities,
 * and calculate the current active process and remaining quantity.
 * Modifies the item object and also returns it for convenience.
 */
function checkProcessProgress(item) {
    const totalNeeded = item.Quantity;
    if (totalNeeded && !isNaN(totalNeeded)) {
        const requiredQty = parseInt(totalNeeded);
        // Mark processes as completed if their completed quantities meet or exceed required
        item.preProcessCompleted = item.preProcessQuantity ? (item.preProcessQuantity >= requiredQty) : false;
        item.process1Completed = item.process1Quantity ? (item.process1Quantity >= requiredQty) : false;
        item.process2Completed = item.process2Quantity ? (item.process2Quantity >= requiredQty) : false;
    } else {
        // If Quantity is not a number, treat as unknown (all processes not completed)
        item.preProcessCompleted = false;
        item.process1Completed = false;
        item.process2Completed = false;
    }

    // Determine which process is currently active and how many parts remain for it
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
        // All processes completed
        currentProcess = null;
        remaining = 0;
    }
    item.currentProcess = currentProcess;
    item.remaining = remaining;
    return item;
}

/**
 * Display the given BOM data as a grid of part buttons on the dashboard.
 * Each part button shows part details and color-coded status, and opens an edit modal on click.
 */
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';  // Clear current grid

    // Sort parts alphabetically by Part Name for consistent display order
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(rawPart => {
        // Ensure part has updated process flags and status info
        const part = checkProcessProgress(rawPart);
        const statusClass = getPartStatus(part);

        // Create part button element
        const partButton = document.createElement('div');
        partButton.classList.add('part-button', statusClass);
        partButton.dataset.partName = part["Part Name"] || '';

        // Inner content of part button (using template literals for clarity)
        partButton.innerHTML = `
            <h3>${part["Part Name"]}</h3>
            <p><strong>Material:</strong> ${part.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${part.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${part.remaining ?? part.Quantity ?? 'N/A'}</p>
            <p><strong>Current Process:</strong> ${part.currentProcess || 'Completed'}</p>
        `;

        // When a part is clicked, open the edit modal for that part
        partButton.addEventListener('click', () => openEditModal(part));
        gridContainer.appendChild(partButton);
    });
}

/**
 * Open the part edit modal for a given part. Populates the modal with input fields for each process.
 */
function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveBtn = document.getElementById('saveButton');
    if (!modal || !modalBody || !saveBtn) return;

    // Populate the modal with quantity input fields for each process defined on the part
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

    // Attach +/- button functionality for the modal counters
    attachCounterListeners();

    // Show the modal
    modal.style.display = 'flex';

    // When save button is clicked, persist changes and close modal
    saveBtn.onclick = () => savePartQuantities(part);
}

/**
 * Attach click handlers to all increment and decrement buttons (quantity adjusters) in a modal.
 */
function attachCounterListeners() {
    document.querySelectorAll('.increment').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetInput = document.getElementById(btn.getAttribute('data-target'));
            if (targetInput) {
                targetInput.value = parseInt(targetInput.value || "0") + 1;
            }
        });
    });
    document.querySelectorAll('.decrement').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetInput = document.getElementById(btn.getAttribute('data-target'));
            if (targetInput) {
                targetInput.value = Math.max(0, parseInt(targetInput.value || "0") - 1);
            }
        });
    });
}

/**
 * Save updated part quantities from the edit modal:
 * - Update the part object and local BOM data
 * - Reapply current filter to refresh display
 * - Send updated BOM to server
 */
async function savePartQuantities(part) {
    // Fetch updated values from modal inputs (if exist, otherwise keep current values)
    const preQtyInput  = document.getElementById('preProcessQty');
    const proc1Input   = document.getElementById('process1Qty');
    const proc2Input   = document.getElementById('process2Qty');
    part.preProcessQuantity  = preQtyInput ? parseInt(preQtyInput.value)  || 0 : (part.preProcessQuantity  || 0);
    part.process1Quantity    = proc1Input ? parseInt(proc1Input.value)    || 0 : (part.process1Quantity    || 0);
    part.process2Quantity    = proc2Input ? parseInt(proc2Input.value)    || 0 : (part.process2Quantity    || 0);

    const robotName = getRobotName();
    const teamNum = getTeamNumber();
    if (!robotName || !teamNum) {
        console.error("Missing team or robot context for saving part quantities.");
        return;
    }
    // Update the part in local BOM data and save back to localStorage
    const currentSystem = getSelectedSystem();
    let bomData = getBOMDataFromLocal(robotName, currentSystem);
    const index = bomData.findIndex(item => item["Part Name"] === part["Part Name"]);
    if (index !== -1) {
        bomData[index] = part;
    } else {
        console.error("Part not found in local BOM data:", part);
        return;
    }
    saveBOMDataToLocal(bomData, robotName, currentSystem);

    // Refresh the BOM display using the currently selected filter
    const currentFilter = localStorage.getItem('current_filter') || 'All';
    handleFilterBOM(currentFilter);

    // Close the edit modal
    closeModal();

    // Persist the updated BOM data to the server
    try {
        const token = getAuthToken();
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
            console.log(data.message);  // Log success message from server
        }
    } catch (error) {
        console.error("Error saving BOM data to server:", error);
        alert('An error occurred while saving BOM data to the server.');
    }
}

/**
 * Apply a filter to the BOM items in localStorage (filter by type or process stage) and update the display.
 * filter argument can be "All", "COTS", "InHouse", specific process names, or stage identifiers like "pre-process".
 */
function handleFilterBOM(filter) {
    const robotName = getRobotName();
    const currentSystem = getSelectedSystem();
    const bomData = getBOMDataFromLocal(robotName, currentSystem) || [];

    // Update each item's completion status before filtering
    bomData.forEach(item => checkProcessProgress(item));

    // Remember the chosen filter for persistence
    localStorage.setItem('current_filter', filter);
    const normalized = filter.trim().toLowerCase();
    let filteredData = [];

    switch (normalized) {
        case 'all':
            filteredData = bomData;
            break;
        case 'cots':
            // COTS: parts with no custom processes (all processes fields empty or "Unknown")
            filteredData = bomData.filter(item =>
                (!item.preProcess && !item.Process1 && !item.Process2) ||
                (item.preProcess === "Unknown" && item.Process1 === "Unknown" && item.Process2 === "Unknown")
            );
            break;
        case 'inhouse':
            // InHouse: parts that have at least one custom process defined (and not all marked "Unknown")
            filteredData = bomData.filter(item =>
                (item.preProcess || item.Process1 || item.Process2) &&
                !(item.preProcess === "Unknown" && item.Process1 === "Unknown" && item.Process2 === "Unknown")
            );
            break;
        case 'pre-process':
            // Parts in pre-processing stage (preProcess defined and not yet completed)
            filteredData = bomData.filter(item =>
                item.preProcess && !item.preProcessCompleted
            );
            break;
        case 'process1':
            // Parts in first process stage (Process1 defined, preProcess completed, Process1 not yet completed)
            filteredData = bomData.filter(item =>
                item.Process1 && item.preProcessCompleted && !item.process1Completed
            );
            break;
        case 'process2':
            // Parts in second process stage (Process2 defined, process1 completed, Process2 not yet completed)
            filteredData = bomData.filter(item =>
                item.Process2 && item.process1Completed && !item.process2Completed
            );
            break;
        default:
            // Filter by specific process name (e.g., "CNC", "Lathe", etc.)
            filteredData = bomData.filter(item =>
                (item.preProcess && item.preProcess.toLowerCase() === normalized && !item.preProcessCompleted) ||
                (item.Process1 && item.Process1.toLowerCase() === normalized && item.preProcessCompleted && !item.process1Completed) ||
                (item.Process2 && item.Process2.toLowerCase() === normalized && item.process1Completed && !item.process2Completed)
            );
            break;
    }
    // Update the display with the filtered list
    displayBOMAsButtons(filteredData);
}

/**
 * Fetch BOM data from the server for a given robot and system.
 * On success, saves the data to localStorage and displays the BOM.
 */
async function fetchBOMDataFromServer(robotName, system = 'Main') {
    const teamNum = getTeamNumber();
    const token = getAuthToken();
    if (!teamNum || !robotName) return;
    try {
        const response = await fetch(`${API_BASE_URL}api/get_bom?team_number=${teamNum}&robot=${robotName}&system=${system}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data, robotName, system);
            displayBOMAsButtons(data.bom_data);
        } else {
            console.error(`Failed to retrieve BOM for ${robotName}/${system}:`, data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error(`Fetch BOM Data Error for ${robotName}/${system}:`, error);
        alert('An error occurred while fetching BOM data.');
    }
}

// ==================== 5. Modal Handling ====================

/**
 * Close the part edit modal (and optionally perform any cleanup needed).
 */
function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.style.display = 'none';
}

/**
 * (Team Admin only) Setup and handle the Settings modal for Onshape BOM fetch:
 * Opens and closes the modal, and triggers BOM fetch when requested.
 */
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

// ==================== 6. Admin Utilities (Upload/Download) ====================

/**
 * Upload a JSON data file (e.g., BOM or Settings) to the server.
 * Expects the input file to contain JSON that will be sent under a specified key in the request body.
 */
async function uploadJsonFile(fileInputId, apiEndpoint, payloadKey) {
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput?.files[0];
    if (!file) { alert('Please select a file to upload.'); return; }
    try {
        const fileText = await file.text();
        const token = getAuthToken();
        const payload = {};
        payload[payloadKey] = JSON.parse(fileText);
        const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok) {
            alert(`${payloadKey.replace('_', ' ')} uploaded successfully!`);
        } else {
            alert(`Error: ${result.error || 'Failed to upload data.'}`);
        }
    } catch (error) {
        console.error(`Error uploading ${payloadKey}:`, error);
        alert('An error occurred while uploading the data.');
    }
}

/**
 * Upload a binary file (like a SQLite database file) to the server via FormData.
 */
async function uploadBinaryFile(fileInputId, apiEndpoint) {
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput?.files[0];
    if (!file) { alert('Please select a file to upload.'); return; }
    try {
        const formData = new FormData();
        formData.append('file', file);
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await response.json();
        if (response.ok) {
            alert(`${file.name} uploaded successfully!`);
        } else {
            alert(`Error: ${result.error || 'Failed to upload file.'}`);
        }
    } catch (error) {
        console.error(`Error uploading file:`, error);
        alert('An error occurred while uploading the file.');
    }
}

/**
 * Download JSON data (like BOM or Settings for all teams) from the server and trigger a file download.
 * `dataKey` is the property of the returned JSON to be saved (e.g., 'bom_data_dict').
 */
async function downloadJsonData(apiEndpoint, dataKey, fileName) {
    const token = getAuthToken();
    try {
        const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            // Prepare file content and trigger download
            const blob = new Blob([JSON.stringify(data[dataKey], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            alert(data.error || `Failed to download ${fileName}.`);
        }
    } catch (error) {
        console.error(`Error downloading ${fileName}:`, error);
        alert(`Failed to download ${fileName}.`);
    }
}

/**
 * Download a binary file from the server (e.g., teams.db) and trigger a file download.
 */
async function downloadBinaryData(apiEndpoint, fileName) {
    const token = getAuthToken();
    try {
        const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            // Get the binary data as a Blob
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            // If server returns an error message in JSON
            const errorData = await response.json();
            alert(errorData.error || `Failed to download ${fileName}.`);
        }
    } catch (error) {
        console.error(`Error downloading ${fileName}:`, error);
        alert('An error occurred while downloading the file.');
    }
}

// ==================== 7. Event Listeners (DOMContentLoaded) ====================

document.addEventListener('DOMContentLoaded', () => {
    // If on a dashboard page (team user or team admin), initialize it
    if (document.getElementById('dashboard')) {
        initializeDashboard();
    }

    // AUTH: Attach event handlers for login and registration forms if they exist
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    // AUTH: Links for switching between login and registration pages
    document.getElementById('registerButton')?.addEventListener('click', () => {
        window.location.href = '/register';
    });
    document.getElementById('backToLogin')?.addEventListener('click', () => {
        window.location.href = '/';
    });

    // AUTH: Logout buttons (if present in header)
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // UI: Display team number in header if applicable
    const teamNumberElem = document.getElementById('teamNumber');
    if (teamNumberElem) {
        teamNumberElem.textContent = getTeamNumber() || '';
    }

    // UI: Handle system dropdown changes (navigate between system pages for the same robot)
    const systemSelectElem = document.getElementById('systemSelect');
    if (systemSelectElem && document.getElementById('dashboard')) {
        systemSelectElem.addEventListener('change', event => {
            const selectedSystem = event.target.value;
            const teamNum = getTeamNumber();
            const robot = getRobotName();
            if (teamNum && robot) {
                if (isUserAdmin()) {
                    window.location.href = `/${teamNum}/Admin/${robot}/${selectedSystem}`;
                } else {
                    window.location.href = `/${teamNum}/${robot}/${selectedSystem}`;
                }
            }
        });
    }

    // UI: Filter button click handlers (filter BOM view by category/process)
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter') || 'All';
            handleFilterBOM(filter);
        });
    });

    // Team Admin Page: If present, initialize the Settings modal (Onshape BOM fetch)
    initializeSettingsModal();

    // Team Admin Page: Robot management buttons (create, rename, delete)
    const renameBtn = document.getElementById('renameRobotButton');
    const deleteBtn = document.getElementById('deleteRobotButton');
    const createBtn = document.getElementById('createRobotButton');
    if (renameBtn) {
        renameBtn.addEventListener('click', () => {
            const teamNum = getTeamNumber();
            const oldName = document.getElementById('oldRobotName').value.trim();
            const newName = document.getElementById('newRobotName').value.trim();
            if (!oldName || !newName) {
                alert('Please provide both the existing robot name and a new name.');
            } else {
                renameRobot(teamNum, oldName, newName);
            }
        });
    }
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const teamNum = getTeamNumber();
            const robotName = document.getElementById('deleteRobotName').value.trim();
            if (!robotName) {
                alert('Please enter the name of the robot to delete.');
            } else if (confirm(`Are you sure you want to delete robot "${robotName}"? This action cannot be undone.`)) {
                deleteRobot(teamNum, robotName);
            }
        });
    }
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const teamNum = getTeamNumber();
            if (teamNum) promptNewRobotCreation(teamNum);
        });
    }

    // Modal: Close the edit part modal when clicking the close (X) button or outside the modal
    document.getElementById('closeModal')?.addEventListener('click', closeModal);
    window.addEventListener('click', event => {
        const editModal = document.getElementById('editModal');
        if (event.target === editModal) {
            closeModal();
        }
    });

    // Global Admin Page: Upload forms (BOM data, Settings data, Teams DB)
    const uploadBOMForm = document.getElementById('uploadBOMDataForm');
    if (uploadBOMForm) {
        uploadBOMForm.addEventListener('submit', event => {
            event.preventDefault();
            uploadJsonFile('bomDataFileInput', 'api/admin/upload_bom_dict', 'bom_data_dict');
        });
    }
    const uploadSettingsForm = document.getElementById('uploadSettingsDataForm');
    if (uploadSettingsForm) {
        uploadSettingsForm.addEventListener('submit', event => {
            event.preventDefault();
            uploadJsonFile('settingsDataFileInput', 'api/admin/upload_settings_dict', 'settings_data_dict');
        });
    }
    const uploadTeamsForm = document.getElementById('uploadTeamsDBForm');
    if (uploadTeamsForm) {
        uploadTeamsForm.addEventListener('submit', event => {
            event.preventDefault();
            uploadBinaryFile('teamsDBFileInput', 'api/admin/upload_teams_db');
        });
    }

    // Global Admin Page: Download buttons (BOM data, Settings data, Teams DB)
    document.getElementById('downloadBOMDictButton')?.addEventListener('click', () => {
        downloadJsonData('api/admin/download_bom_dict', 'bom_data_dict', 'bom_data.json');
    });
    document.getElementById('downloadSETTINGSDictButton')?.addEventListener('click', () => {
        downloadJsonData('api/admin/download_settings_dict', 'settings_data_dict', 'settings_data.json');
    });
    document.getElementById('downloadTEAMSDictButton')?.addEventListener('click', () => {
        downloadBinaryData('api/admin/download_teams_db', 'teams.db');
    });

    // Global Admin Page: Fetch Team BOM form (retrieve BOM of a specified team & system)
    const fetchTeamBOMForm = document.getElementById('fetchTeamBOMForm');
    if (fetchTeamBOMForm) {
        fetchTeamBOMForm.addEventListener('submit', async event => {
            event.preventDefault();
            const teamInput = document.getElementById('teamNumberInput').value.trim();
            const systemSelected = document.getElementById('systemSelect').value;
            if (!teamInput) {
                alert('Please enter a team number.');
                return;
            }
            try {
                const token = getAuthToken();
                const response = await fetch(`${API_BASE_URL}api/admin/get_bom?team_number=${teamInput}&system=${systemSelected}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (response.ok) {
                    // Display fetched BOM data in the BOM display section (simple list of part names)
                    const partsGrid = document.getElementById('bomPartsGrid');
                    partsGrid.innerHTML = '';
                    data.bom_data.forEach(part => {
                        const partDiv = document.createElement('div');
                        partDiv.className = 'part-button';
                        partDiv.textContent = part["Part Name"] || 'Unknown Part';
                        partsGrid.appendChild(partDiv);
                    });
                } else {
                    alert(data.error || 'Failed to fetch BOM data.');
                }
            } catch (error) {
                console.error('Error fetching team BOM:', error);
                alert('An error occurred while fetching the BOM data.');
            }
        });
    }
    const fetchBOMBtn = document.getElementById('fetchBOMButton');
if (fetchBOMBtn) {
    fetchBOMBtn.addEventListener('click', async () => {
        const docUrl = document.getElementById('onshapeDocumentUrl')?.value;
        const accessKey = document.getElementById('accessKey')?.value;
        const secretKey = document.getElementById('secretKey')?.value;

        const teamNumber = getTeamNumber();
        const robotName = getRobotName();
        const system = getSelectedSystem();
        const token = getAuthToken();

        if (!docUrl || !accessKey || !secretKey || !teamNumber || !robotName || !system || !token) {
            alert('Missing information. Make sure all fields are filled and you are logged in.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}api/import_bom`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    document_url: docUrl,
                    access_key: accessKey,
                    secret_key: secretKey,
                    team_number: teamNumber,
                    robot_name: robotName,
                    system: system
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('BOM successfully imported from Onshape!');
                await fetchBOMDataFromServer(robotName, system);
            } else {
                alert(`Failed to import BOM: ${data.error}`);
            }
        } catch (error) {
            console.error('Fetch BOM from Onshape failed:', error);
            alert('Error fetching BOM from Onshape. See console for details.');
        }
    });
}

});
