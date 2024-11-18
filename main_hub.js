// Handle Logout
document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

// Button Click Handlers
document.getElementById('cncButton').addEventListener('click', () => navigateTo('cnc_parts.html'));
document.getElementById('printerButton').addEventListener('click', () => navigateTo('printer_parts.html'));
document.getElementById('latheButton').addEventListener('click', () => navigateTo('lathe_parts.html'));
document.getElementById('millButton').addEventListener('click', () => navigateTo('mill_parts.html'));
document.getElementById('gerungButton').addEventListener('click', () => navigateTo('gerung_parts.html'));
document.getElementById('showAllButton').addEventListener('click', () => navigateTo('all_parts.html'));
document.getElementById('showInHouseButton').addEventListener('click', () => navigateTo('inhouse_parts.html'));
document.getElementById('showCOTSButton').addEventListener('click', () => navigateTo('cots_parts.html'));

// Settings and Export Handlers
document.getElementById('settingsButton').addEventListener('click', () => alert('Open settings modal'));
document.getElementById('exportBOM').addEventListener('click', () => alert('Export BOM data'));

// Navigation Function
function navigateTo(page) {
    window.location.href = page;
}
