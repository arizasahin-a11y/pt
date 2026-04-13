import os
import win32com.client
import re
import unicodedata

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
EYLEM_DOC = os.path.join(BASE_DIR, "OÖP OKUL EYLEM PLANI.doc")
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_for_match(text):
    if not text: return ""
    text = text.strip().replace('\r', '').replace('\x07', '').lower()
    text = text.replace('\u0130', 'i').replace('\u0131', 'i')
    text = ''.join(c for c in unicodedata.normalize('NFKD', text) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', text)

def run_diag():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    # 1. EYLEM PLANI
    print("--- EYLEM PLANI GÖREVLERİ ---")
    doc_e = word.Documents.Open(os.path.abspath(EYLEM_DOC))
    for t in doc_e.Tables:
        h = t.Range.Cells(1).Range.Text
        if "Eylemler" in h or "Görevler" in h:
            for cell in t.Range.Cells:
                if cell.ColumnIndex == 1 and cell.RowIndex > 1:
                    raw = cell.Range.Text
                    key = clean_for_match(raw)
                    if key: print(f"P Key: {key[:30]}... (Len: {len(key)})")
    doc_e.Close(False)

    # 2. TAKVİM
    print("\n--- TAKVİM SATIRLARI ---")
    doc_t = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    table = doc_t.Tables(1)
    for cell in table.Range.Cells:
        if cell.ColumnIndex == 1 and cell.RowIndex >= 3:
            raw = cell.Range.Text
            key = clean_for_match(raw)
            if key: print(f"T Key: {key[:30]}... (Len: {len(key)})")
    doc_t.Close(False)
    
    word.Quit()

if __name__ == "__main__":
    run_diag()
