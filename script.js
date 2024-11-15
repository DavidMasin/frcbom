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

// Handle Fetch BOM
async function handleFetchBOM() {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    if (!documentUrl) {
        alert('Please enter an Onshape Document URL.');
        return;
    }

    const bomData = await fetchBOMFromOnshape(documentUrl);
    await saveBOMData(bomData);
    displayBOM(bomData);
}

// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}
