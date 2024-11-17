// script.js

const API_BASE_URL = 'https://frcbom-production.up.railway.app'; // Replace with your API base URL

let teamNumber = localStorage.getItem('team_number') || '';
let currentFilter = 'All';

// Function to handle user login
async function handleLogin(event) {
    event.preventDefault();
    const teamNumberInput = document.getElementById('loginTeamNumber').value;
    const passwordInput = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumberInput, password: passwordInput })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', data.team_number);
            teamNumber = data.team_number;
            window.location.href = 'dashboard.html';
        } else {
            alert(`Login failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('An error occurred during login.');
    }
}

// Function to handle user registration
async function handleRegister(event) {
    event.preventDefault();
    const teamNumberInput = document.getElementById('registerTeamNumber').value;
    const passwordInput = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumberInput, password: passwordInput })
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

    // Fetch BOM data and display it
    const bomData = getBOMDataFromLocal();
    if (bomData && bomData.length > 0) {
        initializeBOMData(bomData);
        handleFilterBOM(currentFilter); // Display the BOM with the current filter
    } else {
        fetchBOMDataFromServer();
    }

    // Attach event listeners for buttons
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // Attach event listeners for filter buttons
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');
            handleFilterBOM(filter);
        });
    });

    // Initialize modal logic if applicable
    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
}

// Function to handle Fetch BOM from Onshape
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
            body: JSON.stringify({ document_url: documentUrl, team_number: teamNumber })
        });

        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            initializeBOMData(data.bom_data);
            handleFilterBOM(currentFilter); // Display the BOM with the current filter
            alert('BOM data fetched and saved successfully.');
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
}

// Function to handle user logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// Function to save BOM data to localStorage
function saveBOMDataToLocal(bomData) {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log('BOM data saved to localStorage for team:', teamNumber);
}

// Function to get BOM data from localStorage
function getBOMDataFromLocal() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Function to fetch BOM data from the server
async function fetchBOMDataFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            initializeBOMData(data.bom_data);
            handleFilterBOM(currentFilter); // Display the BOM with the current filter
        } else {
            console.error('Failed to retrieve BOM data from the server:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

// Function to initialize BOM data and set up process statuses
function initializeBOMData(bomData) {
    bomData.forEach(item => {
        // Normalize process names
        item.preProcess = item.preProcess ? item.preProcess.trim().toLowerCase() : '';
        item.Process1 = item.Process1 ? item.Process1.trim().toLowerCase() : '';
        item.Process2 = item.Process2 ? item.Process2.trim().toLowerCase() : '';

        // Initialize quantities
        item.preProcessQuantity = item.preProcessQuantity || 0;
        item.process1Quantity = item.process1Quantity || 0;
        item.process2Quantity = item.process2Quantity || 0;

        // Initialize completion and availability statuses
        item.preProcessCompleted = false;
        item.process1Completed = false;
        item.process2Completed = false;
        item.process1Available = false;
        item.process2Available = false;

        // Update process progression
        checkProcessProgress(item);
    });
}

// Function to check and update process progression
function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;

    // Check Pre-Process Completion
    if (item.preProcess) {
        item.preProcessQuantity = item.preProcessQuantity || 0;
        item.preProcessCompleted = item.preProcessQuantity >= requiredQuantity;
    } else {
        // If no Pre-Process, consider it completed by default
        item.preProcessCompleted = true;
    }

    // Check Process 1 Availability and Completion
    if (item.Process1) {
        item.process1Quantity = item.process1Quantity || 0;
        if (item.preProcessCompleted) {
            item.process1Available = true;
            item.process1Completed = item.process1Quantity >= requiredQuantity;
        } else {
            item.process1Available = false;
            item.process1Quantity = 0;
            item.process1Completed = false;
        }
    } else {
        // If no Process 1, consider it completed by default
        item.process1Completed = true;
        item.process1Available = true;
    }

    // Check Process 2 Availability and Completion
    if (item.Process2) {
        item.process2Quantity = item.process2Quantity || 0;
        if (item.process1Completed) {
            item.process2Available = true;
            item.process2Completed = item.process2Quantity >= requiredQuantity;
        } else {
            item.process2Available = false;
            item.process2Quantity = 0;
            item.process2Completed = false;
        }
    } else {
        // If no Process 2, consider it completed by default
        item.process2Completed = true;
        item.process2Available = true;
    }
}

// Function to handle filtering BOM data
function handleFilterBOM(filter) {
    currentFilter = filter;
    const bomData = getBOMDataFromLocal();
    let filteredData = [];

    const normalizedFilter = filter.trim().toLowerCase();

    filteredData = bomData.filter(item => {
        const itemPreProcess = item.preProcess || '';
        const itemProcess1 = item.Process1 || '';
        const itemProcess2 = item.Process2 || '';

        if (normalizedFilter === 'all') {
            return true;
        } else if (normalizedFilter === 'inhouse') {
            return !!(item.preProcess || item.Process1 || item.Process2);
        } else if (normalizedFilter === 'cots') {
            return !item.preProcess && !item.Process1 && !item.Process2;
        } else if (normalizedFilter === itemPreProcess) {
            // Include all items with this pre-process
            return true;
        } else if (normalizedFilter === itemProcess1) {
            // Include items available for Process 1
            return item.process1Available;
        } else if (normalizedFilter === itemProcess2) {
            // Include items available for Process 2
            return item.process2Available;
        } else {
            return false;
        }
    });

    displayBOM(filteredData);
    document.getElementById('bomTableContainer').style.display = 'block';
}

// Function to display BOM data in the table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    if (!bomData || bomData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="12">No parts found</td></tr>';
        return;
    }

    // Sort BOM data alphabetically by Part Name
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(item => {
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
        row.innerHTML += `<td>${createQuantityCounter('preProcessQuantity', item["Part Name"], item.preProcessQuantity || 0, item.preProcessCompleted, true)}</td>`;
        // Pre-Process Status
        row.innerHTML += `<td>${item.preProcessCompleted ? 'Completed' : 'In Progress'}</td>`;

        // Process 1
        row.innerHTML += `<td>${item.Process1 || 'N/A'}</td>`;
        // Process 1 Quantity Counter
        row.innerHTML += `<td>${createQuantityCounter('process1Quantity', item["Part Name"], item.process1Quantity || 0, item.process1Completed, item.process1Available)}</td>`;
        // Process 1 Status
        row.innerHTML += `<td>${item.process1Completed ? 'Completed' : (item.process1Available ? 'In Progress' : 'Not Available')}</td>`;

        // Process 2
        row.innerHTML += `<td>${item.Process2 || 'N/A'}</td>`;
        // Process 2 Quantity Counter
        row.innerHTML += `<td>${createQuantityCounter('process2Quantity', item["Part Name"], item.process2Quantity || 0, item.process2Completed, item.process2Available)}</td>`;
        // Process 2 Status
        row.innerHTML += `<td>${item.process2Completed ? 'Completed' : (item.process2Available ? 'In Progress' : 'Not Available')}</td>`;

        tableBody.appendChild(row);
    });

    // Attach event listeners for the quantity counters
    attachQuantityCounterEventListeners();
}

// Function to create quantity counter HTML
function createQuantityCounter(fieldName, partName, quantity, isCompleted, isAvailable = true) {
    const disabledClass = isAvailable ? '' : 'disabled';
    const completedClass = isCompleted ? 'completed' : '';

    return `
        <div class="quantity-counter ${disabledClass} ${completedClass}">
            <button class="quantity-decrement" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}" ${!isAvailable ? 'disabled' : ''}>-</button>
            <span class="quantity-value">${quantity}</span>
            <button class="quantity-increment" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}" ${!isAvailable ? 'disabled' : ''}>+</button>
        </div>
    `;
}

// Function to attach event listeners to quantity counters
function attachQuantityCounterEventListeners() {
    document.querySelectorAll('.quantity-decrement').forEach(button => {
        button.addEventListener('click', handleQuantityDecrement);
    });
    document.querySelectorAll('.quantity-increment').forEach(button => {
        button.addEventListener('click', handleQuantityIncrement);
    });
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

    // Update process progression
    checkProcessProgress(item);

    // Save updated BOM data
    saveBOMDataToLocal(bomData);

    // Update the display
    handleFilterBOM(currentFilter);
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

    // Update process progression
    checkProcessProgress(item);

    // Save updated BOM data
    saveBOMDataToLocal(bomData);

    // Update the display
    handleFilterBOM(currentFilter);
}

// Attach event listeners after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the login page
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    }

    // Check if we are on the registration page
    const registerButton = document.getElementById('registerButton');
    if (registerButton) {
        registerButton.addEventListener('click', handleRegister);
    }

    // If on dashboard, initialize dashboard
    if (document.getElementById('dashboard')) {
        initializeDashboard();
    }
});
