const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number') || '';
let currentView = 'InHouse';
let currentFilter = 'All';

// Function to handle login
async function handleLogin(event) {
    event.preventDefault();

    const teamNumberInput = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumberInput, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', data.team_number);

            // Update teamNumber variable
            teamNumber = data.team_number;

            // Redirect to dashboard.html after login
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
    console.log('Register button clicked');

    const teamNumberInput = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    console.log('Team Number:', teamNumberInput);
    console.log('Password:', password);
    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumberInput, password: password})
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

// Function to check if the user is logged in
function checkLoginStatus() {
    teamNumber = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');

    if (!teamNumber || !token) {
        alert('You are not logged in.');
        window.location.href = 'index.html';
    }
}

// Function to initialize the dashboard
function initializeDashboard() {
    checkLoginStatus();

    // Display the team number in the header
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    // Fetch BOM data and apply the initial filter and view
    fetchBOMDataFromServer();

    // Attach event listeners for buttons and filters
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // Filter buttons
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');
            handleFilterBOM(filter);
        });
    });
}

// Function to handle Fetch BOM
async function handleFetchBOM() {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    if (!documentUrl) {
        alert('Please enter an Onshape Document URL.');
        return;
    }

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
            body: JSON.stringify({document_url: documentUrl, team_number: teamNumber})
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

// Initialize Socket.IO
const socket = io(API_BASE_URL);

// Listen for BOM updates
socket.on('update_bom', (data) => {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    if (data.team_number === teamNumber) {
        saveBOMDataToLocal(data.bom_data);
        displayBOM(data.bom_data);
    }
});

// Function to save BOM data to localStorage and emit updates
function saveBOMDataToLocal(bomData) {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));

    // Emit update to server
    socket.emit('bom_update', {team_number: teamNumber, bom_data: bomData});
}

// Function to get BOM Data from Local Storage
function getBOMDataFromLocal() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Function to fetch BOM Data from Server
async function fetchBOMDataFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            applyFilterAndDisplay(); // Use the current filter and view
        } else {
            console.error('Failed to retrieve BOM data:', data.error);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

// Function to apply the current filter and display the BOM data
function applyFilterAndDisplay() {
    const bomData = getBOMDataFromLocal();
    let filteredData = [];

    switch (currentFilter) {
        case 'All':
            filteredData = bomData;
            break;
        case 'InHouse':
            filteredData = bomData.filter(item => item.preProcess || item.Process1 || item.Process2);
            break;
        case 'COTS':
            filteredData = bomData.filter(item => !item.preProcess && !item.Process1 && !item.Process2);
            break;
        default:
            filteredData = bomData.filter(item => {
                const requiredQuantity = item.Quantity;

                if (currentFilter === item.preProcess) {
                    return (item.preProcessQuantity || 0) < requiredQuantity;
                } else if (currentFilter === item.Process1) {
                    return item.inProcess1 && (item.process1Quantity || 0) < requiredQuantity;
                } else if (currentFilter === item.Process2) {
                    return item.inProcess2 && (item.process2Quantity || 0) < requiredQuantity;
                } else {
                    return false;
                }
            });
    }

    displayBOM(filteredData);
    document.getElementById('bomTableContainer').style.display = 'block';
}

// Function to handle BOM filtering
function handleFilterBOM(filter) {
    currentFilter = filter; // Update the current filter
    applyFilterAndDisplay();
}

// Function to display BOM Data in Table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    if (!bomData || bomData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10">No parts found</td></tr>';
        return;
    }

    // Sort BOM data alphabetically by Part Name
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach((item) => {
        const row = document.createElement('tr');

        // Part Name
        row.innerHTML += `<td>${item["Part Name"] || 'N/A'}</td>`;
        // Description
        row.innerHTML += `<td>${item.Description || 'N/A'}</td>`;
        // Material
        row.innerHTML += `<td>${item.Material || 'N/A'}</td>`;
        // Quantity Required
        row.innerHTML += `<td>${item.Quantity || 'N/A'}</td>`;

        // Pre-Process
        row.innerHTML += `<td>${item.preProcess || 'N/A'}</td>`;
        // Pre-Process Quantity Counter
        row.innerHTML += `<td>${createQuantityCounter('preProcessQuantity', item["Part Name"], item.preProcessQuantity || 0)}</td>`;

        // Process 1
        row.innerHTML += `<td>${item.Process1 || 'N/A'}</td>`;
        // Process 1 Quantity Counter
        row.innerHTML += `<td>${createQuantityCounter('process1Quantity', item["Part Name"], item.process1Quantity || 0)}</td>`;

        // Process 2
        row.innerHTML += `<td>${item.Process2 || 'N/A'}</td>`;
        // Process 2 Quantity Counter
        row.innerHTML += `<td>${createQuantityCounter('process2Quantity', item["Part Name"], item.process2Quantity || 0)}</td>`;

        tableBody.appendChild(row);
    });

    // Attach event listeners for the quantity counters
    document.querySelectorAll('.quantity-decrement').forEach(button => {
        button.addEventListener('click', handleQuantityDecrement);
    });
    document.querySelectorAll('.quantity-increment').forEach(button => {
        button.addEventListener('click', handleQuantityIncrement);
    });
}

// Function to create quantity counter HTML
function createQuantityCounter(fieldName, partName, quantity) {
    return `
        <div class="quantity-counter">
            <button class="quantity-decrement" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}">-</button>
            <span class="quantity-value">${quantity}</span>
            <button class="quantity-increment" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}">+</button>
        </div>
    `;
}

// Function to handle quantity increment
function handleQuantityIncrement(event) {
    const partName = decodeURIComponent(event.target.getAttribute('data-part-name'));
    const field = event.target.getAttribute('data-field');
    const bomData = getBOMDataFromLocal();

    const item = bomData.find(item => item["Part Name"] === partName);
    if (!item) return;

    const maxQuantity = item.Quantity;
    item[field] = (item[field] || 0) + 1;
    if (item[field] > maxQuantity) {
        item[field] = maxQuantity;
    }

    // Check process progression
    checkProcessProgress(item);

    saveBOMDataToLocal(bomData);
    displayBOM(bomData);
}

// Function to handle quantity decrement
function handleQuantityDecrement(event) {
    const partName = decodeURIComponent(event.target.getAttribute('data-part-name'));
    const field = event.target.getAttribute('data-field');
    const bomData = getBOMDataFromLocal();

    const item = bomData.find(item => item["Part Name"] === partName);
    if (!item) return;

    item[field] = (item[field] || 0) - 1;
    if (item[field] < 0) {
        item[field] = 0;
    }

    // Check process progression
    checkProcessProgress(item);

    saveBOMDataToLocal(bomData);
    displayBOM(bomData);
}

// Function to check process progression
function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;

    // Pre-Process to Process 1
    if ((item.preProcess || item.preProcessQuantity !== undefined) && item.preProcessQuantity >= requiredQuantity) {
        // Move to Process 1
        item.inProcess1 = true;
    } else {
        item.inProcess1 = false;
        item.process1Quantity = 0; // Reset Process 1 quantity if pre-process is incomplete
    }

    // Process 1 to Process 2
    if ((item.Process1 || item.process1Quantity !== undefined) && item.process1Quantity >= requiredQuantity) {
        // Move to Process 2
        item.inProcess2 = true;
    } else {
        item.inProcess2 = false;
        item.process2Quantity = 0; // Reset Process 2 quantity if Process 1 is incomplete
    }
}

// Attach event listeners after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the login page
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log("Added Event Listener to loginForm");
    }

    // Check if we are on the registration page
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
        console.log("Added Event Listener to registerForm");
    }

    // If on dashboard, initialize dashboard
    if (document.getElementById('dashboard')) {
        initializeDashboard();
        console.log("Dashboard initialized");
    }
});
