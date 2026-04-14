// Database Configuration
const DB_NAME = 'PFDS_Database';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let db;
let combinedData = null;
let savedReportsCache = []; // Cache for filtering overdue list
let currentReportingPerson = null; // Track who is currently filling from the modal

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
    syncSavedReportsCache();
};

request.onerror = (event) => {
    console.error('Database error:', event.target.error);
};

async function syncSavedReportsCache() {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
        savedReportsCache = getAllRequest.result;
        console.log(`Cache updated: ${savedReportsCache.length} reports.`);
    };
}

// Automatic Academic Year Calculation
function calculateEduYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    let eduYear = "";
    if (month < 1) { // Before/In January
        eduYear = `${year} - ${year + 1}`;
    } else { // After January
        eduYear = `${year - 1} - ${year}`;
    }
    const el = document.getElementById('edu-year');
    if (el) el.value = eduYear;
}

// Helper: Track if an input has a meaningful value
function updateFilledState(el) {
    if (!el) return;
    if (el.type === 'radio' || el.type === 'checkbox') return;

    const val = el.value ? el.value.trim() : "";
    let hasValue = val.length > 0;

    if (hasValue) {
        el.classList.add('has-value');
    } else {
        el.classList.remove('has-value');
    }
}

// Selectors
const form = document.getElementById('activity-form');
const saveBtn = document.getElementById('save-btn');
const directPrintBtn = document.getElementById('direct-print-btn');
const historyBtn = document.getElementById('history-btn');
const backToFormBtn = document.getElementById('back-to-form');
const savedReportsSection = document.getElementById('saved-reports');
const reportsList = document.getElementById('reports-list');

// Initialize Core Application
window.addEventListener('DOMContentLoaded', () => {
    calculateEduYear();
    
    // Recovery of last state
    const lastType = localStorage.getItem('lastProjectType');
    if (lastType) {
        const typeRadio = document.querySelector(`input[name="project-type"][value="${lastType}"]`);
        if (typeRadio) typeRadio.checked = true;
    }

    const lastStatus = localStorage.getItem('lastActivityStatus');
    if (lastStatus) {
        const statusRadio = document.querySelector(`input[name="activity-status"][value="${lastStatus}"]`);
        if (statusRadio) statusRadio.checked = true;
    }
    
    // Initial load through database overlay
    if (typeof COMBINED_DB !== 'undefined') {
        const checkInterval = setInterval(() => {
            if (db) {
                clearInterval(checkInterval);
                refreshCombinedData();
            }
        }, 100);
    }
    
    // Master Download Button
    const downloadMasterBtn = document.getElementById('download-master-btn');
    if (downloadMasterBtn) downloadMasterBtn.onclick = downloadMasterJson;

    // Listeners for inputs (Visual feedback)
    document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea').forEach(el => {
        el.addEventListener('input', () => updateFilledState(el));
        el.addEventListener('change', () => updateFilledState(el));
        el.addEventListener('blur', () => updateFilledState(el));
        updateFilledState(el);
    });
    
    // Listen for project type changes
    document.querySelectorAll('input[name="project-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastProjectType', e.target.value);
            checkOverdueActivities();
            
            // Handle label update for Okul Özel Projesi
            const selectedType = document.querySelector('input[name="project-type"]:checked').value;
            const suggestionsLabel = document.getElementById('suggestions-label');
            const pSuggestionsLabel = document.getElementById('p-suggestions-label');
            
            if (selectedType === 'OKUL ÖZEL PROJESİ') {
                if (suggestionsLabel) suggestionsLabel.textContent = 'Gerçekleşen Değer';
                if (pSuggestionsLabel) pSuggestionsLabel.textContent = 'Gerçekleşen Değer:';
            } else {
                if (suggestionsLabel) suggestionsLabel.textContent = 'İyileştirme Önerileri';
                if (pSuggestionsLabel) pSuggestionsLabel.textContent = 'İyileştirme Önerileri:';
            }
        });
    });
    
    // Initial State Dispatch
    const initialType = document.querySelector('input[name="project-type"]:checked');
    if (initialType) initialType.dispatchEvent(new Event('change'));

    // Status changes listener
    document.querySelectorAll('input[name="activity-status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastActivityStatus', e.target.value);
            checkOverdueActivities();
        });
    });

    // --- SUGGESTIONS SYSTEM ---
    const respInput = document.getElementById('responsible-teacher');
    const suggestionsPanel = document.getElementById('suggestions-panel');
    const activityInput = document.getElementById('activity-name');
    const activityPanel = document.getElementById('activity-suggestions-panel');

    respInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const lastCommaIndex = val.lastIndexOf(',');
        const currentFragment = val.substring(lastCommaIndex + 1).trim();
        if (currentFragment.length >= 2) renderSuggestions(currentFragment);
        else suggestionsPanel.style.display = 'none';
        debounceAudit();
    });

    respInput.addEventListener('focus', () => renderSuggestions(respInput.value.substring(respInput.value.lastIndexOf(',') + 1).trim()));
    respInput.addEventListener('click', () => renderSuggestions(respInput.value.substring(respInput.value.lastIndexOf(',') + 1).trim()));

    // Activity Suggestions with filtering by Responsible
    activityInput.addEventListener('input', (e) => renderActivitySuggestions(e.target.value));
    activityInput.addEventListener('focus', () => renderActivitySuggestions(activityInput.value));
    activityInput.addEventListener('click', () => renderActivitySuggestions(activityInput.value));

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!respInput.contains(e.target) && !suggestionsPanel.contains(e.target)) suggestionsPanel.style.display = 'none';
        if (!activityInput.contains(e.target) && !activityPanel.contains(e.target)) activityPanel.style.display = 'none';
    });

    // Clear Button logic
    const clearRespBtn = document.getElementById('clear-responsible');
    if (clearRespBtn) {
        clearRespBtn.addEventListener('click', () => {
            respInput.value = '';
            suggestionsPanel.style.display = 'none';
            respInput.focus();
            updateFilledState(respInput);
        });
    }

    // Modal listeners
    const outClose = document.getElementById('close-overdue');
    const okClose = document.getElementById('overdue-ok-btn');
    if (outClose) outClose.onclick = hideOverdueModal;
    if (okClose) okClose.onclick = hideOverdueModal;

    // Report Actions Listeners
    document.getElementById('unreported-actions-btn').onclick = checkUnreportedActivities;
    document.getElementById('reported-actions-btn').onclick = checkReportedActivities;
    document.getElementById('export-excel-btn').onclick = exportToExcel;

    // Principal Name (Shift + Right Click on Title)
    const mainTitle = document.getElementById('main-title');
    if (mainTitle) {
        mainTitle.title = "Okul müdürünü değiştirmek için Shift+Sağ Tık yapın";
        mainTitle.addEventListener('mousedown', (e) => {
            if (e.shiftKey && e.button === 2) {
                e.preventDefault();
                const current = localStorage.getItem('schoolPrincipal') || '';
                const name = prompt('Okul Müdürü İsmini Giriniz:', current);
                if (name !== null) {
                    localStorage.setItem('schoolPrincipal', name.trim());
                    alert('Okul Müdürü güncellendi: ' + name.trim());
                }
            }
        });
        // Also suppress context menu to avoid overlap
        mainTitle.addEventListener('contextmenu', (e) => {
            if (e.shiftKey) e.preventDefault();
        });
    }

    // History Toggle
    historyBtn.onclick = () => { form.style.display = 'none'; savedReportsSection.style.display = 'block'; loadReports(); };
    backToFormBtn.onclick = () => { savedReportsSection.style.display = 'none'; form.style.display = 'block'; };

    // Direct Print
    directPrintBtn.onclick = () => { if (validateForm()) printReport(getFormData()); };
    directPrintBtn.oncontextmenu = (e) => { e.preventDefault(); printReport(getFormData()); };

    setTimeout(() => { document.querySelectorAll('input, textarea').forEach(updateFilledState); }, 500);
});

// --- CORE LOGIC FUNCTIONS ---

async function refreshCombinedData() {
    if (typeof COMBINED_DB === 'undefined' || !db) return;
    combinedData = JSON.parse(JSON.stringify(COMBINED_DB));
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
        const reports = getAllRequest.result;
        reports.sort((a, b) => a.timestamp - b.timestamp).forEach(report => {
            if (report.status === 'Güncellendi') applyOverlayUpdate(combinedData, report);
        });
        console.log('Data synchronization complete.');
    };
}

function applyOverlayUpdate(targetDb, report) {
    const dbKey = report.projectType === 'OKUL GELİŞİM PROJESİ' ? 'og_db' : 'oo_db';
    const list = targetDb[dbKey];
    if (!list) return;

    const actionKey = dbKey === 'og_db' ? 'eylem_adi' : 'eylem_gorev';
    const item = list.find(i => (i[actionKey] || "").toString().trim() === (report.activityName || "").toString().trim());
    if (!item) return;

    const n = (parseInt(report.eduYear.split('-')[0].trim()) - 2025) + 1;
    if (n < 1 || n > 4) return;

    const parse = (s) => (s && s !== 'NaN') ? new Date(s.split('.')[2], s.split('.')[1]-1, s.split('.')[0]) : null;
    const format = (d) => `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;

    const newStart = parse(report.startDate);
    const newEnd = parse(report.endDate);
    if (!newStart || !newEnd) return;

    const startKey = dbKey === 'og_db' ? `y${n}_bas` : `baslangic_${n}`;
    const endKey = dbKey === 'og_db' ? `y${n}_bit` : `bitis_${n}`;

    const oldStart = parse(item[startKey]);
    const durationMs = newEnd.getTime() - newStart.getTime();

    item[startKey] = format(newStart);
    item[endKey] = format(newEnd);
    if (dbKey === 'og_db') item.sorumlu = report.teacher;
    else item.sorumlu_verisi = report.teacher;

    if (oldStart) {
        const deltaMs = newStart.getTime() - oldStart.getTime();
        for (let i = n + 1; i <= 4; i++) {
            const nS = dbKey === 'og_db' ? `y${i}_bas` : `baslangic_${i}`;
            const nE = dbKey === 'og_db' ? `y${i}_bit` : `bitis_${i}`;
            const pS = parse(item[nS]);
            if (pS) {
                const s = new Date(pS.getTime() + deltaMs);
                const e = new Date(s.getTime() + durationMs);
                item[nS] = format(s);
                item[nE] = format(e);
            }
        }
    }
}

function renderSuggestions(fragment) {
    if (!combinedData) return;
    const panel = document.getElementById('suggestions-panel');
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    
    let items = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db.map(item => item.sorumlu) : combinedData.oo_db.map(item => item.sorumlu_verisi);
    const unique = new Set();
    items.forEach(it => { if (it) it.split(',').forEach(p => { if (p.trim()) unique.add(p.trim()); }); });

    const filtered = Array.from(unique).filter(n => n.toLocaleLowerCase('tr').includes(fragment.toLocaleLowerCase('tr'))).sort();
    if (filtered.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    filtered.slice(0, 10).forEach(name => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<i class="fas fa-user-tag"></i> ${name}`;
        div.onclick = () => {
            const input = document.getElementById('responsible-teacher');
            const current = input.value;
            const lastIdx = current.lastIndexOf(',');
            input.value = (lastIdx === -1 ? name : current.substring(0, lastIdx + 1).trim() + ' ' + name) + ', ';
            panel.style.display = 'none';
            input.focus();
            updateFilledState(input);
            checkOverdueActivities();
        };
        panel.appendChild(div);
    });
    panel.style.display = 'block';
}

function renderActivitySuggestions(fragment) {
    if (!combinedData) return;
    const panel = document.getElementById('activity-suggestions-panel');
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const respValue = document.getElementById('responsible-teacher').value.trim();
    
    const list = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    if (!list) return;

    let filtered = list;
    if (respValue) {
        const teachers = respValue.split(',').map(s => s.trim().toLocaleLowerCase('tr')).filter(s => s.length > 0);
        if (teachers.length > 0) {
            filtered = list.filter(item => {
                const itemSorumlu = (selectedType === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi) || "";
                const itemT = itemSorumlu.toLocaleLowerCase('tr');
                return teachers.every(t => itemT.includes(t));
            });
        }
    }

    const final = filtered.filter(it => {
        const name = (selectedType === 'OKUL GELİŞİM PROJESİ' ? it.eylem_adi : it.eylem_gorev) || "";
        const pool = (name + " " + (it.kod || "")).toLocaleLowerCase('tr');
        return pool.includes(fragment.toLocaleLowerCase('tr'));
    });

    if (final.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    final.slice(0, 12).forEach(item => {
        const nameText = (selectedType === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev);
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.style.flexDirection = 'column'; div.style.alignItems = 'flex-start';
        div.innerHTML = `<div>${item.kod ? `<b>[${item.kod}]</b> ` : ''}${nameText}</div><div style="font-size: 0.7rem; color: #94a3b8;">${selectedType === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi}</div>`;
        div.onclick = () => {
            activityInput.value = nameText;
            panel.style.display = 'none';
            activityInput.focus();
            updateFilledState(activityInput);
        };
        panel.appendChild(div);
    });
    panel.style.display = 'block';
}

function checkOverdueActivities() {
    if (!combinedData) return;
    const names = document.getElementById('responsible-teacher').value.split(',').map(n => n.trim()).filter(n => n.length >= 3);
    if (names.length === 0) return;

    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const statusRadio = document.querySelector('input[name="activity-status"]:checked').value;
    const today = new Date(); today.setHours(0,0,0,0);
    
    let dbSource = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    let modalTasks = [];
    let seen = new Set(); 

    names.forEach(name => {
        dbSource.forEach(item => {
            const isOG = selectedType === 'OKUL GELİŞİM PROJESİ';
            const resp = isOG ? item.sorumlu : item.sorumlu_verisi;
            const tid = isOG ? `og-${item.no}` : `oo-${item.sira}`;
            
            if (resp && resp.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr')) && !seen.has(tid)) {
                const dateStr = isOG ? (item.y1_bit || item.y1_bas) : (item.bitis_1 || item.baslangic_1);
                const taskDate = parseDBDate(dateStr);
                
                if (taskDate) {
                    const dt = new Date(taskDate);
                    const isMatch = statusRadio === 'expired' ? dt < today : dt >= today;
                    
                    if (isMatch) {
                        if (isTaskIgnored(name, tid)) return; // Check ignore list
                        seen.add(tid);
                        const aName = isOG ? item.eylem_adi : item.eylem_gorev;
                        const hasRep = savedReportsCache.some(r => r.activityName === aName && (r.reportingPerson === name || (r.teacher && r.teacher.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr')))));
                        
                        modalTasks.push({ 
                            id: tid, 
                            name: aName, 
                            start: isOG ? item.y1_bas : item.baslangic_1, 
                            end: isOG ? item.y1_bit : item.bitis_1, 
                            person: resp, 
                            isReported: hasRep 
                        });
                    }
                }
            }
        });
    });
    if (modalTasks.length > 0) showOverdueModal(modalTasks);
}

function showOverdueModal(tasks) {
    const list = document.getElementById('overdue-list');
    list.innerHTML = '';
    const modalEl = document.getElementById('overdue-modal');
    modalEl.querySelector('.modal-header h3').innerHTML = '<i class="fas fa-file-invoice"></i> Görev Listesi (' + tasks.length + ')';
    
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.isReported ? 'overdue-item reported-item' : 'overdue-item';
        li.innerHTML = `
            <span class="overdue-name">${t.name}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${t.person}</span>
            </div>
            <div class="overdue-actions">
                <button class="btn-primary btn-action-sm btn-fill" data-id="${t.id}" data-type="${document.querySelector('input[name="project-type"]:checked').value}">
                    <i class="fas fa-edit"></i> Raporu Doldur
                </button>
            </div>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.btn-fill').forEach(btn => {
        btn.onclick = (e) => {
            fillReportForm(e.currentTarget.dataset.id, e.currentTarget.dataset.type);
            hideOverdueModal();
        };
    });
    modalEl.style.display = 'flex';
}

function fillReportForm(taskId, selectedType) {
    if (!combinedData) return;
    const dbSource = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    const item = dbSource.find(i => (selectedType === 'OKUL GELİŞİM PROJESİ' ? `og-${i.no}` : `oo-${i.sira}`) === taskId);
    if (!item) return;

    document.getElementById('activity-name').value = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev;
    document.getElementById('responsible-teacher').value = (selectedType === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi).trim() + ', ';
    
    const start = parseDBDate(selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bas : item.baslangic_1);
    const end = parseDBDate(selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bit : item.bitis_1);
    if (start) document.getElementById('activity-start').value = start;
    if (end) document.getElementById('activity-end').value = end;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('input, textarea').forEach(updateFilledState);
}

function hideOverdueModal() { document.getElementById('overdue-modal').style.display = 'none'; }
function validateForm() {
    const ids = ['activity-name', 'total-participants', 'activity-location', 'activity-start', 'activity-end', 'total-duration', 'cost', 'filler-name', 'filler-role', 'filler-date', 'responsible-teacher'];
    for (const id of ids) { const el = document.getElementById(id); if (!el || !el.value.trim()) { alert('Tüm alanları doldurun!'); el.focus(); return false; } }
    return true;
}

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
        cost: document.getElementById('cost').value,
        documentNo: document.getElementById('document-no').value,
        status: document.querySelector('input[name="report-status"]:checked').value,
        purpose: document.getElementById('purpose').value,
        difficulties: document.getElementById('difficulties').value,
        suggestions: document.getElementById('suggestions').value,
        collaborations: document.getElementById('collaborations').value,
        evaluation: document.getElementById('evaluation').value,
        docs: getCheckboxValues('docs', 'docs-other-check', 'docs-other-text'),
        fillerName: document.getElementById('filler-name').value,
        fillerRole: document.getElementById('filler-role').value,
        fillerDate: document.getElementById('filler-date').value,
        reportingPerson: currentReportingPerson,
        principalName: localStorage.getItem('schoolPrincipal') || '',
        timestamp: new Date().getTime()
    };
}

saveBtn.addEventListener('click', async () => {
    if (!validateForm()) return;
    const data = getFormData();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).add(data).onsuccess = () => {
        alert('Rapor kaydedildi!'); form.reset(); refreshCombinedData(); syncSavedReportsCache();
        document.querySelectorAll('.has-value').forEach(el => el.classList.remove('has-value'));
    };
});

function printReport(data) {
    const pc = document.getElementById('print-content').cloneNode(true);
    const fill = (id, val) => { const el = pc.querySelector(id); if (el) el.textContent = val || ''; };
    fill('#p-edu-year', data.eduYear); fill('#p-type-area', data.projectType); fill('#p-name', data.activityName);
    fill('#p-type', data.activityType); fill('#p-teacher', data.teacher); fill('#p-profile', data.participantProfile);
    fill('#p-count', data.totalParticipants); fill('#p-location', data.location); 
    fill('#p-dates', formatDateRange(data.startDate, data.endDate)); fill('#p-duration', data.duration);
    fill('#p-cost', data.cost); fill('#p-document-no', data.documentNo); fill('#p-purpose', data.purpose);
    fill('#p-difficulties', data.difficulties); fill('#p-suggestions', data.suggestions);
    fill('#p-collaborations', data.collaborations); fill('#p-evaluation', data.evaluation); fill('#p-docs', data.docs);
    const fDate = data.fillerDate ? new Date(data.fillerDate).toLocaleDateString('tr-TR') : '';
    fill('#p-filler', `${data.fillerName}\n${data.fillerRole}\n${fDate}`);
    
    // Formatting Principal Name (First name Initial caps, Surname ALL CAPS)
    if (pc.querySelector('#p-principal-name')) {
        const rawName = data.principalName || '';
        const parts = rawName.trim().split(/\s+/);
        if (parts.length > 0) {
            const surname = parts.pop().toLocaleUpperCase('tr-TR');
            const names = parts.map(n => n.charAt(0).toLocaleUpperCase('tr-TR') + n.slice(1).toLocaleLowerCase('tr-TR'));
            pc.querySelector('#p-principal-name').textContent = [...names, surname].join(' ');
        }
    }

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up engelleyiciyi kapatın!'); return; }

    const styles = `
        <style>
            body { background: #f0f2f5; margin: 0; padding: 20px; font-family: 'Times New Roman', serif; }
            #preview-container { width: 210mm; background: white; padding: 30px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; position: relative; min-height: 297mm; }
            .action-bar { max-width: 210mm; margin: 0 auto 20px auto; display: flex; justify-content: flex-end; gap: 10px; }
            .btn-action { padding: 10px 20px; border-radius: 50px; cursor: pointer; border: none; font-weight: bold; color: white; display: flex; align-items: center; gap: 8px; font-family: sans-serif; }
            .btn-print { background: #ff7e5f; }
            .btn-download { background: #6366f1; }
            @media print { .action-bar { display: none !important; } body { background: white; padding: 0; } #preview-container { box-shadow: none; border-radius: 0; padding: 10mm; } }
        </style>
    `;

    win.document.write(`
        <html>
        <head>
            <title>Rapor Önizleme</title>
            ${styles}
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        </head>
        <body>
            <div class="action-bar">
                <button class="btn-action btn-download" onclick="window.downloadPDF()">PDF İndir</button>
                <button class="btn-action btn-print" onclick="window.print()">Hemen Yazdır</button>
            </div>
            <div id="preview-container">
                ${pc.innerHTML}
            </div>
            <script>
                window.downloadPDF = function() {
                    const element = document.getElementById('preview-container');
                    const opt = {
                        margin: 0,
                        filename: 'Rapor_${new Date().getTime()}.pdf',
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };
                    html2pdf().set(opt).from(element).save();
                };
            </script>
        </body>
        </html>
    `);
    win.document.close();
}

function downloadMasterJson() {
    if (!combinedData) return;
    const blob = new Blob([JSON.stringify(combinedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'combined_db.json'; a.click();
}

function exportToExcel() {
    if (!combinedData) { alert('Veri henüz hazır değil.'); return; }
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
        const reports = getAllRequest.result;
        const matchedIds = new Set();
        
        const clean = (t) => t ? t.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : "";

        const mapRow = (pItem, report, type) => ({
            'ID': type === 'OG' ? `OG-${pItem.no}` : `OO-${pItem.sira}`,
            'Kod': pItem.kod || '',
            'Eylem/Görev Adı': type === 'OG' ? pItem.eylem_adi : pItem.eylem_gorev,
            'Sorumlular (Plan)': type === 'OG' ? pItem.sorumlu : pItem.sorumlu_verisi,
            'Başlangıç (Plan)': type === 'OG' ? pItem.y1_bas : pItem.baslangic_1,
            'Bitiş (Plan)': type === 'OG' ? pItem.y1_bit : pItem.bitis_1,
            'DURUM': report ? report.status : 'EKSİK',
            'Raporlanan Faaliyet': report ? report.activityName : '',
            'Süre (Saat)': report ? report.duration : '',
            'Maliyeti': report ? report.cost : '',
            'Dolduran': report ? report.fillerName : '',
            'Tarih': report ? report.fillerDate : ''
        });

        // School Action Plan (OG)
        const ogRows = combinedData.og_db.map(p => {
            const m = reports.find(r => r.projectType === 'OKUL GELİŞİM PROJESİ' && clean(r.activityName) === clean(p.eylem_adi));
            if (m) matchedIds.add(m.id);
            return mapRow(p, m, 'OG');
        });

        // Activity Calendar (OO)
        const ooRows = combinedData.oo_db.map(p => {
            const m = reports.find(r => r.projectType === 'OKUL ÖZEL PROJESİ' && clean(r.activityName) === clean(p.eylem_gorev));
            if (m) matchedIds.add(m.id);
            return mapRow(p, m, 'OO');
        });

        // Unmatched
        const unmatched = reports.filter(r => !matchedIds.has(r.id)).map(r => ({
            'Rapor Adı': r.activityName,
            'Tür': r.projectType,
            'Durum': 'PLAN HARİCİ',
            'Tarih': r.fillerDate
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ogRows), "Okul Gelişim Projesi");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ooRows), "Okul Özel Projesi");
        if (unmatched.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatched), "Diğer");
        
        XLSX.writeFile(wb, `IAAL_PTS_Rapor_${new Date().getTime()}.xlsx`);
    };
}

function loadReports() {
    reportsList.innerHTML = '';
    db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        e.target.result.sort((a,b)=>b.timestamp-a.timestamp).forEach(r => {
            const div = document.createElement('div');
            div.className = 'report-card';
            div.innerHTML = `<div><h3>${r.activityName}</h3><p>${r.teacher}</p></div><button onclick='window.printRecord(${JSON.stringify(r)})'>Yazdır</button>`;
            reportsList.appendChild(div);
        });
    };
}

window.printRecord = (data) => printReport(data);

function parseDBDate(s) { 
    if (!s || s.indexOf('.') === -1) return null;
    const p = s.split('.'); return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

function getCheckboxValues(name, otherCheckId, otherTextId) {
    const cbs = document.querySelectorAll(`input[name="${name}"]:checked`);
    let vals = Array.from(cbs).map(c => c.value);
    const oc = document.getElementById(otherCheckId);
    if (oc && oc.checked) { vals = vals.filter(v=>v!=='Diğer'); vals.push(document.getElementById(otherTextId).value); }
    return vals.join(', ');
}

function checkUnreportedActivities() {
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }
    const status = document.querySelector('input[name="activity-status"]:checked').value;
    const type = document.querySelector('input[name="project-type"]:checked').value;
    const isOG = type === 'OKUL GELİŞİM PROJESİ';
    const today = new Date(); today.setHours(0,0,0,0);
    
    let list = isOG ? combinedData.og_db : combinedData.oo_db;
    let results = [];

    list.forEach(item => {
        const name = isOG ? item.eylem_adi : item.eylem_gorev;
        if (!name) return;
        if (savedReportsCache.some(r => r.activityName === name)) return;

        const dStr = isOG ? (item.y1_bit || item.y1_bas) : (item.bitis_1 || item.baslangic_1);
        const dt = parseDBDate(dStr);
        if (dt) {
            const d = new Date(dt);
            if (status === 'expired' ? d < today : d >= today) {
                const start = isOG ? item.y1_bas : item.baslangic_1;
                const end = isOG ? item.y1_bit : item.bitis_1;
                const person = isOG ? item.sorumlu : item.sorumlu_verisi;
                results.push({ id: isOG ? `og-${item.no}` : `oo-${item.sira}`, name, start, end, person, type });
            }
        }
    });

    if (results.length > 0) showStatusModal('Hiç Rapor Girilmemiş Eylemler', results);
    else alert('Kriterlere uygun eylem bulunamadı.');
}

function checkReportedActivities() {
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }
    const status = document.querySelector('input[name="activity-status"]:checked').value;
    const type = document.querySelector('input[name="project-type"]:checked').value;
    const isOG = type === 'OKUL GELİŞİM PROJESİ';
    const today = new Date(); today.setHours(0,0,0,0);

    let list = isOG ? combinedData.og_db : combinedData.oo_db;
    let results = [];

    list.forEach(item => {
        const name = isOG ? item.eylem_adi : item.eylem_gorev;
        const report = savedReportsCache.find(r => r.activityName === name);
        if (!report) return;

        const dStr = isOG ? (item.y1_bit || item.y1_bas) : (item.bitis_1 || item.baslangic_1);
        const dt = parseDBDate(dStr);
        if (dt) {
            const d = new Date(dt);
            if (status === 'expired' ? d < today : d >= today) {
                const person = isOG ? item.sorumlu : item.sorumlu_verisi;
                results.push({ id: isOG ? `og-${item.no}` : `oo-${item.sira}`, name, start: report.startDate, end: report.endDate, person, filler: report.fillerName, reported: true });
            }
        }
    });

    if (results.length > 0) showStatusModal('Raporu Girilmiş Eylemler', results);
    else alert('Kriterlere uygun eylem bulunamadı.');
}

// --- HELPERS & IGNORE LOGIC ---
function getIgnoredTasks() { return JSON.parse(localStorage.getItem('pfds_ignored_tasks') || '{}'); }
function ignoreTask(person, taskId) {
    const ignored = getIgnoredTasks();
    if (!ignored[person]) ignored[person] = [];
    if (!ignored[person].includes(taskId)) {
        ignored[person].push(taskId);
        localStorage.setItem('pfds_ignored_tasks', JSON.stringify(ignored));
    }
}
function isTaskIgnored(person, taskId) {
    const ignored = getIgnoredTasks();
    return ignored[person] && ignored[person].includes(taskId);
}

function showStatusModal(title, tasks) {
    const list = document.getElementById('overdue-list');
    list.innerHTML = '';
    const modal = document.getElementById('overdue-modal');
    modal.querySelector('.modal-header h3').innerHTML = `<i class="fas fa-list"></i> ${title} (${tasks.length})`;
    
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.reported ? 'overdue-item reported-item' : 'overdue-item';
        
        const ignoreBtn = !t.reported ? `
            <button class="btn-secondary btn-action-sm" style="background:#ef4444; color:white; border:none;" onclick="handleIgnoreTask(event, '${t.person}', '${t.id}')">
                <i class="fas fa-trash-alt"></i> Listeden Kaldır
            </button>` : '';

        li.innerHTML = `
            <span class="overdue-name">${t.name}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${t.person}</span>
                ${t.filler ? `<div style="color:#10b981; font-size:0.75rem; margin-top:4px;">Dolduran: ${t.filler}</div>` : ''}
            </div>
            <div class="overdue-actions">
                ${ignoreBtn}
                <button class="btn-primary btn-action-sm btn-fill" onclick="fillFromModal('${t.name}', '${t.person}', '${t.start}', '${t.end}')">Rapor Doldur</button>
            </div>
        `;
        list.appendChild(li);
    });
    modal.style.display = 'flex';
}

window.handleIgnoreTask = (e, person, tid) => {
    const pw = prompt('Bu eylemi listeden kaldırmak için yetkili şifresini giriniz:');
    if (pw === '321') {
        ignoreTask(person, tid);
        e.target.closest('.overdue-item').remove();
        if (document.getElementById('overdue-list').children.length === 0) hideOverdueModal();
    } else {
        alert('Hatalı şifre!');
    }
};

window.fillFromModal = (name, person, start, end) => {
    document.getElementById('activity-name').value = name;
    document.getElementById('responsible-teacher').value = person + ', ';
    document.getElementById('activity-start').value = parseDBDate(start);
    document.getElementById('activity-end').value = parseDBDate(end);
    hideOverdueModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('input, textarea').forEach(updateFilledState);
};

function debounce(f, w) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>f(...a), w); }; }
const debounceAudit = debounce(checkOverdueActivities, 1000);
function formatDateRange(s, e) { return `${s ? new Date(s).toLocaleDateString('tr-TR') : ''} - ${e ? new Date(e).toLocaleDateString('tr-TR') : ''}`; }
