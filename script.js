const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number');

// Function to check if the user is logged in
function checkLoginStatus() {
    teamNumber = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');

    // If team number or token is missing, redirect to login page
    if (!teamNumber || !token) {
        alert('You are not logged in.');
        window.location.href = 'index.html';
    }
}

// Ensure the check only runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    checkLoginStatus();

    // Display the team number in the header
    const teamNumberElement = document.getElementById('teamNumber');
    if (teamNumberElement && teamNumber) {
        teamNumberElement.textContent = teamNumber;
    }

    // Attach event listeners
    document.getElementById('fetchBOMButton')?.addEventListener('click', handleFetchBOM);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => handleFilterBOM(button.getAttribute('data-filter')));
    });
});

// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// Display team number
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('teamNumber').textContent = teamNumber;

    // Attach event listeners
    const fetchBOMButton = document.getElementById('fetchBOMButton');
    const logoutButton = document.getElementById('logoutButton');
    const settingsButton = document.getElementById('settingsButton');
    const filterButtons = document.querySelectorAll('.filter-button');

    // Check if elements exist before adding event listeners
    fetchBOMButton?.addEventListener('click', handleFetchBOM);
    logoutButton?.addEventListener('click', handleLogout);
    settingsButton?.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
    });

    // Attach event listeners for filter buttons
    filterButtons.forEach(button => {
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
});

// Handle Fetch BOM
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
            saveBOMDataToLocal(data.bom_data);
            displayBOM(data.bom_data);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching BOM data.');
    }
}

// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// Save BOM Data to Local Storage
function saveBOMDataToLocal(bomData) {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    bomDict[teamNumber] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log('BOM data saved to localStorage for team:', teamNumber);
}

// Get BOM Data from Local Storage
function getBOMDataFromLocal() {
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber] || [];
}

// Fetch BOM Data from Server
async function fetchBOMDataFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}`);
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data);
            displayBOM(data.bom_data);
        } else {
            console.error('Failed to retrieve BOM data:', data.error);
        }
    } catch (error) {
        console.error('Fetch BOM Data Error:', error);
    }
}

// Handle BOM Filtering
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

// Display BOM Data in Table
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
