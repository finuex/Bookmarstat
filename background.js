// Fungsi untuk membuat tab baru dengan dashboard statistik
function openDashboard() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
}

// Menambahkan listener untuk klik ikon extension
chrome.action.onClicked.addListener(openDashboard);