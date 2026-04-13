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
    
    // Recovery of last state from localStorage
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
    
    // Load combined data from global variable (db_data.js)
    if (typeof COMBINED_DB !== 'undefined') {
        combinedData = COMBINED_DB;
        console.log('Combined data loaded from JS');
        updateResponsibleDatalist();
    } else {
        console.warn('COMBINED_DB not found. Dynamic lists will be disabled.');
    }
    
    // Listen for project type changes to update responsible list
    document.querySelectorAll('input[name="project-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastProjectType', e.target.value);
            updateResponsibleDatalist();
            checkOverdueActivities();
            
            // Handle label change for Okul Özel Projesi
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
    
    // Trigger change event once to set initial state
    document.querySelector('input[name="project-type"]:checked').dispatchEvent(new Event('change'));
    
    // Also attach to radio buttons for date status text change behavior
    document.querySelectorAll('input[name="activity-status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastActivityStatus', e.target.value);
            const inputVal = document.getElementById('responsible-teacher').value.trim();
            if (inputVal && inputVal.length > 2) {
                checkOverdueActivities();
            }
        });
    });

    // Listen for responsible selection to check overdue tasks and handle multiple selection
    const respInput = document.getElementById('responsible-teacher');
    const suggestionsPanel = document.getElementById('suggestions-panel');

    respInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const lastCommaIndex = val.lastIndexOf(',');
        const currentFragment = val.substring(lastCommaIndex + 1).trim();

        if (currentFragment.length >= 2) {
            renderSuggestions(currentFragment);
        } else {
            suggestionsPanel.style.display = 'none';
        }
        
        // Modal will only trigger after 3s of silence instead of 1s
        debounceAudit();
    });

    // Show suggestions when clicked or focused
    respInput.addEventListener('focus', () => {
        const val = respInput.value;
        const lastCommaIndex = val.lastIndexOf(',');
        const currentFragment = val.substring(lastCommaIndex + 1).trim();
        renderSuggestions(currentFragment); // Show suggestions even for empty/short strings on focus
    });

    respInput.addEventListener('click', () => {
        const val = respInput.value;
        const lastCommaIndex = val.lastIndexOf(',');
        const currentFragment = val.substring(lastCommaIndex + 1).trim();
        renderSuggestions(currentFragment);
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!respInput.contains(e.target) && !suggestionsPanel.contains(e.target)) {
            suggestionsPanel.style.display = 'none';
        }
    });
    
    // Modal Close Listeners
    document.getElementById('close-overdue').onclick = hideOverdueModal;
    document.getElementById('overdue-ok-btn').onclick = hideOverdueModal;

    // Clear Button Listener
    document.getElementById('clear-responsible').addEventListener('click', () => {
        respInput.value = '';
        suggestionsPanel.style.display = 'none';
        respInput.focus();
        // Hide the clear button itself is handled by CSS (:placeholder-shown)
    });

    // Unreported Actions Listener
    document.getElementById('unreported-actions-btn').addEventListener('click', checkUnreportedActivities);
    
    // Reported Actions Listener
    document.getElementById('reported-actions-btn').addEventListener('click', checkReportedActivities);
    
    // Excel Export Listener
    const exportBtn = document.getElementById('export-excel-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
});

function checkUnreportedActivities() {
    console.log('Checking unreported activities...');
    if (!combinedData) {
        alert('Veritabanı henüz yüklenmedi, lütfen biraz bekleyip tekrar deneyin.');
        return;
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    let unreportedTasks = [];
    
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const statusRadio = document.querySelector('input[name="activity-status"]:checked').value;
    
    // Check only the selected database
    const databases = [
        { data: combinedData.og_db, type: 'OKUL GELİŞİM PROJESİ' },
        { data: combinedData.oo_db, type: 'OKUL ÖZEL PROJESİ' }
    ].filter(db => db.type === selectedType);

    databases.forEach(dbObj => {
        if (!dbObj.data) return;
        dbObj.data.forEach(item => {
            const taskName = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev;
            if (!taskName) return;

            // Check if ANY report exists for this activity
            const isReported = savedReportsCache.some(r => r.activityName === taskName);
            if (isReported) return;

            // Check if end date has passed
            const startStr = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.y1_bas : item.baslangic_1;
            const endStr = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.y1_bit : item.bitis_1;
            const dateToCheck = (endStr && endStr !== 'NaN' && endStr !== '...') ? endStr : startStr;

            if (dateToCheck && typeof dateToCheck === 'string' && dateToCheck.includes('.')) {
                const parts = dateToCheck.split('.');
                const taskEndDate = new Date(parts[2], parts[1] - 1, parts[0]);
                
                let isMatch = false;
                if (statusRadio === 'expired') {
                    isMatch = taskEndDate < today;
                } else {
                    isMatch = taskEndDate >= today;
                }

                if (isMatch) {
                    unreportedTasks.push({
                        name: taskName,
                        start: startStr,
                        end: endStr && endStr !== 'NaN' ? endStr : '...',
                        person: dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi,
                        type: dbObj.type
                    });
                }
            }
        });
    });

    console.log(`Found ${unreportedTasks.length} unreported tasks.`);
    if (unreportedTasks.length > 0) {
        showUnreportedModal(unreportedTasks);
    } else {
        alert('Seçili olan projede ve durumda, raporu girilmemiş etkinlik bulunamadı.');
    }
}

function showUnreportedModal(tasks) {
    // We can reuse the overdue modal structure but update content
    const modal = document.getElementById('overdue-modal');
    const title = modal.querySelector('.modal-header h3');
    const desc = modal.querySelector('#modal-desc');
    const list = document.getElementById('overdue-list');
    
    // Backup original header/desc if needed or just overwrite
    title.innerHTML = `<i class="fas fa-clipboard-list"></i> Hiç Rapor Girilmemiş Eylemler(${tasks.length})`;
    desc.textContent = 'Süresi geçmiş ancak hiçbir sorumlu tarafından raporu henüz girilmemiş eylemler:';
    
    list.innerHTML = '';
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = 'overdue-item';
        // Note: Blue border instead of the usual primary for this global list
        li.style.borderColor = '#60a5fa'; 
        li.innerHTML = `
            <span class="overdue-name">${t.name}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-users"></i> ${t.person}</span>
            </div>
            <div class="overdue-actions" style="margin-top: 0.5rem;">
                <button class="btn-action-sm cancel-task-btn" style="background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2);" data-name="${t.name.replace(/"/g, '&quot;')}" data-person="${t.person.replace(/"/g, '&quot;')}" data-type="${t.type}" data-start="${t.start}" data-end="${t.end}">
                    <i class="fas fa-ban"></i> Faaliyeti İptal Et
                </button>
            </div>
            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; text-transform: uppercase;">${t.type}</div>
        `;
        list.appendChild(li);
    });
    
    // Add close listener that restores titles (simple way)
    const originalTitle = '<i class="fas fa-file-invoice"></i> Rapor Yazılması Gereken Eylemler';
    const originalDesc = 'Seçilen sorumluya ait bu yılın planında yer alan ancak raporu doldurulması gereken faaliyetler:';
    
    const closeBtn = document.getElementById('close-overdue');
    const okBtn = document.getElementById('overdue-ok-btn');
    
    const restoreAndClose = () => {
        modal.style.display = 'none';
        title.innerHTML = originalTitle;
        desc.textContent = originalDesc;
        // Remove individual style if any
        list.querySelectorAll('li').forEach(li => li.style.borderColor = '');
    };
    
    // Add Cancel task listeners
    list.querySelectorAll('.cancel-task-btn').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Bu faaliyeti "İPTAL" olarak işaretlemek istediğinize emin misiniz?')) return;
            const pw = prompt('İptal işlemi için yönetici şifresini giriniz:');
            if (pw !== '4321') {
                alert('Hatalı şifre! İşlem reddedildi.');
                return;
            }
            
            const tNode = e.currentTarget;
            const dummyReport = {
                eduYear: document.getElementById('edu-year').value,
                projectType: tNode.dataset.type,
                activityName: tNode.dataset.name,
                activityType: '-',
                teacher: tNode.dataset.person,
                participantProfile: '-',
                totalParticipants: '',
                location: '-',
                startDate: tNode.dataset.start,
                endDate: tNode.dataset.end,
                duration: '',
                cost: '',
                documentNo: '',
                status: 'İPTAL',
                purpose: '-',
                difficulties: '-',
                suggestions: 'Faaliyet iptal edilmiştir.',
                collaborations: '-',
                evaluation: '-',
                docs: '-',
                fillerName: 'Sistem',
                fillerRole: 'Yönetici',
                fillerDate: new Date().toISOString().split('T')[0],
                reportingPerson: 'Sistem Yöneticisi',
                timestamp: new Date().getTime()
            };
            
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const addRequest = store.add(dummyReport);
            
            addRequest.onsuccess = () => {
                syncSavedReportsCache();
                const itemDiv = tNode.closest('.overdue-item');
                if (itemDiv) itemDiv.remove();
                if (list.children.length === 0) {
                    restoreAndClose();
                }
            };
        };
    });
    
    closeBtn.onclick = restoreAndClose;
    okBtn.onclick = restoreAndClose;

    modal.style.display = 'flex';
}

function checkReportedActivities() {
    console.log('Checking reported activities...');
    if (!combinedData) {
        alert('Veritabanı henüz yüklenmedi, lütfen biraz bekleyip tekrar deneyin.');
        return;
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    let reportedTasks = [];
    
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const statusRadio = document.querySelector('input[name="activity-status"]:checked').value;
    
    const databases = [
        { data: combinedData.og_db, type: 'OKUL GELİŞİM PROJESİ' },
        { data: combinedData.oo_db, type: 'OKUL ÖZEL PROJESİ' }
    ].filter(db => db.type === selectedType);

    databases.forEach(dbObj => {
        if (!dbObj.data) return;
        dbObj.data.forEach(item => {
            const taskName = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev;
            if (!taskName) return;

            const isReported = savedReportsCache.some(r => r.activityName === taskName);
            if (!isReported) return;

            const startStr = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.y1_bas : item.baslangic_1;
            const endStr = dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.y1_bit : item.bitis_1;
            const dateToCheck = (endStr && endStr !== 'NaN' && endStr !== '...') ? endStr : startStr;

            if (dateToCheck && typeof dateToCheck === 'string' && dateToCheck.includes('.')) {
                const parts = dateToCheck.split('.');
                const taskEndDate = new Date(parts[2], parts[1] - 1, parts[0]);
                
                let isMatch = false;
                if (statusRadio === 'expired') {
                    isMatch = taskEndDate < today;
                } else {
                    isMatch = taskEndDate >= today;
                }

                if (isMatch) {
                    // Find actual filler
                    const matchingReport = savedReportsCache.find(r => r.activityName === taskName);
                    reportedTasks.push({
                        name: taskName,
                        start: startStr,
                        end: endStr && endStr !== 'NaN' ? endStr : '...',
                        person: dbObj.type === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi,
                        type: dbObj.type,
                        filler: matchingReport ? matchingReport.fillerName : ''
                    });
                }
            }
        });
    });

    if (reportedTasks.length > 0) {
        showReportedModal(reportedTasks);
    } else {
        alert('Seçili olan projede ve durumda, daha önceden raporlanmış etkinlik bulunamadı.');
    }
}

function showReportedModal(tasks) {
    const modal = document.getElementById('overdue-modal');
    const title = modal.querySelector('.modal-header h3');
    const desc = modal.querySelector('#modal-desc');
    const list = document.getElementById('overdue-list');
    
    title.innerHTML = `<i class="fas fa-check-circle"></i> Raporu Girilmiş Eylemler (${tasks.length})`;
    desc.textContent = 'Aşağıdaki faaliyetler daha önceden raporlanmıştır:';
    
    list.innerHTML = '';
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = 'overdue-item reported-item';
        let reporterHtml = t.filler ? `<div style="font-size:0.75rem; color:#10b981; margin-top:4px;"><i class="fas fa-check"></i> Raporu Dolduran: ${t.filler}</div>` : '';
        li.innerHTML = `
            <span class="overdue-name">${t.name}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-users"></i> ${t.person}</span>
                ${reporterHtml}
            </div>
            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; text-transform: uppercase;">${t.type}</div>
        `;
        list.appendChild(li);
    });
    
    const originalTitle = '<i class="fas fa-file-invoice"></i> Rapor Yazılması Gereken Eylemler';
    const originalDesc = 'Seçilen sorumluya ait bu yılın planında yer alan ancak raporu doldurulması gereken faaliyetler:';
    
    const closeBtn = document.getElementById('close-overdue');
    const okBtn = document.getElementById('overdue-ok-btn');
    
    const restoreAndClose = () => {
        modal.style.display = 'none';
        title.innerHTML = originalTitle;
        desc.textContent = originalDesc;
    };
    
    closeBtn.onclick = restoreAndClose;
    okBtn.onclick = restoreAndClose;

    modal.style.display = 'flex';
}

function renderSuggestions(fragment) {
    if (!combinedData) return;
    const panel = document.getElementById('suggestions-panel');
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    
    // Get all unique responsibles
    let items = selectedType === 'OKUL GELİŞİM PROJESİ' 
        ? combinedData.og_db.map(item => item.sorumlu) 
        : combinedData.oo_db.map(item => item.sorumlu_verisi);
    
    const uniqueResponsibles = new Set();
    items.forEach(item => {
        if (!item) return;
        item.split(',').forEach(part => {
            const trimmed = part.trim();
            if (trimmed) uniqueResponsibles.add(trimmed);
        });
    });

    const filtered = Array.from(uniqueResponsibles)
        .filter(name => name.toLocaleLowerCase('tr').includes(fragment.toLocaleLowerCase('tr')))
        .sort();

    if (filtered.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = '';
    filtered.forEach(name => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<i class="fas fa-user-tag"></i> ${name}`;
        div.onclick = () => {
            const input = document.getElementById('responsible-teacher');
            const currentVal = input.value;
            const lastCommaIndex = currentVal.lastIndexOf(',');
            
            let newValue = '';
            if (lastCommaIndex === -1) {
                newValue = name;
            } else {
                newValue = currentVal.substring(0, lastCommaIndex + 1).trim() + ' ' + name;
            }
            
            input.value = newValue + ', ';
            panel.style.display = 'none';
            input.focus();
            
            // Immediate audit when a selection is confirmed
            checkOverdueActivities();
        };
        panel.appendChild(div);
    });

    panel.style.display = 'block';
}

const debounceAudit = debounce(checkOverdueActivities, 3000);

// Helper: Debounce function to prevent excessive checks
function debounce(func, wait) {
    let timeout;
    return function() {
        clearTimeout(timeout);
        timeout = setTimeout(func, wait);
    };
}

// Helper: Parse DD.MM.YYYY to YYYY-MM-DD
function parseDBDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('.')) return null;
    const parts = dateStr.trim().split('.');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

// Helper: Ignore list management
function getIgnoredTasks() {
    return JSON.parse(localStorage.getItem('pfds_ignored_tasks') || '{}');
}

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

function isAlreadyReported(person, activityName) {
    return savedReportsCache.some(report => 
        report.activityName === activityName && 
        (report.reportingPerson === person || 
         (report.teacher && report.teacher.toLocaleLowerCase('tr').includes(person.toLocaleLowerCase('tr'))))
    );
}

// Optimized matching: If reportingPerson is exact match, use it. Otherwise fallback to fuzzy teacher match if reportingPerson is missing.
function isSpecificReported(person, activityName) {
    return savedReportsCache.some(report => 
        report.activityName === activityName && 
        report.reportingPerson === person
    );
}


function updateResponsibleDatalist() {
    // Custom suggestions panel handles this now
}

function checkOverdueActivities() {
    if (!combinedData) return;
    
    const fullValue = document.getElementById('responsible-teacher').value.trim();
    if (!fullValue) return;

    // Split by comma to check multiple people
    const names = fullValue.split(',').map(n => n.trim()).filter(n => n.length >= 3);
    if (names.length === 0) return;

    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const statusRadio = document.querySelector('input[name="activity-status"]:checked').value;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let dbSource = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    let modalTasks = [];
    let seenTasks = new Set(); 

    names.forEach(name => {
        dbSource.forEach(item => {
            const respText = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi;
            const taskId = selectedType === 'OKUL GELİŞİM PROJESİ' ? `og-${item.no}` : `oo-${item.sira}`;
            
            if (respText && respText.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr'))) {
                if (seenTasks.has(taskId)) return;
                
                const startStr = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bas : item.baslangic_1;
                const endStr = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bit : item.bitis_1;
                const dateToCheck = (endStr && endStr !== 'NaN' && endStr !== '...') ? endStr : startStr;

                if (dateToCheck && typeof dateToCheck === 'string' && dateToCheck.includes('.')) {
                    const parts = dateToCheck.split('.');
                    const taskEndDate = new Date(parts[2], parts[1] - 1, parts[0]);
                    
                    let isMatch = false;
                    if (statusRadio === 'expired') {
                        isMatch = taskEndDate < today;
                    } else {
                        isMatch = taskEndDate >= today;
                    }

                    if (isMatch) {
                        seenTasks.add(taskId);
                        
                        const activityName = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev;
                        const hasReport = isSpecificReported(name, activityName) || isAlreadyReported(name, activityName);
                        
                        if (!hasReport && isTaskIgnored(name, taskId)) return;
                        
                        let fillerTxt = "";
                        if (hasReport) {
                            const matchingReport = savedReportsCache.find(r => r.activityName === activityName && (r.reportingPerson === name || (r.teacher && r.teacher.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr')))));
                            if(matchingReport) fillerTxt = matchingReport.fillerName;
                        }
                        
                        modalTasks.push({
                            id: taskId,
                            name: activityName,
                            start: startStr,
                            end: endStr && endStr !== 'NaN' ? endStr : '...',
                            person: respText, // Full list instead of just searched name
                            isReported: hasReport,
                            filler: fillerTxt
                        });
                    }
                }
            }
        });
    });

    if (modalTasks.length > 0) {
        showOverdueModal(modalTasks);
    } else if (names.length > 0) {
        const statusText = statusRadio === 'expired' ? 'Süresi Dolan' : 'Devam Eden';
        alert(`Belirtilen sorumlunun ${selectedType} planında "${statusText}" statüsünde faaliyeti bulunmamaktadır.`);
    }
}

function showOverdueModal(tasks) {
    const list = document.getElementById('overdue-list');
    list.innerHTML = '';
    
    // Update Title based on Radio state
    const statusRadio = document.querySelector('input[name="activity-status"]:checked').value;
    const titleText = statusRadio === 'expired' ? 'Süresi Dolan Faaliyetler (' + tasks.length + ')' : 'Devam Eden Faaliyetler (' + tasks.length + ')';
    
    const modalEl = document.getElementById('overdue-modal');
    modalEl.querySelector('.modal-header h3').innerHTML = '<i class="fas fa-file-invoice"></i> ' + titleText;
    
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;

    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.isReported ? 'overdue-item reported-item' : 'overdue-item';
        
        let reporterHtml = t.isReported && t.filler ? `<div style="font-size:0.75rem; color:#10b981; margin-top:4px;"><i class="fas fa-check"></i> Raporu Dolduran: ${t.filler}</div>` : '';
        
        li.innerHTML = `
            <span class="overdue-name">${t.name}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${t.person}</span>
                ${reporterHtml}
            </div>
            <div class="overdue-actions">
                ${!t.isReported ? `<button class="btn-secondary btn-action-sm btn-ignore" data-id="${t.id}" data-person="${t.person}">
                    <i class="fas fa-trash-alt"></i> Listeden Kaldır
                </button>` : ''}
                <button class="btn-primary btn-action-sm btn-fill" data-id="${t.id}" data-type="${selectedType}">
                    <i class="fas fa-edit"></i> Rapor Doldur
                </button>
            </div>
        `;
        list.appendChild(li);
    });
    
    // Add Click Listeners
    list.querySelectorAll('.btn-ignore').forEach(btn => {
        btn.onclick = (e) => {
            const pw = prompt('Bu eylemi listeden kaldırmak için yetkili şifresini giriniz:');
            if (pw !== '321') {
                alert('Hatalı şifre! İşlem iptal edildi.');
                return;
            }
            const id = e.currentTarget.dataset.id;
            const person = e.currentTarget.dataset.person;
            ignoreTask(person, id);
            // Refresh modal or remove item
            e.currentTarget.closest('.overdue-item').remove();
            if (list.children.length === 0) hideOverdueModal();
        };
    });

    list.querySelectorAll('.btn-fill').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            const type = e.currentTarget.dataset.type;
            const person = e.currentTarget.closest('.overdue-item').querySelector('.overdue-person').textContent.replace(' ', '').trim();
            // Actually dataset person is better, it was there
            const realPerson = e.currentTarget.previousElementSibling.dataset.person; 
            
            currentReportingPerson = realPerson;
            fillReportForm(id, type);
            hideOverdueModal();
        };
    });

    document.getElementById('overdue-modal').style.display = 'flex';
}

function fillReportForm(taskId, selectedType) {
    if (!combinedData) return;
    
    let dbSource = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    const item = dbSource.find(i => {
        const currentId = selectedType === 'OKUL GELİŞİM PROJESİ' ? `og-${i.no}` : `oo-${i.sira}`;
        return currentId === taskId;
    });

    if (!item) return;

    // 1. Activity Name
    const name = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.eylem_adi : item.eylem_gorev;
    document.getElementById('activity-name').value = name;

    // 2. All Responsibles for this task
    const respText = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.sorumlu : item.sorumlu_verisi;
    if (respText) {
        // Ensure it ends with a comma for better UX with the suggestion system if needed
        document.getElementById('responsible-teacher').value = respText.trim() + ', ';
    }

    // 3. Dates
    const startStr = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bas : item.baslangic_1;
    const endStr = selectedType === 'OKUL GELİŞİM PROJESİ' ? item.y1_bit : item.bitis_1;

    const formattedStart = parseDBDate(startStr);
    const formattedEnd = parseDBDate(endStr);

    if (formattedStart) document.getElementById('activity-start').value = formattedStart;
    if (formattedEnd) document.getElementById('activity-end').value = formattedEnd;

    // Scroll to form top and give feedback
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log(`Form filled for task: ${taskId}`);
}

function hideOverdueModal() {
    document.getElementById('overdue-modal').style.display = 'none';
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

// Validation Logic
function validateForm() {
    const requiredInputIds = [
        'activity-name', 'total-participants', 'activity-location', 
        'activity-start', 'activity-end', 'total-duration', 'cost',
        'purpose', 'difficulties', 'suggestions', 'collaborations', 
        'evaluation', 'filler-name', 'filler-role', 'filler-date', 'responsible-teacher'
    ];
    
    for (const id of requiredInputIds) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            alert('Lütfen tüm zorunlu alanları doldurun! (Evrak No hariç)');
            if(el) el.focus();
            return false;
        }
    }

    const aType = getCheckboxValues('activity-type', 'type-other-check', 'type-other-text');
    if (!aType) { alert('Faaliyetin Türü alanından en az bir seçim yapınız!'); document.getElementById('activity-type-container').scrollIntoView(); return false; }
    
    const pProfile = getCheckboxValues('participant-profile', 'participant-other-check', 'participant-other-text');
    if (!pProfile) { alert('Katılımcı Profili alanından en az bir seçim yapınız!'); return false; }
    
    const docs = getCheckboxValues('docs', 'docs-other-check', 'docs-other-text');
    if (!docs) { alert('Teslim Edilen Belgeler alanından en az bir seçim yapınız!'); return false; }

    return true;
}

function getFormData() {
    const reportStatusRadio = document.querySelector('input[name="report-status"]:checked');
    const taskStatus = reportStatusRadio ? reportStatusRadio.value : 'Tamamlandı';

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
        status: taskStatus,
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
        timestamp: new Date().getTime()
    };
}

// Save Report
saveBtn.addEventListener('click', () => {
    if (!validateForm()) return;
    
    const reportData = getFormData();

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const addRequest = store.add(reportData);

    addRequest.onsuccess = () => {
        alert('Rapor başarıyla kaydedildi!');
        syncSavedReportsCache(); // Refresh cache after save
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
        printContent.querySelector('#p-cost').textContent = data.cost || '0';
        printContent.querySelector('#p-document-no').textContent = data.documentNo || '-';
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
                #preview-container { width: 210mm; min-height: 297mm; max-height: 297mm; overflow: hidden; box-sizing: border-box; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; position: relative; }
                .action-bar { max-width: 210mm; margin: 0 auto 20px auto; display: flex; justify-content: flex-end; padding: 0; gap: 10px; }
                .btn-print { background: #ff7e5f; color: white; border: none; padding: 10px 20px; border-radius: 50px; cursor: pointer; font-family: sans-serif; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(255,126,95,0.3); transition: transform 0.2s; }
                .btn-download { background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 50px; cursor: pointer; font-family: sans-serif; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(99,102,241,0.3); transition: transform 0.2s; }
                .btn-print:hover, .btn-download:hover { transform: translateY(-2px); }
                img { max-width: 80px; height: auto; }
                @media print {
                    @page { size: A4; margin: 0; }
                    body { background: white !important; padding: 0 !important; }
                    .action-bar { display: none !important; }
                    #preview-container { box-shadow: none !important; border-radius: 0 !important; padding: 8mm !important; margin: 0 !important; width: 100% !important; height: 297mm !important; overflow: hidden; }
                }
            </style>
        `;

        const printIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';
        const downloadIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

        win.document.write('<!DOCTYPE html><html><head><title>Rapor Önizleme</title>' + styles + '</head><body>');
        win.document.write('<div class="action-bar">');
        win.document.write('<button class="btn-download" onclick="window.downloadPDF()">' + downloadIcon + ' PDF İndir</button>');
        win.document.write('<button class="btn-print" onclick="window.print()">' + printIcon + ' Hemen Yazdır</button>');
        win.document.write('</div>');
        win.document.write('<div id="preview-container" id="capture">');
        win.document.write(printContent.innerHTML);
        win.document.write('</div>');

        win.document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>');
        win.document.write('<script>');
        win.document.write(`
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
        `);
        win.document.write('</script>');
        win.document.write('</body></html>');
        win.document.close();
        
    } catch (error) {
        console.error('Print Error:', error);
        alert('İşlem sırasında bir hata oluştu: ' + error.message);
    }
}

// EXCEL EXPORT (Multi-Sheet Enhanced)
async function exportToExcel() {
    if (!db || !combinedData) {
        alert('Veritabanı bağlantısı veya plan verisi henüz hazır değil.');
        return;
    }

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
        const reports = getAllRequest.result;
        const matchedReportIds = new Set();
        
        // Helper: Clean for matching
        const clean = (text) => {
            if (!text) return "";
            let t = text.toString().toLowerCase()
                .replace(/İ/g, 'i').replace(/ı/g, 'i')
                .toLocaleLowerCase('tr-TR');
            t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return t.replace(/[^a-z0-9]/g, '');
        };

        // Plan Row Mapper
        const mapPlanWithReport = (planItem, report, type) => {
            const row = {
                // Plan Data
                'ID': type === 'OG' ? `OG-${planItem.no}` : `OO-${planItem.sira}`,
                'Kod': planItem.kod || '',
                'Eylem/Görev Adı': type === 'OG' ? planItem.eylem_adi : planItem.eylem_gorev,
                'Sorumlular (Plan)': type === 'OG' ? planItem.sorumlu : planItem.sorumlu_verisi,
                'Başlangıç (Plan)': type === 'OG' ? planItem.y1_bas : planItem.baslangic_1,
                'Bitiş (Plan)': type === 'OG' ? planItem.y1_bit : planItem.bitis_1,
                
                // Status
                'DURUM': report && report.status ? report.status : (report ? 'TAMAMLANDI' : 'EKSİK'),
                
                // Report Data (if exists)
                'Raporlanan Faaliyet': report ? report.activityName : '',
                'Faaliyet Türü': report ? report.activityType : '',
                'Rapor Tarihi': report ? `${report.startDate} / ${report.endDate}` : '',
                'Yer': report ? report.location : '',
                'Katılımcı Profili': report ? report.participantProfile : '',
                'Kişi Sayısı': report ? report.totalParticipants : '',
                'Süre (Saat)': report ? report.duration : '',
                'Maliyeti': report ? (report.cost || '0') : '',
                'Raporu Dolduran Sorumlu': report ? (report.reportingPerson || '---') : '',
                'Formu Dolduran Kişi': report ? report.fillerName : '',
                'Evrak No': report ? (report.documentNo || '') : '',
                'Doldurma Tarihi': report ? report.fillerDate : '',
                'Öneri/Gerçekleşen Değer': report ? report.suggestions : '',
                'Değerlendirme': report ? report.evaluation : ''
            };
            return row;
        };

        // 1. Process School Action Plan (OG)
        const ogRows = [];
        combinedData.og_db.forEach(planItem => {
            const planKey = clean(planItem.eylem_adi);
            const matches = reports.filter(r => r.projectType === 'OKUL GELİŞİM PROJESİ' && clean(r.activityName) === planKey);
            
            if (matches.length > 0) {
                matches.forEach(m => {
                    ogRows.push(mapPlanWithReport(planItem, m, 'OG'));
                    matchedReportIds.add(m.id);
                });
            } else {
                ogRows.push(mapPlanWithReport(planItem, null, 'OG'));
            }
        });

        // 2. Process Activity Calendar (OO)
        const ooRows = [];
        combinedData.oo_db.forEach(planItem => {
            const planKey = clean(planItem.eylem_gorev);
            const matches = reports.filter(r => r.projectType === 'OKUL ÖZEL PROJESİ' && clean(r.activityName) === planKey);
            
            if (matches.length > 0) {
                matches.forEach(m => {
                    ooRows.push(mapPlanWithReport(planItem, m, 'OO'));
                    matchedReportIds.add(m.id);
                });
            } else {
                ooRows.push(mapPlanWithReport(planItem, null, 'OO'));
            }
        });

        // 3. Process Unmatched Reports
        const unmatchedReports = reports.filter(r => !matchedReportIds.has(r.id));
        const otherRows = unmatchedReports.map(r => ({
            'Rapor Adı': r.activityName,
            'Proje Türü': r.projectType,
            'Durum': r.status ? r.status : 'PLAN HARİCİ / EŞLEŞEMEDİ',
            'Sorumlular': r.teacher,
            'Tarih': `${r.startDate} - ${r.endDate}`,
            'Yer': r.location,
            'Katılımcılar': r.totalParticipants,
            'Maliyeti': r.cost || '0',
            'Evrak No': r.documentNo || '',
            'Öneri/Gerçekleşen Değer': r.suggestions || '',
            'Dolduran': r.fillerName,
            'Timestamp': new Date(r.timestamp).toLocaleString('tr-TR')
        }));

        // Create Workbook
        const wb = XLSX.utils.book_new();
        
        // Add Sheets
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ogRows), "Okul Gelişim Projesi");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ooRows), "Okul Özel Projesi");
        
        if (otherRows.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(otherRows), "Diğer Raporlar");
        }

        // Trigger Download
        const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '_');
        const fileName = `IAAL_PTS_Faaliyet_Raporu_${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    getAllRequest.onerror = () => {
        alert('Raporlar veritabanından alınırken bir hata oluştu.');
    };
}

// Global Print Button (For current form)
directPrintBtn.addEventListener('click', () => {
    if (!validateForm()) return;
    printReport(getFormData());
});

// Bypass validation on right-click for the print button
directPrintBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Prevent standard right-click menu
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
            const rpLabel = report.reportingPerson ? `<span class="report-person-tag">${report.reportingPerson}</span>` : '';
            card.innerHTML = `
                <div>
                    <h3 style="margin-bottom: 0.3rem;">${report.activityName} ${rpLabel}</h3>
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
