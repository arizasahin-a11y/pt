// Database Configuration
const DB_NAME = 'PFDS_Database';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let db;
let combinedData = null;

// Initialize IndexedDB
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    console.log('Database initialized successfully');
};

request.onerror = (event) => {
    console.error('Database error:', event.target.error);
};

// Automatic Academic Year Calculation
function calculateEduYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0 is January
    
    let eduYear = "";
    if (month < 1) { // Before/In January
        eduYear = `${year} - ${year + 1}`;
    } else { // After January
        eduYear = `${year - 1} - ${year}`;
    }
    document.getElementById('edu-year').value = eduYear;
}

// Selectors
const form = document.getElementById('activity-form');
const saveBtn = document.getElementById('save-btn');
const directPrintBtn = document.getElementById('direct-print-btn');
const historyBtn = document.getElementById('history-btn');
const backToFormBtn = document.getElementById('back-to-form');
const savedReportsSection = document.getElementById('saved-reports');
const reportsList = document.getElementById('reports-list');

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    calculateEduYear();
    fetchCombinedData();
    
    // Listen for project type changes to update responsible list
    document.querySelectorAll('input[name="project-type"]').forEach(radio => {
        radio.addEventListener('change', updateResponsibleDatalist);
    });
});

async function fetchCombinedData() {
    try {
        const response = await fetch('combined_db.json');
        if (!response.ok) throw new Error('Data file not found');
        combinedData = await response.json();
        console.log('Combined data loaded');
        updateResponsibleDatalist();
    } catch (error) {
        console.warn('Could not load combined_db.json. Dynamic lists will be disabled.', error);
    }
}

function updateResponsibleDatalist() {
    if (!combinedData) return;
    
    const datalist = document.getElementById('responsible-list');
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    
    datalist.innerHTML = '';
    
    let items = [];
    if (selectedType === 'OKUL GELİŞİM PROJESİ') {
        items = combinedData.og_db.map(item => item.sorumlu);
    } else {
        items = combinedData.oo_db.map(item => item.sorumlu_verisi);
    }
    
    // Unique, non-empty, and split by comma if multiple listed in one string
    const uniqueResponsibles = new Set();
    items.forEach(item => {
        if (!item) return;
        // Some entries have multiple responsibles separated by comma
        item.split(',').forEach(part => {
            const trimmed = part.trim();
            if (trimmed) uniqueResponsibles.add(trimmed);
        });
    });
    
    Array.from(uniqueResponsibles).sort().forEach(resp => {
        const option = document.createElement('option');
        option.value = resp;
        datalist.appendChild(option);
    });
}

// Helper: Get checkbox values (including 'Other')
function getCheckboxValues(name, otherCheckId, otherTextId) {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);
    let values = Array.from(checkboxes).map(cb => cb.value);
    
    const otherCheck = document.getElementById(otherCheckId);
    const otherText = document.getElementById(otherTextId);
    
    if (otherCheck && otherCheck.checked && otherText.value.trim() !== '') {
        values = values.filter(v => v !== 'Diğer');
        values.push(otherText.value.trim());
    }
    return values.join(', ');
}

// Helper: Format date for report
function formatDateRange(start, end) {
    if (!start && !end) return '....';
    const s = start ? new Date(start).toLocaleDateString('tr-TR') : '...';
    const e = end ? new Date(end).toLocaleDateString('tr-TR') : '...';
    return `${s} - ${e}`;
}

// Save Report
saveBtn.addEventListener('click', () => {
    const reportData = {
        eduYear: document.getElementById('edu-year').value,
        projectType: document.querySelector('input[name="project-type"]:checked').value,
        activityName: document.getElementById('activity-name').value,
        activityType: getCheckboxValues('activity-type', 'type-other-check', 'type-other-text'),
        teacher: document.getElementById('responsible-teacher').value,
        participantProfile: getCheckboxValues('participant-profile', 'participant-other-check', 'participant-other-text'),
        totalParticipants: document.getElementById('total-participants').value,
        location: document.getElementById('activity-location').value,
        startDate: document.getElementById('activity-start').value,
        endDate: document.getElementById('activity-end').value,
        duration: document.getElementById('total-duration').value,
        purpose: document.getElementById('purpose').value,
        difficulties: document.getElementById('difficulties').value,
        suggestions: document.getElementById('suggestions').value,
        collaborations: document.getElementById('collaborations').value,
        evaluation: document.getElementById('evaluation').value,
        docs: getCheckboxValues('docs', 'docs-other-check', 'docs-other-text'),
        fillerName: document.getElementById('filler-name').value,
        fillerRole: document.getElementById('filler-role').value,
        fillerDate: document.getElementById('filler-date').value,
        timestamp: new Date().getTime()
    };

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const addRequest = store.add(reportData);

    addRequest.onsuccess = () => {
        alert('Rapor başarıyla kaydedildi!');
        form.reset();
        calculateEduYear();
    };
});

// NEW TAB PREVIEW AND PRINT
function printReport(data) {
    try {
        // Collect the content
        const printContent = document.getElementById('print-content').cloneNode(true);
        
        // Fill the cloned content with data
        printContent.querySelector('#p-edu-year').textContent = data.eduYear;
        printContent.querySelector('#p-type-area').textContent = data.projectType;
        printContent.querySelector('#p-name').textContent = data.activityName || '';
        printContent.querySelector('#p-type').textContent = data.activityType || '';
        printContent.querySelector('#p-teacher').textContent = data.teacher || '';
        printContent.querySelector('#p-profile').textContent = data.participantProfile || '';
        printContent.querySelector('#p-count').textContent = data.totalParticipants || '';
        printContent.querySelector('#p-location').textContent = data.location || '';
        printContent.querySelector('#p-dates').textContent = formatDateRange(data.startDate, data.endDate);
        printContent.querySelector('#p-duration').textContent = data.duration || '';
        printContent.querySelector('#p-purpose').textContent = data.purpose || '';
        printContent.querySelector('#p-difficulties').textContent = data.difficulties || '';
        printContent.querySelector('#p-suggestions').textContent = data.suggestions || '';
        printContent.querySelector('#p-collaborations').textContent = data.collaborations || '';
        printContent.querySelector('#p-evaluation').textContent = data.evaluation || '';
        printContent.querySelector('#p-docs').textContent = data.docs || '';
        const fDate = data.fillerDate ? new Date(data.fillerDate).toLocaleDateString('tr-TR') : '';
        printContent.querySelector('#p-filler').textContent = `${data.fillerName || ''}\n${data.fillerRole || ''}\n${fDate}`;

        // Open new window
        const win = window.open('', '_blank');
        
        if (!win || win.closed || typeof win.closed == 'undefined') {
            alert('Lütfen tarayıcınızın pop-up (açılır pencere) engelleyicisini kapatın ve tekrar deneyin.');
            return;
        }

        // Styles for the new window
        const styles = `
            <style>
                body { background: #f0f2f5; margin: 0; padding: 20px; font-family: 'Times New Roman', serif; }
                #preview-container { max-width: 210mm; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; position: relative; }
                .action-bar { max-width: 210mm; margin: 0 auto 20px auto; display: flex; justify-content: flex-end; padding: 0; }
                .btn-print { background: #ff7e5f; color: white; border: none; padding: 12px 25px; border-radius: 50px; cursor: pointer; font-family: sans-serif; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(255,126,95,0.3); transition: transform 0.2s; }
                .btn-print:hover { transform: translateY(-2px); }
                img { max-width: 100px; height: auto; }
                @media print {
                    body { background: white !important; padding: 0 !important; }
                    .action-bar { display: none !important; }
                    #preview-container { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
                }
            </style>
        `;

        const printIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';

        win.document.write('<!DOCTYPE html><html><head><title>Rapor Önizleme</title>' + styles + '</head><body>');
        win.document.write('<div class="action-bar"><button class="btn-print" onclick="window.print()">' + printIcon + ' Raporu Hemen Yazdır</button></div>');
        win.document.write('<div id="preview-container">');
        win.document.write(printContent.innerHTML);
        win.document.write('</div></body></html>');
        win.document.close();
        
    } catch (error) {
        console.error('Print Error:', error);
        alert('İşlem sırasında bir hata oluştu: ' + error.message);
    }
}

// Function to collect form data for immediate action
function getFormData() {
    return {
        eduYear: document.getElementById('edu-year').value,
        projectType: document.querySelector('input[name="project-type"]:checked').value,
        activityName: document.getElementById('activity-name').value,
        activityType: getCheckboxValues('activity-type', 'type-other-check', 'type-other-text'),
        teacher: document.getElementById('responsible-teacher').value,
        participantProfile: getCheckboxValues('participant-profile', 'participant-other-check', 'participant-other-text'),
        totalParticipants: document.getElementById('total-participants').value,
        location: document.getElementById('activity-location').value,
        startDate: document.getElementById('activity-start').value,
        endDate: document.getElementById('activity-end').value,
        duration: document.getElementById('total-duration').value,
        purpose: document.getElementById('purpose').value,
        difficulties: document.getElementById('difficulties').value,
        suggestions: document.getElementById('suggestions').value,
        collaborations: document.getElementById('collaborations').value,
        evaluation: document.getElementById('evaluation').value,
        docs: getCheckboxValues('docs', 'docs-other-check', 'docs-other-text'),
        fillerName: document.getElementById('filler-name').value,
        fillerRole: document.getElementById('filler-role').value,
        fillerDate: document.getElementById('filler-date').value
    };
}

// Global Print Button (For current form)
directPrintBtn.addEventListener('click', () => {
    printReport(getFormData());
});

// View History
historyBtn.addEventListener('click', () => {
    form.style.display = 'none';
    savedReportsSection.style.display = 'block';
    loadReports();
});

backToFormBtn.addEventListener('click', () => {
    savedReportsSection.style.display = 'none';
    form.style.display = 'block';
});

function loadReports() {
    reportsList.innerHTML = '';
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
        const reports = getAllRequest.result;
        if (reports.length === 0) {
            reportsList.innerHTML = '<p style="color: var(--text-muted);">Henüz kaydedilmiş rapor bulunmuyor.</p>';
            return;
        }

        reports.sort((a, b) => b.timestamp - a.timestamp).forEach(report => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.innerHTML = `
                <div>
                    <h3 style="margin-bottom: 0.3rem;">${report.activityName}</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted);">${report.eduYear} - ${formatDateRange(report.startDate, report.endDate)}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-secondary" style="padding: 0.5rem;" onclick='window.printRecord(${JSON.stringify(report).replace(/'/g, "&apos;")})'>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </button>
                    <button class="btn-secondary" style="padding: 0.5rem; color: #ef4444;" onclick="deleteRecord(${report.id})">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            `;
            reportsList.appendChild(card);
        });
    };
}

window.printRecord = (data) => {
    printReport(data);
};

window.deleteRecord = (id) => {
    if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id).onsuccess = () => loadReports();
    }
};
