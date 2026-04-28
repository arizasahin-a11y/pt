// Database Configuration
const STORE_NAME = 'reports';
const LEADER_STORE = 'activity_leaders'; // Faaliyet Liderleri koleksiyonu
const LEADER_PASSWORD = '1234';          // Lider işlemleri şifre

// Firebase Setup
const firebaseConfig = {
  apiKey: "AIzaSyBoScB63OHNIPZ2y1Eo9LWa3ynSRPG6xYU",
  authDomain: "okulpt.firebaseapp.com",
  projectId: "okulpt",
  storageBucket: "okulpt.firebasestorage.app",
  messagingSenderId: "715714176883",
  appId: "1:715714176883:web:a1a125314f834f61b60706"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Enable offline persistence to keep it working without internet!
db.enablePersistence().catch(err => {
    console.warn('Firebase persistence error:', err);
});
let combinedData = null;
let savedReportsCache = []; // Cache for filtering overdue list
let activityLeadersCache = new Map(); // planId -> leaders[]
let currentReportingPerson = null; 
let lastSavedData = null; 
let currentRecordId = null; 
let currentModalTasks = []; // Data for printing the current modal list
let currentModalTitle = ""; // Title for the printed list
let _leaderModalPlanId = null; // Active planId in leader modal
let _leaderModalProjectType = null; // Active project type in leader modal
let isArchiveView = false;

let mainForm, saveBtn, directPrintBtn, historyBtn, backToFormBtn, savedReportsSection, reportsList;
let respInput, activityInput, suggestionsPanel, activityPanel; // Global inputs for suggestion logic

// --- GLOBAL CORE FUNCTIONS (Defined early for reliable accessibility) ---

window._doLoadRecord = function(data) {
    if (!data) {
        alert("Hata: Yüklenecek veri bulunamadı.");
        return;
    }

    try {
        console.log("Loading record into form:", data.id);
        
        // Force Switch Views
        const f = document.getElementById('activity-form');
        const s = document.getElementById('saved-reports');
        if (f) f.style.display = 'block';
        if (s) s.style.display = 'none';
        
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 10);

        currentRecordId = data.id;
        lastSavedData = { ...data };
        if (document.getElementById('plan-id')) {
            document.getElementById('plan-id').value = data.planId || '';
        }

        // Field mapping
        const map = {
            'eduYear': 'edu-year', 'activityName': 'activity-name', 'activityTheme': 'activity-theme', 'teacher': 'responsible-teacher',
            'totalParticipants': 'total-participants', 'location': 'activity-location',
            'startDate': 'activity-start', 'endDate': 'activity-end', 'duration': 'total-duration',
            'cost': 'cost', 'documentNo': 'document-no', 'purpose': 'purpose',
            'difficulties': 'difficulties', 'suggestions': 'suggestions', 'realizedValue': 'realized-value', 'collaborations': 'collaborations',
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
            if (r) {
                r.checked = true;
                r.dispatchEvent(new Event('change', { bubbles: true }));
            }
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

window.editRecord = function(data) {
    console.log("window.editRecord triggered", data ? data.id : 'null');
    window._doLoadRecord(data);
};

window.printRecord = function(data) {
    console.log("window.printRecord triggered", data ? data.id : 'null');
    if (typeof printReport === 'function') {
        printReport(data);
    } else {
        alert("Yazdırma fonksiyonu henüz yüklenmedi!");
    }
};

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

// Initial connection triggers the snapshot
console.log('Firebase initialized successfully');
syncSavedReportsCache();
syncLeadersCache();

async function syncSavedReportsCache() {
    if (!db) return;
    
    // Listen to live changes
    db.collection(STORE_NAME).onSnapshot((snapshot) => {
        savedReportsCache = [];
        snapshot.forEach((doc) => {
            savedReportsCache.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`Cache updated from Firebase: ${savedReportsCache.length} reports.`);
        refreshCombinedData();
        
        // Refresh UI if user is on history page
        if (typeof savedReportsSection !== 'undefined' && savedReportsSection && savedReportsSection.style.display === 'block') {
            loadReports();
        }
        
        // Sadece modal halihazırda açıksa listeyi tazelemek için tetikle.
        // Aksi takdirde kendi kendine kullanıcıya popup fırlatır!
        const modal = document.getElementById('overdue-modal');
        if (modal && modal.style.display === 'flex') {
            const t = modal.querySelector('.modal-header h3').innerText;
            if (t.includes('Eksik') && typeof checkUnreportedActivities === 'function') {
                checkUnreportedActivities();
            } else if (t.includes('Girilmiş') && typeof checkReportedActivities === 'function') {
                checkReportedActivities();
            }
        }
    });
}

// ----------------------------------------------------
// LOCAL-TO-CLOUD AUTOMATIC MIGRATOR
// (Eski cihazlardaki yerel verileri yakalayıp buluta fırlatır)
// ----------------------------------------------------
function migrateOldDataToFirebase() {
    try {
        if (!window.indexedDB) return;
        const request = indexedDB.open('PFDS_Database', 1);
        request.onsuccess = (e) => {
        const localDb = e.target.result;
        if (!localDb.objectStoreNames.contains(STORE_NAME)) return;
        
        const tx = localDb.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.getAll();
        
        getReq.onsuccess = () => {
            const oldReports = getReq.result;
            if (oldReports && oldReports.length > 0) {
                console.log(`Migration: ${oldReports.length} eski yerel rapor bulundu. Buluta aktarılıyor...`);
                oldReports.forEach(report => {
                    // Yerel ID'ler her cihazda '1, 2, 3' şeklinde olacağı için çakışma yaratır.
                    // Bu yüzden bulut ortamına (Firebase) yepyeni eşsiz bir kimlikle yüklüyoruz.
                    const oldId = report.id;
                    const newDocRef = db.collection(STORE_NAME).doc();
                    report.id = newDocRef.id;
                    report.isMigrated = true; // Göç edilenleri etiketle
                    
                    newDocRef.set(report).then(() => {
                        // Buluta başarıyla gittiyse, bir daha aktarmamak ve yer kaplamamak için yerelden sil.
                        const delTx = localDb.transaction([STORE_NAME], 'readwrite');
                        delTx.objectStore(STORE_NAME).delete(oldId);
                    }).catch(err => console.error("Göç Hatası:", err));
                });
            }
        };
    };
    request.onerror = (e) => {
            console.warn("Migration DB Access Error. Cannot read old data:", e);
        };
    } catch(err) {
        console.warn("IndexedDB not supported or blocked, skipping migration.", err);
    }
}
// Göç ediciyi uygulamaya girilir girilmez çalıştır.
migrateOldDataToFirebase();
// ----------------------------------------------------

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
    if (id === 'activity-name') {
        const themeSelect = document.getElementById('activity-theme');
        if (themeSelect) { themeSelect.value = ''; updateFilledState(themeSelect); }
    }
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
        'filler-name', 'filler-role', 'document-no', 'filler-date', 'realized-value'
    ];
    textIds.forEach(id => clearField(id));
    clearCheckboxGroup('activity-type', 'type-other-check', 'type-other-text');
    clearCheckboxGroup('participant-profile', 'participant-other-check', 'participant-other-text');
    clearCheckboxGroup('docs', 'docs-other-check', 'docs-other-text');
    clearRadioGroup('project-type', 'OKUL GELİŞİM PROJESİ');
    const themeSelect = document.getElementById('activity-theme');
    if (themeSelect) { themeSelect.value = ''; updateFilledState(themeSelect); }
    clearRadioGroup('report-status', 'Tamamlandı');
    const sp = document.getElementById('suggestions-panel');
    if (sp) sp.style.display = 'none';
    const planIdObj = document.getElementById('plan-id');
    if (planIdObj) planIdObj.value = '';
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
    const mainTitle = document.getElementById('main-title');
    if (mainTitle) {
        // Left Click: Return Home
        mainTitle.onclick = () => {
            if (savedReportsSection) savedReportsSection.style.display = 'none';
            const archiveSection = document.getElementById('archived-reports');
            if (archiveSection) archiveSection.style.display = 'none';
            if (mainForm) mainForm.style.display = 'block';
            window.scrollTo(0, 0);
        };
        
        // Shift + Right Click: School Principal Control
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

    historyBtn = document.getElementById('history-btn');
    backToFormBtn = document.getElementById('back-to-form');
    savedReportsSection = document.getElementById('saved-reports');
    reportsList = document.getElementById('reports-list');

    const downloadMasterBtn = document.getElementById('download-master-btn');
    if (downloadMasterBtn) downloadMasterBtn.addEventListener('click', downloadMasterJson);

    const exportExcelBtn = document.getElementById('export-excel-btn');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportToExcel);

    calculateEduYear();
    
    // CSS handles `.other-input` visibility through `:checked ~ .other-input`
    // We only need to clear the field if it's unchecked.
    document.querySelectorAll('input[type="checkbox"][id$="-other-check"]').forEach(chk => {
        chk.addEventListener('change', (e) => {
            if (!e.target.checked) {
                const inputId = e.target.id.replace('-check', '-text');
                const input = document.getElementById(inputId);
                if (input) input.value = '';
            }
        });
    });
    
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

    // New Suggestion Panels
    const fillerInput = document.getElementById('filler-name');
    const fillerPanel = document.getElementById('filler-suggestions-panel');
    showSuggestionsOnFocus(fillerInput, fillerPanel, renderFillerSuggestions);
    if (fillerInput) fillerInput.addEventListener('input', (e) => renderFillerSuggestions(e.target.value));

    const leaderFilterInput = document.getElementById('leader-filter-input');
    const leaderFilterPanel = document.getElementById('leader-filter-suggestions');
    showSuggestionsOnFocus(leaderFilterInput, leaderFilterPanel, renderLeaderFilterSuggestions);
    if (leaderFilterInput) leaderFilterInput.addEventListener('input', (e) => renderLeaderFilterSuggestions(e.target.value));

    // Hide suggestions when clicking outside
    document.addEventListener('click', () => {
        if (suggestionsPanel) suggestionsPanel.style.display = 'none';
        if (activityPanel) activityPanel.style.display = 'none';
        if (fillerPanel) fillerPanel.style.display = 'none';
        if (leaderFilterPanel) leaderFilterPanel.style.display = 'none';
    });
    if (suggestionsPanel) suggestionsPanel.onclick = (e) => e.stopPropagation();
    if (activityPanel) activityPanel.onclick = (e) => e.stopPropagation();
    if (fillerPanel) fillerPanel.onclick = (e) => e.stopPropagation();
    if (leaderFilterPanel) leaderFilterPanel.onclick = (e) => e.stopPropagation();

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
        activityInput.addEventListener('input', (e) => {
            renderActivitySuggestions(e.target.value);
            autoSelectTheme();
        });
    }

    const themeSelect = document.getElementById('activity-theme');
    if (themeSelect) {
        themeSelect.addEventListener('change', () => updateFilledState(themeSelect));
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
                const docRef = db.collection(STORE_NAME).doc(currentRecordId);
                const existingDoc = await docRef.get();
                const existing = existingDoc.exists ? existingDoc.data() : null;

                const doSaveAction = () => {
                    docRef.set(data).then(() => {
                        lastSavedData = JSON.parse(JSON.stringify(data));
                        alert('✅ Rapor başarıyla güncellendi!');
                        refreshCombinedData();
                        // syncSavedReportsCache() handled automatically via onSnapshot!
                    }).catch(e => {
                        alert('❌ Kayıt hatası: ' + e.message);
                    });
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
                    const newDocRef = db.collection(STORE_NAME).doc();
                    data.id = newDocRef.id;
                    
                    newDocRef.set(data).then(() => {
                        currentRecordId = data.id;
                        lastSavedData = JSON.parse(JSON.stringify(data));
                        alert('✅ Rapor başarıyla kaydedildi!');
                        refreshCombinedData();
                    }).catch(e => {
                        alert('❌ Yeni kayıt hatası: ' + e.message);
                    });
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
    if (reportedBtn) reportedBtn.onclick = checkReportedActivities;
    if (unreportedBtn) unreportedBtn.onclick = checkUnreportedActivities;
    
    // Fix: "Anladım" and "Close" buttons for overdue modal
    const closeBtn = document.getElementById('close-overdue');
    const okBtn = document.getElementById('overdue-ok-btn');
    if (closeBtn) closeBtn.onclick = hideOverdueModal;
    if (okBtn) okBtn.onclick = hideOverdueModal;
    
    const printModalBtn = document.getElementById('modal-print-btn');
    if (printModalBtn) {
        printModalBtn.onclick = () => printModalList(currentModalTitle, currentModalTasks);
    }
    
    // --- FAAALİYET LİDERİ KONTROLLERI ---
    // Faaliyet Liderleri header butonu
    const allLeadersBtn = document.getElementById('all-leaders-btn');
    if (allLeadersBtn) allLeadersBtn.onclick = showAllLeadersModal;

    // Tüm liderler modal kapatma
    const almClose = document.getElementById('alm-close-btn');
    const almCloseFooter = document.getElementById('alm-close-footer-btn');
    if (almClose) almClose.onclick = () => { document.getElementById('all-leaders-modal').style.display = 'none'; };
    if (almCloseFooter) almCloseFooter.onclick = () => { document.getElementById('all-leaders-modal').style.display = 'none'; };

    // Tüm liderler modal — Listele butonu
    const almPrintBtn = document.getElementById('alm-print-btn');
    if (almPrintBtn) almPrintBtn.onclick = () => printLeaderFullReport();

    // Leader mini modal kapatma
    const lmCloseBtn = document.getElementById('lm-close-btn');
    const lmCloseFooter = document.getElementById('lm-close-footer-btn');
    if (lmCloseBtn) lmCloseBtn.onclick = () => { document.getElementById('leader-modal').style.display = 'none'; };
    if (lmCloseFooter) lmCloseFooter.onclick = () => { document.getElementById('leader-modal').style.display = 'none'; };

    // Leader mini modal — Ekle butonu
    const lmAddBtn = document.getElementById('lm-add-btn');
    if (lmAddBtn) lmAddBtn.onclick = () => _leaderAddAction();

    // Lider ekleme inputu Enter ile gönder
    const lmInput = document.getElementById('lm-name-input');
    if (lmInput) lmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') _leaderAddAction(); });

    // Faaliyet Lideri dropdown change listener
    const leaderSelect = document.getElementById('leader-filter-select');
    if (leaderSelect) {
        leaderSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) checkActivitiesByLeader(val);
            // Reset after triggering
            setTimeout(() => { e.target.value = ''; }, 200);
        });
    }

    // Input Visual Feedback
    document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea, select').forEach(el => {
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
            const rGroup = document.getElementById('realized-value-group');
            if (selectedType === 'OKUL ÖZEL PROJESİ') {
                if (rGroup) rGroup.style.display = 'block';
            } else {
                if (rGroup) rGroup.style.display = 'none';
                clearField('realized-value');
            }
            // Proje türü değişince lider filtresini de sıfırla
            const leaderInput = document.getElementById('leader-filter-input');
            if (leaderInput) leaderInput.value = '';
        });
    });
    
    // Trigger initial UI state for Project Type
    const initialTypeRadio = document.querySelector('input[name="project-type"]:checked');
    if (initialTypeRadio) initialTypeRadio.dispatchEvent(new Event('change', { bubbles: true }));

    // Activity Status changes listeners
    document.querySelectorAll('input[name="report-status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('lastActivityStatus', e.target.value);
            checkOverdueActivities();
        });
    });
    
    // Archive Button
    const openArchiveBtn = document.getElementById('open-archive-btn');
    if (openArchiveBtn) {
        openArchiveBtn.onclick = () => {
            isArchiveView = true;
            if (savedReportsSection) savedReportsSection.style.display = 'none';
            const archiveSection = document.getElementById('archived-reports');
            if (archiveSection) archiveSection.style.display = 'block';
            loadReports();
        };
    }

    const backFromArchiveBtn = document.getElementById('back-from-archive');
    if (backFromArchiveBtn) {
        backFromArchiveBtn.onclick = () => {
            isArchiveView = false;
            const archiveSection = document.getElementById('archived-reports');
            if (archiveSection) archiveSection.style.display = 'none';
            if (savedReportsSection) savedReportsSection.style.display = 'block';
            loadReports();
        };
    }

    const archiveSelectedBtn = document.getElementById('archive-selected-btn');
    if (archiveSelectedBtn) {
        archiveSelectedBtn.onclick = () => archiveSelectedReports(true);
    }

    const unarchiveSelectedBtn = document.getElementById('unarchive-selected-btn');
    if (unarchiveSelectedBtn) {
        unarchiveSelectedBtn.onclick = () => archiveSelectedReports(false);
    }

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
    return new Promise((resolve, reject) => {
        db.collection(STORE_NAME).doc(currentRecordId).set(data).then(() => {
            lastSavedData = JSON.parse(JSON.stringify(data));
            refreshCombinedData();
            resolve();
        }).catch(err => {
            console.error("Firebase update error:", err);
            reject(err);
        });
    });
}

// --- CORE LOGIC FUNCTIONS ---

async function refreshCombinedData() {
    if (typeof COMBINED_DB === 'undefined') return;
    combinedData = JSON.parse(JSON.stringify(COMBINED_DB));
    
    // Safety check: if DB isn't ready yet, skip the update part
    if (!db) return;

    // Use the live cache instead of querying DB again
    const reports = [...savedReportsCache];
    reports.sort((a, b) => a.timestamp - b.timestamp).forEach(report => {
        if (report.status === 'Güncellendi') applyOverlayUpdate(combinedData, report);
    });
    console.log('Data synchronization complete.');
    autoSelectTheme();
}

function applyOverlayUpdate(targetDb, report) {
    const dbKey = report.projectType === 'OKUL GELİŞİM PROJESİ' ? 'og_db' : 'oo_db';
    const list = targetDb[dbKey];
    if (!list) return;

    let item = null;
    if (report.planId) {
        const idNum = parseInt(report.planId.split('-')[1]);
        if (!isNaN(idNum)) {
            item = list.find(i => (dbKey === 'og_db' ? i.no : i.sira) === idNum);
        }
    }

    const actionKey = dbKey === 'og_db' ? 'eylem_adi' : 'eylem_gorev';
    if (!item) {
        item = list.find(i => normalizeString(i[actionKey]) === normalizeString(report.activityName));
    }
    
    if (!item) return;

    // Güncellenen ismi ana veri tabanına da yaz (Kullanıcı eylem ismini değiştirmişse)
    if (report.activityName) {
        item[actionKey] = report.activityName;
    }

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
            const themeSelect = document.getElementById('activity-theme');
            if (themeSelect && isOG && item.tema) {
                themeSelect.value = `TEMA ${item.tema}`;
                updateFilledState(themeSelect);
            }
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
                        const report = savedReportsCache.find(r => {
                            if (r.planId && r.planId === tid) return true;
                            return normalizeString(r.activityName) === normalizeString(aName) && (r.teacher && r.teacher.toLocaleLowerCase('tr').includes(name.toLocaleLowerCase('tr')));
                        });
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
    } else {
        const ignored = getIgnoredTasks();
        if (ignored.length > 0) {
            // Task kalmamış ama gizlenmiş tasklar var, sadece geri getirme butonunu göster
            currentModalTasks = [];
            currentModalTitle = 'Görev Listesi (Hepsi Gizlenmiş)';
            showOverdueModal([]);
        }
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
        li.title = 'CTRL+Tık: Lider Ekle/Gör';
        
        const ignoreBtn = `
            <button class="btn-secondary btn-action-sm" style="background:#ef4444; color:white; border:none;" onclick="handleIgnoreTask(event, '${t.person}', '${t.id}')">
                <i class="fas fa-trash-alt"></i> Listeden Kaldır
            </button>`;

        const statusBadge = t.isReported ? getReportStatusBadge(t.status) : '';
        const leaderBadgeHtml = buildLeaderBadgeRow(t.id);
        li.innerHTML = `
            <span class="overdue-name">${t.name} ${statusBadge ? `<span style="vertical-align: middle; margin-left: 5px;">${statusBadge}</span>` : ''}</span>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${formatNameTR(t.person)}</span>
            </div>
            ${leaderBadgeHtml}

            <div class="overdue-actions">
                ${ignoreBtn}
                ${!t.isReported ? `<button class="btn-primary btn-action-sm btn-fill" data-id="${t.id}" data-type="${document.querySelector('input[name="project-type"]:checked').value}"><i class="fas fa-edit"></i> Raporu Doldur</button>` : ''}
            </div>
        
        `;
        list.appendChild(li);
        // Ctrl+tık ile lider yönetimi
        attachLeaderEvents(li, t.id, document.querySelector('input[name="project-type"]:checked').value, t.name);
    });

    list.querySelectorAll('.btn-fill').forEach(btn => {
        btn.onclick = (e) => {
            fillReportForm(e.currentTarget.dataset.id, e.currentTarget.dataset.type);
            hideOverdueModal();
        };
    });
    
    // Toggle gizlenenleri geri getir button
    const rsBtn = document.getElementById('modal-restore-btn');
    if (rsBtn) {
        if (getIgnoredTasks().length > 0) rsBtn.style.display = 'block';
        else rsBtn.style.display = 'none';
    }

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
    
    const planIdObj = document.getElementById('plan-id');
    if (planIdObj) planIdObj.value = taskId;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (isOG && item.tema) {
        const themeSelect = document.getElementById('activity-theme');
        if (themeSelect) {
            themeSelect.value = `TEMA ${item.tema}`;
            updateFilledState(themeSelect);
        }
    }

    document.querySelectorAll('input, textarea, select').forEach(updateFilledState);
    
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
    
    // Sadece Okul Özel Projesi seçiliyse 'Gerçekleşen Değer' de dolu olmalı
    const selectedType = document.querySelector('input[name="project-type"]:checked').value;
    if (selectedType === 'OKUL ÖZEL PROJESİ') {
        ids.push('realized-value');
    }
    
    for (const id of ids) { const el = document.getElementById(id); if (!el || !el.value.trim()) { alert('Tüm alanları doldurun!'); el.focus(); return false; } }
    return true;
}

function getFormData() {
    const typeChecked = document.querySelector('input[name="project-type"]:checked');
    const statusChecked = document.querySelector('input[name="report-status"]:checked');
    
    return {
        planId: document.getElementById('plan-id') ? document.getElementById('plan-id').value : '',
        eduYear: document.getElementById('edu-year').value,
        projectType: typeChecked ? typeChecked.value : 'OKUL GELİŞİM PROJESİ',
        activityName: document.getElementById('activity-name').value,
        activityTheme: document.getElementById('activity-theme') ? document.getElementById('activity-theme').value : '',
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
        realizedValue: document.getElementById('realized-value') ? document.getElementById('realized-value').value : '',
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
    fill('#p-edu-year', data.eduYear); fill('#p-type-area', data.projectType); 
    
    let displayName = data.activityName;
    if (data.projectType === 'OKUL GELİŞİM PROJESİ' && data.activityTheme) {
        displayName += ` (${data.activityTheme})`;
    }
    fill('#p-name', displayName);
    fill('#p-type', data.activityType); fill('#p-teacher', data.teacher); fill('#p-profile', data.participantProfile);
    fill('#p-count', data.totalParticipants); fill('#p-location', data.location); 
    fill('#p-dates', formatDateRange(data.startDate, data.endDate)); fill('#p-duration', data.duration);
    fill('#p-cost', data.cost); fill('#p-document-no', data.documentNo); fill('#p-purpose', data.purpose);
    fill('#p-status', data.status); // Populating activity status
    fill('#p-difficulties', data.difficulties); fill('#p-suggestions', data.suggestions);
    fill('#p-realized-value-pdf', data.realizedValue); 
    
    const prWrap = pc.querySelector('#p-realized-value-pdf-wrap');
    if (prWrap) {
        if (data.projectType === 'OKUL ÖZEL PROJESİ') prWrap.style.display = 'block';
        else prWrap.style.display = 'none';
    }

    fill('#p-collaborations', data.collaborations); fill('#p-evaluation', data.evaluation); fill('#p-docs', data.docs);
    const fDate = data.fillerDate ? new Date(data.fillerDate).toLocaleDateString('tr-TR') : '';
    fill('#p-filler', `${data.fillerName}\n${data.fillerRole}\n${fDate}`);
    
    // Formatting Principal Name (First name Initial caps, Surname ALL CAPS)
    if (pc.querySelector('#p-principal-name')) {
        const rawName = data.principalName || localStorage.getItem('schoolPrincipal') || '';
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
            * { box-sizing: border-box; }
            body { background: #f0f2f5; margin: 0; padding: 40px 20px; font-family: 'Times New Roman', serif; }
            #preview-container { 
                width: 210mm; background: white; padding: 30px; margin: 0 auto; 
                box-shadow: 0 10px 50px rgba(0,0,0,0.15); border-radius: 12px; 
                position: relative; min-height: 290mm; 
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
                @page { margin: 0; }
                body { background: white; padding: 0; margin: 0; } 
                #preview-container { box-shadow: none; border-radius: 0; padding: 10mm; margin:0; width: 210mm; max-width: 100%; box-sizing: border-box; min-height: auto !important; height: auto !important; page-break-after: avoid; } 
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
    
    const rawReports = [...savedReportsCache];
    const uniqueReports = [];
    const seenKeys = new Set();
    rawReports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(r => {
        const dupKey = r.timestamp ? `${r.timestamp}` : `${r.activityName}_${r.fillerName}`;
        if (!seenKeys.has(dupKey)) {
            seenKeys.add(dupKey);
            r._dupKey = dupKey;
            uniqueReports.push(r);
        }
    });
    
    const reports = uniqueReports;
    const matchedIds = new Set();
        
        const clean = (t) => t ? t.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : "";

        const mapRowOG = (pItem, report) => ({
            'Plana Göre ID': pItem ? `OG-${pItem.no}` : 'PLAN HARİCİ',
            'Plana Göre Kod': pItem ? pItem.kod || '' : '',
            'Plana Göre Eylem Adı': pItem ? pItem.eylem_adi : '',
            'Plana Göre Sorumlu': pItem ? pItem.sorumlu : '',
            'Plana Göre Başlangıç': pItem ? pItem.y1_bas : '',
            'Plana Göre Bitiş': pItem ? pItem.y1_bit : '',
            'DURUM': report ? report.status : 'EKSİK',
            'Eğitim Yılı': report ? report.eduYear : '',
            'Proje Türü': report ? report.projectType : '',
            'Faaliyet Adı': report ? report.activityName : '',
            'Faaliyet Türü': report ? report.activityType : '',
            'Faaliyet Sorumlusu': report ? report.teacher : '',
            'Katılımcı Profili': report ? report.participantProfile : '',
            'Toplam Katılımcı': report ? report.totalParticipants : '',
            'Faaliyet Yeri': report ? report.location : '',
            'Rapor Başlangıç': report ? report.startDate : '',
            'Rapor Bitiş': report ? report.endDate : '',
            'Süre (Saat)': report ? report.duration : '',
            'Maliyet (TL)': report ? report.cost : '',
            'Belge/Karar No': report ? report.documentNo : '',
            'Faaliyetin Amacı': report ? report.purpose : '',
            'Karşılaşılan Güçlükler': report ? report.difficulties : '',
            'Çözüm Önerileri': report ? report.suggestions : '',
            'İşbirliği Yapılan Kurumlar': report ? report.collaborations : '',
            'Faaliyet Değerlendirmesi': report ? report.evaluation : '',
            'Ekler': report ? report.docs : '',
            'Dolduran Kişi': report ? report.fillerName : '',
            'Dolduran Unvan': report ? report.fillerRole : '',
            'Doldurulma Tarihi': report ? report.fillerDate : ''
        });

        const mapRowOO = (pItem, report) => ({
            'Plana Göre ID': pItem ? `OO-${pItem.sira}` : 'PLAN HARİCİ',
            'Plana Göre Kod': pItem ? pItem.kod || '' : '',
            'Plana Göre Görev Adı': pItem ? pItem.eylem_gorev : '',
            'Plana Göre Sorumlu': pItem ? pItem.sorumlu_verisi : '',
            'Plana Göre Başlangıç': pItem ? pItem.baslangic_1 : '',
            'Plana Göre Bitiş': pItem ? pItem.bitis_1 : '',
            'DURUM': report ? report.status : 'EKSİK',
            'Eğitim Yılı': report ? report.eduYear : '',
            'Proje Türü': report ? report.projectType : '',
            'Faaliyet Adı': report ? report.activityName : '',
            'Faaliyet Türü': report ? report.activityType : '',
            'Faaliyet Sorumlusu': report ? report.teacher : '',
            'Katılımcı Profili': report ? report.participantProfile : '',
            'Toplam Katılımcı': report ? report.totalParticipants : '',
            'Faaliyet Yeri': report ? report.location : '',
            'Rapor Başlangıç': report ? report.startDate : '',
            'Rapor Bitiş': report ? report.endDate : '',
            'Süre (Saat)': report ? report.duration : '',
            'Maliyet (TL)': report ? report.cost : '',
            'Belge/Karar No': report ? report.documentNo : '',
            'Faaliyetin Amacı': report ? report.purpose : '',
            'Karşılaşılan Güçlükler': report ? report.difficulties : '',
            'Çözüm Önerileri': report ? report.suggestions : '',
            'Gerçekleşen Değer': report ? report.realizedValue : '',
            'İşbirliği Yapılan Kurumlar': report ? report.collaborations : '',
            'Faaliyet Değerlendirmesi': report ? report.evaluation : '',
            'Ekler': report ? report.docs : '',
            'Dolduran Kişi': report ? report.fillerName : '',
            'Dolduran Unvan': report ? report.fillerRole : '',
            'Doldurulma Tarihi': report ? report.fillerDate : ''
        });

        const ogRows = [];
        const ooRows = [];

        // School Action Plan (OG)
        combinedData.og_db.forEach(p => {
            const m = reports.find(r => r.projectType === 'OKUL GELİŞİM PROJESİ' && clean(r.activityName) === clean(p.eylem_adi));
            if (m) matchedIds.add(m._dupKey);
            ogRows.push(mapRowOG(p, m));
        });

        // Activity Calendar (OO)
        combinedData.oo_db.forEach(p => {
            const m = reports.find(r => r.projectType === 'OKUL ÖZEL PROJESİ' && clean(r.activityName) === clean(p.eylem_gorev));
            if (m) matchedIds.add(m._dupKey);
            ooRows.push(mapRowOO(p, m));
        });

        // Unmatched reports pushed into their respective sheet
        reports.filter(r => !matchedIds.has(r._dupKey)).forEach(r => {
            if (r.projectType === 'OKUL GELİŞİM PROJESİ') {
                ogRows.push(mapRowOG(null, r));
            } else {
                ooRows.push(mapRowOO(null, r));
            }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ogRows), "Okul Gelişim Projesi");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ooRows), "Okul Özel Projesi");
        
        XLSX.writeFile(wb, `IAAL_PTS_Rapor_${new Date().getTime()}.xlsx`);
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

    const reports = [...savedReportsCache];
    
    const updateTitle = (count) => {
        const titleId = isArchiveView ? 'archived-reports-title' : 'saved-reports-title';
        const titleEl = document.getElementById(titleId);
        if (titleEl) titleEl.textContent = `${isArchiveView ? 'Arşivlenmiş Raporlar' : 'Kayıtlı Raporlar'} (${count})`;
    };

    const listContainer = isArchiveView ? document.getElementById('archived-list') : reportsList;
    if (!listContainer) return;

    if (!reports || reports.length === 0) {
        updateTitle(0);
        listContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">Henüz kaydedilmiş rapor bulunmuyor.</div>';
        return;
    }
        
    listContainer.innerHTML = ''; // Clear loading message

        // ----------------------------------------------------
        // DEDUPLICATION (Aynı timestamp/isime sahip JSON kopyalarını ele)
        // ----------------------------------------------------
        const uniqueReports = [];
        const seenKeys = new Set();
        reports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(r => {
            const dupKey = r.timestamp ? `${r.timestamp}` : `${r.activityName}_${r.fillerName}`;
            if (!seenKeys.has(dupKey)) {
                seenKeys.add(dupKey);
                uniqueReports.push(r);
            }
        });

        const filterRadio = document.querySelector('input[name="history-filter"]:checked');
        const filterVal = filterRadio ? filterRadio.value : 'TÜMÜ';
        let finalReports = filterVal === 'TÜMÜ' ? uniqueReports : uniqueReports.filter(r => r.projectType === filterVal);

        // Arşiv filtresi ekle
        if (isArchiveView) {
            finalReports = finalReports.filter(r => r.isArchived === true);
        } else {
            finalReports = finalReports.filter(r => r.isArchived !== true);
        }

        updateTitle(finalReports.length);

        if (finalReports.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:#64748b;">Bu türe ait ${isArchiveView ? 'arşivlenmiş' : 'kaydedilmiş'} rapor bulunmuyor.</div>`;
            return;
        }

        finalReports.forEach(r => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.gap = '15px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'report-checkbox';
            checkbox.value = r.id;
            checkbox.style.width = '20px';
            checkbox.style.height = '20px';
            checkbox.style.cursor = 'pointer';

            card.appendChild(checkbox);

            const info = document.createElement('div');
            info.style.flexGrow = '1';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;';

            const title = document.createElement('h3');
            title.style.cssText = 'margin:0; font-size:1rem; display:flex; align-items:center; flex-wrap:wrap; gap:8px;';
            title.innerHTML = `<span>${r.activityName || 'İsimsiz Rapor'}</span>`;
            if (r.fillerName) {
                title.innerHTML += `<span style="font-size:0.75rem; background:#ecfdf5; color:#10b981; padding:2px 8px; border-radius:12px; font-weight:600; border:1px solid #a7f3d0;"><i class="fas fa-pencil-alt" style="margin-right:4px;"></i>${formatNameTR(r.fillerName)}</span>`;
            }

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
            editBtn.type = 'button';
            editBtn.className = 'btn-secondary';
            editBtn.style.cssText = 'font-size:0.8rem; padding:0.5rem 1rem;';
            editBtn.textContent = 'Formda Göster';
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.editRecord(r);
            });

            const printBtn = document.createElement('button');
            printBtn.type = 'button';
            printBtn.className = 'btn-primary';
            printBtn.style.cssText = 'font-size:0.8rem; padding:0.5rem 1rem;';
            printBtn.textContent = 'Yazdır';
            printBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.printRecord(r);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-secondary';
            deleteBtn.style.cssText = 'font-size:0.8rem; padding:0.5rem 1rem; color: #ef4444; border-color: #ef4444;';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Sil';
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.deleteRecord(r);
            });

            actions.appendChild(editBtn);
            actions.appendChild(printBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(info);
            card.appendChild(actions);
            listContainer.appendChild(card);
        });
}

async function archiveSelectedReports(shouldArchive) {
    const listId = isArchiveView ? 'archived-list' : 'reports-list';
    const checkboxes = document.querySelectorAll(`#${listId} .report-checkbox:checked`);
    if (checkboxes.length === 0) {
        alert('Lütfen en az bir rapor seçin.');
        return;
    }

    const pw = prompt(`${shouldArchive ? 'Arşivleme' : 'Arşivden çıkarma'} işlemi için şifreyi giriniz:`);
    if (pw === null) return;
    if (pw !== '1234') {
        alert('Hatalı şifre!');
        return;
    }

    const msg = shouldArchive ? `${checkboxes.length} rapor arşivlenecek. Emin misiniz?` : `${checkboxes.length} rapor arşivden çıkarılacak. Emin misiniz?`;
    if (!confirm(msg)) return;

    let successCount = 0;
    for (const cb of checkboxes) {
        const id = cb.value;
        try {
            await db.collection(STORE_NAME).doc(id).update({
                isArchived: shouldArchive
            });
            successCount++;
        } catch (err) {
            console.error(`Error ${shouldArchive ? 'archiving' : 'unarchiving'} report ${id}:`, err);
        }
    }

    alert(`✅ ${successCount} rapor başarıyla ${shouldArchive ? 'arşivlendi' : 'arşivden çıkarıldı'}.`);
    loadReports();
}



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

    const eduYearVal = document.getElementById('edu-year').value;
    list.forEach(item => {
        const nameText = (isOG ? item.eylem_adi : item.eylem_gorev) || "";
        const normName = normalizeString(nameText);
        if (!normName) return;
        
        const itemId = isOG ? `og-${item.no}` : `oo-${item.sira}`;
        // Sadece İLGİLİ TÜR ve YIL için kontrol et, id varsa id ile yoksa isimle eşleştir.
        const isReported = savedReportsCache.some(r => {
            if (r.projectType !== typeVal || r.eduYear !== eduYearVal) return false;
            if (r.planId && r.planId === itemId) return true;
            return normalizeString(r.activityName) === normName;
        });
        
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

function checkReportedActivities() {
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
    const uniqueReports = [];
    const seenKeys = new Set();
    savedReportsCache.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(r => {
        const dupKey = r.timestamp ? `${r.timestamp}` : `${r.activityName}_${r.fillerName}`;
        if (!seenKeys.has(dupKey)) {
            seenKeys.add(dupKey);
            uniqueReports.push(r);
        }
    });

    uniqueReports.forEach(report => {
        if (report.projectType !== typeVal) return;

        const normReportName = normalizeString(report.activityName);
        const planItem = planList.find(p => {
            const itemId = isOG ? `og-${p.no}` : `oo-${p.sira}`;
            if (report.planId && report.planId === itemId) return true;
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

window.restoreIgnoredTasks = function() {
    if (confirm("Daha önce 'Listeden Kaldır' diyerek gizlediğiniz tüm faaliyetler tablolara geri getirilecektir. Onaylıyor musunuz?")) {
        localStorage.removeItem('pfds_ignored_tasks');
        checkOverdueActivities();
    }
};

function getIgnoredTasks() { 
    try {
        let v = JSON.parse(localStorage.getItem('pfds_ignored_tasks'));
        if (!Array.isArray(v)) v = [];
        return v;
    } catch(e) { return []; } 
}
function ignoreTask(person, taskId) {
    const ignored = getIgnoredTasks();
    if (!ignored.includes(taskId)) {
        ignored.push(taskId);
        localStorage.setItem('pfds_ignored_tasks', JSON.stringify(ignored));
    }
}
function isTaskIgnored(person, taskId) {
    const ignored = getIgnoredTasks();
    return ignored.includes(taskId);
}

function showStatusModal(title, tasks) {
    const list = document.getElementById('overdue-list');
    list.innerHTML = '';
    const modal = document.getElementById('overdue-modal');
    modal.querySelector('.modal-header h3').innerHTML = `<i class="fas fa-list"></i> ${title} (${tasks.length})`;
    
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.isReported ? 'overdue-item reported-item' : 'overdue-item';
        li.title = 'CTRL+Tık: Lider Ekle/Gör';
        
        let statusBadge = '';
        if (t.isReported) {
            const badge = getReportStatusBadge(t.status);
            statusBadge = `<div style="margin-top:4px;">${badge}</div>`;
        }
        const leaderBadgeHtml = buildLeaderBadgeRow(t.id);

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="overdue-name">${t.name}</span>
                    ${t.filler ? `<span style="font-size:0.7rem; background:#ecfdf5; color:#10b981; padding:2px 6px; border-radius:10px; font-weight:600; border:1px solid #a7f3d0;"><i class="fas fa-pencil-alt" style="margin-right:4px;"></i>${formatNameTR(t.filler)}</span>` : ''}
                </div>
                <span style="font-size:0.75rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#64748b; font-weight:600;">${t.eduYear}</span>
            </div>
            <div class="overdue-details">
                <span class="overdue-date"><i class="far fa-calendar-alt"></i> ${t.start} — ${t.end}</span>
                <span class="overdue-person"><i class="fas fa-user"></i> ${formatNameTR(t.person)}</span>
                ${statusBadge}
            </div>
            ${leaderBadgeHtml}
            <div class="task-actions" style="display:flex; gap:10px; margin-top:5px;">
                <button class="btn-secondary btn-action-sm btn-delete" onclick="handleIgnoreTask(event, '${t.person.replace(/'/g, "\\'")}', '${t.id}')">
                    <i class="fas fa-trash-alt"></i> Listeden Kaldır
                </button>
                ${!t.isReported ? `
                    <button class="btn-primary btn-action-sm btn-fill" onclick="fillFromModal('${t.name.replace(/'/g, "\\'")}','${t.person.replace(/'/g, "\\'")}','${t.start}','${t.end}','${t.id}')">Rapor Doldur</button>
                ` : ''}
            </div>
        `;
        list.appendChild(li);
        // Ctrl+tık ile lider yönetimi
        const projType = document.querySelector('input[name="project-type"]:checked') ? document.querySelector('input[name="project-type"]:checked').value : 'OKUL GELİŞİM PROJESİ';
        attachLeaderEvents(li, t.id, projType, t.name);
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

window.fillFromModal = (name, person, start, end, tid) => {
    document.getElementById('activity-name').value = name;
    document.getElementById('responsible-teacher').value = person + ', ';
    document.getElementById('activity-start').value = parseDBDate(start);
    document.getElementById('activity-end').value = parseDBDate(end);
    if (tid) {
        const planIdObj = document.getElementById('plan-id');
        if (planIdObj) planIdObj.value = tid;
    }
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
    pwInput.setAttribute('readonly', 'readonly');
    modal.style.display = 'flex';
    setTimeout(() => {
        pwInput.removeAttribute('readonly');
        pwInput.focus();
    }, 100);

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

window.deleteRecord = function(data) {
    if (!data || !data.id) return;
    
    promptVerifyPassword((enteredPw) => {
        if (enteredPw === null) return; // User cancelled
        
        const isMaster = enteredPw === '21012012';
        const isCorrectHash = data.passwordHash && hashPassword(enteredPw) === data.passwordHash;
        const isEmptyPasswordHash = !data.passwordHash || data.passwordHash === hashPassword('');
        
        // Always require password. If record has an empty password, either enter empty or master.
        if (isMaster || isCorrectHash || (isEmptyPasswordHash && enteredPw === '')) {
            if (confirm(`'${data.activityName || "İsimsiz Rapor"}' kalıcı olarak silinecek. Onaylıyor musunuz?`)) {
                _executeDelete(data);
            }
        } else {
            alert("Hatalı şifre! Kayıt silinemedi. Yetkili değilseniz master şifreyi girmelisiniz.");
        }
    });
};

function _executeDelete(data) {
    if (!db) {
        alert("Veritabanı bağlantısı yok.");
        return;
    }
    db.collection(STORE_NAME).doc(data.id).delete().then(() => {
        // syncSavedReportsCache array automatic sync via onSnapshot will handle cache removal
        if (currentRecordId === data.id) {
            clearAllForm();
        }
        alert("Kayıt başarıyla silindi.");
    }).catch((e) => {
        console.error("Delete failed:", e);
        alert("Silme işlemi başarısız oldu.");
    });
}

// =============================================
// FAAALİYET LİDERİ — GLOBAL FONKSİYONLAR
// =============================================

// Firebase'den lider verisini dinle ve cache'e al
function syncLeadersCache() {
    if (!db) { setTimeout(syncLeadersCache, 500); return; }
    db.collection(LEADER_STORE).onSnapshot((snapshot) => {
        activityLeadersCache.clear();
        snapshot.forEach((doc) => {
            const d = doc.data();
            activityLeadersCache.set(doc.id, d.leaders || []);
        });
        console.log(`Leader cache updated: ${activityLeadersCache.size} entries.`);
        // Listeler snapshot ile güncellenir, ek işlem gerekmez.
    });
}

// Lider badge satırını inşa et
function buildLeaderBadgeRow(planId) {
    const leaders = activityLeadersCache.get(planId) || [];
    if (leaders.length === 0) return '';
    const badges = leaders.map(l => `<span class="leader-badge"><i class="fas fa-crown"></i>${l}</span>`).join('');
    return `<div class="leader-badge-row">${badges}</div>`;
}

// CTRL+Tık ile lider yönetimi event'lerini bağla
function attachLeaderEvents(liEl, planId, projectType, taskName) {
    liEl.addEventListener('contextmenu', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            openLeaderModal(planId, projectType, taskName);
        }
    });
    liEl.addEventListener('click', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            openLeaderModal(planId, projectType, taskName);
        }
    });
}

// Lider mini modal aç (hem ekleme hem listeleme)
function openLeaderModal(planId, projectType, taskName) {
    _leaderModalPlanId = planId;
    _leaderModalProjectType = projectType;

    const modal = document.getElementById('leader-modal');
    const title = document.getElementById('lm-title');
    const taskNameEl = document.getElementById('lm-task-name');
    const nameInput = document.getElementById('lm-name-input');

    if (title) title.innerHTML = '<i class="fas fa-crown"></i> Faaliyet Lideri Yönetimi';
    if (taskNameEl) taskNameEl.textContent = taskName;
    if (nameInput) nameInput.value = '';

    renderLeaderModalList(planId);

    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 150);
}

// Lider listesini modal içinde yeniden çiz
function renderLeaderModalList(planId) {
    const ul = document.getElementById('lm-leaders-list');
    if (!ul) return;
    const leaders = activityLeadersCache.get(planId) || [];
    ul.innerHTML = '';

    if (leaders.length === 0) {
        ul.innerHTML = '<div class="lm-empty"><i class="fas fa-user-slash" style="margin-right:6px;"></i>Henüz lider tanımlanmamış.</div>';
        return;
    }

    leaders.forEach((leader, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><i class="fas fa-crown" style="color:#fbbf24; margin-right:6px; font-size:0.75rem;"></i>${leader}</span>
            <button class="lm-delete-btn" data-idx="${idx}"><i class="fas fa-trash-alt"></i> Sil</button>
        `;
        li.querySelector('.lm-delete-btn').onclick = () => deleteLeaderAction(planId, idx, leader);
        ul.appendChild(li);
    });
}

// Lider ekleme işlemi (şifre korumalı)
function _leaderAddAction() {
    const nameInput = document.getElementById('lm-name-input');
    const rawName = nameInput ? nameInput.value.trim() : '';
    if (!rawName) { alert('Lider adı boş olamaz!'); return; }

    const pw = prompt('Lider eklemek için şifreyi girin:');
    if (pw === null) return;
    if (pw !== LEADER_PASSWORD) { alert('❌ Hatalı şifre!'); return; }

    const planId = _leaderModalPlanId;
    const projectType = _leaderModalProjectType;
    if (!planId) return;

    const currentLeaders = [...(activityLeadersCache.get(planId) || [])];
    const formattedName = formatNameTR(rawName);

    if (currentLeaders.some(l => l.toLowerCase() === formattedName.toLowerCase())) {
        alert('Bu lider zaten eklenmiş!');
        return;
    }

    currentLeaders.push(formattedName);

    db.collection(LEADER_STORE).doc(planId).set({
        planId,
        projectType,
        leaders: currentLeaders
    }).then(() => {
        if (nameInput) nameInput.value = '';
        renderLeaderModalList(planId);
    }).catch(e => alert('Kayıt hatası: ' + e.message));
}

// Lider silme işlemi (şifre korumalı)
function deleteLeaderAction(planId, idx, leaderName) {
    const pw = prompt(`"${leaderName}" liderini silmek için şifreyi girin:`);
    if (pw === null) return;
    if (pw !== LEADER_PASSWORD) { alert('❌ Hatalı şifre!'); return; }

    const currentLeaders = [...(activityLeadersCache.get(planId) || [])];
    currentLeaders.splice(idx, 1);

    const docRef = db.collection(LEADER_STORE).doc(planId);
    if (currentLeaders.length === 0) {
        docRef.delete().then(() => {
            renderLeaderModalList(planId);
        }).catch(e => alert('Silme hatası: ' + e.message));
    } else {
        docRef.set({ planId, leaders: currentLeaders }, { merge: true }).then(() => {
            renderLeaderModalList(planId);
        }).catch(e => alert('Güncelleme hatası: ' + e.message));
    }
}

// Faaliyet Lideri dropdown'u artık kullanılmıyor, datalist/suggestions yapısına geçildi

// Formu dolduran kişi öneri listesini oluştur
function renderFillerSuggestions(fragment) {
    const panel = document.getElementById('filler-suggestions-panel');
    if (!panel) return;

    const allNames = new Set();
    activityLeadersCache.forEach(names => names.forEach(n => allNames.add(n)));
    
    const filtered = Array.from(allNames)
        .filter(n => n.toLocaleLowerCase('tr').includes(fragment.toLocaleLowerCase('tr')))
        .sort((a, b) => a.localeCompare(b, 'tr'));

    if (filtered.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    filtered.slice(0, 20).forEach(name => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<i class="fas fa-crown" style="color: #ffd700;"></i> ${name}`;
        div.onclick = () => {
            const input = document.getElementById('filler-name');
            input.value = name;
            panel.style.display = 'none';
            updateFilledState(input);
        };
        panel.appendChild(div);
    });
    panel.style.display = 'block';
}

// Faaliyet Lideri filtresi öneri listesini oluştur
function renderLeaderFilterSuggestions(fragment) {
    const panel = document.getElementById('leader-filter-suggestions');
    if (!panel) return;

    const typeRadio = document.querySelector('input[name="project-type"]:checked');
    const typeVal = typeRadio ? typeRadio.value : 'OKUL GELİŞİM PROJESİ';
    const prefix = typeVal === 'OKUL GELİŞİM PROJESİ' ? 'og-' : 'oo-';

    const allLeaders = new Set();
    activityLeadersCache.forEach((leaders, planId) => {
        if (planId.startsWith(prefix)) {
            leaders.forEach(l => allLeaders.add(l));
        }
    });

    const filtered = Array.from(allLeaders)
        .filter(n => n.toLocaleLowerCase('tr').includes(fragment.toLocaleLowerCase('tr')))
        .sort((a, b) => a.localeCompare(b, 'tr'));

    if (filtered.length === 0) { panel.style.display = 'none'; return; }

    panel.innerHTML = '';
    filtered.slice(0, 20).forEach(name => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<i class="fas fa-crown" style="color: #ffd700;"></i> ${name}`;
        div.onclick = () => {
            const input = document.getElementById('leader-filter-input');
            input.value = name;
            panel.style.display = 'none';
            checkActivitiesByLeader(name);
        };
        panel.appendChild(div);
    });
    panel.style.display = 'block';
}

// Seçilen liderin faaliyetlerini listele (mevcut proje türü + süresi dolan/devam eden filtresi)
function checkActivitiesByLeader(leaderName) {
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }

    const typeRadio = document.querySelector('input[name="project-type"]:checked');
    const statusRadio = document.querySelector('input[name="activity-status"]:checked');
    const typeVal = typeRadio ? typeRadio.value : 'OKUL GELİŞİM PROJESİ';
    const statusVal = statusRadio ? statusRadio.value : 'expired';
    const isOG = typeVal === 'OKUL GELİŞİM PROJESİ';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yearIdx = getYearIndexForReport();

    // Bu lidere ait planId'leri bul
    const leaderPlanIds = new Set();
    activityLeadersCache.forEach((leaders, planId) => {
        if (leaders.some(l => l.toLowerCase() === leaderName.toLowerCase())) {
            leaderPlanIds.add(planId);
        }
    });

    if (leaderPlanIds.size === 0) {
        alert(`"${leaderName}" adlı lidere atanmış faaliyet bulunamadı.`);
        return;
    }

    const dbSource = isOG ? combinedData.og_db : combinedData.oo_db;
    const results = [];
    const eduYearVal = document.getElementById('edu-year').value;

    dbSource.forEach(item => {
        const itemId = isOG ? `og-${item.no}` : `oo-${item.sira}`;
        if (!leaderPlanIds.has(itemId)) return;

        const dStr = isOG
            ? (item[`y${yearIdx}_bit`] || item[`y${yearIdx}_bas`])
            : (item[`bitis_${yearIdx}`] || item[`baslangic_${yearIdx}`]);
        const dt = parseDBDate(dStr);
        if (!dt) return;

        const d = new Date(dt);
        const isMatch = statusVal === 'expired' ? d < today : d >= today;
        if (!isMatch) return;

        const nameText = isOG ? item.eylem_adi : item.eylem_gorev;
        const normName = normalizeString(nameText);
        const report = savedReportsCache.find(r => {
            if (r.projectType !== typeVal) return false;
            if (r.planId && r.planId === itemId) return true;
            return normalizeString(r.activityName) === normName && r.eduYear === eduYearVal;
        });

        results.push({
            id: itemId,
            name: nameText,
            eduYear: eduYearVal,
            start: isOG ? item[`y${yearIdx}_bas`] : item[`baslangic_${yearIdx}`],
            end: isOG ? item[`y${yearIdx}_bit`] : item[`bitis_${yearIdx}`],
            person: isOG ? item.sorumlu : item.sorumlu_verisi,
            isReported: !!report,
            status: report ? report.status : null,
            filler: report ? report.fillerName : null
        });
    });

    if (results.length === 0) {
        alert(`"${leaderName}" liderine ait ${statusVal === 'expired' ? 'süresi dolan' : 'devam eden'} faaliyet bulunamadı.`);
        return;
    }

    currentModalTasks = results;
    currentModalTitle = `${leaderName} — Faaliyet Listesi`;
    showStatusModal(currentModalTitle, results);
}

// Aktif filtreler (printLeaderFullReport icin)
let _almCurrentTypeVal = 'OKUL GELİŞİM PROJESİ';
let _almCurrentStatusVal = 'expired';

// Tüm faaliyet liderlerini özet modal'da göster
function showAllLeadersModal() {
    const typeRadio = document.querySelector('input[name="project-type"]:checked');
    const statusRadio = document.querySelector('input[name="activity-status"]:checked');
    const typeVal = typeRadio ? typeRadio.value : 'OKUL GELİŞİM PROJESİ';
    const statusVal = statusRadio ? statusRadio.value : 'expired';
    _almCurrentTypeVal = typeVal;
    _almCurrentStatusVal = statusVal;
    const statusLabel = statusVal === 'expired' ? 'Süresi Dolan' : 'Devam Eden';
    const typeLabel = typeVal === 'OKUL GELİŞİM PROJESİ' ? 'Okul Gelişim' : 'Okul Özel';

    const modal = document.getElementById('all-leaders-modal');
    const almTitle = document.getElementById('alm-title');
    const almList = document.getElementById('alm-list');
    if (!modal || !almList) return;

    if (almTitle) almTitle.textContent = `Faaliyet Liderleri — ${typeLabel} / ${statusLabel}`;

    // Lider → faaliyet sayısı hesapla
    const leaderCounts = new Map();
    activityLeadersCache.forEach((leaders, planId) => {
        // Proje türü filtresi
        const prefix = typeVal === 'OKUL GELİŞİM PROJESİ' ? 'og-' : 'oo-';
        if (!planId.startsWith(prefix)) return;
        leaders.forEach(l => {
            leaderCounts.set(l, (leaderCounts.get(l) || 0) + 1);
        });
    });

    almList.innerHTML = '';
    if (leaderCounts.size === 0) {
        almList.innerHTML = '<div class="lm-empty" style="text-align:center; color:#64748b; padding:1.5rem;"><i class="fas fa-crown" style="margin-right:8px;"></i>Bu proje türünde lider tanımlanmamış.</div>';
    } else {
        const sorted = Array.from(leaderCounts.entries()).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([leader, count]) => {
            const div = document.createElement('div');
            div.className = 'leader-group-item';
            div.innerHTML = `
                <span class="leader-group-name"><i class="fas fa-crown"></i>${leader}</span>
                <span class="leader-group-count">${count} faaliyet</span>
            `;
            div.onclick = () => {
                modal.style.display = 'none';
                checkActivitiesByLeader(leader);
            };
            almList.appendChild(div);
        });
    }

    modal.style.display = 'flex';
}

// Tüm faaliyet liderleri için detaylı rapor — yeni sekmede aç
function printLeaderFullReport() {
    if (!combinedData) { alert('Veri henüz yüklenmedi.'); return; }

    const typeVal = _almCurrentTypeVal;
    const isOG = typeVal === 'OKUL GELİŞİM PROJESİ';
    const typeLabel = isOG ? 'Okul Gelişim Projesi' : 'Okul Özel Projesi';
    const prefix = isOG ? 'og-' : 'oo-';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yearIdx = getYearIndexForReport();
    const eduYearVal = document.getElementById('edu-year') ? document.getElementById('edu-year').value : '';
    const dbSource = isOG ? combinedData.og_db : combinedData.oo_db;

    const leaderActivities = new Map();

    activityLeadersCache.forEach((leaders, planId) => {
        if (!planId.startsWith(prefix)) return;
        const item = dbSource.find(it => (isOG ? `og-${it.no}` : `oo-${it.sira}`) === planId);
        if (!item) return;

        const dStr = isOG
            ? (item[`y${yearIdx}_bit`] || item[`y${yearIdx}_bas`])
            : (item[`bitis_${yearIdx}`] || item[`baslangic_${yearIdx}`]);
        const dt = parseDBDate(dStr);
        const endDate = dt ? new Date(dt) : null;
        const isExpired = endDate ? endDate < today : false;
        // Filtre yok — süresi dolsun ya da dolmasın tümü listelenir

        const startStr = isOG ? item[`y${yearIdx}_bas`] : item[`baslangic_${yearIdx}`];
        const endStr   = isOG ? item[`y${yearIdx}_bit`] : item[`bitis_${yearIdx}`];
        const nameText = isOG ? item.eylem_adi : item.eylem_gorev;
        const normName = normalizeString(nameText);
        const report = savedReportsCache.find(r => {
            if (r.projectType !== typeVal) return false;
            if (r.planId && r.planId === planId) return true;
            return normalizeString(r.activityName) === normName && r.eduYear === eduYearVal;
        });

        const actInfo = {
            name: nameText,
            project: typeLabel,
            start: startStr || '—',
            end: endStr || '—',
            isExpired,
            isReported: !!report,
            status: report ? report.status : null
        };

        leaders.forEach(leader => {
            if (!leaderActivities.has(leader)) leaderActivities.set(leader, []);
            leaderActivities.get(leader).push(actInfo);
        });
    });

    if (leaderActivities.size === 0) {
        alert('Bu filtreler için lider tanımlı faaliyet bulunamadı.');
        return;
    }

    const sortedLeaders = Array.from(leaderActivities.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
    const totalActs = Array.from(leaderActivities.values()).flat();
    let tableRows = '';
    let rowNo = 0;

    sortedLeaders.forEach(([leader, activities]) => {
        activities.forEach((act, idx) => {
            rowNo++;
            const expColor = act.isExpired ? '#dc2626' : '#059669';
            const expText  = act.isExpired ? 'Süresi Doldu' : 'Devam Ediyor';
            const repColor = act.isReported ? (act.status === 'İptal' ? '#dc2626' : '#059669') : '#6b7280';
            const repText  = act.isReported ? (act.status || 'Tamamlandı') : 'Rapor Yok';
            const ldrCell  = idx === 0
                ? `<td rowspan="${activities.length}" style="vertical-align:middle;text-align:center;padding:10px 8px;border:1px solid #e5e7eb;background:#fefce8;white-space:nowrap;">
                     <span style="display:block;font-size:0.65rem;background:#fbbf24;color:#1e293b;padding:2px 6px;border-radius:10px;margin-bottom:4px;font-weight:700;">👑 LİDER</span>
                     <span style="font-weight:700;color:#b45309;font-size:0.85rem;">${leader}</span>
                   </td>`
                : '';
            tableRows += `
            <tr style="background:${rowNo%2===0?'#f9fafb':'#fff'};">
              ${ldrCell}
              <td style="padding:9px 10px;border:1px solid #e5e7eb;font-size:12px;font-weight:600;color:#1f2937;">${act.name}</td>
              <td style="padding:9px 10px;border:1px solid #e5e7eb;text-align:center;">
                <span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;">${act.project.replace(' Projesi','')}</span>
              </td>
              <td style="padding:9px 10px;border:1px solid #e5e7eb;font-size:11px;text-align:center;color:#374151;white-space:nowrap;">${act.start}</td>
              <td style="padding:9px 10px;border:1px solid #e5e7eb;font-size:11px;text-align:center;color:#374151;white-space:nowrap;">${act.end}</td>
              <td style="padding:9px 10px;border:1px solid #e5e7eb;text-align:center;">
                <span style="background:${expColor}18;color:${expColor};padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid ${expColor}33;">${expText}</span>
              </td>
              <td style="padding:9px 10px;border:1px solid #e5e7eb;text-align:center;">
                <span style="background:${repColor}18;color:${repColor};padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid ${repColor}33;">${repText}</span>
              </td>
            </tr>`;
        });
    });

    const now = new Date().toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

    const html = `<!DOCTYPE html><html lang="tr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Faaliyet Liderleri — ${typeLabel} / Tüm Faaliyetler</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Outfit',sans-serif;background:#f1f5f9;color:#1e293b;padding:28px 18px;}
.wrap{max-width:1120px;margin:0 auto;}
.rh{background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;border-radius:16px;padding:22px 28px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
.rh h1{font-size:1.3rem;font-weight:700;margin-bottom:5px;}
.rh p{font-size:0.8rem;color:#94a3b8;}
.bdg{display:inline-block;padding:5px 13px;border-radius:18px;font-size:0.78rem;font-weight:700;margin-bottom:5px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.3);color:#fbbf24;}
.bdg.red{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);color:#fca5a5;}
.bdg.grn{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3);color:#6ee7b7;}
.abar{display:flex;gap:10px;margin-bottom:16px;}
.bprnt{background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1e293b;border:none;border-radius:10px;padding:10px 22px;font-size:0.9rem;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif;display:flex;align-items:center;gap:8px;}
.bprnt:hover{transform:translateY(-2px);}
.stats{display:flex;gap:11px;margin-bottom:16px;flex-wrap:wrap;}
.stat{background:#fff;border-radius:10px;padding:11px 16px;border:1px solid #e2e8f0;flex:1;min-width:110px;}
.stat .v{font-size:1.45rem;font-weight:700;color:#fbbf24;}
.stat .l{font-size:0.73rem;color:#64748b;}
.tw{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.06);border:1px solid #e2e8f0;}
table{width:100%;border-collapse:collapse;}
thead th{background:#1e293b;color:#f8fafc;padding:12px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-right:1px solid rgba(255,255,255,.1);}
thead th:last-child{border-right:none;}
tbody tr:hover{background:#fffbeb!important;}
.foot{text-align:center;color:#94a3b8;font-size:0.76rem;margin-top:16px;}
@media print{
  body{background:#fff;padding:6px;}
  .abar{display:none!important;}
  .wrap{max-width:100%;}
  .rh,.tw{border-radius:0;}
  .tw{box-shadow:none;}
  @page{margin:8mm;size:A4 landscape;}
}
</style></head><body>
<div class="wrap">
  <div class="rh">
    <div>
      <h1>👑 Faaliyet Liderleri Raporu</h1>
      <p>İstanbul Atatürk Anadolu Lisesi &nbsp;|&nbsp; ${eduYearVal} Eğitim Öğretim Yılı &nbsp;|&nbsp; ${now}</p>
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
      <span class="bdg">${typeLabel}</span>
      <span class="bdg grn">Tüm Faaliyetler</span>
    </div>
  </div>
  <div class="abar">
    <button class="bprnt" onclick="window.print()">🖨️ Yazdır / PDF</button>
  </div>
  <div class="stats">
    <div class="stat"><div class="v">${sortedLeaders.length}</div><div class="l">Faaliyet Lideri</div></div>
    <div class="stat"><div class="v">${rowNo}</div><div class="l">Toplam Faaliyet</div></div>
    <div class="stat"><div class="v" style="color:#dc2626;">${totalActs.filter(a=>a.isExpired).length}</div><div class="l">Süresi Dolan</div></div>
    <div class="stat"><div class="v" style="color:#059669;">${totalActs.filter(a=>!a.isExpired).length}</div><div class="l">Devam Eden</div></div>
    <div class="stat"><div class="v" style="color:#059669;">${totalActs.filter(a=>a.isReported).length}</div><div class="l">Raporu Dolu</div></div>
    <div class="stat"><div class="v" style="color:#6b7280;">${totalActs.filter(a=>!a.isReported).length}</div><div class="l">Rapor Yok</div></div>
  </div>
  <div class="tw">
    <table>
      <thead><tr>
        <th style="width:155px;">Faaliyet Lideri</th>
        <th>Faaliyet Adı</th>
        <th style="width:95px;text-align:center;">Proje</th>
        <th style="width:88px;text-align:center;">Başlangıç</th>
        <th style="width:88px;text-align:center;">Bitiş</th>
        <th style="width:115px;text-align:center;">Süre Durumu</th>
        <th style="width:110px;text-align:center;">Rapor</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div class="foot">PFDS — Proje Faaliyeti Değerlendirme ve Raporlama Sistemi</div>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up engelleyiciyi kapatın!'); return; }
    win.document.write(html);
    win.document.close();
}

function autoSelectTheme() {
    const nameInput = document.getElementById('activity-name');
    const themeSelect = document.getElementById('activity-theme');
    const typeChecked = document.querySelector('input[name="project-type"]:checked');
    const isOG = typeChecked && typeChecked.value === 'OKUL GELİŞİM PROJESİ';

    if (!nameInput || !themeSelect || !isOG || !combinedData || !combinedData.og_db) return;

    const normName = normalizeString(nameInput.value);
    if (!normName) {
        themeSelect.value = '';
        updateFilledState(themeSelect);
        return;
    }

    const item = combinedData.og_db.find(i => normalizeString(i.eylem_adi) === normName);
    if (item && item.tema) {
        themeSelect.value = `TEMA ${item.tema}`;
    }
    updateFilledState(themeSelect);
}
