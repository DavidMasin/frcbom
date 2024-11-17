const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number');


// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password})
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNumber);
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('loginMessage').textContent = data.error;
        }
    } catch (error) {
        console.error('Login Error:', error);
        document.getElementById('loginMessage').textContent = 'Login failed.';
    }
}

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
// Function to handle filtering BOM data
function handleFilterBOM(filter) {
    const bomData = getBOMDataFromLocal();
    let filteredData;

    // Normalize the filter string
    const normalizedFilter = filter.trim().toLowerCase();
    // Apply filtering based on the selected filter
    switch (normalizedFilter) {
        case 'all':
            // Show all parts
            filteredData = bomData;
            break;

        case 'cots':
            // Show only COTS parts (no pre-process, process 1, or process 2 defined)
            filteredData = bomData.filter(item =>
                !item.preProcess && !item.Process1 && !item.Process2
            );
            break;

        case 'inhouse':
            // Show only in-house parts (with any pre-process, process 1, or process 2 defined)
            filteredData = bomData.filter(item =>
                item.preProcess || item.Process1 || item.Process2
            );
            break;

        case 'pre-process':
            // Show parts that require a pre-process step and are not completed
            filteredData = bomData.filter(item =>
                item.preProcess && !item.preProcessCompleted
            );
            break;

        case 'process1':
            // Show parts available for Process 1 (pre-process must be completed)
            filteredData = bomData.filter(item =>
                item.Process1 && item.preProcessCompleted && !item.process1Completed
            );
            break;

        case 'process2':
            // Show parts available for Process 2 (Process 1 must be completed)
            filteredData = bomData.filter(item =>
                item.Process2 && item.process1Completed && !item.process2Completed
            );
            break;

        default:
            // Custom filter based on specific process names (e.g., CNC, Lathe, Gerung)
            console.log("WENT TO DEFAULT!!")
            filteredData = bomData.filter(item =>
                (item.preProcess?.toLowerCase() === normalizedFilter) ||
                (item.Process1?.toLowerCase() === normalizedFilter && item.preProcessCompleted) ||
                (item.Process2?.toLowerCase() === normalizedFilter && item.process1Completed)
            );
            break;
    }

    // Display the filtered BOM data
    console.log(filteredData)

    displayBOM(filteredData);
    console.log("Displayed BOM")
}

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password})
        });

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

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dashboard')) {
        initializeDashboard();
        console.log("Dashboard initialized");
    }
    // Attach event listeners
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('registerButton')?.addEventListener('click', () => {
        window.location.href = 'register.html';
    });
    document.getElementById('backToLogin')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);

    // Display team number in header
    if (document.getElementById('teamNumber')) {
        document.getElementById('teamNumber').textContent = teamNumber || '';
    }

    // Fetch BOM data from the server on page load (if applicable)
    if (window.location.pathname.includes('dashboard.html')) {
        fetchBOMDataFromServer();
    }

    // Modal Logic (move inside DOMContentLoaded)
    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
});

// Function to handle fetching BOM data from Onshape
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
            console.log('Fetched BOM data:', data.bom_data);
            await saveBOMDataToServer(data.bom_data);
            displayBOM(data.bom_data);
        } else {
            console.error('Failed to fetch BOM data:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
}

// Function to save BOM data to the server
async function saveBOMDataToServer(bomData) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/save_bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, bom_data: bomData})
        });

        if (response.ok) {
            console.log('BOM data saved to the server successfully.');
        } else {
            console.error('Failed to save BOM data to the server.');
        }
    } catch (error) {
        console.error('Save BOM Data Error:', error);
    }
}

// Function to fetch BOM data from the server
async function fetchBOMDataFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            console.log('Loaded BOM data from the server:', data.bom_data);
            displayBOM(data.bom_data);
        } else {
            console.error('Failed to retrieve BOM data from the server:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

// Display team number
document.getElementById('teamNumber').textContent = teamNumber;

// Modal Logic
const modal = document.getElementById('settingsModal');
const settingsButton = document.getElementById('settingsButton');
const closeButton = document.querySelector('.close');

settingsButton.addEventListener('click', () => modal.style.display = 'flex');
closeButton.addEventListener('click', () => modal.style.display = 'none');


// Function to save BOM data to localStorage
function saveBOMDataToLocal(bomData) {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log('BOM data saved to localStorage for team:', teamNumber);

    saveBOMDataToServer(bomData);
}

// Function to get BOM data from localStorage
function getBOMDataFromLocal() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Fetch BOM Data and Save to Local Storage
document.getElementById('fetchBOMButton')?.addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    const token = localStorage.getItem('jwt_token');

    if (!documentUrl) {
        alert('Please enter a URL.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({document_url: documentUrl, team_number: teamNumber})
        });

        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            displayBOM(data.bom_data);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
});



// Function to display and sort BOM data in the table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));
    console.log("LENGTH:")
    console.log(bomData.length)
    if (!bomData || bomData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10">No parts found</td></tr>';
        console.log("BROKE!!")
        return;
    }

    // Sort BOM data alphabetically by Part Name
    console.log("BOM DATA:")
    console.log(bomData)
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
    attachQuantityCounterEventListeners();
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

function attachQuantityCounterEventListeners() {
    document.querySelectorAll('.quantity-decrement').forEach(button => {
        button.addEventListener('click', handleQuantityDecrement);
    });
    document.querySelectorAll('.quantity-increment').forEach(button => {
        button.addEventListener('click', handleQuantityIncrement);
    });
}

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
    checkProcessProgress(item);

    // Save updated BOM data
    saveBOMDataToLocal(bomData);

    // Update the display
    displayBOM(bomData);
}

// Function to initialize the dashboard
function initializeDashboard() {
    // Ensure the user is logged in
    checkLoginStatus();

    // Update the team number variable
    teamNumber = localStorage.getItem('team_number');

    // Display the team number in the header
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    // Fetch BOM data and display it
    const bomData = getBOMDataFromLocal();
    if (bomData && bomData.length > 0) {
        // If BOM data exists in localStorage, display it
        displayBOM(bomData);
    } else {
        // If no BOM data in localStorage, fetch from the server
        fetchBOMDataFromServer();
    }

    // Attach event listeners for buttons
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // Attach event listeners for filter buttons (if you have any)
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');
            handleFilterBOM(filter);
        });
    });

    // Initialize modal logic (if applicable)
    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
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
    checkProcessProgress(item);

    // Save updated BOM data
    saveBOMDataToLocal(bomData);

    // Update the display
    displayBOM(bomData);
}

// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}