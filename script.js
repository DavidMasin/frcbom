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
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // Display team number in header
    document.getElementById('teamNumber').textContent = teamNumber;

    // Load saved BOM data from localStorage
    const savedBOMData = getSavedBOMData();
    if (savedBOMData) {
        console.log('Loaded saved BOM data:', savedBOMData);
        displayBOM(savedBOMData);
    }
});

// Function to handle fetching BOM data
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
            saveBOMData(data.bom_data);
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

// Function to save BOM data to localStorage
function saveBOMData(bomData) {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log('BOM data saved to localStorage for team:', teamNumber);
}

// Function to get saved BOM data from localStorage
function getSavedBOMData() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || null;
}

// Function to display BOM data in the table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    if (!bomData || bomData.length === 0) {
        alert('No BOM data available.');
        return;
    }

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
// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}
