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

// Function to save BOM Data to Local Storage
function saveBOMDataToLocal(bomData) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
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

// Function to handle BOM Filtering
function handleFilterBOM(filter) {
    const bomData = getBOMDataFromLocal();
    let filteredData;

    if (filter === 'All') {
        filteredData = bomData;
    } else {
        filteredData = bomData.filter(item => {
            const preProcessDone = item.preProcessDone || false;
            return (
                (filter === item.Process1 && preProcessDone) ||
                filter === item.Process2 ||
                filter === item.preProcess
            );
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
        tableBody.innerHTML = '<tr><td colspan="7">No parts found</td></tr>';
        return;
    }

    // Sort BOM data alphabetically by Part Name
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(item => {
        const row = `<tr>
            <td>${item["Part Name"] || 'N/A'}</td>
            <td>${item.Description || 'N/A'}</td>
            <td>${item.Material || 'N/A'}</td>
            <td>${item.Quantity || 'N/A'}</td>
            <td>${item.preProcess || 'N/A'}</td>
            <td>${item.Process1 || 'N/A'}</td>
            <td>${item.Process2 || 'N/A'}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
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
