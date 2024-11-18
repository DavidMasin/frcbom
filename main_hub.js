document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/';
});

document.getElementById('cncButton').addEventListener('click', () => window.location.href = '/cnc_parts');
document.getElementById('printerButton').addEventListener('click', () => window.location.href = '/printer_parts');
document.getElementById('latheButton').addEventListener('click', () => window.location.href = '/lathe_parts');
document.getElementById('millButton').addEventListener('click', () => window.location.href = '/mill_parts');
document.getElementById('gerungButton').addEventListener('click', () => window.location.href = '/gerung_parts');
document.getElementById('showAllButton').addEventListener('click', () => window.location.href = '/all_parts');
document.getElementById('showInHouseButton').addEventListener('click', () => window.location.href = '/inhouse_parts');
document.getElementById('showCOTSButton').addEventListener('click', () => window.location.href = '/cots_parts');
