const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let socket; // Declare socket variable globally
let teamNumber = localStorage.getItem('team_number');

document.addEventListener('DOMContentLoaded', () => {
    // Initialize WebSocket connection
    try {
        socket = io('https://frcbom-production.up.railway.app');

        socket.on('connect', () => {
            console.log('WebSocket connection established.');
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });

        // Listen for real-time updates from the server
        socket.on('update_bom', (data) => {
            const { team_number, bom_data } = data;
            if (team_number === teamNumber) {
                console.log('Real-time BOM update received');
                displayBOM(bom_data);
            }
        });
    } catch (error) {
        console.error('Socket.IO Initialization Error:', error);
    }

    // Update team number text
    const teamNumberElement = document.getElementById('teamNumber');

    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    } else {
        console.warn('Element #teamNumber not found or team number is missing.');
    }
});

// Redirect to registration page
document.getElementById('registerButton')?.addEventListener('click', () => {
    window.location.href = 'register.html';
});

// Handle Login
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

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
    }
});

// Fetch BOM Data from Onshape Document URL
document.getElementById('fetchBOMButton')?.addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    const token = localStorage.getItem('jwt_token');

    if (!documentUrl) {
        alert('Please enter an Onshape Document URL.');
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
            displayBOM(data.bom_data);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
});

// Function to fetch BOM data and update the table
async function fetchBOMData(documentUrl = null) {
    const token = localStorage.getItem('jwt_token');

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
            displayBOM(data.bom_data);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
    }
}

// Display BOM data in the table
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    bomData.forEach(item => {
        const row = `<tr>
            <td>${item["Part Name"]}</td>
            <td>${item.Description || 'N/A'}</td>
            <td>${item.Material}</td>
            <td>${item.Quantity}</td>
            <td>${item.preProcess || 'N/A'}</td>
            <td>${item.Process1 || 'N/A'}</td>
            <td>${item.Process2 || 'N/A'}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

// Logout Function
document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

// Handle Registration
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

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
            document.getElementById('registerMessage').textContent = 'Registration successful! You can now sign in.';
            document.getElementById('registerMessage').style.color = 'green';
        } else {
            document.getElementById('registerMessage').textContent = `Error: ${data.error}`;
            document.getElementById('registerMessage').style.color = 'red';
        }
    } catch (error) {
        console.error('Registration Error:', error);
        document.getElementById('registerMessage').textContent = 'An error occurred during registration.';
        document.getElementById('registerMessage').style.color = 'red';
    }
});

// Redirect to Sign In page
document.getElementById('backToLogin')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});
