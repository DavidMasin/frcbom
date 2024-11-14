// Replace with your actual backend URL from Railway
const API_BASE_URL = 'https://frcbom-production.up.railway.app';

// Helper function to display messages
function displayMessage(message) {
    alert(message);
}

// Registration Function
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    console.log('API_BASE_URL:', API_BASE_URL);

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                team_number: teamNumber,
                password: password
            })
        });

        const data = await response.json();
        if (response.ok) {
            displayMessage('Registration successful!');
        } else {
            displayMessage(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        displayMessage('An error occurred during registration.');
    }
});

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
            body: JSON.stringify({
                team_number: teamNumber,
                password: password
            })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', data.team_number);
            displayMessage('Login successful!');
            displayGreeting(); // Call the function to display the greeting
        } else {
            displayMessage(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        displayMessage('An error occurred during login.');
    }
});
function displayGreeting() {
    const teamNumber = localStorage.getItem('team_number');
    const greetingDiv = document.getElementById('greetingMessage');

    if (teamNumber) {
        greetingDiv.textContent = `Hello, Team ${teamNumber}`;
    } else {
        greetingDiv.textContent = '';
    }
}
document.addEventListener('DOMContentLoaded', () => {
    displayGreeting();
});
// Fetch BOM Data
document.getElementById('bomForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const documentUrl = document.getElementById('documentUrl').value;
    const token = localStorage.getItem('jwt_token');

    if (!token) {
        displayMessage('Please log in first.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/bom`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                document_url: documentUrl
            })
        });

        const data = await response.json();
        if (response.ok) {
            document.getElementById('bomData').textContent = JSON.stringify(data, null, 2);
        } else {
            displayMessage(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        displayMessage('An error occurred while fetching BOM data.');
    }
});

// Fetch Dashboard Data
document.getElementById('fetchDashboard').addEventListener('click', async function() {
    const token = localStorage.getItem('jwt_token');

    if (!token) {
        displayMessage('Please log in first.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            // Display dashboard data
            const dashboardDiv = document.getElementById('dashboard');
            dashboardDiv.innerHTML = ''; // Clear previous data

            for (const processType in data) {
                const parts = data[processType];
                const processHeader = document.createElement('h3');
                processHeader.textContent = processType;
                dashboardDiv.appendChild(processHeader);

                parts.forEach(part => {
                    const partDiv = document.createElement('div');
                    partDiv.textContent = `Part Name: ${part.name}, Status: ${part.status}`;
                    dashboardDiv.appendChild(partDiv);
                });
            }
        } else {
            displayMessage(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error:', error);
        displayMessage('An error occurred while fetching dashboard data.');
    }

});
