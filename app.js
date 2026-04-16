// Database Configuration
const DB_NAME = 'PFDS_Database';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let db;
let combinedData = null;
let savedReportsCache = []; // Cache for filtering overdue list
let currentReportingPerson = null; 
let lastSavedData = null; 
let currentRecordId = null; 
let currentModalTasks = []; // Data for printing the current modal list
let currentModalTitle = ""; // Title for the printed list

let mainForm, saveBtn, directPrintBtn, historyBtn, backToFormBtn, savedReportsSection, reportsList;
let respInput, activityInput, suggestionsPanel, activityPanel; // Global inputs for suggestion logic

// --- GLOBAL CORE FUNCTIONS (Defined early for reliable accessibility) ---

window.PFDS_DoLoadRecordInternal = function(data) {
    if (!data) return;
    try {
        console.log("Loading record into form:", data.id);
        
        // Force Switch Views using global references if available
        const f = mainForm || document.getElementById('activity-form');
        const s = savedReportsSection || document.getElementById('saved-reports');
        if (f) f.style.display = 'block';
        if (s) s.style.display = 'none';
        
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 10);

        // State update
        currentRecordId = data.id;
        lastSavedData = { ...data };

        // Field mapping
        const map = {
            'eduYear': 'edu-year', 'activityName': 'activity-name', 'teacher': 'responsible-teacher',
            'totalParticipants': 'total-participants', 'location': 'activity-location',
            'startDate': 'activity-start', 'endDate': 'activity-end', 'duration': 'total-duration',
            'cost': 'cost', 'documentNo': 'document-no', 'purpose': 'purpose',
            'difficulties': 'difficulties', 'suggestions': 'suggestions', 'collaborations': 'collaborations',
            'evaluation': 'evaluation', 'fillerName': 'filler-name', 'fillerRole': 'filler-role', 'fillerDate': 'filler-date'
        };

        for (const key in map) {
            const el = document.getElementById(map[key]);
            if (el) {
                el.value = data[key] || '';
                if (typeof updateFilledState === 'function') updateFilledState(el);
            }
        }

        // Project Type Radio
        if (data.projectType) {
            const r = document.querySelector(`input[name="project-type"][value="${data.projectType}"]`);
            if (r) r.checked = true;
        }

        // Status Radio
        if (data.status) {
            const r = document.querySelector(`input[name="report-status"][value="${data.status}"]`);
            if (r) r.checked = true;
        }

        // Multi-select Checkboxes
        if (typeof setCheckboxValues === 'function') {
            setCheckboxValues('activity-type', data.activityType, 'type-other-check', 'type-other-text');
            setCheckboxValues('participant-profile', data.participantProfile, 'participant-other-check', 'participant-other-text');
            setCheckboxValues('docs', data.docs, 'docs-other-check', 'docs-other-text');
        }

        // Refresh all filled states
        document.querySelectorAll('input, textarea').forEach(el => {
            if (typeof updateFilledState === 'function') updateFilledState(el);
        });
        
        console.log("Record loaded successfully:", data.id);
    } catch (err) {
        console.error("Error in _doLoadRecord:", err);
        alert("Kayıt yüklenirken teknik bir hata oluştu: " + err.message);
    }
};

window.PFDS_LoadRecordToForm = function(data) {
    if (!data) {
        alert("Hata: Yüklenecek veri bulunamadı.");
        return;
    }
    console.log("PFDS_LoadRecordToForm triggered", data.id);
    window.PFDS_DoLoadRecordInternal(data);
};
window.editRecord = window.PFDS_LoadRecordToForm; // Backward compatibility

window.PFDS_PrintRecord = function(data) {
    if (!data) return;
    console.log("PFDS_PrintRecord triggered", data.id);
    if (typeof printReport === 'function') {
        printReport(data);
    } else {
        alert("Yazdırma fonksiyonu henüz yüklenmedi!");
    }
};
window.printRecord = window.PFDS_PrintRecord; // Backward compatibility

function setCheckboxValues(name, csvValue, otherCheckId, otherTextId) {
    if (!csvValue) return;
    const vals = csvValue.split(',').map(v => v.trim());
    const checks = document.querySelectorAll(`input[name="${name}"]`);
    const otherCheck = document.getElementById(otherCheckId);
    const otherText = document.getElementById(otherTextId);

    checks.forEach(c => c.checked = false);
    if (otherCheck) otherCheck.checked = false;

    vals.forEach(val => {
        let found = false;
        checks.forEach(c => {
            if (c.value === val) { c.checked = true; found = true; }
        });
        if (!found && otherCheck) {
            otherCheck.checked = true;
            if (otherText) otherText.value = val;
        }
    });
}

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
    
    // If user is already on the history page, refresh the list
    if (savedReportsSection && savedReportsSection.style.display === 'block') {
        loadReports();
    }
};

request.onerror = (event) => {
    console.error('Database error:', event.target.error);
};

/**
 * Synchronizes the global cache with IndexedDB.
 * Returns a Promise that resolves when the cache is updated.
 */
function syncSavedReportsCache() {
    return new Promise((resolve) => {
        if (!db) { resolve([]); return; }
        try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getAllRequest = store.getAll();
    
            getAllRequest.onsuccess = () => {
                savedReportsCache = getAllRequest.result || [];
                console.log(`Cache updated: ${savedReportsCache.length} reports.`);
                resolve(savedReportsCache);
            };
            getAllRequest.onerror = () => {
                console.error("Cache sync failed.");
                resolve(savedReportsCache);
            };
        } catch (e) {
            console.error("Transaction failed during sync:", e);
            resolve(savedReportsCache);
        }
    });
}

// Automatic Academic Year Calculation
function calculateEduYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0=Ocak, 8=Eylül
    
    let eduYear = "";
    if (month >= 8) { // Eylül ve sonrası: yeni eğitim yılı başladı
        eduYear = `${year} - ${year + 1}`;
    } else { // Eylül'den önce: önceki yıl hala devam ediyor
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
    // Update field-wrapper state to show/hide × button
    const wrapper = el.closest('.field-wrapper');
    if (wrapper) {
        if (hasValue) wrapper.classList.add('has-content');
        else wrapper.classList.remove('has-content');
    }
    checkFormHasContent();
}

// Show/hide the top “Tüm Formu Temizle” bar based on form state
function checkFormHasContent() {
    const textIds = [
        'activity-name', 'responsible-teacher', 'total-participants', 'activity-location',
        'activity-start', 'activity-end', 'total-duration', 'cost', 'purpose',
        'difficulties', 'suggestions', 'collaborations', 'evaluation',
        'filler-name', 'filler-role', 'document-no', 'filler-date'
    ];
    const hasText = textIds.some(id => {
        const el = document.getElementById(id);
        return el && el.value.trim().length > 0;
    });
    const hasChecked = document.querySelectorAll(
        '[name="activity-type"]:checked, [name="participant-profile"]:checked, [name="docs"]:checked'
    ).length > 0;
    const bar = document.getElementById('clear-all-bar');
    if (bar) bar.style.display = (hasText || hasChecked) ? 'flex' : 'none';
}

// Clear SORUMLU field and close its suggestion panel
function clearResponsible() {
    clearField('responsible-teacher');
    const sp = document.getElementById('suggestions-panel');
    if (sp) sp.style.display = 'none';
}

// --- CLEAR HELPERS ---
function clearField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    updateFilledState(el);
    el.dispatchEvent(new Event('input'));
}

function clearCheckboxGroup(name, otherCheckId, otherTextId) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(c => { c.checked = false; });
    const oc = document.getElementById(otherCheckId);
    const ot = document.getElementById(otherTextId);
    if (oc) oc.checked = false;
    if (ot) ot.value = '';
    checkFormHasContent();
}

function clearRadioGroup(name, defaultValue) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(r => { r.checked = (r.value === defaultValue); });
    // Trigger change event on the default
    const def = document.querySelector(`input[name="${name}"][value="${defaultValue}"]`);
    if (def) def.dispatchEvent(new Event('change'));
}

function clearAllForm() {
    if (!confirm('Formdaki TÜM veriler silinecek. Emin misiniz?')) return;
    const textIds = [
        'activity-name', 'responsible-teacher', 'total-participants', 'activity-location',
        'activity-start', 'activity-end', 'total-duration', 'cost', 'purpose',
        'difficulties', 'suggestions', 'collaborations', 'evaluation',
        'filler-name', 'filler-role', 'document-no', 'filler-date'
    ];
    textIds.forEach(id => clearField(id));
    clearCheckboxGroup('activity-type', 'type-other-check', 'type-other-text');
    clearCheckboxGroup('participant-profile', 'participant-other-check', 'participant-other-text');
    clearCheckboxGroup('docs', 'docs-other-check', 'docs-other-text');
    clearRadioGroup('project-type', 'OKUL GELİŞİM PROJESİ');
    clearRadioGroup('report-status', 'Tamamlandı');
    const sp = document.getElementById('suggestions-panel');
    if (sp) sp.style.display = 'none';
    currentRecordId = null;
    lastSavedData = null;
    document.querySelectorAll('input, textarea').forEach(updateFilledState);
    checkFormHasContent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialize Core Application
window.addEventListener('DOMContentLoaded', () => {
    // Selection of UI Elements
    mainForm = document.getElementById('activity-form');
    saveBtn = document.getElementById('save-btn');
    directPrintBtn = document.getElementById('direct-print-btn');
    historyBtn = document.getElementById('history-btn');
    backToFormBtn = document.getElementById('back-to-form');
    savedReportsSection = document.getElementById('saved-reports');
    reportsList = document.getElementById('reports-list');

    calculateEduYear();
    
    // Recovery of last state
    const lastType = localStorage.getItem('lastProjectType');
    if (lastType) {
        const typeRadio = document.querySelector(`input[name="project-type"][value="${lastType}"]`);
        if (typeRadio) typeRadio.checked = true;
    }

    // Suggestions Logic Initialization
    respInput = document.getElementById('responsible-teacher');
    activityInput = document.getElementById('activity-name');
    suggestionsPanel = document.getElementById('suggestions-panel');
    activityPanel = document.getElementById('activity-suggestions-panel');

    // Show suggestions on Focus/Click
    const showSuggestionsOnFocus = (input, panel, renderFn) => {
        if (!input || !panel) return;
        input.addEventListener('focus', () => {
            const val = input.value;
            const lastComma = val.lastIndexOf(',');
            const frag = val.substring(lastComma + 1).trim();
            renderFn(frag || "");
        });
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = input.value;
            const lastComma = val.lastIndexOf(',');
            const frag = val.substring(lastComma + 1).trim();
            renderFn(frag || "");
        });
    };

    showSuggestionsOnFocus(respInput, suggestionsPanel, renderSuggestions);
    showSuggestionsOnFocus(activityInput, activityPanel, renderActivitySuggestions);

    // Hide suggestions when clicking outside
    document.addEventListener('click', () => {
        if (suggestionsPanel) suggestionsPanel.style.display = 'none';
        if (activityPanel) activityPanel.style.display = 'none';
    });
    if (suggestionsPanel) suggestionsPanel.onclick = (e) => e.stopPropagation();
    if (activityPanel) activityPanel.onclick = (e) => e.stopPropagation();

    if (respInput) {
        respInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const lastCommaIndex = val.lastIndexOf(',');
            const currentFragment = val.substring(lastCommaIndex + 1).trim();
            renderSuggestions(currentFragment);
            debounceAudit();
        });
    }

    if (activityInput) {
        activityInput.addEventListener('input', (e) => renderActivitySuggestions(e.target.value));
    }

    const lastStatus = localStorage.getItem('lastActivityStatus');
    if (lastStatus) {
        const statusRadio = document.querySelector(`input[name="report-status"][value="${lastStatus}"]`);
        if (statusRadio) statusRadio.checked = true;
    }
    
    // Initial data load - DO NOT WAIT for DB for suggestions
    if (typeof COMBINED_DB !== 'undefined') {
        refreshCombinedData();
    }

    const checkInterval = setInterval(() => {
        if (db) {
            clearInterval(checkInterval);
            refreshCombinedData(); // Re-run to pick up DB updates
            syncSavedReportsCache();
        }
    }, 200);

    // Modal Binding Stability
    const cm = document.getElementById('close-overdue');
    const ok = document.getElementById('overdue-ok-btn');
    if (cm) cm.onclick = hideOverdueModal;
    if (ok) ok.onclick = hideOverdueModal;
    
    // --- Master Control Listeners ---
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!validateForm()) return;
            
            const data = getFormData();
            if (currentRecordId) {
                // UPDATE existing record
                data.id = currentRecordId;
                const existing = await new Promise(resolve => {
                    const tx = db.transaction([STORE_NAME], 'readonly');
                    tx.objectStore(STORE_NAME).get(currentRecordId).onsuccess = (e) => resolve(e.target.result);
                });

                const doSaveAction = () => {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    transaction.objectStore(STORE_NAME).put(data).onsuccess = () => {
                        lastSavedData = JSON.parse(JSON.stringify(data));
                        alert('✅ Rapor başarıyla güncellendi!');
                        refreshCombinedData();
                        syncSavedReportsCache();
                    };
                };

                if (existing && existing.savePassword) {
                    promptVerifyPassword((enteredPw) => {
                        if (enteredPw === null) return; 
                        const MASTER = hashPassword('21012012');
                        if (hashPassword(enteredPw) === existing.savePassword || hashPassword(enteredPw) === MASTER) {
                            data.savePassword = existing.savePassword;
                            doSaveAction();
                        } else { alert('❌ Hatalı şifre! Güncelleme reddedildi.'); }
                    });
                } else {
                    promptSavePassword((pw) => {
                        if (pw === null) return;
                        if (pw) data.savePassword = hashPassword(pw);
                        doSaveAction();
                    });
                }
            } else {
                // NEW record
                promptSavePassword((password) => {
                    if (password) data.savePassword = hashPassword(password);
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const req = transaction.objectStore(STORE_NAME).add(data);
                    req.onsuccess = (e) => {
                        currentRecordId = e.target.result;
                        lastSavedData = JSON.parse(JSON.stringify(data));
                        alert('✅ Rapor başarıyla kaydedildi!');
                        refreshCombinedData();
                        syncSavedReportsCache();
                    };
                });
            }
        });
    }

    if (directPrintBtn) {
        directPrintBtn.onclick = async () => {
            if (!validateForm()) return;
            if (!lastSavedData) { alert('⚠️ Lütfen önce raporu kaydedin!'); return; }
            if (isFormDirty()) {
                if (confirm('Fomda kaydedilmemiş değişiklikler var. Kaydedip devam edilsin mi?')) {
                    await updateCurrentRecord();
                    printReport(getFormData());
                }
            } else { printReport(getFormData()); }
        };
        directPrintBtn.oncontextmenu = (e) => {
            e.preventDefault();
            printReport(getFormData());
        };
    }

    if (historyBtn) {
        historyBtn.onclick = () => { 
            if (mainForm) mainForm.style.display = 'none'; 
            if (savedReportsSection) savedReportsSection.style.display = 'block'; 
            loadReports(); 
        };
    }
    if (backToFormBtn) {
        backToFormBtn.onclick = () => { 
            if (savedReportsSection) savedReportsSection.style.display = 'none'; 
            if (mainForm) mainForm.style.display = 'block'; 
        };
    }

    // Modal Controls
    // Modal Controls
    const reportedBtn = document.getElementById('reported-actions-btn');
    const unreportedBtn = document.getElementById('unreported-actions-btn');
    if (reportedBtn) reportedBtn.onclick = async () => { await syncSavedReportsCache(); checkReportedActivities(); };
    if (unreportedBtn) unreportedBtn.onclick = async () => { await syncSavedReportsCache(); checkUnreportedActivities(); };
    
    // Fix: "Anladım" and "Close" buttons for overdue modal
    const closeBtn = document.getElementById('close-overdue');
    const okBtn = document.getElementById('overdue-ok-btn');
    if (closeBtn) closeBtn.onclick = hideOverdueModal;
    if (okBtn) okBtn.onclick = hideOverdueModal;
    
    const printModalBtn = document.getElementById('modal-print-btn');
    if (printModalBtn) {
        printModalBtn.onclick = () => printModalList(currentModalTitle, currentModalTasks);
    }
    
    // School Principal Control (Shift + Right Click on Title)
    const mainTitle = document.getElementById('main-title');
    if (mainTitle) {
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
        mainTitle.addEventListener('contextmenu', (e) => { if (e.shiftKey) e.preventDefault(); });
    }

    // Input Visual Feedback
    document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea').forEach(el => {
        el.addEventListener('input', () => updateFilledState(el));
        el.addEventListener('change', () => updateFilledState(el));
        el.addEventListener('blur', () => updateFilledState(el));
        updateFilledState(el);
    });

    // Project Type changes listeners
    document.querySelectorAll('input[name="project-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastProjectType', e.target.value);
            checkOverdueActivities();
            const selectedType = document.querySelector('input[name="project-type"]:checked').value;
            const sug = document.getElementById('suggestions-label');
            const psug = document.getElementById('p-suggestions-label');
            if (selectedType === 'OKUL ÖZEL PROJESİ') {
                if (sug) sug.textContent = 'Gerçekleşen Değer';
                if (psug) psug.textContent = 'Gerçekleşen Değer:';
            } else {
                if (sug) sug.textContent = 'İyileştirme Önerileri';
                if (psug) psug.textContent = 'İyileştirme Önerileri:';
            }
        });
    });

    // Activity Status changes listeners
    document.querySelectorAll('input[name="report-status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastActivityStatus', e.target.value);
            checkOverdueActivities();
        });
    });
    
    // Clear All Logic
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) clearAllBtn.onclick = clearAllForm;

    // Initialization check
    setTimeout(() => document.querySelectorAll('input, textarea').forEach(updateFilledState), 500);
});

// Helper to check if form was modified since last save
function isFormDirty() {
    if (!lastSavedData) return true;
    const current = getFormData();
    const keys = ['activityName', 'teacher', 'totalParticipants', 'location', 'startDate', 'endDate', 'duration', 'cost', 'purpose', 'difficulties', 'suggestions', 'collaborations', 'evaluation', 'fillerName', 'fillerRole'];
    return keys.some(k => JSON.stringify(current[k]) !== JSON.stringify(lastSavedData[k]));
}

async function updateCurrentRecord() {
    if (!currentRecordId) return;
    const data = getFormData();
    data.id = currentRecordId;
    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).put(data).onsuccess = () => {
            lastSavedData = JSON.parse(JSON.stringify(data));
            refreshCombinedData();
            syncSavedReportsCache();
            resolve();
        };
    });
}

// --- CORE LOGIC FUNCTIONS ---

async function refreshCombinedData() {
    if (typeof COMBINED_DB === 'undefined') return;
    combinedData = JSON.parse(JSON.stringify(COMBINED_DB));
    
    // Safety check: if DB isn't ready yet, skip the update part
    if (!db) return;

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

function formatNameTR(rawName) {
    if (!rawName) return '';
    if (rawName.includes(',')) {
        return rawName.split(',').map(s => formatNameTR(s.trim())).join(', ');
    }
    const val = rawName.trim();
    // Keywords that indicate this is a role/organization, not a person
    const orgKeywords = ['Yönetimi', 'İdaresi', 'Lideri', 'Vakfı', 'Derneği', 'Birliği', 'Zümresi', 'Kurulu', 'Kulübü', 'Okul', 'Tema', 'Servisi', 'Rehberlik'];
    const isOrg = orgKeywords.some(key => val.toLocaleLowerCase('tr-TR').includes(key.toLocaleLowerCase('tr-TR')));

    const parts = val.split(/\s+/);
    if (parts.length === 0) return '';

    if (isOrg) {
        // Just title case for organizations/roles
        return parts.map(n => n.charAt(0).toLocaleUpperCase('tr-TR') + n.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
    } else {
        // Person formatting: Name SURNAME
        const surname = parts.pop().toLocaleUpperCase('tr-TR');
        const names = parts.map(n => n.charAt(0).toLocaleUpperCase('tr-TR') + n.slice(1).toLocaleLowerCase('tr-TR'));
        return [...names, surname].join(' ');
    }
}

function renderSuggestions(fragment) {
    if (!combinedData) return;
    const panel = document.getElementById('suggestions-panel');
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    const isOG = selectedType === 'OKUL GELİŞİM PROJESİ';
    
    let items = isOG ? combinedData.og_db.map(item => item.sorumlu) : combinedData.oo_db.map(item => item.sorumlu_verisi);
    const unique = new Set();
    items.forEach(it => { if (it) it.split(',').forEach(p => { if (p.trim()) unique.add(p.trim()); }); });

    const filtered = Array.from(unique)
        .filter(n => n.toLocaleLowerCase('tr').includes(fragment.toLocaleLowerCase('tr')))
        .sort((a, b) => {
            // Put organizations/roles at the top
            const orgKeywords = ['Yönetimi', 'İdaresi', 'Lideri', 'Vakfı', 'Derneği', 'Birliği', 'Zümresi', 'Kurulu', 'Kulübü'];
            const aIsOrg = orgKeywords.some(k => a.includes(k));
            const bIsOrg = orgKeywords.some(k => b.includes(k));
            if (aIsOrg && !bIsOrg) return -1;
            if (!aIsOrg && bIsOrg) return 1;
            return a.localeCompare(b, 'tr');
        });

    if (filtered.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    filtered.slice(0, 40).forEach(name => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<i class="fas fa-user-tag"></i> ${name}`;
        div.onclick = () => {
            const input = document.getElementById('responsible-teacher');
            const current = input.value;
            const lastIdx = current.lastIndexOf(',');
            // Auto format the name being selected
            const formattedName = formatNameTR(name);
            input.value = (lastIdx === -1 ? formattedName : current.substring(0, lastIdx + 1).trim() + ' ' + formattedName) + ', ';
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
    const isOG = selectedType === 'OKUL GELİŞİM PROJESİ'; // ← DÜZELTME: isOG tanımlandı
    const respValue = document.getElementById('responsible-teacher').value.trim();
    
    const list = isOG ? combinedData.og_db : combinedData.oo_db;
    if (!list) return;

    let filtered = list;
    if (respValue) {
        const teachers = respValue.split(',').map(s => s.trim().toLocaleLowerCase('tr')).filter(s => s.length > 0);
        if (teachers.length > 0) {
            filtered = list.filter(item => {
                const itemSorumlu = (isOG ? item.sorumlu : item.sorumlu_verisi) || "";
                const itemT = itemSorumlu.toLocaleLowerCase('tr');
                return teachers.every(t => itemT.includes(t));
            });
        }
    }

    const final = filtered.filter(it => {
        const name = (isOG ? it.eylem_adi : it.eylem_gorev) || "";
        const pool = (name + " " + (it.kod || "")).toLocaleLowerCase('tr');
        return pool.includes(fragment.toLocaleLowerCase('tr'));
    });

    if (final.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    final.slice(0, 15).forEach(item => {
        const nameText = isOG ? item.eylem_adi : item.eylem_gorev;
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.style.flexDirection = 'column'; div.style.alignItems = 'flex-start';
        div.innerHTML = `<div>${item.kod ? `<b>[${item.kod}]</b> ` : ''}${nameText}</div><div style="font-size: 0.7rem; color: #94a3b8;">${(isOG ? item.sorumlu : item.sorumlu_verisi) || ''}</div>`;
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

async function checkOverdueActivities() {
    await syncSavedReportsCache();
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
                        const report = savedReportsCache.find(r => r.activityName === aName && (r.teacher && r.teacher.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr'))));
                        const hasRep = !!report;
                        
                        modalTasks.push({ 
                            id: tid, 
                            name: aName, 
                            start: isOG ? item.y1_bas : item.baslangic_1, 
                            end: isOG ? item.y1_bit : item.bitis_1, 
                            person: resp, 
                            isReported: hasRep,
                            status: report ? report.status : null
                        });
                    }
                }
            }
        });
    });
    if (modalTasks.length > 0) {
        currentModalTasks = modalTasks;
        currentModalTitle = `Görev Listesi (${statusRadio === 'expired' ? 'Süresi Dolan' : 'Devam Eden'})`;
        showOverdueModal(modalTasks);
    }
}

function printModalList(title, tasks) {
    const win = window.open('', '_blank');
    if (!win) return;

    const rows = tasks.map(t => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 12px;">${t.id.split('-')[1]}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 12px; font-weight: bold;">${t.name}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 12px; color: #555;">${t.start} - ${t.end}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">${formatNameTR(t.person)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align: center; font-weight: bold; color: ${t.isReported ? (t.status === 'İptal' ? '#ef4444' : '#10b981') : '#666'};">${t.isReported ? (t.status || 'TAMAMLANDI') : 'EKSİK'}</td>
        </tr>
    `).join('');

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                body { font-family: 'Outfit', sans-serif; padding: 20px; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #f8fafc; text-align: left; border: 1px solid #ddd; padding: 10px; font-size: 13px; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
                .print-btn { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
                @media print { .print-btn { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h2 style="margin:0;">${title}</h2>
                    <p style="margin:5px 0 0; color:#666;">İstanbul Atatürk Anadolu Lisesi | Raporlama Sistemi</p>
                </div>
                <button class="print-btn" onclick="window.print()">Hemen Yazdır</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">No</th>
                        <th>Faaliyet Adı</th>
                        <th style="width: 150px;">Tarih</th>
                        <th style="width: 200px;">Sorumlu</th>
                        <th style="width: 100px;">Durum</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </body>
        </html>
    `);
    win.document.close();
}

function showOverdueModal(tasks) {
    const list = document.getElementById('overdue-list');
    list.innerHTML = '';
    const modalEl = document.getElementById('overdue-modal');
    modalEl.querySelector('.modal-header h3').innerHTML = '<i class="fas fa-file-invoice"></i> Görev Listesi (' + tasks.length + ')';
    
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.isReported ? 'overdue-item reported-item' : 'overdue-item';
        
        const ignoreBtn = `
            <button class="btn-secondary btn-action-sm" style="background:#ef4444; color:white; border:none;" onclick="handleIgnoreTask(event, '${t.person}', '${t.id}')">
                <i class="fas fa-trash-alt"></i> Listeden Kaldır
            </button>`;

        const statusBadge = t.isReported ? getReportStatusBadge(t.status) : '';
        li.innerHTML = `
            <span class="overdue-name">${t.name} ${statusBadge ? `<span style="vertical-align: middle; margin-left: 5px;">${statusBadge}</span>` : ''}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${formatNameTR(t.person)}</span>
            </div>

            <div class="overdue-actions">
                ${ignoreBtn}
                ${!t.isReported ? `<button class="btn-primary btn-action-sm btn-fill" data-id="${t.id}" data-type="${document.querySelector('input[name="project-type"]:checked').value}"><i class="fas fa-edit"></i> Raporu Doldur</button>` : ''}
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
    document.getElementById('modal-print-btn').style.display = 'block';
}

function fillReportForm(taskId, selectedType) {
    if (!combinedData) return;
    const dbSource = selectedType === 'OKUL GELİŞİM PROJESİ' ? combinedData.og_db : combinedData.oo_db;
    const item = dbSource.find(i => (selectedType === 'OKUL GELİŞİM PROJESİ' ? `og-${i.no}` : `oo-${i.sira}`) === taskId);
    if (!item) return;

    const isOG = selectedType === 'OKUL GELİŞİM PROJESİ';
    document.getElementById('activity-name').value = isOG ? item.eylem_adi : item.eylem_gorev;
    document.getElementById('responsible-teacher').value = (isOG ? item.sorumlu : item.sorumlu_verisi || '').trim() + ', ';
    
    const start = parseDBDate(isOG ? item.y1_bas : item.baslangic_1);
    const end = parseDBDate(isOG ? item.y1_bit : item.bitis_1);
    if (start) document.getElementById('activity-start').value = start;
    if (end) document.getElementById('activity-end').value = end;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('input, textarea').forEach(updateFilledState);
    
    // Reset save state for new fill
    lastSavedData = null;
    currentRecordId = null;
}

function hideOverdueModal() { 
    document.getElementById('overdue-modal').style.display = 'none'; 
    document.getElementById('modal-print-btn').style.display = 'none';
}
function validateForm() {
    const ids = ['activity-name', 'total-participants', 'activity-location', 'activity-start', 'activity-end', 'total-duration', 'cost', 'filler-name', 'filler-role', 'filler-date', 'responsible-teacher'];
    for (const id of ids) { const el = document.getElementById(id); if (!el || !el.value.trim()) { alert('Tüm alanları doldurun!'); el.focus(); return false; } }
    return true;
}

function getFormData() {
    const typeChecked = document.querySelector('input[name="project-type"]:checked');
    const statusChecked = document.querySelector('input[name="report-status"]:checked');
    
    return {
        eduYear: document.getElementById('edu-year').value,
        projectType: typeChecked ? typeChecked.value : 'OKUL GELİŞİM PROJESİ',
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
        status: statusChecked ? statusChecked.value : 'Tamamlandı',
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

// --- Listeners moved back into DOMContentLoaded ---

function printReport(data) {
    const pc = document.getElementById('print-content').cloneNode(true);
    const fill = (id, val) => { const el = pc.querySelector(id); if (el) el.textContent = val || ''; };
    fill('#p-edu-year', data.eduYear); fill('#p-type-area', data.projectType); fill('#p-name', data.activityName);
    fill('#p-type', data.activityType); fill('#p-teacher', data.teacher); fill('#p-profile', data.participantProfile);
    fill('#p-count', data.totalParticipants); fill('#p-location', data.location); 
    fill('#p-dates', formatDateRange(data.startDate, data.endDate)); fill('#p-duration', data.duration);
    fill('#p-cost', data.cost); fill('#p-document-no', data.documentNo); fill('#p-purpose', data.purpose);
    fill('#p-status', data.status); // Populating activity status
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
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap');
            body { background: #f0f2f5; margin: 0; padding: 40px 20px; font-family: 'Times New Roman', serif; }
            #preview-container { 
                width: 210mm; background: white; padding: 30px; margin: 0 auto; 
                box-shadow: 0 10px 50px rgba(0,0,0,0.15); border-radius: 12px; 
                position: relative; min-height: 297mm; 
                transform-origin: top center;
            }
            .action-bar { 
                position: sticky; top: 20px; z-index: 1000;
                max-width: 210mm; margin: 0 auto 30px auto; 
                display: flex; justify-content: flex-end; gap: 12px; 
                background: rgba(255,255,255,0.8); backdrop-filter: blur(10px);
                padding: 10px; border-radius: 50px; border: 1px solid rgba(0,0,0,0.05);
            }
            .btn-action { 
                padding: 10px 24px; border-radius: 50px; cursor: pointer; border: none; 
                font-weight: 600; color: white; display: flex; align-items: center; 
                gap: 8px; font-family: 'Outfit', sans-serif; transition: transform 0.2s, box-shadow 0.2s;
                font-size: 0.9rem;
            }
            .btn-action:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
            .btn-print { background: linear-gradient(135deg, #ff7e5f, #feb47b); }
            .btn-download { background: linear-gradient(135deg, #6366f1, #a855f7); }
            @media print { 
                .action-bar { display: none !important; } 
                body { background: white; padding: 0; } 
                #preview-container { box-shadow: none; border-radius: 0; padding: 10mm; margin:0; width: 100%; } 
            }
        </style>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    `;

    win.document.write(`
        <html>
        <head>
            <title>Rapor Önizleme - ${data.activityName}</title>
            ${styles}
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        </head>
        <body>
            <div class="action-bar">
                <button class="btn-action btn-download" onclick="window.downloadPDF()">
                    <i class="fas fa-save"></i> Kaydet
                </button>
                <button class="btn-action btn-print" onclick="window.print()">
                    <i class="fas fa-print"></i> Yazdır
                </button>
            </div>
            <div id="preview-container">
                ${pc.innerHTML}
            </div>
            <script>
                window.downloadPDF = function() {
                    const element = document.getElementById('preview-container');
                    const opt = {
                        margin: 0,
                        filename: 'Rapor_${data.activityName.substring(0,30).replace(/[^a-zA-Z0-9]/g, '_')}.pdf',
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, logging: false },
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
    if (!reportsList) {
        const el = document.getElementById('reports-list');
        if (el) reportsList = el; else return;
    }
    
    reportsList.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Raporlar yükleniyor...</div>';
    
    if (!db) {
        console.warn('Database not ready yet, will retry in 500ms...');
        setTimeout(loadReports, 500);
        return;
    }

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (e) => {
        const reports = e.target.result;
        if (!reports || reports.length === 0) {
            reportsList.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">Henüz kaydedilmiş rapor bulunmuyor.</div>';
            return;
        }
        
        reportsList.innerHTML = ''; // Clear loading message

        reports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(r => {
            const card = document.createElement('div');
            card.className = 'report-card';

            const info = document.createElement('div');
            info.style.flexGrow = '1';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;';

            const title = document.createElement('h3');
            title.style.cssText = 'margin:0; font-size:1rem;';
            title.textContent = r.activityName || 'İsimsiz Rapor';

            const badge = document.createElement('span');
            const statusStr = (r.status || 'Tamamlandı');
            const cleanStatus = statusStr.toLowerCase().replace('ü','u').replace('ö','o').replace('ı','i').replace('ş','s').replace('ç','c').replace('ğ','g');
            const badgeType = cleanStatus === 'iptal' ? 'iptal' : (cleanStatus === 'güncellendi' ? 'guncellendi' : 'tamamlandi');
            badge.className = `status-badge status-${badgeType}`;
            badge.textContent = statusStr;

            header.appendChild(title);
            header.appendChild(badge);

            const teacher = document.createElement('p');
            teacher.style.cssText = 'margin:0; font-size:0.85rem; color:#64748b;';
            teacher.textContent = r.teacher ? formatNameTR(r.teacher) : '';

            info.appendChild(header);
            info.appendChild(teacher);

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:10px;';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-secondary';
            editBtn.style.cssText = 'font-size:0.8rem; padding:0.5rem 1rem;';
            editBtn.textContent = 'Formda Göster';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PFDS_LoadRecordToForm(r);
            });

            const printBtn = document.createElement('button');
            printBtn.className = 'btn-primary';
            printBtn.style.cssText = 'font-size:0.8rem; padding:0.5rem 1rem;';
            printBtn.textContent = 'Yazdır';
            printBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PFDS_PrintRecord(r);
            });

            actions.appendChild(editBtn);
            actions.appendChild(printBtn);

            card.appendChild(info);
            card.appendChild(actions);
            reportsList.appendChild(card);
        });
    };
}

// --- End of History Functions ---

function parseDBDate(s) { 
    if (!s || s.indexOf('.') === -1) return null;
    const p = s.split('.'); return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

function getCheckboxValues(name, otherCheckId, otherTextId) {
    const cbs = document.querySelectorAll(`input[name="${name}"]:checked`);
    let vals = Array.from(cbs).map(c => c.value);
    const oc = document.getElementById(otherCheckId);
    if (oc && oc.checked) { 
        vals = vals.filter(v => v !== 'Diğer'); 
        vals.push(document.getElementById(otherTextId).value); 
    }
    return vals.join(', ');
}

function getYearIndexForReport() {
    const eduYearVal = document.getElementById('edu-year').value;
    if (!eduYearVal) return 1;
    const startYear = parseInt(eduYearVal.split('-')[0].trim());
    const index = (startYear - 2025) + 1; // 2025 -> 1, 2026 -> 2...
    return (index >= 1 && index <= 4) ? index : 1;
}

function checkUnreportedActivities() {
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }
    const statusRadio = document.querySelector('input[name="activity-status"]:checked');
    const typeRadio = document.querySelector('input[name="project-type"]:checked');
    if (!statusRadio || !typeRadio) return;
    
    const statusVal = statusRadio.value;
    const typeVal = typeRadio.value;
    const isOG = typeVal === 'OKUL GELİŞİM PROJESİ';
    const today = new Date(); today.setHours(0,0,0,0);
    const yearIdx = getYearIndexForReport();
    
    let list = isOG ? combinedData.og_db : combinedData.oo_db;
    let results = [];

    list.forEach(item => {
        const nameText = (isOG ? item.eylem_adi : item.eylem_gorev) || "";
        const cleanName = normalizeString(nameText);
        if (!cleanName) return;
        
        // Check if reported in cache
        const isReported = savedReportsCache.some(r => normalizeString(r.activityName) === cleanName);
        if (isReported) return;

        // Dynamic date lookup based on year index
        const dStr = isOG ? (item[`y${yearIdx}_bit`] || item[`y${yearIdx}_bas`]) : (item[`bitis_${yearIdx}`] || item[`baslangic_${yearIdx}`]);
        const dt = parseDBDate(dStr);
        
        if (dt) {
            const d = new Date(dt);
            if (statusVal === 'expired' ? d < today : d >= today) {
                results.push({ 
                    id: isOG ? `og-${item.no}` : `oo-${item.sira}`, 
                    name: nameText.trim(), 
                    eduYear: document.getElementById('edu-year').value,
                    start: isOG ? item[`y${yearIdx}_bas`] : item[`baslangic_${yearIdx}`], 
                    end: isOG ? item[`y${yearIdx}_bit`] : item[`bitis_${yearIdx}`], 
                    person: isOG ? item.sorumlu : item.sorumlu_verisi, 
                    type: typeVal, 
                    isReported: false, 
                    status: null 
                });
            }
        }
    });

    if (results.length > 0) {
        currentModalTasks = results;
        currentModalTitle = 'Hiç Rapor Girilmemiş Faaliyetler';
        showStatusModal(currentModalTitle, results);
    }
    else alert('Kriterlere uygun raporlanmamış faaliyet bulunamadı.');
}

// Utility for extremely robust string comparison (ignoring case, spaces, and special Turkish differences)
function normalizeString(s) {
    if (!s) return "";
    return s.toString()
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, '') // Remove ALL spaces
        .replace(/[^a-z0-9ğüşıioöç]/g, ''); // Remove non-alphanumeric
}

async function checkReportedActivities() {
    await syncSavedReportsCache();
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }
    const statusRadio = document.querySelector('input[name="activity-status"]:checked');
    const typeRadio = document.querySelector('input[name="project-type"]:checked');
    if (!statusRadio || !typeRadio) return;

    const statusVal = statusRadio.value;
    const typeVal = typeRadio.value;
    const isOG = typeVal === 'OKUL GELİŞİM PROJESİ';
    const today = new Date(); today.setHours(0,0,0,0);
    const yearIdx = getYearIndexForReport();

    let planList = isOG ? combinedData.og_db : combinedData.oo_db;
    let results = [];

    // --- REPORT-CENTRIC LOGIC ---
    savedReportsCache.forEach(report => {
        if (report.projectType !== typeVal) return;

        const normReportName = normalizeString(report.activityName);
        const planItem = planList.find(p => {
            const planName = (isOG ? p.eylem_adi : p.eylem_gorev) || "";
            return normalizeString(planName) === normReportName;
        });

        const currentEduYear = document.getElementById('edu-year').value;
        const isCurrentYear = report.eduYear === currentEduYear;
        let showItem = true;
        let planDates = "";

        // Only apply date filtering (Expired/Ongoing) for the CURRENT year
        if (isCurrentYear && planItem) {
            const dStr = isOG ? (planItem[`y${yearIdx}_bit`] || planItem[`y${yearIdx}_bas`]) : (planItem[`bitis_${yearIdx}`] || planItem[`baslangic_${yearIdx}`]);
            const dt = parseDBDate(dStr);
            if (dt) {
                const d = new Date(dt);
                if (statusVal === 'expired' && d >= today) showItem = false;
                if (statusVal === 'ongoing' && d < today) showItem = false;
                planDates = `${isOG ? planItem[`y${yearIdx}_bas`] : planItem[`baslangic_${yearIdx}`]} — ${isOG ? planItem[`y${yearIdx}_bit`] : planItem[`bitis_${yearIdx}`]}`;
            }
        }

        if (showItem) {
            results.push({ 
                id: planItem ? (isOG ? `og-${planItem.no}` : `oo-${planItem.sira}`) : 'manual', 
                name: report.activityName || 'İsimsiz Rapor', 
                eduYear: report.eduYear || 'Bilinmiyor',
                start: report.startDate || (planDates ? planDates.split('—')[0].trim() : ''), 
                end: report.endDate || (planDates ? planDates.split('—')[1].trim() : ''), 
                person: report.teacher || (planItem ? (isOG ? planItem.sorumlu : planItem.sorumlu_verisi) : ''), 
                filler: report.fillerName, 
                isReported: true, 
                status: report.status,
                isManual: !planItem || !isCurrentYear
            });
        }
    });

    if (results.length > 0) {
        currentModalTasks = results;
        currentModalTitle = `Raporu Girilmiş ${typeVal === 'OKUL GELİŞİM PROJESİ' ? 'Gelişim' : 'Özel'} Faaliyetler`;
        showStatusModal(currentModalTitle, results);
    }
    else alert('Seçili türde ve kriterlerde raporlanmış faaliyet bulunamadı.');
}

// --- HELPERS & IGNORE LOGIC ---
function getReportStatusBadge(status) {
    const s = (status || 'Tamamlandı').toString();
    const clean = s.toLowerCase().replace('ü','u').replace('ö','o').replace('ı','i').replace('ş','s').replace('ç','c').replace('ğ','g');
    const type = (clean === 'iptal') ? 'iptal' : (clean === 'güncellendi' ? 'guncellendi' : 'tamamlandi');
    return `<span class="status-badge status-${type}" style="padding: 1px 6px; font-size: 0.65rem;">${s}</span>`;
}

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
        li.className = t.isReported ? 'overdue-item reported-item' : 'overdue-item';
        
        let statusBadge = '';
        if (t.isReported) {
        const badge = getReportStatusBadge(t.status);
        const fillerInfo = t.fillerName ? `<div style="font-size:0.7rem; color:var(--accent); margin-top:4px;">Dolduran: ${t.fillerName}</div>` : '';
            statusBadge = `<div style="margin-top:4px;">${badge}${fillerInfo}</div>`;
        }

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span class="overdue-name">${t.name}</span>
                <span style="font-size:0.75rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#64748b; font-weight:600;">${t.eduYear}</span>
            </div>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${formatNameTR(t.person)}</span>
                ${statusBadge}
                ${t.filler ? `<div style="color:#10b981; font-size:0.75rem; margin-top:4px;">Dolduran: ${formatNameTR(t.filler)}</div>` : ''}
            </div>
            <div class="overdue-actions">
                <button class="btn-secondary btn-action-sm" style="background:#ef4444; color:white; border:none;" onclick="handleIgnoreTask(event, '${t.person}', '${t.id}')">
                    <i class="fas fa-trash-alt"></i> Listeden Kaldır
                </button>
                ${!t.isReported ? `
                    <button class="btn-primary btn-action-sm btn-fill" onclick="fillFromModal('${t.name.replace(/'/g, "\\'")}', '${t.person}', '${t.start}', '${t.end}')">Rapor Doldur</button>
                ` : ''}
            </div>
        `;
        list.appendChild(li);
    });
    modal.style.display = 'flex';
    document.getElementById('modal-print-btn').style.display = 'block';
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

// --- PASSWORD UTILITIES ---
function hashPassword(pw) {
    // Simple but consistent deterministic hash (not crypto-safe, sufficient for this use-case)
    if (!pw) return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < pw.length; i++) {
        h ^= pw.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
}

function _showPwModal({ title, desc, btnLabel, onConfirm }) {
    const modal = document.getElementById('password-modal');
    const pwInput = document.getElementById('pw-modal-input');
    const confirmBtn = document.getElementById('pw-modal-confirm');
    const cancelBtn = document.getElementById('pw-modal-cancel');
    const closeBtn = document.getElementById('pw-modal-close');

    document.getElementById('pw-modal-title').textContent = title;
    document.getElementById('pw-modal-desc').textContent = desc;
    document.getElementById('pw-modal-btn-label').textContent = btnLabel;
    pwInput.value = '';
    modal.style.display = 'flex';
    setTimeout(() => pwInput.focus(), 100);

    const cleanup = () => { modal.style.display = 'none'; };

    // Remove old listeners by cloning
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    const newClose = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newClose, closeBtn);

    document.getElementById('pw-modal-confirm').onclick = () => {
        const val = document.getElementById('pw-modal-input').value.trim();
        cleanup();
        onConfirm(val);
    };
    document.getElementById('pw-modal-cancel').onclick = () => { cleanup(); onConfirm(null); };
    document.getElementById('pw-modal-close').onclick = () => { cleanup(); onConfirm(null); };

    // Enter key
    const keyHandler = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('pw-modal-confirm').click();
            document.getElementById('pw-modal-input').removeEventListener('keydown', keyHandler);
        }
    };
    document.getElementById('pw-modal-input').addEventListener('keydown', keyHandler);
}

function promptSavePassword(onConfirm) {
    _showPwModal({
        title: 'Kayıt Şifresi Belirle',
        desc: 'Bu raporu korumak için bir şifre belirleyin. Raporu daha sonra düzenlemek istediğinizde bu şifre sorulacaktır. (Boş bırakırsanız şifre uygulanmaz.)',
        btnLabel: 'Şifreyi Kaydet',
        onConfirm
    });
}

function promptVerifyPassword(onConfirm) {
    _showPwModal({
        title: 'Rapor Şifresi',
        desc: 'Bu rapor şifre korumalıdır. Lütfen kayıt şifresini girin. (Yetkili için master şifre geçerlidir.)',
        btnLabel: 'Doğrula & Yükle',
        onConfirm
    });
}
