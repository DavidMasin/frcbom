const API_BASE_URL = 'https://frcbom-production.up.railway.app';

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