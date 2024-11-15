const API_BASE_URL = 'https://frcbom-production.up.railway.app';

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

// Display Team Number on Dashboard
document.addEventListener('DOMContentLoaded', () => {
    const teamNumber = localStorage.getItem('team_number');
    document.getElementById('teamNumber').textContent = teamNumber;
});

// Fetch BOM Data
async function fetchBOM(filter = null) {
    const token = localStorage.getItem('jwt_token');
    const response = await fetch(`${API_BASE_URL}/api/bom`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
    });

    const data = await response.json();
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = '';

    data.bom_data
        .filter(item => !filter || item.Process1 === filter)
        .forEach(item => {
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

// Dashboard Button Clicks
document.getElementById('fetchCNC')?.addEventListener('click', () => fetchBOM('CNC'));
document.getElementById('fetchLathe')?.addEventListener('click', () => fetchBOM('Lathe'));
document.getElementById('fetch3DPrinter')?.addEventListener('click', () => fetchBOM('3D Printer'));
document.getElementById('fetchAllParts')?.addEventListener('click', () => fetchBOM());

// Logout Function
document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

document.addEventListener('DOMContentLoaded', () => {
    displayGreeting();
});

// Display greeting message
function displayGreeting() {
    const teamNumber = localStorage.getItem('team_number');
    const greetingDiv = document.getElementById('greetingMessage');

    if (teamNumber) {
        greetingDiv.textContent = `Hello, Team ${teamNumber}`;
    } else {
        greetingDiv.textContent = '';
    }
}

// Registration function
document.getElementById('registerForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ team_number: teamNumber, password: password })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Registration successful!');
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during registration.');
    }
});

// Login function
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ team_number: teamNumber, password: password })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', data.team_number);
            alert('Login successful!');
            displayGreeting();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during login.');
    }
});

// Fetch BOM data
document.getElementById('bomForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const documentUrl = document.getElementById('documentUrl').value;
    const token = localStorage.getItem('jwt_token');

    try {
        const response = await fetch(`${API_BASE_URL}/api/bom`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ document_url: documentUrl })
        });

        const data = await response.json();
        if (response.ok) {
            const bomData = data.bom_data;
            document.getElementById('bomData').textContent = JSON.stringify(bomData, null, 2);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
});