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

    // If on dashboard, check login status
    if (document.getElementById('dashboard')) {
        checkLoginStatus();
        // Rest of your dashboard initialization code...
    }
});
