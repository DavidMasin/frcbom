const API_BASE_URL = 'https://frcbom-production.up.railway.app';

// Function to handle login
async function handleLogin(event) {
    event.preventDefault();

    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', data.team_number);
            window.location.href = 'dashboard.html';
        } else {
            alert(`Login failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('An error occurred during login.');
    }
}

// Function to handle registration
async function handleRegister(event) {
    event.preventDefault();

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Registration successful! You can now log in.');
            window.location.href = 'index.html';
        } else {
            alert(`Registration failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Registration Error:', error);
        alert('An error occurred during registration.');
    }
}

// Attach event listener for the registration form
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});



// Function to check if the user is logged in
function checkLoginStatus() {
    const teamNumber = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');

    if (!teamNumber || !token) {
        alert('You are not logged in.');
        window.location.href = 'index.html';
    }
}

// Function to initialize the dashboard
function initializeDashboard() {
    checkLoginStatus();

    const teamNumber = localStorage.getItem('team_number');

    // Display the team number in the header
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    // Attach event listeners
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.getElementById('settingsButton')?.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
    });
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => handleFilterBOM(button.getAttribute('data-filter')));
    });

    // Close settings modal
    const closeButton = document.querySelector('.close');
    closeButton?.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'none';
    });

    // Fetch BOM data on page load
    fetchBOMDataFromServer();
}

// Function to handle Fetch BOM
async function handleFetchBOM() {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    if (!documentUrl) {
        alert('Please enter an Onshape Document URL.');
        return;
    }

    const teamNumber = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        alert('You are not authenticated. Please log in again.');
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/bom`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ document_url: documentUrl, team_number: teamNumber })
        });

        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            displayBOM(data.bom_data);
            document.getElementById('bomTableContainer').style.display = 'block';
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
}

// Function to handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}
const socket = io(API_BASE_URL);

// Listen for BOM updates
socket.on('update_bom', (data) => {
    const teamNumber = localStorage.getItem('team_number');
    if (data.team_number === teamNumber) {
        saveBOMDataToLocal(data.bom_data);
        displayBOM(data.bom_data);
    }
});

// Update the saveBOMDataToLocal function if necessary
function saveBOMDataToLocal(bomData) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    socket.emit('bom_update', { team_number: teamNumber, bom_data: bomData });

    // Optionally, send update to server
    saveBOMDataToServer(bomData);
}

// Function to save BOM data to server
async function saveBOMDataToServer(bomData) {
    const teamNumber = localStorage.getItem('team_number');
    try {
        const response = await fetch(`${API_BASE_URL}/api/save_bom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, bom_data: bomData })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Failed to save BOM data:', data.error);
        }
    } catch (error) {
        console.error('Save BOM Data Error:', error);
    }
}

// Function to get BOM Data from Local Storage
function getBOMDataFromLocal() {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Function to fetch BOM Data from Server
async function fetchBOMDataFromServer() {
    const teamNumber = localStorage.getItem('team_number');
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            displayBOM(data.bom_data);
            document.getElementById('bomTableContainer').style.display = 'block';
        } else {
            console.error('Failed to retrieve BOM data:', data.error);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

function handleFilterBOM(filter) {
    const bomData = getBOMDataFromLocal();
    let filteredData;

    if (filter === 'All') {
        filteredData = bomData;
    } else {
        filteredData = bomData.filter(item => {
            const preProcessDone = item.preProcessDone || !item.preProcess;
            const process1Done = item.Process1Done || !item.Process1;
            if (filter === item.preProcess) {
                // Show if pre-process not done
                return !item.preProcessDone;
            } else if (filter === item.Process1) {
                // Show if pre-process is done and process 1 not done
                return preProcessDone && !item.Process1Done;
            } else if (filter === item.Process2) {
                // Show if process 1 is done and process 2 not done
                return process1Done && !item.Process2Done;
            } else {
                return false;
            }
        });
    }

    displayBOM(filteredData);
    document.getElementById('bomTableContainer').style.display = 'block';
}

// Function to display BOM Data in Table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    if (!bomData || bomData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="11">No parts found</td></tr>';
        return;
    }

    // Sort BOM data alphabetically by Part Name
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach((item, index) => {
        const row = document.createElement('tr');

        // Part Name
        row.innerHTML += `<td>${item["Part Name"] || 'N/A'}</td>`;
        // Description
        row.innerHTML += `<td>${item.Description || 'N/A'}</td>`;
        // Material
        row.innerHTML += `<td>${item.Material || 'N/A'}</td>`;
        // Quantity Required
        row.innerHTML += `<td>${item.Quantity || 'N/A'}</td>`;
        // Quantity Produced (Input Field)
        row.innerHTML += `<td><input type="number" min="0" value="${item.QuantityProduced || 0}" data-index="${index}" class="quantity-produced"></td>`;
        // Pre-Process
        row.innerHTML += `<td>${item.preProcess || 'N/A'}</td>`;
        // Pre-Process Done (Checkbox)
        row.innerHTML += `<td><input type="checkbox" ${item.preProcessDone ? 'checked' : ''} data-index="${index}" data-process="preProcessDone" class="process-done"></td>`;
        // Process 1
        row.innerHTML += `<td>${item.Process1 || 'N/A'}</td>`;
        // Process 1 Done (Checkbox)
        row.innerHTML += `<td><input type="checkbox" ${item.Process1Done ? 'checked' : ''} data-index="${index}" data-process="Process1Done" class="process-done"></td>`;
        // Process 2
        row.innerHTML += `<td>${item.Process2 || 'N/A'}</td>`;
        // Process 2 Done (Checkbox)
        row.innerHTML += `<td><input type="checkbox" ${item.Process2Done ? 'checked' : ''} data-index="${index}" data-process="Process2Done" class="process-done"></td>`;

        tableBody.appendChild(row);
    });

    // Add event listeners for quantity input fields
    document.querySelectorAll('.quantity-produced').forEach(input => {
        input.addEventListener('change', handleQuantityChange);
    });

    // Add event listeners for process done checkboxes
    document.querySelectorAll('.process-done').forEach(checkbox => {
        checkbox.addEventListener('change', handleProcessStatusChange);
    });
}
// Function to handle quantity produced change
function handleQuantityChange(event) {
    const index = event.target.getAttribute('data-index');
    const bomData = getBOMDataFromLocal();
    const newQuantity = parseInt(event.target.value, 10) || 0;
    bomData[index].QuantityProduced = newQuantity;
    saveBOMDataToLocal(bomData);
    // Optionally, send update to server and other clients via Socket.IO
}

// Function to handle process status change
function handleProcessStatusChange(event) {
    const index = event.target.getAttribute('data-index');
    const process = event.target.getAttribute('data-process');
    const bomData = getBOMDataFromLocal();
    bomData[index][process] = event.target.checked;
    saveBOMDataToLocal(bomData);
    // Optionally, send update to server and other clients via Socket.IO
}
// Attach event listeners after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the login page
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Check if we are on the registration page
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // If on dashboard, initialize dashboard
    if (document.getElementById('dashboard')) {
        initializeDashboard();
    }
});
