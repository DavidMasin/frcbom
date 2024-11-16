const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number');

document.addEventListener('DOMContentLoaded', () => {
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
});

// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, password })
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

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, password })
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
            body: JSON.stringify({ document_url: documentUrl, team_number: teamNumber })
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, bom_data: bomData })
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ document_url: documentUrl, team_number: teamNumber })
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

// Filter BOM Data based on selected process
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.getAttribute('data-filter');
        const bomData = getBOMDataFromLocal();
        let filteredData;

        if (filter === 'All') {
            filteredData = bomData;
        } else {
            filteredData = bomData.filter(item => item.Process1 === filter || item.Process2 === filter);
        }

        displayBOM(filteredData);
    });
});

// Function to display and sort BOM data in the table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    if (!bomData || bomData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">No parts found</td></tr>';
        return;
    }

    // Sort the BOM data alphabetically by Part Name (A-Z)
    bomData.sort((a, b) => {
        const partNameA = (a["Part Name"] || '').toUpperCase();
        const partNameB = (b["Part Name"] || '').toUpperCase();
        return partNameA.localeCompare(partNameB);
    });

    // Populate the table with sorted data
    bomData.forEach(item => {
        const row = `<tr>
            <td>${item["Part Name"] || 'N/A'}</td>
            <td>${item.Description || 'N/A'}</td>
            <td>${item.materialBOM || 'N/A'}</td>
            <td>${item.Quantity || 'N/A'}</td>
            <td>${item.preProcess || 'N/A'}</td>
            <td>${item.Process1 || 'N/A'}</td>
            <td>${item.Process2 || 'N/A'}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}
// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}