const API_BASE_URL = 'https://frcbom-production.up.railway.app/';
let teamNumber = localStorage.getItem('team_number');

function getTeamNumberFromURL() {
    const path = window.location.pathname;
    const pathSegments = path.split('/').filter(segment => segment !== '');
    if (pathSegments.length > 0) {
        const teamNumber = pathSegments[0];
        return teamNumber;
    } else {
        return null;
    }
}

async function handlePasswordSubmit() {
    const password = document.getElementById('passwordPromptInput').value;
    const teamNumber = localStorage.getItem('team_number');

    if (!password || !teamNumber) {
        alert('Please enter a password');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password})
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            // Remove the overlay
            const overlay = document.getElementById('passwordOverlay');
            overlay.remove();
            // Remove blur from background
            document.body.style.filter = 'none';
            // Proceed to initialize the dashboard
            initializeDashboard();
        } else {
            alert('Incorrect password');
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('An error occurred while logging in.');
    }
}

function showPasswordPrompt() {
    // Create the overlay element
    const overlay = document.createElement('div');
    overlay.id = 'passwordOverlay';
    overlay.className = 'modal'; // Use your existing modal styling
    overlay.style.display = 'flex';

    // Create the modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Close button (optional)
    const closeButton = document.createElement('span');
    closeButton.className = 'close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => {
        overlay.style.display = 'none';
        document.body.style.filter = 'none';
    };

    // Prompt message
    const promptText = document.createElement('h2');
    promptText.textContent = 'Please enter your password to access the dashboard';

    // Password input field
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'passwordPromptInput';
    passwordInput.placeholder = 'Password';
    passwordInput.style.width = '80%';
    passwordInput.style.padding = '10px';
    passwordInput.style.marginTop = '20px';

    // Submit button
    const submitButton = document.createElement('button');
    submitButton.textContent = 'Submit';
    submitButton.className = 'button-primary';
    submitButton.style.marginTop = '20px';

    submitButton.addEventListener('click', handlePasswordSubmit);

    // Append elements to modal content
    modalContent.appendChild(closeButton);
    modalContent.appendChild(promptText);
    modalContent.appendChild(passwordInput);
    modalContent.appendChild(submitButton);

    // Append modal content to overlay
    overlay.appendChild(modalContent);

    // Append overlay to body
    document.body.appendChild(overlay);

    // Blur the background content
    // document.body.style.filter = 'blur(5px)';
}

// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password}),
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNumber);
            let selectedSystem = ""
            if (document.getElementById('systemSelect') != null) {
                selectedSystem = document.getElementById('systemSelect').value;
            } else {
                selectedSystem = "";
            }
            // Check if admin
            if (teamNumber === "0000") {
                window.location.href = '/admin'; // Redirect to admin dashboard
            } else {
                window.location.href = `/${teamNumber}/${selectedSystem}`;
            }
        } else {
            document.getElementById('loginMessage').textContent = data.error;
        }
    } catch (error) {
        console.error('Login Error:', error);
        document.getElementById('loginMessage').textContent = 'Login failed.';
    }
}


function getPartStatus(part) {
    if (!part.preProcessQuantity && !part.process1Quantity && !part.process2Quantity) {
        return 'not-started'; // RED
    } else if (part.preProcessCompleted && part.process1Completed && part.process2Completed) {
        return 'completed'; // GREEN
    } else {
        return 'in-progress'; // YELLOW
    }
}

function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;
    // console.log("PLACER3: item: " + item)
    // Check Pre-Process Completion
    if (item.preProcess) {
        item.preProcessQuantity = item.preProcessQuantity || 0;
        item.preProcessCompleted = item.preProcessQuantity >= requiredQuantity;
    } else {
        // If no Pre-Process, consider it completed by default
        item.preProcessCompleted = true;
    }

    // Check Process 1 Completion
    if (item.Process1) {
        item.process1Quantity = item.process1Quantity || 0;
        // Process 1 can only start if Pre-Process is completed
        if (item.preProcessCompleted) {
            item.process1Available = true;
            item.process1Completed = item.process1Quantity >= requiredQuantity;
        } else {
            item.process1Available = false;
            item.process1Quantity = 0;  // Reset quantity if not available
            item.process1Completed = false;
        }
    } else {
        // If no Process 1, consider it completed by default
        item.process1Completed = true;
    }

    // Check Process 2 Completion
    if (item.Process2) {
        item.process2Quantity = item.process2Quantity || 0;
        // Process 2 can only start if Process 1 is completed
        if (item.process1Completed) {
            item.process2Available = true;
            item.process2Completed = item.process2Quantity >= requiredQuantity;
        } else {
            item.process2Available = false;
            item.process2Quantity = 0;  // Reset quantity if not available
            item.process2Completed = false;
        }
    } else {
        // If no Process 2, consider it completed by default
        item.process2Completed = true;
    }
}

document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.getAttribute('data-filter');
        handleFilterBOM(filter);
    });
});

// Function to handle filtering BOM data
function handleFilterBOM(filter) {
    let systemSelect
    if (document.getElementById("systemSelect")) {
        systemSelect = document.getElementById("systemSelect").value;
    } else {
        systemSelect = "Main"
    }
    const bomData = getBOMDataFromLocal(systemSelect);
    let filteredData;

    // Save the current filter to localStorage
    localStorage.setItem('current_filter', filter);
    console.log("The filter is: " + filter)
    // Update process completion states
    bomData.forEach((item) => {
        checkProcessProgress(item);
    });
    // Normalize the filter string
    const normalizedFilter = filter.trim().toLowerCase();

    // Apply filtering based on the selected filter
    switch (normalizedFilter) {
        case 'all':
            filteredData = bomData;
            break;
        case 'cots':
            filteredData = bomData.filter(item =>
                !item.preProcess && !item.Process1 && !item.Process2
            );
            break;
        case 'inhouse':
            filteredData = bomData.filter(item =>
                item.preProcess || item.Process1 || item.Process2
            );
            break;
        case 'pre-process':
            filteredData = bomData.filter(item =>
                item.preProcess && !item.preProcessCompleted
            );
            break;
        case 'process1':
            filteredData = bomData.filter(item =>
                item.Process1 && item.preProcessCompleted && !item.process1Completed
            );
            break;
        case 'process2':
            filteredData = bomData.filter(item =>
                item.Process2 && item.process1Completed && !item.process2Completed
            );
            break;
        default:
            filteredData = bomData.filter(item =>
                (item.preProcess?.toLowerCase() === normalizedFilter && !item.preProcessCompleted) ||
                (item.Process1?.toLowerCase() === normalizedFilter && item.preProcessCompleted && !item.process1Completed) ||
                (item.Process2?.toLowerCase() === normalizedFilter && item.process1Completed && !item.process2Completed)
            );
            break;
    }

    displayBOMAsButtons(filteredData);
}

function isPasswordStrong(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    console.log("Checking strength: " + (password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers))
    return (
        password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers
    );
}

function showRegisterMessage(message, type) {
    const registerMessage = document.getElementById('registerMessage');
    registerMessage.textContent = message;
    console.log("Showing message: " + message)
    registerMessage.className = `alert alert-${type} mt-3`;
    registerMessage.classList.remove('d-none');
}

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    console.log('Register form submitted');

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showRegisterMessage('Passwords do not match.', 'danger');
        return;
    }

    if (!isPasswordStrong(password)) {
        showRegisterMessage(
            'Password is not strong enough. Please meet the requirements.',
            'danger'
        );
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password})
        });
        console.log("Registered team!")
        const data = await response.json();
        if (response.ok) {
            document.getElementById('registerMessage').textContent = 'Registration successful!';
            document.getElementById('registerMessage').style.color = 'green';
        } else {
            document.getElementById('registerMessage').textContent = `Error: ${data.error}`;
        }
    } catch (error) {
        console.error('Registration Error:', error);
        document.getElementById('registerMessage').textContent = 'Registration failed.';
    }
}

function showLoginMessage(message, type) {
    const loginMessage = document.getElementById('loginMessage');
    loginMessage.textContent = message;
    loginMessage.className = `alert alert-${type} mt-3`;
    loginMessage.classList.remove('d-none');
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log("Loading content")
    if (document.getElementById('dashboard')) {
        initializeDashboard();
        console.log("Dashboard initialized");
    }
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    document.getElementById('registerButton')?.addEventListener('click', () => {
        window.location.href = '/register';
    });
    document.getElementById('backToLogin')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);


    // Display team number in header
    if (document.getElementById('teamNumber')) {
        document.getElementById('teamNumber').textContent = teamNumber || '';
    }

    // Fetch BOM data from the server on page load (if applicable)
    if (window.location.pathname.includes('dashboard.html')) {
        console.log("Im Here")
        fetchBOMDataFromServer('Main');
    }

    // Modal Logic (move inside DOMContentLoaded)
    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
});


document.getElementById('systemSelect').addEventListener('change', (event) => {
    const selectedSystem = event.target.value;
    console.log("IM HERE3: " + selectedSystem)
    fetchBOMDataFromServer(selectedSystem); // Fetch BOM for the selected system
});

// Fetch BOM Data and Save to Local Storage
async function fetchBOMDataFromServer(system = 'Main') {
    const teamNumber = localStorage.getItem('team_number');
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}&system=${system}`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`}
        });
        console.log("System: " + system)
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data, system);
            displayBOMAsButtons(data.bom_data);
        } else {
            console.error(`Failed to retrieve BOM for system '${system}':`, data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error(`Fetch BOM Data Error for system '${system}':`, error);
    }
}

// Save BOM Data Locally for a System
function saveBOMDataToLocal(bomData, system) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    if (!bomDict[teamNumber]) {
        bomDict[teamNumber] = {};
    }
    bomDict[teamNumber][system] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log(bomData)
    console.log(`Saved BOM for system '${system}' locally.`);
}

function getBOMDataFromLocal(system) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber]?.[system] || [];
}


// Display team number
document.getElementById('teamNumber').textContent = teamNumber;

// Modal Logic
const modal = document.getElementById('settingsModal');
const settingsButton = document.getElementById('settingsButton');
const closeButton = document.querySelector('.close');

settingsButton.addEventListener('click', () => modal.style.display = 'flex');
closeButton.addEventListener('click', () => modal.style.display = 'none');

// Fetch BOM Data and Save to Local Storage
// Function to fetch BOM with system selection
document.getElementById('fetchBOMButton').addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    const accessKey = document.getElementById('accessKey').value;
    const secretKey = document.getElementById('secretKey').value;
    const system = document.getElementById('systemSelect').value; // Get selected system
    const teamNumber = localStorage.getItem('team_number');

    if (!documentUrl || !teamNumber) {
        alert('Document URL and Team Number are required.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                document_url: documentUrl,
                team_number: teamNumber,
                system: system, // Include the selected system
                access_key: accessKey,
                secret_key: secretKey,
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log(`BOM fetched and saved for system '${system}'.`);
            saveBOMDataToLocal(data.bom_data, system); // Save to local storage
            displayBOMAsButtons(data.bom_data); // Update the UI
        } else {
            console.error('Error fetching BOM:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching the BOM.');
    }
});


// Function to display BOM data as buttons
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    gridContainer.innerHTML = ''; // Clear previous content

    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(part => {
        const currentProcess = determineCurrentProcess(part);
        const statusClass = getPartStatus(part); // Get status class

        // Create part button
        const button = document.createElement('div');
        button.classList.add('part-button', statusClass); // Add status class
        button.dataset.partName = part["Part Name"];

        // Populate button content
        button.innerHTML = `
            <h3>${part["Part Name"]}</h3>
            <p><strong>Material:</strong> ${part.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${part.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${currentProcess.remaining || part.Quantity || 'N/A'}</p>
            <p><strong>Current Process:</strong> ${currentProcess.name || 'Completed'}</p>
        `;

        // Add click event listener
        button.addEventListener('click', () => openEditModal(part));

        // Append button to grid
        gridContainer.appendChild(button);
    });
}

// Function to open the modal with part details
function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveButton = document.getElementById('saveButton');

    // Clear existing content
    modalBody.innerHTML = '<button id="downloadCADButton" class="button-primary">Download STEP File</button>';
    // Populate modal with editable fields for the part
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
    console.log(modalBody.innerHTML)
    const downloadCADButton = document.getElementById('downloadCADButton');
    if (downloadCADButton) {
        downloadCADButton.addEventListener('click', () => {
            console.log('Downloading CAD for part:', part["Part Name"], " with the id of" + part["ID"]);
            downloadCADFile(part["ID"]).then(r => {
            });
        });
    }
    // Show the modal
    modal.style.display = 'flex';
    attachCounterListeners();

    // Save changes
    saveButton.onclick = () => savePartQuantities(part);
}

function attachCounterListeners() {
    document.querySelectorAll('.increment').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.getAttribute('data-target'));
            target.value = parseInt(target.value) + 1;
        });
    });

    document.querySelectorAll('.decrement').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.getAttribute('data-target'));
            target.value = Math.max(0, parseInt(target.value) - 1); // Ensure value doesn't go below 0
        });
    });
}

// Function to save quantities and update the BOM data
function savePartQuantities(part) {
    // Fetch updated quantities from the modal
    const preProcessQty = document.getElementById('preProcessQty')?.value || part.preProcessQuantity || 0;
    const process1Qty = document.getElementById('process1Qty')?.value || part.process1Quantity || 0;
    const process2Qty = document.getElementById('process2Qty')?.value || part.process2Quantity || 0;

    // Update the part's properties
    part.preProcessQuantity = parseInt(preProcessQty, 10);
    part.process1Quantity = parseInt(process1Qty, 10);
    part.process2Quantity = parseInt(process2Qty, 10);

    // Retrieve the BOM data from localStorage

    let systemSelect
    if (document.getElementById("systemSelect")) {
        systemSelect = document.getElementById("systemSelect").value;
    } else {
        systemSelect = "Main"
    }
    let bomData = getBOMDataFromLocal(systemSelect);
    console.log('Pre-Process Qty:', preProcessQty);
    console.log('Process 1 Qty:', process1Qty);
    console.log('Process 2 Qty:', process2Qty);
    console.log('Updated Part:', part);

    // Find and update the part in the BOM data
    const partIndex = bomData.findIndex(item => item["Part Name"] === part["Part Name"]);
    if (partIndex !== -1) {
        bomData[partIndex] = part;
    } else {
        console.error("Part not found in BOM data:", part);
        return;
    }

    // Save the updated BOM data back to localStorage
    saveBOMDataToLocal(bomData,systemSelect);

    // Re-render the BOM grid to reflect changes
    const currentFilter = localStorage.getItem('current_filter') || 'InHouse';
    handleFilterBOM(currentFilter);

    // Close the modal
    closeModal();
}


// Function to close the modal
function closeModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
}

// Add close event listener
document.querySelector('.close').addEventListener('click', closeModal);

// Close modal on clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeModal();
    }
});

async function downloadCADFile(partId) {
    const jwtToken = localStorage.getItem('jwt_token');

    try {
        const response = await fetch(`${API_BASE_URL}/api/download_cad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({id: partId, team_number: teamNumber}),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(error.message || 'Failed to download CAD file.');
        }
        console.log(response.blob())
        console.log(response.body)
        const blob = await response.blob();
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `Part-${partId}.step`;
        downloadLink.click();
    } catch (error) {
        console.error('Error downloading CAD file:', error);
        alert('Failed to download CAD file. Check the console for details.');
    }
}

// Function to determine the current process and remaining quantity
function determineCurrentProcess(part) {
    // console.log("PLACER1: part: " + part)
    if (part.preProcess && !part.preProcessCompleted) {
        return {name: part.preProcess, remaining: part.preProcessQuantity || part.Quantity};
    } else if (part.Process1 && !part.process1Completed) {
        return {name: part.Process1, remaining: part.process1Quantity || part.Quantity};
    } else if (part.Process2 && !part.process2Completed) {
        return {name: part.Process2, remaining: part.process2Quantity || part.Quantity};
    } else {
        return {name: 'Completed', remaining: 0};
    }
}

function checkLoginStatus() {
    const storedTeamNumber = localStorage.getItem('team_number');
    const currentPath = window.location.pathname.split('/');
    const currentTeamNumber = currentPath[1]; // Extract the team number from the URL

    // Redirect if not logged in or if team number mismatch
    // if (!storedTeamNumber || storedTeamNumber !== currentTeamNumber) {
    //     alert('You are not logged in. Redirecting to the login page.');
    //     window.location.href = '/'; // Redirect to home/login
    // }
}

document.addEventListener('DOMContentLoaded', () => {
    const systemSelect = document.getElementById('systemSelect');
    const teamNumber = localStorage.getItem('team_number'); // Get the team number from localStorage

    // Update the URL when a system is selected
    systemSelect.addEventListener('change', () => {
        const selectedSystem = systemSelect.value;
        if (teamNumber && selectedSystem) {
            // Redirect to the system-specific URL
            window.location.href = `/${teamNumber}/${selectedSystem}`;
        }
    });

    // Set the dropdown to the current system from the URL
    const currentSystem = window.location.pathname.split('/')[2]; // Get system from URL
    if (currentSystem) {
        systemSelect.value = currentSystem;
    }
    // Toggle Password Visibility on Sign In Page
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function () {
            const passwordField = document.getElementById('loginPassword');
            const type =
                passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }

// Toggle Password Visibility on Register Page
    const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
    if (toggleRegisterPassword) {
        toggleRegisterPassword.addEventListener('click', function () {
            const passwordField = document.getElementById('registerPassword');
            const type =
                passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
    checkLoginStatus();
});


// Function to initialize the dashboard
async function initializeDashboard() {
    const teamNumber = getTeamNumberFromURL();
    console.log("TEAM NUMBER: ", teamNumber)
    const jwtToken = localStorage.getItem('jwt_token');

    if (!teamNumber) {
        alert('Invalid team number in URL. Redirecting to the home page.');
        window.location.href = '/';
        return;
    }

    const teamExists = await checkTeamExists(teamNumber);
    if (!teamExists) {
        alert('Team does not exist. Redirecting to the home page.');
        window.location.href = '/';
        return;
    }

    localStorage.setItem('team_number', teamNumber);
    const system = document.getElementById('systemSelect').value;
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement) {
        teamNumberElement.textContent = teamNumber;
    }

    if (!jwtToken) {
        // User is not logged in, display password prompt overlay
        showPasswordPrompt();
    } else {
        // User is logged in, proceed to initialize dashboard
        console.log("Fetched from INIT DASHBOARD!!")
        fetchBOMDataFromServer(system);
    }

    // Attach event listener for logout
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
}


async function checkTeamExists(teamNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}api/team_exists?team_number=${teamNumber}`);
        const data = await response.json();
        console.log(data)
        if (response.ok) {
            return data.exists;
        } else {
            console.error('Failed to check if team exists:', data.error);
            return false;
        }
    } catch (error) {
        console.error('Error checking if team exists:', error);
        return false;
    }
}


// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
}

document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#0056b3'; // Hover effect
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#007BFF'; // Revert back
    });
});