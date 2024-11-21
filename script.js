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
function handleFilterBOM(filter) {
    const bomData = getBOMDataFromLocal();
    let filteredData;

    // Save the current filter to localStorage
    localStorage.setItem('current_filter', filter);

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
    console.log("Loading content")
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
            const savedFilter = localStorage.getItem('current_filter') || 'InHouse';
            saveBOMDataToLocal(data.bom_data)
            handleFilterBOM(savedFilter)
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

    saveBOMDataToServer(bomData).then(r =>{} );
}

// Function to get BOM data from localStorage
function getBOMDataFromLocal() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Fetch BOM Data and Save to Local Storage
document.getElementById('fetchBOMButton')?.addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    const access_key = document.getElementById("accessKey").value;
    const secret_key = document.getElementById("secretKey").value;

    const token = localStorage.getItem('jwt_token');

    if (!documentUrl) {
        alert('Please enter a URL.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({
                document_url: documentUrl,
                team_number: teamNumber,
                access_key: access_key,
                secret_key: secret_key
            })
        });

        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            displayBOMAsButtons(data.bom_data);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
});

// Function to display BOM data as buttons
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    gridContainer.innerHTML = ''; // Clear previous content
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));
    bomData.forEach(part => {
        const currentProcess = determineCurrentProcess(part);

        // Create part button
        const button = document.createElement('div');
        button.classList.add('part-button');
        button.dataset.partName = part["Part Name"];

        // Populate button content
        button.innerHTML = `
            <h3>${part["Part Name"]}</h3>
            <p><strong>Material:</strong> ${part.Material || 'N/A'}</p>
            <p><strong>Description:</strong> ${part.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${part.Quantity || 'N/A'}</p>
            <p><strong>Current Process:</strong> ${currentProcess.name} (${currentProcess.remaining} left)</p>
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
    modalBody.innerHTML = '';

    // Populate modal with editable fields for the part
    if (part.preProcess) {
        modalBody.innerHTML += `
            <label for="preProcessQty">Pre-Process (${part.preProcess}):</label>
            <input type="number" id="preProcessQty" value="${part.preProcessQuantity || 0}" min="0">
        `;
    }
    if (part.Process1) {
        modalBody.innerHTML += `
            <label for="process1Qty">Process 1 (${part.Process1}):</label>
            <input type="number" id="process1Qty" value="${part.process1Quantity || 0}" min="0">
        `;
    }
    if (part.Process2) {
        modalBody.innerHTML += `
            <label for="process2Qty">Process 2 (${part.Process2}):</label>
            <input type="number" id="process2Qty" value="${part.process2Quantity || 0}" min="0">
        `;
    }

    // Show the modal
    modal.style.display = 'flex';

    // Save changes
    saveButton.onclick = () => savePartQuantities(part);
}

// Function to save quantities and update the BOM data
function savePartQuantities(part) {
    const preProcessQty = document.getElementById('preProcessQty')?.value || part.preProcessQuantity || 0;
    const process1Qty = document.getElementById('process1Qty')?.value || part.process1Quantity || 0;
    const process2Qty = document.getElementById('process2Qty')?.value || part.process2Quantity || 0;

    // Update the part's quantities
    part.preProcessQuantity = parseInt(preProcessQty, 10);
    part.process1Quantity = parseInt(process1Qty, 10);
    part.process2Quantity = parseInt(process2Qty, 10);
    console.log(part)
    // Save updated data to localStorage or server
    saveBOMDataToLocal(getBOMDataFromLocal());

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

// Function to determine the current process and remaining quantity
function determineCurrentProcess(part) {
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
    // Retrieve the JWT token from localStorage
    const jwtToken = localStorage.getItem('jwt_token');
    const teamNumber = localStorage.getItem('team_number');

    // If no token or team number is found, redirect to the login page
    if (!jwtToken || !teamNumber) {
        alert('You are not logged in. Redirecting to the login page.');
        window.location.href = 'index.html'; // Replace with your login page path if different
    }



}


// Function to initialize the dashboard
function initializeDashboard() {
    checkLoginStatus();

    teamNumber = localStorage.getItem('team_number');

    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    const bomData = getBOMDataFromLocal();
    console.log("bomData: " + bomData)
    if (bomData && bomData.length > 0) {
        const savedFilter = localStorage.getItem('current_filter') || 'InHouse';
        console.log("savedFilter: " + savedFilter)
        handleFilterBOM(savedFilter);
    } else {
        const savedFilter = localStorage.getItem('current_filter') || 'InHouse';
        fetchBOMDataFromServer().then(r => handleFilterBOM(savedFilter));

    }

    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // Attach event listeners for filter buttons
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');
            handleFilterBOM(filter);
        });
    });


    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
}


// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#0056b3'; // Hover effect
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#007BFF'; // Revert back
    });
});