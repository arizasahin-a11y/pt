// Database Configuration
const DB_NAME = 'PFDS_Database';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let db;

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
const printBtn = document.getElementById('print-btn');
const directPrintBtn = document.getElementById('direct-print-btn');
const historyBtn = document.getElementById('history-btn');
const backToFormBtn = document.getElementById('back-to-form');
const savedReportsSection = document.getElementById('saved-reports');
const reportsList = document.getElementById('reports-list');

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    calculateEduYear();
});

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

// PDF Generation Logic (Preview in new tab)
async function generatePDF(data) {
    const printArea = document.getElementById('print-content');
    const printWrapper = document.getElementById('print-wrapper');
    
    try {
        // Populate content
        fillPrintTemplate(data);

        // Wait for styles/content
        await new Promise(r => setTimeout(r, 200));

        // CRITICAL FIX: Make it visible JUST during capture
        printWrapper.style.opacity = '1';
        printWrapper.style.position = 'static';
        printWrapper.style.zIndex = '1';

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `Rapor_${(data.activityName || 'dosya').replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const pdf = await html2pdf().set(opt).from(printArea).output('bloburl');
        window.open(pdf, '_blank');
        
        // Hide it back
        printWrapper.style.opacity = '0';
        printWrapper.style.position = 'fixed';
        printWrapper.style.zIndex = '-1000';
        
    } catch (err) {
        console.error('PDF Error:', err);
        alert('PDF oluşturulurken bir hata oluştu.');
    }
}

// Helper: Fill the hidden template with data
function fillPrintTemplate(data) {
    document.getElementById('p-date-top').textContent = data.fillerDate ? new Date(data.fillerDate).toLocaleDateString('tr-TR') : '..../....';
    document.getElementById('p-edu-year').textContent = data.eduYear;
    document.getElementById('p-type-area').textContent = data.projectType;
    document.getElementById('p-name').textContent = data.activityName || '';
    document.getElementById('p-type').textContent = data.activityType || '';
    document.getElementById('p-teacher').textContent = data.teacher || '';
    document.getElementById('p-profile').textContent = data.participantProfile || '';
    document.getElementById('p-count').textContent = data.totalParticipants || '';
    document.getElementById('p-location').textContent = data.location || '';
    document.getElementById('p-dates').textContent = formatDateRange(data.startDate, data.endDate);
    document.getElementById('p-duration').textContent = data.duration || '';
    document.getElementById('p-purpose').textContent = data.purpose || '';
    document.getElementById('p-difficulties').textContent = data.difficulties || '';
    document.getElementById('p-suggestions').textContent = data.suggestions || '';
    document.getElementById('p-collaborations').textContent = data.collaborations || '';
    document.getElementById('p-evaluation').textContent = data.evaluation || '';
    document.getElementById('p-docs').textContent = data.docs || '';
    const fDate = data.fillerDate ? new Date(data.fillerDate).toLocaleDateString('tr-TR') : '';
    document.getElementById('p-filler').textContent = `${data.fillerName || ''}\n${data.fillerRole || ''}\n${fDate}`;
}

// PDF Preview Button
printBtn.addEventListener('click', () => generatePDF(getFormData()));

// Direct Print Button (The most reliable method)
directPrintBtn.addEventListener('click', () => {
    const data = getFormData();
    fillPrintTemplate(data);
    
    // Very short delay to ensure DOM update
    setTimeout(() => {
        window.print(); // This will trigger the CSS @media print rules
    }, 100);
});

// Helper: Get current form data
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
                    <button class="btn-secondary" style="padding: 0.5rem 1rem;" onclick='printRecord(${JSON.stringify(report).replace(/'/g, "&apos;")})'>
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button class="btn-secondary" style="padding: 0.5rem 1rem; color: #ef4444;" onclick="deleteRecord(${report.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            reportsList.appendChild(card);
        });
    };
}

window.printRecord = (data) => {
    generatePDF(data);
};

window.deleteRecord = (id) => {
    if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id).onsuccess = () => loadReports();
    }
};
