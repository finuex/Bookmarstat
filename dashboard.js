// Variabel global untuk menyimpan data dan chart
let bookmarksData = [];
let domainsData = {};
let foldersData = {};
let domainChartInstance, timelineChartInstance, folderChartInstance, timeChartInstance;

// Fungsi utama untuk memuat dan menganalisis data bookmark
async function loadBookmarkData() {
    try {
        showLoadingState();
        
        // Mengambil seluruh bookmark
        const bookmarksTree = await chrome.bookmarks.getTree();
        bookmarksData = [];
        domainsData = {};
        foldersData = {};
        
        // Fungsi rekursif untuk mengekstrak semua bookmark
        function processBookmarkNode(node, folderPath = "") {
            if (node.children) {
                // Ini adalah folder
                const currentFolderPath = folderPath ? `${folderPath}/${node.title}` : node.title;
                
                if (!foldersData[currentFolderPath]) {
                    foldersData[currentFolderPath] = {
                        count: 0,
                        bookmarks: []
                    };
                }
                
                node.children.forEach(child => processBookmarkNode(child, currentFolderPath));
            } else if (node.url) {
                // Ini adalah bookmark
                bookmarksData.push({
                    id: node.id,
                    title: node.title,
                    url: node.url,
                    dateAdded: node.dateAdded,
                    folder: folderPath
                });
                
                // Menghitung statistik per folder
                if (!foldersData[folderPath]) {
                    foldersData[folderPath] = {
                        count: 0,
                        bookmarks: []
                    };
                }
                foldersData[folderPath].count++;
                foldersData[folderPath].bookmarks.push(node);
                
                // Ekstrak domain dari URL
                let domain;
                try {
                    domain = new URL(node.url).hostname;
                    // Menghapus www. dari domain
                    domain = domain.replace(/^www\./, '');
                } catch (e) {
                    domain = "invalid-url";
                }
                
                // Menghitung statistik per domain
                if (!domainsData[domain]) {
                    domainsData[domain] = {
                        count: 0,
                        lastAdded: node.dateAdded,
                        lastTitle: node.title
                    };
                }
                
                domainsData[domain].count++;
                if (node.dateAdded > domainsData[domain].lastAdded) {
                    domainsData[domain].lastAdded = node.dateAdded;
                    domainsData[domain].lastTitle = node.title;
                }
            }
        }
        
        // Memproses semua bookmark
        processBookmarkNode(bookmarksTree[0]);
        
        // Memperbarui UI dengan data
        updateStats();
        updateCharts();
        updateDomainTable();
        updateLastUpdated();
        
    } catch (error) {
        console.error("Error loading bookmark data:", error);
        showErrorState();
    }
}

// Memperbarui statistik utama
function updateStats() {
    const totalBookmarksEl = document.getElementById('total-bookmarks');
    const uniqueDomainsEl = document.getElementById('unique-domains');
    const totalFoldersEl = document.getElementById('total-folders');
    const avgPerFolderEl = document.getElementById('avg-per-folder');
    
    if (totalBookmarksEl) {
        totalBookmarksEl.textContent = bookmarksData.length.toLocaleString();
    }
    
    if (uniqueDomainsEl) {
        uniqueDomainsEl.textContent = Object.keys(domainsData).length.toLocaleString();
    }
    
    if (totalFoldersEl) {
        totalFoldersEl.textContent = Object.keys(foldersData).length.toLocaleString();
    }
    
    if (avgPerFolderEl) {
        const avgPerFolder = Object.keys(foldersData).length > 0 ? 
            (bookmarksData.length / Object.keys(foldersData).length) : 0;
        avgPerFolderEl.textContent = avgPerFolder.toFixed(1);
    }
}

// Memperbarui chart
function updateCharts() {
    updateDomainChart();
    updateTimelineChart();
    updateFolderChart();
    updateTimeChart();
}

// Chart untuk domain paling banyak
function updateDomainChart() {
    const canvas = document.getElementById('domainChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Mengurutkan domain berdasarkan jumlah bookmark
    const sortedDomains = Object.entries(domainsData)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
    
    const labels = sortedDomains.map(item => item[0]);
    const data = sortedDomains.map(item => item[1].count);
    
    if (domainChartInstance) {
        domainChartInstance.destroy();
    }
    
    domainChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Bookmark',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Jumlah Bookmark'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Domain'
                    }
                }
            }
        }
    });
}

// Chart untuk timeline penambahan bookmark
function updateTimelineChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Menghitung bookmark per hari (30 hari terakhir)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const dailyCounts = {};
    
    // Inisialisasi objek untuk 30 hari terakhir
    for (let i = 29; i >= 0; i--) {
        const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
        const dateStr = date.toISOString().split('T')[0];
        dailyCounts[dateStr] = 0;
    }
    
    // Menghitung bookmark per hari
    bookmarksData.forEach(bookmark => {
        if (bookmark.dateAdded >= thirtyDaysAgo) {
            const date = new Date(bookmark.dateAdded);
            const dateStr = date.toISOString().split('T')[0];
            if (dailyCounts[dateStr] !== undefined) {
                dailyCounts[dateStr]++;
            }
        }
    });
    
    const labels = Object.keys(dailyCounts);
    const data = Object.values(dailyCounts);
    
    if (timelineChartInstance) {
        timelineChartInstance.destroy();
    }
    
    timelineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bookmark Ditambahkan',
                data: data,
                fill: false,
                backgroundColor: 'rgba(75, 192, 192, 0.7)',
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Jumlah Bookmark'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Tanggal'
                    }
                }
            }
        }
    });
}

// Chart untuk distribusi folder
function updateFolderChart() {
    const canvas = document.getElementById('folderChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Mengurutkan folder berdasarkan jumlah bookmark
    const sortedFolders = Object.entries(foldersData)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
    
    const labels = sortedFolders.map(item => {
        // Memendekkan nama folder jika terlalu panjang
        const folderName = item[0];
        return folderName.length > 20 ? folderName.substring(0, 20) + '...' : folderName;
    });
    
    const data = sortedFolders.map(item => item[1].count);
    
    if (folderChartInstance) {
        folderChartInstance.destroy();
    }
    
    folderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(199, 199, 199, 0.7)',
                    'rgba(83, 102, 255, 0.7)',
                    'rgba(40, 159, 64, 0.7)',
                    'rgba(210, 99, 132, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

// Chart untuk waktu pembuatan bookmark
function updateTimeChart() {
    const canvas = document.getElementById('timeChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Mengelompokkan bookmark berdasarkan jam pembuatan
    const hourlyCounts = Array(24).fill(0);
    
    bookmarksData.forEach(bookmark => {
        const date = new Date(bookmark.dateAdded);
        const hour = date.getHours();
        hourlyCounts[hour]++;
    });
    
    const labels = Array.from({length: 24}, (_, i) => {
        return `${i.toString().padStart(2, '0')}:00`;
    });
    
    if (timeChartInstance) {
        timeChartInstance.destroy();
    }
    
    timeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Bookmark',
                data: hourlyCounts,
                backgroundColor: 'rgba(153, 102, 255, 0.7)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Jumlah Bookmark'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Jam'
                    }
                }
            }
        }
    });
}

// Memperbarui tabel domain
function updateDomainTable() {
    const tableBody = document.getElementById('domainTableBody');
    tableBody.innerHTML = '';
    
    // Mengurutkan domain berdasarkan jumlah bookmark
    const sortedDomains = Object.entries(domainsData)
        .sort((a, b) => b[1].count - a[1].count);
    
    sortedDomains.forEach(([domain, data]) => {
        const row = document.createElement('tr');
        
        const percentage = ((data.count / bookmarksData.length) * 100).toFixed(1);
        const lastAdded = new Date(data.lastAdded).toLocaleDateString();
        
        row.innerHTML = `
            <td>${domain}</td>
            <td>${data.count.toLocaleString()}</td>
            <td>${percentage}%</td>
            <td>${lastAdded} (${data.lastTitle})</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Memperbarui waktu terakhir update
function updateLastUpdated() {
    const now = new Date();
    document.getElementById('last-updated').textContent = now.toLocaleString();
}

// Menampilkan state loading
function showLoadingState() {
    // Update statistik dengan loading indicator
    document.getElementById('total-bookmarks').textContent = 'Loading...';
    document.getElementById('unique-domains').textContent = 'Loading...';
    document.getElementById('total-folders').textContent = 'Loading...';
    document.getElementById('avg-per-folder').textContent = 'Loading...';
    
    // Clear tabel
    const tableBody = document.getElementById('domainTableBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="4">Loading data...</td></tr>';
    }
    
    // Update last updated
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = 'Loading...';
    }
}

// Menampilkan state error
function showErrorState() {
    // Update statistik dengan error indicator
    document.getElementById('total-bookmarks').textContent = 'Error';
    document.getElementById('unique-domains').textContent = 'Error';
    document.getElementById('total-folders').textContent = 'Error';
    document.getElementById('avg-per-folder').textContent = 'Error';
    
    // Clear tabel dengan pesan error
    const tableBody = document.getElementById('domainTableBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color: red; text-align: center;">Error loading data. Please check permissions and try again.</td></tr>';
    }
    
    // Update last updated dengan error
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = 'Error loading data';
    }
    
    // Tampilkan alert untuk user
    alert('Terjadi error saat memuat data bookmark. Pastikan extension memiliki izin yang diperlukan dan coba refresh.');
}

// Event listeners
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');

if (refreshBtn) {
    refreshBtn.addEventListener('click', loadBookmarkData);
}

if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
}

// Fungsi untuk mengekspor data
function exportData() {
    // Membuat data dalam format CSV
    let csvContent = "Data Statistik Bookmark\n\n";
    
    // Statistik umum
    csvContent += "STATISTIK UMUM\n";
    csvContent += `Total Bookmark,${bookmarksData.length}\n`;
    csvContent += `Domain Unik,${Object.keys(domainsData).length}\n`;
    csvContent += `Jumlah Folder,${Object.keys(foldersData).length}\n`;
    csvContent += `Rata-rata per Folder,${(bookmarksData.length / Object.keys(foldersData).length).toFixed(1)}\n\n`;
    
    // Data per domain
    csvContent += "DATA PER DOMAIN\n";
    csvContent += "Domain,Jumlah,Persentase\n";
    
    const sortedDomains = Object.entries(domainsData)
        .sort((a, b) => b[1].count - a[1].count);
    
    sortedDomains.forEach(([domain, data]) => {
        const percentage = ((data.count / bookmarksData.length) * 100).toFixed(1);
        csvContent += `${domain},${data.count},${percentage}%\n`;
    });
    
    csvContent += "\n";
    
    // Data per folder
    csvContent += "DATA PER FOLDER\n";
    csvContent += "Folder,Jumlah Bookmark\n";
    
    const sortedFolders = Object.entries(foldersData)
        .sort((a, b) => b[1].count - a[1].count);
    
    sortedFolders.forEach(([folder, data]) => {
        csvContent += `${folder},${data.count}\n`;
    });
    
    // Membuat blob dan mendownload file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'bookmark_statistics.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Memuat data saat halaman siap
document.addEventListener('DOMContentLoaded', loadBookmarkData);