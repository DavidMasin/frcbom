const API_BASE_URL = 'https://frcbom-production.up.railway.app/';
const teamNumber = localStorage.getItem('team_number');

// Load Robots on Page Load
document.addEventListener('DOMContentLoaded', loadRobotList);

async function loadRobotList() {
    try {
        const response = await fetch(`${API_BASE_URL}api/get_robots?team_number=${teamNumber}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` },
        });

        const data = await response.json();
        if (response.ok) {
            displayRobots(data.robots);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error fetching robots:', error);
    }
}

// Display Robots with Action Buttons
function displayRobots(robots) {
    const robotList = document.getElementById('robotList');
    robotList.innerHTML = '';

    robots.forEach(robot => {
        const robotDiv = document.createElement('div');
        robotDiv.className = 'robot-button';

        const robotLink = document.createElement('a');
        robotLink.textContent = robot;
        robotLink.href = `/${teamNumber}/${robot}/Main`;
        robotLink.style.color = 'white';
        robotLink.style.textDecoration = 'none';

        const renameButton = document.createElement('button');
        renameButton.textContent = 'Rename';
        renameButton.className = 'action-button';
        renameButton.addEventListener('click', () => showRenameRobotModal(robot));

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'action-button';
        deleteButton.addEventListener('click', () => showDeleteRobotModal(robot));

        robotDiv.appendChild(robotLink);
        robotDiv.appendChild(renameButton);
        robotDiv.appendChild(deleteButton);
        robotList.appendChild(robotDiv);
    });
}

// Create New Robot
document.getElementById('createRobotButton').addEventListener('click', () => {
    const robotName = prompt('Enter the name for your new robot:');
    if (robotName) createRobot(robotName);
});

async function createRobot(robotName) {
    try {
        const response = await fetch(`${API_BASE_URL}api/new_robot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
            },
            body: JSON.stringify({ team_number: teamNumber, robot_name: robotName }),
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            loadRobotList();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error creating robot:', error);
    }
}

// Show Rename Modal
function showRenameRobotModal(oldRobotName) {
    const modal = document.getElementById('robotActionModal');
    const modalBody = document.getElementById('modalBody');
    const confirmButton = document.getElementById('confirmActionButton');

    modalBody.innerHTML = `
        <label for="newRobotName">Enter New Name:</label>
        <input type="text" id="newRobotName" placeholder="New Robot Name">
    `;

    confirmButton.onclick = () => {
        const newRobotName = document.getElementById('newRobotName').value;
        if (newRobotName) renameRobot(oldRobotName, newRobotName);
        modal.style.display = 'none';
    };

    modal.style.display = 'block';
}

// Rename Robot
async function renameRobot(oldRobotName, newRobotName) {
    try {
        const response = await fetch(`${API_BASE_URL}api/rename_robot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
            },
            body: JSON.stringify({
                team_number: teamNumber,
                old_robot_name: oldRobotName,
                new_robot_name: newRobotName,
            }),
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            loadRobotList();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error renaming robot:', error);
    }
}

// Show Delete Modal
function showDeleteRobotModal(robotName) {
    const modal = document.getElementById('robotActionModal');
    const modalBody = document.getElementById('modalBody');
    const confirmButton = document.getElementById('confirmActionButton');

    modalBody.innerHTML = `<p>Are you sure you want to delete robot "${robotName}"?</p>`;

    confirmButton.onclick = () => {
        deleteRobot(robotName);
        modal.style.display = 'none';
    };

    modal.style.display = 'block';
}

// Delete Robot
async function deleteRobot(robotName) {
    try {
        const response = await fetch(`${API_BASE_URL}api/delete_robot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
            },
            body: JSON.stringify({ team_number: teamNumber, robot_name: robotName }),
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            loadRobotList();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error deleting robot:', error);
    }
}
