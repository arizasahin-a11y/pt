// ==UserScript==
// @name         MEB PROIZ Excel Aktarım Botu
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Excel dosyasından verileri okuyarak MEB Proiz sayfasına otomatik olarak işler.
// @author       Antigravity
// @match        https://proiz.meb.gov.tr/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // CSS variables for UI
    const styles = `
        #proiz-bot-panel {
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            background: white; border: 1px solid #ccc; border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); padding: 15px; width: 320px;
            font-family: Arial, sans-serif; font-size: 14px;
        }
        #proiz-bot-panel h3 { margin-top: 0; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; color: #333; }
        .bot-btn {
            background: #2563eb; color: white; border: none; padding: 8px 12px;
            border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; margin-top: 10px;
        }
        .bot-btn:hover { background: #1d4ed8; }
        .bot-btn.btn-cancel { background: #ef4444; }
        .bot-btn.btn-cancel:hover { background: #b91c1c; }
        .bot-btn.btn-skip { background: #f59e0b; color: black; }
        .bot-btn.btn-skip:hover { background: #d97706; }
        .bot-form-group { margin-bottom: 10px; }
        .bot-form-group label { display: block; margin-bottom: 5px; color: #555; }
        #bot-log { font-size: 12px; color: #666; margin-top: 10px; max-height: 100px; overflow-y: auto; background: #f9f9f9; padding: 5px; border-radius: 4px; }
        #bot-overlay-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 9999999; display: flex;
            align-items: center; justify-content: center;
        }
        .bot-modal-box {
            background: white; padding: 20px; border-radius: 8px; width: 400px; max-width: 90%;
            box-shadow: 0 5px 25px rgba(0,0,0,0.3); text-align: center;
        }
        .bot-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
    `;
    
    // Inject CSS
    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);

    // Helpers
    function logMessage(msg) {
        const logBox = document.getElementById('bot-log');
        if (logBox) {
            logBox.innerHTML += `<div>> ${msg}</div>`;
            logBox.scrollTop = logBox.scrollHeight;
        }
        console.log("[PROIZ BOT]", msg);
    }

    function cleanString(str) {
        if (!str) return "";
        return str.toString().toLowerCase()
            .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
            .replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u')
            .replace(/[^a-z0-9]/gi, '');
    }

    // Modal Builder
    function showModal(message, eylemName, onYes, onSkip, onCancel) {
        const existing = document.getElementById('bot-overlay-modal');
        if (existing) existing.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'bot-overlay-modal';
        modalOverlay.innerHTML = `
            <div class="bot-modal-box">
                <h3 style="margin-top:0; color:#333;">İşlem Onayı</h3>
                <p style="font-size:13px; color:#555; margin-bottom:15px;"><strong>Eylem:</strong> <span style="background:#e0f2fe; padding:2px 5px; border-radius:3px;">${eylemName}</span></p>
                <p style="font-size:15px; font-weight:bold;">${message}</p>
                <div class="bot-modal-actions">
                    <button id="bm-yes" class="bot-btn">Evet (Kaydet)</button>
                    ${onSkip ? '<button id="bm-skip" class="bot-btn btn-skip">Atla</button>' : ''}
                    <button id="bm-cancel" class="bot-btn btn-cancel">İptal</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        document.getElementById('bm-yes').onclick = () => { modalOverlay.remove(); onYes(); };
        if (onSkip) document.getElementById('bm-skip').onclick = () => { modalOverlay.remove(); onSkip(); };
        document.getElementById('bm-cancel').onclick = () => { modalOverlay.remove(); if(onCancel) onCancel(); };
    }

    function showNotice(title, message, onClose) {
        const existing = document.getElementById('bot-overlay-modal');
        if (existing) existing.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'bot-overlay-modal';
        modalOverlay.innerHTML = `
            <div class="bot-modal-box">
                <h3 style="margin-top:0; color:#333;">${title}</h3>
                <p style="font-size:14px; margin-bottom:20px;">${message}</p>
                <button id="bm-ok" class="bot-btn">Tamam</button>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        document.getElementById('bm-ok').onclick = () => { modalOverlay.remove(); if(onClose) onClose(); };
    }

    // Storage Management
    const STATE = {
        get data() { return JSON.parse(GM_getValue('proiz_data') || 'null'); },
        set data(v) { GM_setValue('proiz_data', JSON.stringify(v)); },
        get type() { return GM_getValue('proiz_type') || ''; },
        set type(v) { GM_setValue('proiz_type', v); },
        get activePhase() { return GM_getValue('proiz_phase') || 'IDLE'; },
        set activePhase(v) { GM_setValue('proiz_phase', v); },
        clear() { 
            GM_deleteValue('proiz_data'); 
            GM_deleteValue('proiz_type'); 
            GM_deleteValue('proiz_phase'); 
        }
    };

    // UI Constructor
    function renderMainUI() {
        const panel = document.createElement('div');
        panel.id = 'proiz-bot-panel';
        
        let contentHTML = '';
        
        if (STATE.activePhase === 'IDLE' || window.location.href.includes('first_page.php') === false) {
            contentHTML = `
                <h3>🔄 Excel Aktarım Botu</h3>
                <div class="bot-form-group">
                    <label>Proje Türü Seçin:</label>
                    <label><input type="radio" name="bot-proj" value="OG" checked> Okul Gelişim Projesi</label><br>
                    <label><input type="radio" name="bot-proj" value="OO"> Okul Özel Projesi</label>
                </div>
                <div class="bot-form-group">
                    <label>Excel Dosyası Seçin:</label>
                    <input type="file" id="bot-file-input" accept=".xlsx" style="width:100%; border:1px solid #ddd; padding:4px;">
                </div>
                <button id="bot-btn-start" class="bot-btn">Aktarımı Başlat (Tabloda Bul)</button>
                <div id="bot-log">Sistem hazır. Excel dosyası bekleniyor.</div>
            `;
        } else if (STATE.activePhase === 'DETAIL_VIEW') {
            contentHTML = `
                <h3>🔄 Bot: Veri Giriş Bekleniyor</h3>
                <p style="font-size:12px; color:#555;">Faaliyet Durumu süzmesini yapayı unutmayın (Örn: Süresi Geçmiş).</p>
                <button id="bot-btn-process-form" class="bot-btn" style="background:#10b981;">Ekranda Tarama ve Giriş Yap</button>
                <button id="bot-btn-reset" class="bot-btn btn-cancel" style="margin-top:5px;">İşlemi Sıfırla</button>
                <div id="bot-log">Sistem listeyi okumaya hazır.</div>
            `;
        }
        
        panel.innerHTML = contentHTML;
        document.body.appendChild(panel);
        bindUIEvents();
    }

    // Excel Parser
    function parseExcel(file, projType, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                // Use first sheet for OG, second sheet for OO
                const targetSheetIndex = projType === 'OG' ? 0 : 1;
                const sheetName = workbook.SheetNames[targetSheetIndex];
                if (!sheetName) {
                    showNotice('Hata', 'İlgili sayfa bulunamadı. Lütfen doğru PTS Excel dosyasını yüklediğinizden emin olun.');
                    return;
                }
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, {defval: ""});
                callback(json);
            } catch (err) {
                showNotice('Hata', 'Excel dosyası okunamadı: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Logic 1: Start Flow & Find Table Row
    function handleStart() {
        const fileInput = document.getElementById('bot-file-input');
        if (!fileInput.files.length) { alert('Lütfen Excel dosyası seçin!'); return; }
        
        const projRadio = document.querySelector('input[name="bot-proj"]:checked');
        const projType = projRadio.value; // 'OG' or 'OO'
        
        logMessage("Dosya okunuyor...");
        
        parseExcel(fileInput.files[0], projType, (jsonData) => {
            logMessage(`Excel yüklendi. ${jsonData.length} satır bulundu. Sayfa taranıyor...`);
            STATE.data = jsonData;
            STATE.type = projType;
            
            // Search table for matching row
            const searchText = projType === 'OG' ? "OKUL GELİŞİM" : "OKUL ÖZEL"; // Adust logic based on MEBBIS text
            let foundButton = null;
            
            // Try matching TR containing the exact phrase
            const trs = document.querySelectorAll('tr');
            for(let t of trs) {
                if (cleanString(t.innerText).includes(cleanString(searchText))) {
                    // found the row
                    const btn = t.querySelector('button, a.btn');
                    if (btn && btn.innerText.includes('Takibe Gir')) {
                        foundButton = btn;
                        break;
                    }
                }
            }
            
            if (foundButton) {
                logMessage("Takibe Gir butonu bulundu. Tıklanıyor...");
                STATE.activePhase = 'DETAIL_VIEW';
                setTimeout(() => { foundButton.click(); }, 1000); // 1s delay
            } else {
                showNotice("Bulunamadı", `Sayfada "${searchText}" projesine ait 'Takibe Gir' butonu bulunamadı. Doğru sayfada mısınız?`);
                STATE.clear();
            }
        });
    }

    // Logic 2: Read details page & process forms dynamically
    async function processDetailForms() {
        logMessage("Formlar işleniyor...");
        const db = STATE.data;
        const pType = STATE.type;

        // Find all forms/blocks related to an action.
        // The structure usually has "Eylem 1:" or "Görev 2:" text.
        // We will locate "Kaydet" buttons as a proxy for identifying actionable areas.
        const blocks = [];
        const buttons = document.querySelectorAll('button, a.btn');
        for (let btn of buttons) {
            if (btn.innerText.trim().toLowerCase() === 'kaydet') {
                // Ascend to the parent container that holds the header
                let container = btn.closest('div.card') || btn.closest('div.panel') || btn.parentElement.parentElement;
                
                // Extra check: try to find the label/title in this container
                if (container && container.innerText.match(/(Eylem|Görev)\s*\d+:/i)) {
                    blocks.push(container);
                }
            }
        }
        
        logMessage(`${blocks.length} adet kaydedilebilir form alanı tespit edildi.`);
        if (blocks.length === 0) {
            showNotice("Form Bulunamadı", "Sayfada eylem/görev form alanları bulunamadı. Lütfen süzmeyi kontrol edin.");
            return;
        }

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            
            // If the block is hidden, ignore
            if (block.offsetHeight === 0) continue;

            const fullText = block.innerText;
            // E.g. "Eylem 1: Yeni gelen velilerle tanışma... Süresi geçti"
            const matchHeader = fullText.match(/(?:Eylem|Görev)\s*\d+:\s*(.*?)(?:\n|\r|Süresi|$)/i);
            
            if (!matchHeader || !matchHeader[1]) {
                console.log("Header eşleşmedi:", fullText.substring(0, 100));
                continue;
            }
            
            let domTitle = matchHeader[1].trim();
            // remove badges explicitly just in case
            domTitle = domTitle.replace(/Yıllık.*$/i, '').replace(/Süresi geçti/i, '').replace(/Süresi dolmadı/i, '').trim();
            const cleanDomTitle = cleanString(domTitle);
            
            // Find in Excel Data
            const colName = pType === 'OG' ? 'Plana Göre Eylem Adı' : 'Plana Göre Görev Adı';
            const excItem = db.find(r => cleanString(r[colName] || r['Faaliyet Adı']) === cleanDomTitle || (r[colName] && cleanString(r[colName]).includes(cleanDomTitle)));
            
            if (!excItem) {
                logMessage(`[Atlandı] Eşleşme Bulunamadı: ${domTitle}`);
                continue;
            }

            const eylemDurum = excItem['DURUM'];
            if (eylemDurum === 'EKSİK' || eylemDurum === 'PLAN HARİCİ') {
                logMessage(`[Atlandı] Veri ${eylemDurum}: ${domTitle}`);
                continue; // Automatically skip incomplete/unmatched reports or ask user? User said skip after prompt. Let's ask.
            }
            
            // WE HAVE A MATCH with data!
            // Wait for user interaction cycle via Promise
            await new Promise((resolve) => {
                if (eylemDurum === 'EKSİK') {
                    showModal("Bu eylem için rapor eksik. Boş geçilecek.", domTitle, 
                        () => resolve(), // yes -> just resolve
                        () => resolve(), 
                        () => resolve()
                    );
                    return;
                }

                // Fill Inputs
                fillFormElements(block, excItem, eylemDurum);
                
                showModal(`Excel'den (${eylemDurum}) verisi aktarıldı. Sisteme KAYDET butonuna basılsın mı?`, domTitle,
                    () => {
                        logMessage(`Kaydediliyor: ${domTitle}`);
                        const btn = Array.from(block.querySelectorAll('button')).find(b => b.innerText.includes('Kaydet'));
                        if (btn) btn.click();
                        setTimeout(resolve, 800); // give it time to submit
                    },
                    () => { logMessage("Atlandı."); resolve(); },
                    () => { logMessage("İptal edildi."); resolve(); }
                );
            });
        }
        
        showNotice("Tamamlandı", "Ekrandaki tüm eylemler tarandı.");
    }

    function setSelectByText(selectElem, text) {
        if(!selectElem) return;
        const lowerText = text.toLowerCase().replace('ü','u').replace('ı','i').replace('ş','s').replace('ç','c').replace('ğ','g').trim();
        for (let opt of selectElem.options) {
            const optLower = opt.innerText.toLowerCase().replace('ü','u').replace('ı','i').replace('ş','s').replace('ç','c').replace('ğ','g').trim();
            if (optLower === lowerText) {
                selectElem.value = opt.value;
                selectElem.dispatchEvent(new Event('change', {bubbles: true}));
                return;
            }
        }
    }

    function fillFormElements(block, excItem, durum) {
        // Durum Dropdown
        const selects = block.querySelectorAll('select');
        if (selects.length > 0) {
            setSelectByText(selects[0], durum);
        }

        // Dates
        const dateInputs = block.querySelectorAll('input[type="text"], input[type="date"]');
        const start = excItem['Plana Göre Başlangıç'] || excItem['Rapor Başlangıç']; // In excel it is formatted as "01.10.2025" or similar. MEB might expect DD.MM.YYYY.
        const end = excItem['Plana Göre Bitiş'] || excItem['Rapor Bitiş'];
        const numInputs = block.querySelectorAll('input[type="number"], input[type="text"]');
        // Let's rely on placeholder or name/id to find inputs
        
        block.querySelectorAll('input').forEach(inp => {
            const htmlLower = inp.outerHTML.toLowerCase();
            if (htmlLower.includes('başlan') || htmlLower.includes('start')) {
                if(start && inp.value === '') { inp.value = start; inp.dispatchEvent(new Event('change')); }
            }
            if (htmlLower.includes('biti') || htmlLower.includes('end')) {
                if(end && inp.value === '') { inp.value = end; inp.dispatchEvent(new Event('change')); }
            }
            if (htmlLower.includes('mal') || htmlLower.includes('cost')) {
                if(inp.value === '') { 
                    inp.value = excItem['Maliyet (TL)'] || '0'; 
                    inp.dispatchEvent(new Event('change')); 
                }
            }
        });

        const txt = block.querySelector('textarea');
        if (txt && txt.value === '') {
            txt.value = excItem['Faaliyet Değerlendirmesi'] || excItem['Çözüm Önerileri'] || '-';
            txt.dispatchEvent(new Event('change'));
        }
    }

    function bindUIEvents() {
        const startBtn = document.getElementById('bot-btn-start');
        if (startBtn) startBtn.addEventListener('click', handleStart);

        const processBtn = document.getElementById('bot-btn-process-form');
        if (processBtn) processBtn.addEventListener('click', processDetailForms);

        const resetBtn = document.getElementById('bot-btn-reset');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            STATE.clear();
            document.getElementById('proiz-bot-panel').remove();
            renderMainUI();
        });
    }

    // Initialize 
    window.addEventListener('load', () => {
        setTimeout(renderMainUI, 1000); 
    });

})();
