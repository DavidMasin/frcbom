const API_BASE_URL = 'https://frcbom-production.up.railway.app';
let teamNumber = localStorage.getItem('team_number');

// Fetch BOM Data when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Fetching BOM data for team:', teamNumber);

    if (!teamNumber) {
        console.error('Team number is missing. Please log in.');
        return;
    }

    const bomData = await getBOMData();
    if (bomData.length > 0) {
        console.log('BOM data loaded successfully:', bomData);
        displayBOM(bomData);
    } else {
        console.log('No BOM data found for this team.');
    }
});

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

// Function to display BOM data in the table
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

// Button to manually fetch BOM data from Onshape and save it
document.getElementById('fetchBOMButton')?.addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    if (!documentUrl) {
        alert('Please enter an Onshape Document URL.');
        return;
    }

    const bomData = await fetchBOMFromOnshape(documentUrl);
    if (bomData) {
        await saveBOMData(bomData);
        displayBOM(bomData);
    }
});

// Function to fetch BOM data from Onshape (dummy function for testing)
async function fetchBOMFromOnshape(documentUrl) {
    console.log('Fetching BOM data from Onshape for URL:', documentUrl);
    // Replace this with your actual Onshape API integration
    return [
        { "Part Name": "Part1", "Description": "Test Part", "Material": "Aluminum", "Quantity": 10 },
        { "Part Name": "Part2", "Description": "Test Part 2", "Material": "Steel", "Quantity": 5 }
    ];
}

// Function to save BOM data to the server
async function saveBOMData(bomData) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/save_bom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_number: teamNumber, bom_data: bomData })
        });

        if (response.ok) {
            console.log('BOM data saved successfully.');
        } else {
            console.error('Failed to save BOM data.');
        }
    } catch (error) {
        console.error('Save BOM Data Error:', error);
    }
}

// Logout Function
document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});
