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

            // Redirect to the new URL structure
            const newUrl = `/${teamNumber}/InHouse/All`;
            window.location.href = newUrl;
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

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    console.log('Team Number:', teamNumber);
    console.log('Password:', password);
    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password: password})
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
        console.log("Added Event Listener to registerForm");
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

    // Parse the URL path
    const pathSegments = window.location.pathname.split('/').filter(segment => segment !== '');
    const teamNumber = localStorage.getItem('team_number');

    // Verify that the team number in the URL matches the logged-in user's team number
    if (pathSegments[0] && pathSegments[0] !== teamNumber) {
        alert('Invalid team number in URL.');
        window.location.href = `/${teamNumber}/InHouse/All`;
        return;
    }

    const initialView = pathSegments[1] || 'InHouse';
    const initialFilter = pathSegments[2] || 'All';

    // Set current view and filter
    currentView = initialView;
    currentFilter = initialFilter;

    // Display the team number in the header
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    // Attach event listeners (as previously described)
    // ...

    // Fetch BOM data and apply the initial filter and view
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

    // Emit update to server
    socket.emit('bom_update', {team_number: teamNumber, bom_data: bomData});
}


// Function to save BOM data to server
async function saveBOMDataToServer(bomData) {
    const teamNumber = localStorage.getItem('team_number');
    try {
        const response = await fetch(`${API_BASE_URL}/api/save_bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, bom_data: bomData})
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
            applyFilterAndDisplay(); // Use the current filter and view
        } else {
            console.error('Failed to retrieve BOM data:', data.error);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

function applyFilterAndDisplay() {
    const bomData = getBOMDataFromLocal();
    let filteredData = [];

    function handleFilterBOM(filter) {
        const bomData = getBOMDataFromLocal();
        let filteredData = [];

        switch (filter) {
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

                    if (filter === item.preProcess) {
                        return (item.preProcessQuantity || 0) < requiredQuantity;
                    } else if (filter === item.Process1) {
                        return item.inProcess1 && (item.process1Quantity || 0) < requiredQuantity;
                    } else if (filter === item.Process2) {
                        return item.inProcess2 && (item.process2Quantity || 0) < requiredQuantity;
                    } else {
                        return false;
                    }
                });
        }
        const teamNumber = localStorage.getItem('team_number');
        const newUrl = `/${teamNumber}/${currentView}/${currentFilter}`;
        history.pushState(null, '', newUrl);

        applyFilterAndDisplay();
        displayBOM(filteredData);
        document.getElementById('bomTableContainer').style.display = 'block';
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

    function handleViewChange(view) {
        currentView = view;

        // Update the URL without reloading the page
        const teamNumber = localStorage.getItem('team_number');
        const newUrl = `/${teamNumber}/${currentView}/${currentFilter}`;
        history.pushState(null, '', newUrl);

        applyFilterAndDisplay();
    }

    window.addEventListener('popstate', (event) => {
        const pathSegments = window.location.pathname.split('/').filter(segment => segment !== '');
        const teamNumber = localStorage.getItem('team_number');

        // Verify the team number
        if (pathSegments[0] && pathSegments[0] !== teamNumber) {
            alert('Invalid team number in URL.');
            window.location.href = `/${teamNumber}/InHouse/All`;
            return;
        }

        currentView = pathSegments[1] || 'InHouse';
        currentFilter = pathSegments[2] || 'All';

        applyFilterAndDisplay();
    });

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

    function createQuantityCounter(fieldName, partName, quantity) {
        return `
        <div class="quantity-counter">
            <button class="quantity-decrement" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}">-</button>
            <span class="quantity-value">${quantity}</span>
            <button class="quantity-increment" data-part-name="${encodeURIComponent(partName)}" data-field="${fieldName}">+</button>
        </div>
    `;
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
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            initializeDashboard();
        }
    });
}
