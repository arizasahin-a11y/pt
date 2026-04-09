import os
import re
import win32com.client
import openpyxl
import calendar
import unicodedata
import time
import glob

# Dosya yollari
BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
OUTPUT_EXCEL = os.path.join(BASE_DIR, "Eylem_Plani_Raporu.xlsx")

def find_file(pattern):
    matches = glob.glob(os.path.join(BASE_DIR, pattern))
    if matches: return matches[0]
    return None

EYLEM_PLANI_DOC = find_file("*EYLEM PLANI*.doc")
# Kullanıcı özellikle OÖP FAALİYET TAKVİMİ.doc dedi
TAKTAK_DOC = find_file("O\u00d6P FAAL\u0130YET TAKV\u0130M\u0130.doc") or find_file("*FAAL\u0130YET TAKV\u0130M\u0130*.doc")

turkish_months = {
    "EYLUL": 9, "EKIM": 10, "KASIM": 11, "ARALIK": 12,
    "OCAK": 1, "SUBAT": 2, "MART": 3, "NISAN": 4,
    "MAYIS": 5, "HAZIRAN": 6, "TEMMUZ": 7, "AGUSTOS": 8
}

def clean_text(text):
    if text is None: return ""
    return str(text).strip().replace('\r', '').replace('\x07', '')

def clean_task_name(name):
    name = clean_text(name)
    name = re.sub(r'^(Eylem|Görev|Sıra)?\s*\d+[\.\s:]*', '', name, flags=re.I).strip()
    return name

def universal_key(text):
    if not text: return ""
    text = text.lower().replace('\u0130', 'i').replace('\u0131', 'i')
    text = ''.join(c for c in unicodedata.normalize('NFKD', text) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', text)

def run_extraction():
    print(">>> KÖPRÜ METODU: İşlem başlatıldı (Word + Excel) <<<")
    start_time = time.time()
    
    tasks_data = []
    
    try:
        word = win32com.client.Dispatch("Word.Application")
        excel = win32com.client.Dispatch("Excel.Application")
        word.Visible = False
        excel.Visible = False
        word.DisplayAlerts = 0
        excel.DisplayAlerts = 0
    except Exception as e:
        print(f"HATA: Ofis uygulamalarına bağlanılamadı: {e}"); return

    try:
        # 1. EYLEM PLANI OKUMA (Word)
        print("1/4 - Eylem Planı okunuyor...")
        doc_e = word.Documents.Open(os.path.abspath(EYLEM_PLANI_DOC))
        for table in doc_e.Tables:
            try:
                header = clean_text(table.Range.Cells(1).Range.Text)
                if "Eylemler" in header or "Görevler" in header:
                    row_map = {}
                    for cell in table.Range.Cells:
                        r, c = cell.RowIndex, cell.ColumnIndex
                        row_map.setdefault(r, {})[c] = cell.Range.Text
                    for r_idx in sorted(row_map.keys()):
                        if r_idx <= 1: continue
                        name = clean_task_name(row_map[r_idx].get(1, ""))
                        col4 = clean_text(row_map[r_idx].get(4, ""))
                        if name:
                            tasks_data.append({"name": name, "match_key": universal_key(name), "col4": col4, "dates": []})
            except: continue
        doc_e.Close(False)
        print(f"  > {len(tasks_data)} görev toplandı.")

        # 2. TAKVİM AKTARIMI (Word -> Excel Köprüsü)
        print("2/4 - Takvim kopyalanıyor ve Excel'e aktarılıyor...")
        doc_t = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
        table_t = doc_t.Tables(1)
        table_t.Range.Copy() # Word tablosunu kopyala
        
        time.sleep(1) # Panonun (Clipboard) dolması için kısa bir bekleme
        
        wb_temp = excel.Workbooks.Add()
        ws_temp = wb_temp.ActiveSheet
        ws_temp.Activate()
        try:
            ws_temp.Range("A1").Select()
            ws_temp.Paste() # Standart yapıştırma
        except:
            ws_temp.PasteSpecial() # Alternatif güvenli yapıştırma
        
        # 3. VERİ ÇEKME (Excel üzerinden - ÇOK HIZLI)
        print("3/4 - Veriler Excel köprüsü üzerinden çekiliyor...")
        # Header Analizi (R1-R2)
        years, months = {}, {}
        for c in range(1, 80):
            v1 = clean_text(ws_temp.Cells(1, c).Value)
            v2 = clean_text(ws_temp.Cells(2, c).Value)
            if v1:
                match = re.search(r'\d{4}', v1)
                if match: years[c] = int(match.group())
            if v2:
                m_norm = universal_key(v2).upper()
                for mname, mnum in turkish_months.items():
                    if mname in m_norm: months[c] = mnum; break

        # Header Doldurma (Local)
        curr_y, curr_m = None, None
        for c in range(1, 81):
            if c in years: curr_y = years[c]
            else: years[c] = curr_y
            if c in months: curr_m = months[c]
            else: months[c] = curr_m

        # Eşleştirme ve Renk Tespiti
        match_count = 0
        for r in range(3, ws_temp.UsedRange.Rows.Count + 1):
            row_name_raw = clean_text(ws_temp.Cells(r, 2).Value) # Görev ismi 2. sütunda
            uk = universal_key(clean_task_name(row_name_raw))
            if not uk: continue
            
            target_t = None
            for t in tasks_data:
                if t["match_key"] and (t["match_key"] in uk or uk in t["match_key"]):
                    target_t = t; break
            
            if target_t:
                match_count += 1
                green_cols = []
                for c in range(3, 80):
                    # Excel hücresinin rengine bak
                    # White/None olmayan her renk 'işaret' kabul ediliyor
                    fill_color = ws_temp.Cells(r, c).Interior.Color
                    if fill_color != 16777215: # 16777215 = White
                        green_cols.append(c)
                
                if green_cols:
                    # Gruplandır
                    groups, curr_g = [], [green_cols[0]]
                    for i in range(1, len(green_cols)):
                        if green_cols[i] == green_cols[i-1] + 1: curr_g.append(green_cols[i])
                        else: groups.append(curr_g); curr_g = [green_cols[i]]
                    groups.append(curr_g)
                    
                    for g in groups:
                        sy, sm = years.get(g[0]), months.get(g[0])
                        ey, em = years.get(g[-1]), months.get(g[-1])
                        if sy and sm and ey and em:
                            sd = f"01.{sm:02d}.{sy}"
                            ed = f"{calendar.monthrange(ey, em)[1]:02d}.{em:02d}.{ey}"
                            target_t["dates"].append((sd, ed))

        wb_temp.Close(False)
        doc_t.Close(False)
        print(f"  > {match_count} görev eşleşti.")

    except Exception as e:
        print(f"HATA: {e}")
    finally:
        try: word.Quit(); excel.Quit()
        except: pass

    # 4. EXCEL RAPORU OLUŞTURMA
    print("4/4 - Rapor oluşturuluyor...")
    wb_o = openpyxl.Workbook()
    ws_o = wb_o.active
    ws_o.append(["Sıra", "Eylem / Görev", "Tekrar", "", "", "Başlangıç 1", "Bitiş 1", "Başlangıç 2", "Bitiş 2", "Başlangıç 3", "Bitiş 3", "Başlangıç 4", "Bitiş 4", "Sorumlu Verisi"])
    for i, t in enumerate(tasks_data, 1):
        row = [i, t["name"], len(t["dates"]), "", ""]
        for d in t["dates"][:4]: row.extend([d[0], d[1]])
        while len(row) < 13: row.append("")
        row.append(t["col4"])
        ws_o.append(row)
    wb_o.save(OUTPUT_EXCEL)
    
    elapsed = round(time.time() - start_time, 1)
    print(f"\n[OK] İŞLEM {elapsed} SANİYEDE TAMAMLANDI! Dosya: {OUTPUT_EXCEL}")

if __name__ == "__main__":
    run_extraction()
