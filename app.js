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

// Selectors
const form = document.getElementById('activity-form');
const saveBtn = document.getElementById('save-btn');
const printBtn = document.getElementById('print-btn');
const historyBtn = document.getElementById('history-btn');
const backToFormBtn = document.getElementById('back-to-form');
const savedReportsSection = document.getElementById('saved-reports');
const reportsList = document.getElementById('reports-list');

// Helper: Get checkbox values (including 'Other')
function getCheckboxValues(name, otherCheckId, otherTextId) {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);
    let values = Array.from(checkboxes).map(cb => cb.value);
    
    const otherCheck = document.getElementById(otherCheckId);
    const otherText = document.getElementById(otherTextId);
    
    if (otherCheck && otherCheck.checked && otherText.value.trim() !== '') {
        // Remove the generic 'Diğer' string and replace with actual input
        values = values.filter(v => v !== 'Diğer');
        values.push(otherText.value.trim());
    }
    return values.join(', ');
}

// Save Report
saveBtn.addEventListener('click', () => {
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const reportData = {
        dateHeader: `${document.getElementById('header-date-1').value} / ${document.getElementById('header-date-2').value}`,
        eduYear: document.getElementById('edu-year').value,
        projectType: document.querySelector('input[name="project-type"]:checked').value,
        activityName: document.getElementById('activity-name').value,
        activityType: getCheckboxValues('activity-type', 'type-other-check', 'type-other-text'),
        teacher: document.getElementById('responsible-teacher').value,
        participantProfile: getCheckboxValues('participant-profile', 'participant-other-check', 'participant-other-text'),
        totalParticipants: document.getElementById('total-participants').value,
        location: document.getElementById('activity-location').value,
        activityDates: document.getElementById('activity-dates').value,
        duration: document.getElementById('total-duration').value,
        purpose: document.getElementById('purpose').value,
        difficulties: document.getElementById('difficulties').value,
        suggestions: document.getElementById('suggestions').value,
        collaborations: document.getElementById('collaborations').value,
        evaluation: document.getElementById('evaluation').value,
        docs: getCheckboxValues('docs', 'docs-other-check', 'docs-other-text'),
        fillerName: document.getElementById('filler-name').value,
        fillerRoleDate: document.getElementById('filler-role-date').value,
        timestamp: new Date().getTime()
    };

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const addRequest = store.add(reportData);

    addRequest.onsuccess = () => {
        alert('Rapor başarıyla kaydedildi!');
        form.reset();
    };
});

// PDF Generation Logic
async function generatePDF(data) {
    const printArea = document.getElementById('print-content');
    
    // Fill the hidden print template with data
    document.getElementById('p-date-top').textContent = data.dateHeader || '.... / ....';
    document.getElementById('p-edu-year').textContent = data.eduYear;
    document.getElementById('p-project-type').textContent = data.projectType;
    document.getElementById('p-name').textContent = data.activityName;
    document.getElementById('p-type').textContent = data.activityType;
    document.getElementById('p-teacher').textContent = data.teacher;
    document.getElementById('p-profile').textContent = data.participantProfile;
    document.getElementById('p-count').textContent = data.totalParticipants;
    document.getElementById('p-location').textContent = data.location;
    document.getElementById('p-dates').textContent = data.activityDates;
    document.getElementById('p-duration').textContent = data.duration;
    document.getElementById('p-purpose').textContent = data.purpose;
    document.getElementById('p-difficulties').textContent = data.difficulties;
    document.getElementById('p-suggestions').textContent = data.suggestions;
    document.getElementById('p-collaborations').textContent = data.collaborations;
    document.getElementById('p-evaluation').textContent = data.evaluation;
    document.getElementById('p-docs').textContent = data.docs;
    document.getElementById('p-filler').textContent = `${data.fillerName}\n${data.fillerRoleDate}`;

    printArea.style.display = 'block';

    const opt = {
        margin: 10,
        filename: `Rapor_${data.activityName.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(printArea).save();
    } finally {
        printArea.style.display = 'none';
    }
}

printBtn.addEventListener('click', () => {
    const reportData = {
        dateHeader: `${document.getElementById('header-date-1').value} / ${document.getElementById('header-date-2').value}`,
        eduYear: document.getElementById('edu-year').value,
        projectType: document.querySelector('input[name="project-type"]:checked').value,
        activityName: document.getElementById('activity-name').value,
        activityType: getCheckboxValues('activity-type', 'type-other-check', 'type-other-text'),
        teacher: document.getElementById('responsible-teacher').value,
        participantProfile: getCheckboxValues('participant-profile', 'participant-other-check', 'participant-other-text'),
        totalParticipants: document.getElementById('total-participants').value,
        location: document.getElementById('activity-location').value,
        activityDates: document.getElementById('activity-dates').value,
        duration: document.getElementById('total-duration').value,
        purpose: document.getElementById('purpose').value,
        difficulties: document.getElementById('difficulties').value,
        suggestions: document.getElementById('suggestions').value,
        collaborations: document.getElementById('collaborations').value,
        evaluation: document.getElementById('evaluation').value,
        docs: getCheckboxValues('docs', 'docs-other-check', 'docs-other-text'),
        fillerName: document.getElementById('filler-name').value,
        fillerRoleDate: document.getElementById('filler-role-date').value
    };
    generatePDF(reportData);
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
                    <p style="font-size: 0.85rem; color: var(--text-muted);">${report.eduYear} - ${report.activityDates || 'Tarih Belirtilmemiş'}</p>
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
