// Variabel global untuk menyimpan data dan chart
let bookmarksData = [];
let domainsData = {};
let foldersData = {};
let domainChartInstance, timelineChartInstance, folderChartInstance, timeChartInstance;

// Variables for table pagination and search
let filteredDomainsData = [];
let currentPage = 1;
let pageSize = 25;
let sortColumn = 1; // Default sort by count
let sortDirection = 'desc';

// Timeline chart filter period
let currentTimelinePeriod = '24h';

// Global Chart.js configuration for CSP compliance
Chart.defaults.set('animation', {
    duration: 0
});
Chart.defaults.set('animations', {
    colors: false,
    numbers: false
});
Chart.defaults.set('responsive', true);
Chart.defaults.set('interaction', {
    intersect: false,
    mode: 'index'
});

// Disable all animations and interactions that might cause CSP violations
Chart.defaults.animation = false;
Chart.defaults.hover.animationDuration = 0;
Chart.defaults.responsiveAnimationDuration = 0;

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
                        lastTitle: node.title,
                        bookmarks: [] // Store actual bookmarks
                    };
                }
                
                domainsData[domain].count++;
                domainsData[domain].bookmarks.push({
                    id: node.id,
                    title: node.title,
                    url: node.url,
                    dateAdded: node.dateAdded,
                    folder: folderPath
                });
                
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
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
            },
            // CSP-compliant configuration
            animation: {
                duration: 0
            },
            hover: {
                animationDuration: 0
            },
            responsiveAnimationDuration: 0
        }
    });
}

// Chart untuk timeline penambahan bookmark
function updateTimelineChart(period = currentTimelinePeriod) {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    let startTime, intervalUnit, intervalCount, labels = [], data = [];
    let chartTitle = '';
    
    const now = Date.now();
    
    switch(period) {
        case '24h':
            // Last 24 hours - hourly data
            startTime = now - (24 * 60 * 60 * 1000);
            intervalUnit = 'hour';
            intervalCount = 24;
            chartTitle = '📅 Aktivitas Penambahan Bookmark (24 Jam Terakhir)';
            
            // Initialize hourly counts
            const hourlyCounts = {};
            for (let i = 23; i >= 0; i--) {
                const date = new Date(now - (i * 60 * 60 * 1000));
                const hourStr = date.getHours().toString().padStart(2, '0') + ':00';
                hourlyCounts[hourStr] = 0;
            }
            
            // Count bookmarks per hour
            bookmarksData.forEach(bookmark => {
                if (bookmark.dateAdded >= startTime) {
                    const date = new Date(bookmark.dateAdded);
                    const hourStr = date.getHours().toString().padStart(2, '0') + ':00';
                    if (hourlyCounts[hourStr] !== undefined) {
                        hourlyCounts[hourStr]++;
                    }
                }
            });
            
            labels = Object.keys(hourlyCounts);
            data = Object.values(hourlyCounts);
            break;
            
        case '30d':
            // Last 30 days - daily data
            startTime = now - (30 * 24 * 60 * 60 * 1000);
            intervalUnit = 'day';
            intervalCount = 30;
            chartTitle = '📅 Aktivitas Penambahan Bookmark (30 Hari Terakhir)';
            
            // Initialize daily counts
            const dailyCounts = {};
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now - (i * 24 * 60 * 60 * 1000));
                const dateStr = date.toISOString().split('T')[0];
                dailyCounts[dateStr] = 0;
            }
            
            // Count bookmarks per day
            bookmarksData.forEach(bookmark => {
                if (bookmark.dateAdded >= startTime) {
                    const date = new Date(bookmark.dateAdded);
                    const dateStr = date.toISOString().split('T')[0];
                    if (dailyCounts[dateStr] !== undefined) {
                        dailyCounts[dateStr]++;
                    }
                }
            });
            
            labels = Object.keys(dailyCounts);
            data = Object.values(dailyCounts);
            break;
            
        case '1y':
            // Last 12 months - monthly data
            startTime = now - (365 * 24 * 60 * 60 * 1000);
            intervalUnit = 'month';
            intervalCount = 12;
            chartTitle = '📅 Aktivitas Penambahan Bookmark (1 Tahun Terakhir)';
            
            // Initialize monthly counts
            const monthlyCounts = {};
            for (let i = 11; i >= 0; i--) {
                const date = new Date(now);
                date.setMonth(date.getMonth() - i);
                const monthStr = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0');
                monthlyCounts[monthStr] = 0;
            }
            
            // Count bookmarks per month
            bookmarksData.forEach(bookmark => {
                if (bookmark.dateAdded >= startTime) {
                    const date = new Date(bookmark.dateAdded);
                    const monthStr = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0');
                    if (monthlyCounts[monthStr] !== undefined) {
                        monthlyCounts[monthStr]++;
                    }
                }
            });
            
            labels = Object.keys(monthlyCounts);
            data = Object.values(monthlyCounts);
            break;
            
        case 'all':
            // All time - monthly data grouped by year-month
            intervalUnit = 'month';
            chartTitle = '📅 Aktivitas Penambahan Bookmark (Semua Masa)';
            
            // Group all bookmarks by month
            const allTimeCounts = {};
            bookmarksData.forEach(bookmark => {
                const date = new Date(bookmark.dateAdded);
                const monthStr = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0');
                if (!allTimeCounts[monthStr]) {
                    allTimeCounts[monthStr] = 0;
                }
                allTimeCounts[monthStr]++;
            });
            
            // Sort by date
            const sortedMonths = Object.keys(allTimeCounts).sort();
            labels = sortedMonths;
            data = sortedMonths.map(month => allTimeCounts[month]);
            break;
    }
    
    // Update chart title
    const titleElement = document.getElementById('timeline-chart-title');
    if (titleElement) {
        titleElement.textContent = chartTitle;
    }
    
    // Destroy existing chart
    if (timelineChartInstance) {
        timelineChartInstance.destroy();
    }
    
    // Create new chart
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
            interaction: {
                intersect: false,
                mode: 'index'
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
                        text: period === '24h' ? 'Jam' : period === '30d' ? 'Tanggal' : 'Periode'
                    }
                }
            },
            // CSP-compliant configuration
            animation: {
                duration: 0
            },
            hover: {
                animationDuration: 0
            },
            responsiveAnimationDuration: 0
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'right'
                }
            },
            // CSP-compliant configuration
            animation: {
                duration: 0
            },
            hover: {
                animationDuration: 0
            },
            responsiveAnimationDuration: 0
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
            interaction: {
                intersect: false,
                mode: 'index'
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
                        text: 'Jam'
                    }
                }
            },
            // CSP-compliant configuration
            animation: {
                duration: 0
            },
            hover: {
                animationDuration: 0
            },
            responsiveAnimationDuration: 0
        }
    });
}

// Memperbarui tabel domain dengan search dan pagination
function updateDomainTable() {
    // Convert domains data to array format
    const domainsArray = Object.entries(domainsData).map(([domain, data]) => {
        const lastAddedDate = new Date(data.lastAdded);
        return {
            domain: domain,
            count: data.count,
            percentage: ((data.count / bookmarksData.length) * 100).toFixed(1),
            lastAdded: lastAddedDate.toLocaleDateString('id-ID'), // Indonesian date format
            lastAddedTimestamp: data.lastAdded, // Keep original timestamp for sorting
            lastTitle: data.lastTitle
        };
    });
    
    // Apply search filter
    const searchTerm = document.getElementById('domain-search')?.value.toLowerCase() || '';
    filteredDomainsData = domainsArray.filter(item => 
        item.domain.toLowerCase().includes(searchTerm) ||
        item.lastTitle.toLowerCase().includes(searchTerm)
    );
    
    // Apply sorting
    applySorting();
    
    // Reset to first page when data changes
    currentPage = 1;
    
    // Update pagination and table
    updatePagination();
    renderTablePage();
    updateTableInfo();
    updateTableHeaders();
}

// Apply sorting to filtered data
function applySorting() {
    filteredDomainsData.sort((a, b) => {
        let aVal, bVal;
        
        switch(sortColumn) {
            case 0: // Domain
                aVal = a.domain.toLowerCase();
                bVal = b.domain.toLowerCase();
                break;
            case 1: // Count
                aVal = a.count;
                bVal = b.count;
                break;
            case 2: // Percentage
                aVal = parseFloat(a.percentage);
                bVal = parseFloat(b.percentage);
                break;
            case 3: // Last Added (use timestamp for accurate sorting)
                aVal = a.lastAddedTimestamp || 0;
                bVal = b.lastAddedTimestamp || 0;
                break;
            default:
                aVal = a.count;
                bVal = b.count;
        }
        
        // For dates and numbers, use numeric comparison
        if (sortColumn === 1 || sortColumn === 2 || sortColumn === 3) {
            if (sortDirection === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        } else {
            // For strings, use string comparison
            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        }
    });
}

// Render current page of table
function renderTablePage() {
    const tableBody = document.getElementById('domainTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredDomainsData.length);
    
    if (filteredDomainsData.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.setAttribute('colspan', '5');
        cell.className = 'empty-state';
        cell.textContent = 'Tidak ada data yang ditemukan';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }
    
    for (let i = startIndex; i < endIndex; i++) {
        const item = filteredDomainsData[i];
        const rowId = `domain-row-${i}`;
        const detailsId = `details-row-${i}`;
        
        // Main row
        const row = document.createElement('tr');
        row.id = rowId;
        
        row.innerHTML = `
            <td class="expand-column">
                <button class="expand-btn" data-target="${detailsId}" data-domain="${item.domain}">▶</button>
            </td>
            <td>${item.domain}</td>
            <td>${item.count.toLocaleString()}</td>
            <td>${item.percentage}%</td>
            <td>${item.lastAdded} (${item.lastTitle})</td>
        `;
        
        tableBody.appendChild(row);
        
        // Details row (hidden by default)
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'bookmark-details';
        detailsRow.id = detailsId;
        
        const detailsCell = document.createElement('td');
        detailsCell.setAttribute('colspan', '5');
        
        const bookmarkList = document.createElement('div');
        bookmarkList.className = 'bookmark-list';
        
        const bookmarkTitle = document.createElement('h4');
        bookmarkTitle.textContent = `📚 Bookmark dari ${item.domain} (${item.count} item):`;
        bookmarkList.appendChild(bookmarkTitle);
        
        // Get bookmarks for this domain
        const domainBookmarks = domainsData[item.domain]?.bookmarks || [];
        
        domainBookmarks.forEach(bookmark => {
            const bookmarkItem = document.createElement('div');
            bookmarkItem.className = 'bookmark-item';
            
            // Get favicon URL
            const faviconUrl = getFaviconUrl(bookmark.url);
            
            // Format date
            const bookmarkDate = new Date(bookmark.dateAdded).toLocaleDateString('id-ID');
            
            // Format folder path - clean up and make more readable
            const folderDisplay = formatFolderPath(bookmark.folder);
            
            bookmarkItem.innerHTML = `
                <img class="bookmark-favicon" src="${faviconUrl}" alt="">
                <div class="bookmark-info">
                    <a href="${bookmark.url}" target="_blank" class="bookmark-title" title="${bookmark.title}">
                        ${bookmark.title || 'Untitled'}
                    </a>
                    <div class="bookmark-url" title="${bookmark.url}">
                        ${bookmark.url}
                    </div>
                    ${folderDisplay ? `<div class="bookmark-folder" title="${bookmark.folder || 'Root'}">${folderDisplay}</div>` : ''}
                </div>
                <div class="bookmark-date">
                    ${bookmarkDate}
                </div>
                <div class="bookmark-actions">
                    <button class="delete-bookmark-btn" data-bookmark-id="${bookmark.id}" data-domain="${item.domain}" title="Delete bookmark">
                        🗑️ Delete
                    </button>
                </div>
            `;
            
            // Add CSP-compliant error handler for favicon
            const faviconImg = bookmarkItem.querySelector('.bookmark-favicon');
            if (faviconImg) {
                faviconImg.addEventListener('error', function() {
                    this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjRjNGNEY2Ci8+CjxwYXRoIGQ9Ik04IDRDNi4zNDMxNSA0IDUgNS4zNDMxNSA1IDdDNSA4LjY1Njg1IDYuMzQzMTUgMTAgOCAxMEM5LjY1Njg1IDEwIDExIDguNjU2ODUgMTEgN0MxMSA1LjM0MzE1IDkuNjU2ODUgNCA4IDRaIiBmaWxsPSIjOUM5Qzk5Ci8+CjxwYXRoIGQ9Ik04IDEyLjVMMTAuNSAxNEg1LjVMOCAxMi41WiIgZmlsbD0iIzlDOUM5OSIvPgo8L3N2Zz4K';
                });
            }
            
            bookmarkList.appendChild(bookmarkItem);
        });
        
        detailsCell.appendChild(bookmarkList);
        detailsRow.appendChild(detailsCell);
        
        tableBody.appendChild(detailsRow);
    }
    
    // Add event listeners for expand buttons
    const expandButtons = document.querySelectorAll('.expand-btn');
    expandButtons.forEach(button => {
        button.addEventListener('click', function() {
            toggleBookmarkDetails(this);
        });
    });
    
    // Add event listeners for delete bookmark buttons
    const deleteButtons = document.querySelectorAll('.delete-bookmark-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const bookmarkId = this.getAttribute('data-bookmark-id');
            const domain = this.getAttribute('data-domain');
            showDeleteConfirmation(bookmarkId, domain, this);
        });
    });
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredDomainsData.length / pageSize);
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageNumbers = document.getElementById('page-numbers');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
    
    // Generate page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = '';
        
        // Show page numbers (with ellipsis for large datasets)
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        // Adjust start page if end page is near the total
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // First page and ellipsis
        if (startPage > 1) {
            addPageNumber(1);
            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'page-ellipsis';
                pageNumbers.appendChild(ellipsis);
            }
        }
        
        // Visible page numbers
        for (let i = startPage; i <= endPage; i++) {
            addPageNumber(i);
        }
        
        // Last page and ellipsis
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'page-ellipsis';
                pageNumbers.appendChild(ellipsis);
            }
            addPageNumber(totalPages);
        }
    }
}

// Add page number button
function addPageNumber(pageNum) {
    const pageNumbers = document.getElementById('page-numbers');
    if (!pageNumbers) return;
    
    const pageBtn = document.createElement('button');
    pageBtn.textContent = pageNum;
    pageBtn.className = `page-number ${pageNum === currentPage ? 'active' : ''}`;
    
    // Use addEventListener instead of onclick to avoid CSP violation
    pageBtn.addEventListener('click', function() {
        goToPage(pageNum);
    });
    
    pageNumbers.appendChild(pageBtn);
}

// Navigate to specific page
function goToPage(page) {
    const totalPages = Math.ceil(filteredDomainsData.length / pageSize);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        updatePagination();
        renderTablePage();
        updateTableInfo();
    }
}

// Update table info display
function updateTableInfo() {
    const tableInfo = document.getElementById('table-info');
    if (!tableInfo) return;
    
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredDomainsData.length);
    const total = filteredDomainsData.length;
    const totalDomains = Object.keys(domainsData).length;
    
    if (total === 0) {
        tableInfo.textContent = 'Tidak ada data yang ditemukan';
    } else if (total === totalDomains) {
        tableInfo.textContent = `Menampilkan ${startIndex}-${endIndex} dari ${total} domain`;
    } else {
        tableInfo.textContent = `Menampilkan ${startIndex}-${endIndex} dari ${total} domain (disaring dari ${totalDomains} total)`;
    }
}

// Sort table by column
function sortTable(columnIndex) {
    if (sortColumn === columnIndex) {
        // Toggle sort direction if same column
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to descending for count/percentage, ascending for text
        sortColumn = columnIndex;
        sortDirection = (columnIndex === 0 || columnIndex === 3) ? 'asc' : 'desc';
    }
    
    updateDomainTable();
    updateTableHeaders();
}

// Update table headers to show sort direction
function updateTableHeaders() {
    const headers = document.querySelectorAll('#domainTable th.sortable');
    headers.forEach(header => {
        const columnIndex = parseInt(header.getAttribute('data-column'));
        // Reset all headers
        const text = header.textContent.replace(/[↑↓↕]/g, '').trim();
        
        if (columnIndex === sortColumn) {
            // Add sort direction indicator
            header.textContent = text + (sortDirection === 'asc' ? ' ↑' : ' ↓');
        } else {
            // Add neutral indicator
            header.textContent = text + ' ↕';
        }
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
        tableBody.innerHTML = '<tr><td colspan="5">Loading data...</td></tr>';
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
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.setAttribute('colspan', '5');
        cell.className = 'error-state';
        cell.textContent = 'Error loading data. Please check permissions and try again.';
        row.appendChild(cell);
        tableBody.innerHTML = '';
        tableBody.appendChild(row);
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

// Search and pagination event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Search functionality
    const searchInput = document.getElementById('domain-search');
    const clearSearchBtn = document.getElementById('clear-search');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            updateDomainTable();
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                updateDomainTable();
            }
        });
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
                updateDomainTable();
            }
        });
    }
    
    // Pagination controls
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageSizeSelect = document.getElementById('page-size');
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function() {
            if (currentPage > 1) {
                goToPage(currentPage - 1);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function() {
            const totalPages = Math.ceil(filteredDomainsData.length / pageSize);
            if (currentPage < totalPages) {
                goToPage(currentPage + 1);
            }
        });
    }
    
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function() {
            pageSize = parseInt(this.value);
            currentPage = 1; // Reset to first page
            updateDomainTable();
        });
    }
    
    // Load initial data
    loadBookmarkData();
    
    // Initialize table headers
    updateTableHeaders();
    
    // Add click event listeners to sortable table headers
    const sortableHeaders = document.querySelectorAll('#domainTable th.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const columnIndex = parseInt(this.getAttribute('data-column'));
            if (!isNaN(columnIndex)) {
                sortTable(columnIndex);
            }
        });
        
        // Add visual feedback for clickable headers
        header.style.cursor = 'pointer';
    });
    
    // Time filter controls for timeline chart
    const timeFilterButtons = document.querySelectorAll('.time-filter-btn');
    timeFilterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            timeFilterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get the selected period and update global variable
            const selectedPeriod = this.getAttribute('data-period');
            currentTimelinePeriod = selectedPeriod;
            
            // Update the timeline chart with new period
            updateTimelineChart(selectedPeriod);
        });
    });
    
    // Set default active button (24 hours)
    const defaultButton = document.querySelector('.time-filter-btn[data-period="24h"]');
    if (defaultButton) {
        defaultButton.classList.add('active');
    }
});

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

// Get favicon URL for a given website URL
function getFaviconUrl(url) {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch (e) {
        // Return default icon for invalid URLs
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04IDRDNi4zNDMxNSA0IDUgNS4zNDMxNSA1IDdDNSA4LjY1Njg1IDYuMzQzMTUgMTAgOCAxMEM5LjY1Njg1IDEwIDExIDguNjU2ODUgMTEgN0MxMSA1LjM0MzE1IDkuNjU2ODUgNCA4IDRaIiBmaWxsPSIjOUM5Qzk5Ii8+CjxwYXRoIGQ9Ik04IDEyLjVMMTAuNSAxNEg1LjVMOCAxMi41WiIgZmlsbD0iIzlDOUM5OSIvPgo8L3N2Zz4K';
    }
}

// Format folder path for display - clean up and make more readable
function formatFolderPath(folderPath) {
    if (!folderPath) {
        return null; // Root folder or no folder
    }
    
    // Clean up common browser bookmark folder names
    let cleanPath = folderPath;
    
    // Remove common browser root folders that are not meaningful
    cleanPath = cleanPath.replace(/^(Bookmarks Bar|Other Bookmarks|Mobile Bookmarks)\/?/, '');
    
    // If path is empty after cleanup, return null (root)
    if (!cleanPath) {
        return null;
    }
    
    // Replace forward slashes with arrow symbols for better readability
    cleanPath = cleanPath.replace(/\//g, ' → ');
    
    // Truncate very long paths (keep first and last parts)
    if (cleanPath.length > 40) {
        const parts = cleanPath.split(' → ');
        if (parts.length > 3) {
            cleanPath = parts[0] + ' → ... → ' + parts[parts.length - 1];
        } else {
            // Simple truncation for long single folder names
            cleanPath = cleanPath.substring(0, 37) + '...';
        }
    }
    
    return cleanPath;
}

// Toggle bookmark details visibility
function toggleBookmarkDetails(button) {
    const targetId = button.getAttribute('data-target');
    const detailsRow = document.getElementById(targetId);
    
    if (detailsRow) {
        const isExpanded = detailsRow.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            detailsRow.classList.remove('expanded');
            button.classList.remove('expanded');
            button.textContent = '▶'; // Right arrow
        } else {
            // Expand
            detailsRow.classList.add('expanded');
            button.classList.add('expanded');
            button.textContent = '▼'; // Down arrow
        }
    }
}

// Show delete confirmation dialog
function showDeleteConfirmation(bookmarkId, domain, buttonElement) {
    // Find the bookmark details
    const bookmark = findBookmarkById(bookmarkId);
    if (!bookmark) {
        console.error('Bookmark not found:', bookmarkId);
        return;
    }
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'bookmark-confirm-dialog';
    
    dialog.innerHTML = `
        <div class="bookmark-confirm-content">
            <h3 class="bookmark-confirm-title">🗑️ Delete Bookmark</h3>
            <div class="bookmark-confirm-message">
                Are you sure you want to delete this bookmark?<br>
                <strong>${bookmark.title || 'Untitled'}</strong><br>
                <em>${bookmark.url}</em>
            </div>
            <div class="bookmark-confirm-actions">
                <button class="bookmark-confirm-btn cancel">Cancel</button>
                <button class="bookmark-confirm-btn delete">Delete</button>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    const cancelBtn = dialog.querySelector('.cancel');
    const deleteBtn = dialog.querySelector('.delete');
    
    cancelBtn.addEventListener('click', function() {
        document.body.removeChild(dialog);
    });
    
    deleteBtn.addEventListener('click', function() {
        deleteBookmark(bookmarkId, domain, buttonElement);
        document.body.removeChild(dialog);
    });
    
    // Close dialog when clicking outside
    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
}

// Find bookmark by ID in the data structure
function findBookmarkById(bookmarkId) {
    for (const bookmark of bookmarksData) {
        if (bookmark.id === bookmarkId) {
            return bookmark;
        }
    }
    return null;
}

// Delete bookmark using Chrome API
async function deleteBookmark(bookmarkId, domain, buttonElement) {
    try {
        // Delete bookmark using Chrome bookmarks API
        await chrome.bookmarks.remove(bookmarkId);
        
        // Remove from local data structures
        removeBookmarkFromData(bookmarkId, domain);
        
        // Remove the bookmark item from DOM
        const bookmarkItem = buttonElement.closest('.bookmark-item');
        if (bookmarkItem) {
            bookmarkItem.remove();
        }
        
        // Update the bookmark count in the domain row
        updateDomainRowAfterDelete(domain);
        
        // Refresh charts and statistics
        updateStats();
        updateCharts();
        updateDomainTable();
        
        // Show success message
        showNotification('✅ Bookmark deleted successfully', 'success');
        
    } catch (error) {
        console.error('Error deleting bookmark:', error);
        showNotification('❌ Failed to delete bookmark: ' + error.message, 'error');
    }
}

// Remove bookmark from local data structures
function removeBookmarkFromData(bookmarkId, domain) {
    // Remove from bookmarksData array
    const bookmarkIndex = bookmarksData.findIndex(bookmark => bookmark.id === bookmarkId);
    if (bookmarkIndex !== -1) {
        bookmarksData.splice(bookmarkIndex, 1);
    }
    
    // Remove from domainsData
    if (domainsData[domain] && domainsData[domain].bookmarks) {
        const domainBookmarkIndex = domainsData[domain].bookmarks.findIndex(bookmark => bookmark.id === bookmarkId);
        if (domainBookmarkIndex !== -1) {
            domainsData[domain].bookmarks.splice(domainBookmarkIndex, 1);
            domainsData[domain].count--;
            
            // If no bookmarks left for this domain, remove it entirely
            if (domainsData[domain].count <= 0) {
                delete domainsData[domain];
            } else {
                // Update lastAdded to the most recent remaining bookmark
                const remainingBookmarks = domainsData[domain].bookmarks;
                if (remainingBookmarks.length > 0) {
                    const mostRecent = remainingBookmarks.reduce((latest, current) => 
                        current.dateAdded > latest.dateAdded ? current : latest
                    );
                    domainsData[domain].lastAdded = mostRecent.dateAdded;
                    domainsData[domain].lastTitle = mostRecent.title;
                }
            }
        }
    }
}

// Update domain row display after bookmark deletion
function updateDomainRowAfterDelete(domain) {
    const domainData = domainsData[domain];
    if (!domainData) {
        // Domain has no bookmarks left, refresh the entire table
        updateDomainTable();
        return;
    }
    
    // Find and update the domain row
    const domainRows = document.querySelectorAll('#domainTableBody tr');
    domainRows.forEach(row => {
        const cells = row.children;
        if (cells.length >= 5 && cells[1].textContent === domain) {
            // Update count
            cells[2].textContent = domainData.count.toLocaleString();
            
            // Update percentage
            const percentage = ((domainData.count / bookmarksData.length) * 100).toFixed(1);
            cells[3].textContent = percentage + '%';
            
            // Update last added
            const lastAddedDate = new Date(domainData.lastAdded).toLocaleDateString('id-ID');
            cells[4].textContent = `${lastAddedDate} (${domainData.lastTitle})`;
            
            // Update bookmark count in the expanded details header
            const expandBtn = cells[0].querySelector('.expand-btn');
            if (expandBtn) {
                const detailsId = expandBtn.getAttribute('data-target');
                const detailsRow = document.getElementById(detailsId);
                if (detailsRow) {
                    const header = detailsRow.querySelector('h4');
                    if (header) {
                        header.textContent = `📚 Bookmark dari ${domain} (${domainData.count} item):`;
                    }
                }
            }
        }
    });
}

// Show notification message
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        max-width: 300px;
    `;
    
    // Set background color based on type
    if (type === 'success') {
        notification.style.backgroundColor = '#27ae60';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#e74c3c';
    } else {
        notification.style.backgroundColor = '#3498db';
    }
    
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
