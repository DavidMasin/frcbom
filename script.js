const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number');

// Check if we are on a protected page (e.g., `dashboard.html`)
const currentPage = window.location.pathname;

if (currentPage.includes('dashboard.html') && !teamNumber) {
    alert('You are not logged in. Redirecting to login page...');
    window.location.href = 'index.html';
}

// Initialize WebSocket connection
document.addEventListener('DOMContentLoaded', () => {
    let socket;
    try {
        socket = io(API_BASE_URL);

        socket.on('connect', () => {
            console.log('WebSocket connection established.');
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });
    } catch (error) {
        console.error('Socket.IO Initialization Error:', error);
    }

    // Fetch and display BOM data if on the dashboard page
    if (currentPage.includes('dashboard.html')) {
        fetchAndDisplayBOMData();
    }
});

// Fetch BOM Data and Display it
async function fetchAndDisplayBOMData() {
    const bomData = await getBOMData();
    if (bomData.length > 0) {
        console.log('BOM data loaded successfully:', bomData);
        displayBOM(bomData);
    } else {
        console.log('No BOM data found for this team.');
    }
}

// Function to fetch BOM data from the server
async function getBOMData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            return data.bom_data;
        } else {
            console.error('Failed to retrieve BOM data:', data.error);
            return [];
        }
    } catch (error) {
        console.error('Get BOM Data Error:', error);
        return [];
    }
}

// Display BOM Data
function displayBOM(bomData) {
    const tableBody = document.querySelector('#bomTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    bomData.forEach(item => {
        const row = `<tr>
            <td>${item["Part Name"]}</td>
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

// Logout Function
document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

// Redirect to registration page
document.getElementById('registerButton')?.addEventListener('click', () => {
    window.location.href = 'register.html';
});
