// Handle Logout
document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

// Handle Process Updates
document.getElementById('updatePreProcess').addEventListener('click', () => {
    openUpdateModal('DonePreProcess');
});
document.getElementById('updateProcess1').addEventListener('click', () => {
    openUpdateModal('DoneProcess1');
});
document.getElementById('updateProcess2').addEventListener('click', () => {
    openUpdateModal('DoneProcess2');
});

// View Parts by Machine
document.getElementById('viewCNCParts').addEventListener('click', () => {
    window.location.href = 'cnc_parts.html';
});
document.getElementById('viewLatheParts').addEventListener('click', () => {
    window.location.href = 'lathe_parts.html';
});
document.getElementById('viewPrinterParts').addEventListener('click', () => {
    window.location.href = 'printer_parts.html';
});
document.getElementById('viewGerungParts').addEventListener('click', () => {
    window.location.href = 'gerung_parts.html';
});

// Quick Filters
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', (event) => {
        const filter = event.target.getAttribute('data-filter');
        applyFilter(filter);
    });
});

// Open Update Modal
function openUpdateModal(processType) {
    alert(`Open modal to update quantities for ${processType}`);
}

// Apply Filter
function applyFilter(filter) {
    alert(`Apply filter: ${filter}`);
}
