const API_BASE_URL = 'https://frcbom-production.up.railway.app/';
let teamNumber = localStorage.getItem('team_number');

function parseURL() {
    const path = window.location.pathname;
    const pathSegments = path.split('/').filter(segment => segment !== '');
    const params = {};

    if (pathSegments.length >= 2) {
        params.teamNumber = pathSegments[0];
        if (pathSegments[1]==="Admin")
        {
            params.admin=true
            params.robotName = pathSegments[2];
            params.system = pathSegments[3] || 'Main';
        }
        else
        {
            params.admin=false
            params.robotName = pathSegments[1];
            params.system = pathSegments[2] || 'Main';
        }
    } else {
        params.teamNumber = pathSegments[0];
        params.admin=false
        params.robotName = null;
        params.system = 'Main';
    }
    console.log("Params: ", params)
    return params;
}


async function handlePasswordSubmit() {
    const password = document.getElementById('passwordPromptInput').value;
    const teamNumber = localStorage.getItem('team_number');

    if (!password || !teamNumber) {
        alert('Please enter a password');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password})
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            // Remove the overlay
            const overlay = document.getElementById('passwordOverlay');
            overlay.remove();
            // Remove blur from background
            document.body.style.filter = 'none';
            // Proceed to initialize the dashboard
            initializeDashboard();
        } else {
            alert('Incorrect password');
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('An error occurred while logging in.');
    }
}

function showPasswordPrompt() {
    return new Promise((resolve, reject) => {
        // Create the overlay element
        const overlay = document.createElement('div');
        overlay.id = 'passwordOverlay';
        overlay.className = 'modal'; // Use your existing modal styling
        overlay.style.display = 'flex';

        // Create the modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        // Close button (optional)
        const closeButton = document.createElement('span');
        closeButton.className = 'close';
        closeButton.innerHTML = '&times;';
        closeButton.onclick = () => {
            overlay.style.display = 'none';
            document.body.style.filter = 'none';
        };

        // Prompt message
        const promptText = document.createElement('h2');
        promptText.textContent = 'Please enter your password to access the dashboard';

        // Password input field
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'passwordPromptInput';
        passwordInput.placeholder = 'Password';
        passwordInput.style.width = '80%';
        passwordInput.style.padding = '10px';
        passwordInput.style.marginTop = '20px';

        // Submit button
        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit';
        submitButton.className = 'button-primary';
        submitButton.style.marginTop = '20px';

        submitButton.addEventListener('click', handlePasswordSubmit);

        // Append elements to modal content
        modalContent.appendChild(closeButton);
        modalContent.appendChild(promptText);
        modalContent.appendChild(passwordInput);
        modalContent.appendChild(submitButton);

        // Append modal content to overlay
        overlay.appendChild(modalContent);

        // Append overlay to body
        document.body.appendChild(overlay);

        // Blur the background content
        // document.body.style.filter = 'blur(5px)';

        async function handlePasswordSubmit() {
            const password = document.getElementById('passwordPromptInput').value;
            const teamNumber = localStorage.getItem('team_number');

            if (!password || !teamNumber) {
                alert('Please enter a password');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}api/login`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({team_number: teamNumber, password})
                });

                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('jwt_token', data.access_token);
                    // Remove the overlay
                    const overlay = document.getElementById('passwordOverlay');
                    overlay.remove();
                    // Remove blur from background
                    document.body.style.filter = 'none';
                    resolve(); // Resolve the Promise
                } else {
                    alert('Incorrect password');
                    reject(); // Reject the Promise
                }
            } catch (error) {
                console.error('Login Error:', error);
                alert('An error occurred while logging in.');
                reject(); // Reject the Promise
            }
        }

        // ... existing code to create the modal ...

        // Attach event listener to the submit button
        submitButton.addEventListener('click', handlePasswordSubmit);

        // Append elements and show the modal
        // ... existing code ...

        // Close button handler to reject the Promise
        closeButton.onclick = () => {
            overlay.style.display = 'none';
            document.body.style.filter = 'none';
            reject(); // Reject the Promise
        };
    });

}

// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    const teamNumber = document.getElementById('loginTeamNumber').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({team_number: teamNumber, password}),
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwt_token', data.access_token);
            localStorage.setItem('team_number', teamNumber);

            // Check if General Admin
            if (teamNumber === "0000") {
                window.location.href = '/admin_dashboard.html'; // Redirect to admin dashboard
            } else {
                if (data.isAdmin) {
                    window.location.href = `/${teamNumber}/Admin`
                    localStorage.setItem("role","Admin")
                } else {
                    window.location.href = `/${teamNumber}`;
                    localStorage.setItem("role","User")
                }

            }
        } else {
            document.getElementById('loginMessage').textContent = data.error;
        }
    } catch (error) {
        console.error('Login Error:', error);
        document.getElementById('loginMessage').textContent = 'Login failed.';
    }
}


function getPartStatus(part) {
    if (!part.preProcessQuantity && !part.process1Quantity && !part.process2Quantity) {
        return 'not-started'; // RED
    } else if (part.preProcessCompleted && part.process1Completed && part.process2Completed) {
        return 'completed'; // GREEN
    } else {
        return 'in-progress'; // YELLOW
    }
}

function checkProcessProgress(item) {
    const requiredQuantity = item.Quantity;
    // console.log("PLACER3: item: " + item)
    // Check Pre-Process Completion
    if (item.preProcess) {
        item.preProcessQuantity = item.preProcessQuantity || 0;
        item.preProcessCompleted = item.preProcessQuantity >= requiredQuantity;
    } else {
        // If no Pre-Process, consider it completed by default
        item.preProcessCompleted = true;
    }

    // Check Process 1 Completion
    if (item.Process1) {
        item.process1Quantity = item.process1Quantity || 0;
        // Process 1 can only start if Pre-Process is completed
        if (item.preProcessCompleted) {
            item.process1Available = true;
            item.process1Completed = item.process1Quantity >= requiredQuantity;
        } else {
            item.process1Available = false;
            item.process1Quantity = 0;  // Reset quantity if not available
            item.process1Completed = false;
        }
    } else {
        // If no Process 1, consider it completed by default
        item.process1Completed = true;
    }

    // Check Process 2 Completion
    if (item.Process2) {
        item.process2Quantity = item.process2Quantity || 0;
        // Process 2 can only start if Process 1 is completed
        if (item.process1Completed) {
            item.process2Available = true;
            item.process2Completed = item.process2Quantity >= requiredQuantity;
        } else {
            item.process2Available = false;
            item.process2Quantity = 0;  // Reset quantity if not available
            item.process2Completed = false;
        }
    } else {
        // If no Process 2, consider it completed by default
        item.process2Completed = true;
    }
}

document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.getAttribute('data-filter');
        handleFilterBOM(filter);
    });
});

// Function to handle filtering BOM data
function handleFilterBOM(filter) {
    const robotName = localStorage.getItem('robot_name');
    let systemSelect
    if (document.getElementById("systemSelect")) {
        systemSelect = document.getElementById("systemSelect").value;
        console.log("Debug system1 ", systemSelect)
    } else {
        systemSelect = "Main"
        console.log("Debug system2 ", systemSelect)
    }
    const bomData = getBOMDataFromLocal(robotName, systemSelect);
    let filteredData;
    console.log("BOM DATA3: ", bomData)

    // Save the current filter to localStorage
    localStorage.setItem('current_filter', filter);
    console.log("The filter is: " + filter)
    // Update process completion states
    bomData.forEach((item) => {
        checkProcessProgress(item);
    });
    // Normalize the filter string
    const normalizedFilter = filter.trim().toLowerCase();
    console.log("normalizedFilter: ", normalizedFilter)
    console.log("BOM DATA2: ", bomData)
    // Apply filtering based on the selected filter
    switch (normalizedFilter) {
        case 'all':
            filteredData = bomData;
            break;
        case 'cots':
            console.log("IN COTS")
            filteredData = bomData.filter(item =>
                !item.preProcess && !item.Process1 && !item.Process2
            );
            break;
        case 'inhouse':
            filteredData = bomData.filter(item =>
                item.preProcess || item.Process1 || item.Process2
            );
            break;
        case 'pre-process':
            filteredData = bomData.filter(item =>
                item.preProcess && !item.preProcessCompleted
            );
            break;
        case 'process1':
            filteredData = bomData.filter(item =>
                item.Process1 && item.preProcessCompleted && !item.process1Completed
            );
            break;
        case 'process2':
            filteredData = bomData.filter(item =>
                item.Process2 && item.process1Completed && !item.process2Completed
            );
            break;
        default:
            filteredData = bomData.filter(item =>
                (item.preProcess?.toLowerCase() === normalizedFilter && !item.preProcessCompleted) ||
                (item.Process1?.toLowerCase() === normalizedFilter && item.preProcessCompleted && !item.process1Completed) ||
                (item.Process2?.toLowerCase() === normalizedFilter && item.process1Completed && !item.process2Completed)
            );
            break;
    }

    displayBOMAsButtons(filteredData);
}

function isPasswordStrong(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    console.log("Checking strength: " + (password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers))
    return (
        password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers
    );
}

function showRegisterMessage(message, type) {
    const registerMessage = document.getElementById('registerMessage');
    registerMessage.textContent = message;
    console.log("Showing message: " + message)
    registerMessage.className = `alert alert-${type} mt-3`;
    registerMessage.classList.remove('d-none');
}

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    console.log('Register form submitted');

    const teamNumber = document.getElementById('registerTeamNumber').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const adminPassword = document.getElementById("registerAdminPassword").value;
    const adminPasswordConfirm = document.getElementById("registerAdminPasswordConfirm").value;
    if (password !== confirmPassword) {
        showRegisterMessage('User Passwords do not match.', 'danger');
        return;
    }
    if (adminPassword !== adminPasswordConfirm) {
        showRegisterMessage('Admin Passwords do not match.', 'danger');
        return;
    }
    if (!isPasswordStrong(password)) {
        showRegisterMessage(
            'User Password is not strong enough. Please meet the requirements.',
            'danger'
        );
        return;
    }
    if (!isPasswordStrong(adminPassword)) {
        showRegisterMessage(
            'Admin Password is not strong enough. Please meet the requirements.',
            'danger'
        );
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}api/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({"team_number": teamNumber, "password": password, "adminPassword": adminPassword})
        });
        console.log("Registered team!")
        const data = await response.json();
        if (response.ok) {
            document.getElementById('registerMessage').textContent = 'Registration successful!';
            document.getElementById('registerMessage').style.color = 'green';
            showRegisterMessage('Registration successful!','green')
        } else {
            document.getElementById('registerMessage').textContent = `Error: ${data.error}`;
        }
    } catch (error) {
        console.error('Registration Error:', error);
        document.getElementById('registerMessage').textContent = 'Registration failed.';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadBOMDataForm');
    const fileInput = document.getElementById('bomDataFileInput');

    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent form submission
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a file to upload.');
            return;
        }

        try {
            const fileContent = await file.text(); // Read the file content
            const token = localStorage.getItem('jwt_token');

            const response = await fetch(`${API_BASE_URL}api/admin/upload_bom_dict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({bom_data_dict: JSON.parse(fileContent)}),
            });

            const result = await response.json();

            if (response.ok) {
                alert('BOM data uploaded successfully!');
            } else {
                alert(`Error: ${result.error || 'Failed to upload BOM data.'}`);
            }
        } catch (error) {
            console.error('Error uploading BOM data:', error);
            alert('An error occurred while uploading the BOM data.');
        }
    });
});

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log("Loading content")
    if (document.getElementById('dashboard')) {
        initializeDashboard().then(() => {
        });
        console.log("Dashboard initialized");
    }
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    document.getElementById('registerButton')?.addEventListener('click', () => {
        window.location.href = '/register';
    });
    document.getElementById('backToLogin')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);


    // Display team number in header
    if (document.getElementById('teamNumber')) {
        document.getElementById('teamNumber').textContent = teamNumber || '';
    }
    const systemSelector = document.getElementById("systemSelect").value;
    // Fetch BOM data from the server on page load (if applicable)
    if (window.location.pathname.includes('dashboard.html')) {
        console.log("Im Here")
        fetchBOMDataFromServer(systemSelector, 'Main').then(() => {
        });
    }

    // Modal Logic (move inside DOMContentLoaded)
    const modal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const closeButton = document.querySelector('.close');

    settingsButton?.addEventListener('click', () => modal.style.display = 'flex');
    closeButton?.addEventListener('click', () => modal.style.display = 'none');
});


document.getElementById('systemSelect').addEventListener('change', (event) => {
    const selectedSystem = event.target.value;
    const teamNumber = localStorage.getItem('team_number');
    const robotName = localStorage.getItem('robot_name');
    if (teamNumber && robotName && selectedSystem) {
        window.location.href = `/${teamNumber}/${robotName}/${selectedSystem}`;
    }
});


// Fetch BOM Data and Save to Local Storage
async function fetchBOMDataFromServer(robotName, system = 'Main') {
    const teamNumber = localStorage.getItem('team_number');
    try {
        const response = await fetch(`${API_BASE_URL}/api/get_bom?team_number=${teamNumber}&robot=${robotName}&system=${system}`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`}
        });
        const data = await response.json();
        if (response.ok) {
            saveBOMDataToLocal(data.bom_data, robotName, system);
            displayBOMAsButtons(data.bom_data);
        } else {
            console.error(`Failed to retrieve BOM for robot '${robotName}' and system '${system}':`, data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error(`Fetch BOM Data Error for robot '${robotName}' and system '${system}':`, error);
    }
}


// Save BOM Data Locally for a System
function saveBOMDataToLocal(bomData, robotName, system) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    if (!bomDict[teamNumber]) {
        bomDict[teamNumber] = {};
    }
    if (!bomDict[teamNumber][robotName]) {
        bomDict[teamNumber][robotName] = {};
    }
    bomDict[teamNumber][robotName][system] = bomData;
    localStorage.setItem('bom_data', JSON.stringify(bomDict));
    console.log(`Saved BOM for robot '${robotName}' and system '${system}' locally.`);
}


function getBOMDataFromLocal(robotName, system) {
    const teamNumber = localStorage.getItem('team_number');
    const bomDict = JSON.parse(localStorage.getItem('bom_data')) || {};
    return bomDict[teamNumber]?.[robotName]?.[system] || [];
}


// Modal Logic
const modal = document.getElementById('settingsModal');
const settingsButton = document.getElementById('settingsButton');
const closeButton = document.querySelector('.close');

settingsButton.addEventListener('click', () => modal.style.display = 'flex');
closeButton.addEventListener('click', () => modal.style.display = 'none');

// Fetch BOM Data and Save to Local Storage
// Function to fetch BOM with system selection
document.getElementById('fetchBOMButton').addEventListener('click', async () => {
    const documentUrl = document.getElementById('onshapeDocumentUrl').value;
    const accessKey = document.getElementById('accessKey').value;
    const secretKey = document.getElementById('secretKey').value;
    const system = document.getElementById('systemSelect').value; // Get selected system
    const teamNumber = localStorage.getItem('team_number');
    const robot_name = localStorage.getItem('robot_name');

    if (!documentUrl || !teamNumber) {
        alert('Document URL and Team Number are required.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}api/bom`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                document_url: documentUrl,
                team_number: teamNumber,
                system: system, // Include the selected system
                access_key: accessKey,
                secret_key: secretKey,
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log(`BOM fetched and saved for system '${system}'.`);
            saveBOMDataToLocal(data.bom_data, robot_name, system); // Save to local storage
            displayBOMAsButtons(data.bom_data); // Update the UI
        } else {
            console.error('Error fetching BOM:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch BOM Error:', error);
        alert('An error occurred while fetching the BOM.');
    }
});


// Function to display BOM data as buttons
function displayBOMAsButtons(bomData) {
    const gridContainer = document.getElementById('bomPartsGrid');
    gridContainer.innerHTML = ''; // Clear previous content
    console.log("BOMDATA1: ", bomData)
    bomData.sort((a, b) => (a["Part Name"] || '').localeCompare(b["Part Name"] || ''));

    bomData.forEach(part => {
        const currentProcess = determineCurrentProcess(part);
        const statusClass = getPartStatus(part); // Get status class

        // Create part button
        const button = document.createElement('div');
        button.classList.add('part-button', statusClass); // Add status class
        button.dataset.partName = part["Part Name"];

        // Populate button content
        button.innerHTML = `
            <h3>${part["Part Name"]}</h3>
            <p><strong>Material:</strong> ${part.materialBOM || 'N/A'}</p>
            <p><strong>Description:</strong> ${part.Description || 'N/A'}</p>
            <p><strong>Quantity Left:</strong> ${currentProcess.remaining || part.Quantity || 'N/A'}</p>
            <p><strong>Current Process:</strong> ${currentProcess.name || 'Completed'}</p>
        `;

        // Add click event listener
        button.addEventListener('click', () => openEditModal(part));

        // Append button to grid
        gridContainer.appendChild(button);
    });
}

// Function to open the modal with part details
function openEditModal(part) {
    const modal = document.getElementById('editModal');
    const modalBody = document.getElementById('modalBody');
    const saveButton = document.getElementById('saveButton');

    // Clear existing content
    modalBody.innerHTML = '<button id="downloadCADButton" class="button-primary">Download STEP File</button>';
    // Populate modal with editable fields for the part
    if (part.preProcess) {
        modalBody.innerHTML += `
        <label for="preProcessQty">Pre-Process (${part.preProcess}):</label>
        <div class="quantity-counter">
            <button class="decrement" data-target="preProcessQty">-</button>
            <input type="number" id="preProcessQty" value="${part.preProcessQuantity || 0}" min="0">
            <button class="increment" data-target="preProcessQty">+</button>
        </div>
    `;
    }
    if (part.Process1) {
        modalBody.innerHTML += `
        <label for="process1Qty">Process 1 (${part.Process1}):</label>
        <div class="quantity-counter">
            <button class="decrement" data-target="process1Qty">-</button>
            <input type="number" id="process1Qty" value="${part.process1Quantity || 0}" min="0">
            <button class="increment" data-target="process1Qty">+</button>
        </div>
    `;
    }
    if (part.Process2) {
        modalBody.innerHTML += `
        <label for="process2Qty">Process 2 (${part.Process2}):</label>
        <div class="quantity-counter">
            <button class="decrement" data-target="process2Qty">-</button>
            <input type="number" id="process2Qty" value="${part.process2Quantity || 0}" min="0">
            <button class="increment" data-target="process2Qty">+</button>
        </div>
    `;

    }
    console.log(modalBody.innerHTML)
    const downloadCADButton = document.getElementById('downloadCADButton');
    if (downloadCADButton) {
        downloadCADButton.addEventListener('click', () => {
            console.log('Downloading CAD for part:', part["Part Name"], " with the id of" + part["ID"]);
            downloadCADFile(part["ID"]).then(r => {
            });
        });
    }
    // Show the modal
    modal.style.display = 'flex';
    attachCounterListeners();

    // Save changes
    saveButton.onclick = () => savePartQuantities(part);
}

function attachCounterListeners() {
    document.querySelectorAll('.increment').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.getAttribute('data-target'));
            target.value = parseInt(target.value) + 1;
        });
    });

    document.querySelectorAll('.decrement').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.getAttribute('data-target'));
            target.value = Math.max(0, parseInt(target.value) - 1); // Ensure value doesn't go below 0
        });
    });
}

// Function to save quantities and update the BOM data
function savePartQuantities(part) {
    // Fetch updated quantities from the modal
    const preProcessQty = document.getElementById('preProcessQty')?.value || part.preProcessQuantity || 0;
    const process1Qty = document.getElementById('process1Qty')?.value || part.process1Quantity || 0;
    const process2Qty = document.getElementById('process2Qty')?.value || part.process2Quantity || 0;
    const robot_name = localStorage.getItem('robot_name');
    if (!robot_name) {
        console.log("NO ROBOT IN SAVE PART QTY")
    }
    // Update the part's properties
    part.preProcessQuantity = parseInt(preProcessQty, 10);
    part.process1Quantity = parseInt(process1Qty, 10);
    part.process2Quantity = parseInt(process2Qty, 10);

    // Retrieve the BOM data from localStorage

    let systemSelect
    if (document.getElementById("systemSelect")) {
        systemSelect = document.getElementById("systemSelect").value;
        console.log("Debug system3 ", systemSelect)

    } else {
        systemSelect = "Main"
        console.log("Debug system4 ", systemSelect)

    }
    let bomData = getBOMDataFromLocal(robot_name, systemSelect);
    console.log('Pre-Process Qty:', preProcessQty);
    console.log('Process 1 Qty:', process1Qty);
    console.log('Process 2 Qty:', process2Qty);
    console.log('Updated Part:', part);

    // Find and update the part in the BOM data
    const partIndex = bomData.findIndex(item => item["Part Name"] === part["Part Name"]);
    if (partIndex !== -1) {
        bomData[partIndex] = part;
    } else {
        console.error("Part not found in BOM data:", part);
        return;
    }

    // Save the updated BOM data back to localStorage
    saveBOMDataToLocal(bomData, robot_name, systemSelect);

    // Re-render the BOM grid to reflect changes
    const currentFilter = localStorage.getItem('current_filter') || 'InHouse';
    handleFilterBOM(currentFilter);

    // Close the modal
    closeModal();
}


// Function to close the modal
function closeModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
}

// Add close event listener
document.querySelector('.close').addEventListener('click', closeModal);

// Close modal on clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeModal();
    }
});

async function downloadCADFile(partId) {
    const jwtToken = localStorage.getItem('jwt_token');

    try {
        const response = await fetch(`${API_BASE_URL}/api/download_cad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({id: partId, team_number: teamNumber}),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(error.message || 'Failed to download CAD file.');
        }
        console.log(response.blob())
        console.log(response.body)
        const blob = await response.blob();
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `Part-${partId}.step`;
        downloadLink.click();
    } catch (error) {
        console.error('Error downloading CAD file:', error);
        alert('Failed to download CAD file. Check the console for details.');
    }
}

// Function to determine the current process and remaining quantity
function determineCurrentProcess(part) {
    // console.log("PLACER1: part: " + part)
    if (part.preProcess && !part.preProcessCompleted) {
        return {name: part.preProcess, remaining: part.Quantity - part.preProcessQuantity || part.Quantity};
    } else if (part.Process1 && !part.process1Completed) {
        return {name: part.Process1, remaining: part.Quantity - part.process1Quantity || part.Quantity};
    } else if (part.Process2 && !part.process2Completed) {
        return {name: part.Process2, remaining: part.Quantity - part.process2Quantity || part.Quantity};
    } else {
        return {name: 'Completed', remaining: 0};
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const systemSelect = document.getElementById('systemSelect');
    const {teamNumber, robotName} = parseURL();

    systemSelect.addEventListener('change', () => {
        const selectedSystem = systemSelect.value;
        if (teamNumber && robotName && selectedSystem) {
            window.location.href = `/${teamNumber}/${robotName}/${selectedSystem}`;
        }
    });

    const currentSystem = parseURL().system;
    console.log(parseURL())
    console.log(currentSystem)
    if (currentSystem) {
        console.log("UPDATTTEDDD SYSTEM TO: ", systemSelect.value)
        systemSelect.value = currentSystem;
    }

    // Toggle Password Visibility on Sign In Page
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function () {
            const passwordField = document.getElementById('loginPassword');
            const type =
                passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }

// Toggle Password Visibility on Register Page
    const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
    if (toggleRegisterPassword) {
        toggleRegisterPassword.addEventListener('click', function () {
            const passwordField = document.getElementById('registerPassword');
            const type =
                passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
});


// Function to initialize the dashboard
async function initializeDashboard() {
    let {teamNumber,admin, robotName, system} = parseURL();
    try {
        robotName=robotName.replace("%20"," ")
    }catch {}

    let jwtToken = localStorage.getItem('jwt_token');

    if (!teamNumber) {
        alert('Invalid team number in URL. Redirecting to the home page.');
        window.location.href = '/';
        return;
    }

    const teamExists = await checkTeamExists(teamNumber);
    if (!teamExists) {
        alert('Team does not exist. Redirecting to the home page.');
        window.location.href = '/';
        return;
    }

    localStorage.setItem('team_number', teamNumber);
    console.log("jwtToken: ",jwtToken)
    if (!jwtToken) {
        await showPasswordPrompt();
        jwtToken = localStorage.getItem('jwt_token');
        if (!jwtToken) {
            alert('You must be logged in to access the dashboard.');
            window.location.href = '/';
            return;
        }
    }
    if (admin)
    {
        if (! localStorage.getItem("role")==="Admin")
        {
            alert('You must be logged in to an ADMIN account to access this dashboard.');
            window.location.href = '/';
            return;
        }
    }
    const robots = await getTeamRobots(teamNumber);

    if (!robotName) {
        if (robots.length > 0) {
            showRobotSelectionDashboard(robots);
        } else {
            promptNewRobotCreation(teamNumber);
        }
    } else {
        if (!robots.includes(robotName)) {
            const createRobot = confirm(`Robot ${robotName} does not exist. Would you like to create it?`);
            if (createRobot) {
                createNewRobot(teamNumber, robotName);
            } else {
                window.location.href = `/${teamNumber}`;
            }
        } else {
            localStorage.setItem('robot_name', robotName);
            document.getElementById('teamNumber').textContent = teamNumber;
            // document.getElementById('robotName').textContent = robotName;
            await fetchBOMDataFromServer(robotName, system);
        }
    }

    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
}

function showRobotSelectionDashboard(robots) {
    const robotSelectionSection = document.getElementById('robotSelection');
    const robotList = document.getElementById('robotList');
    robotList.innerHTML = '';
    console.log(robots)
    if (robots===null)
    {
        robotList.innerHTML = 'NO ROBOTS REGISTERED! (CONTACT TEAM ADMIN)';
    }
    robots.forEach(robot => {
        const robotButton = document.createElement('button');
        robotButton.className = 'robot-button';
        robotButton.textContent = robot;
        robotButton.addEventListener('click', () => {
            const teamNumber = localStorage.getItem('team_number');
            window.location.href = `/${teamNumber}/${robot}/Main`;
        });
        robotList.appendChild(robotButton);
    });

    document.getElementById('createRobotButton').addEventListener('click', () => {
        promptNewRobotCreation(localStorage.getItem('team_number'));
    });

    // document.getElementById('dashboardContent').style.display = 'none';
    robotSelectionSection.style.display = 'block';
}


async function getTeamRobots(teamNumber) {
    const token = localStorage.getItem('jwt_token');
    try {
        const response = await fetch(`${API_BASE_URL}api/get_robots?team_number=${teamNumber}`, {
            headers: {'Authorization': `Bearer ${token}`},
        });
        const data = await response.json();
        if (response.ok) {
            return data.robots;
        } else {
            console.error('Failed to get robots:', data.error);
            return [];
        }
    } catch (error) {
        console.error('Error getting robots:', error);
        return [];
    }
}

async function checkTeamHasRobots(teamNumber) {
    const token = localStorage.getItem('jwt_token');
    try {
        const response = await fetch(`${API_BASE_URL}api/get_robots?team_number=${teamNumber}`, {
            headers: {'Authorization': `Bearer ${token}`},
        });
        const data = await response.json();
        if (response.ok) {
            return data.robots.length > 0;
        } else {
            console.error('Failed to check robots:', data.error);
            return false;
        }
    } catch (error) {
        console.error('Error checking robots:', error);
        return false;
    }
}

function promptNewRobotCreation(teamNumber) {
    const robotName = prompt('Please enter a name for your new robot:');
    if (!robotName) {
        alert('Robot name is required to proceed.');
        return;
    }
    createNewRobot(teamNumber, robotName);
}

function createNewRobot(teamNumber, robotName) {
    const token = localStorage.getItem('jwt_token');

    if (!token) {
        // User is not logged in, show login prompt
        showPasswordPrompt().then(() => {
            createNewRobot(teamNumber, robotName);
        });
        return;
    }

    fetch(`${API_BASE_URL}api/new_robot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({team_number: teamNumber, robot_name: robotName}),
    })
        .then((response) => response.json().then((data) => ({status: response.ok, data})))
        .then(({status, data}) => {
            if (status) {
                alert(data.message);
                window.location.href = `/${teamNumber}/${robotName}/Main`;
            } else {
                alert(data.error || 'Failed to create a new robot.');
            }
        })
        .catch((error) => {
            console.error('Error creating new robot:', error);
            alert('Failed to create a new robot.');
        });
}


async function checkTeamExists(teamNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}api/team_exists?team_number=${teamNumber}`);
        const data = await response.json();
        console.log(data)
        if (response.ok) {
            return data.exists;
        } else {
            console.error('Failed to check if team exists:', data.error);
            return false;
        }
    } catch (error) {
        console.error('Error checking if team exists:', error);
        return false;
    }
}


// Handle Logout
function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
}

document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#0056b3'; // Hover effect
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#007BFF'; // Revert back
    });
});

document.getElementById('createRobotButton').addEventListener('click', () => {
    const teamNumber = localStorage.getItem('team_number');
    const robotName = prompt('Enter a name for the new robot (e.g., Robot1):');
    if (!robotName) {
        alert('Robot name is required.');
        return;
    }

    const token = localStorage.getItem('jwt_token');

    fetch(`${API_BASE_URL}api/new_robot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({team_number: teamNumber, robot_name: robotName}),
    })
        .then((response) => {
            // Save response for both the status and the data
            return response.json().then((data) => ({status: response.ok, data}));
        })
        .then(({status, data}) => {
            if (status) {
                alert(data.message);
                loadRobotSelector(); // Reload the robot selector
            } else {
                alert(data.error || 'Failed to create a new robot.');
            }
        })
        .catch((error) => {
            console.error('Error creating new robot:', error);
            alert('Failed to create a new robot.');
        });
});


function loadRobotSelector() {
    const teamNumber = localStorage.getItem('team_number');
    const token = localStorage.getItem('jwt_token');

    fetch(`${API_BASE_URL}api/get_robots?team_number=${teamNumber}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    })
        .then((response) => {
            // Preserve both the status and data
            return response.json().then((data) => ({status: response.ok, data}));
        })
        .then(({status, data}) => {
            if (status) {
                const robotSelector = document.getElementById('robotSelector');
                robotSelector.innerHTML = ''; // Clear existing options

                const select = document.createElement('select');
                select.id = 'robotSelect';
                data.robots.forEach((robot) => {
                    const option = document.createElement('option');
                    option.value = robot;
                    option.textContent = robot;
                    select.appendChild(option);
                });

                // Add change listener to update the current robot
                select.addEventListener('change', () => {
                    const selectedRobot = select.value;
                    localStorage.setItem('current_robot', selectedRobot);
                    alert(`Switched to ${selectedRobot}`);
                    // Optionally reload the BOM data here
                });

                robotSelector.appendChild(select);
            } else {
                alert(data.error || 'Failed to load robots.');
            }
        })
        .catch((error) => {
            console.error('Error loading robots:', error);
            alert('An error occurred while loading robots.');
        });
}
