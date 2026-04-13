import os
import win32com.client
import re

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
EYLEM_PLANI_DOC = os.path.join(BASE_DIR, "OÖP OKUL EYLEM PLANI.doc")
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_text(text):
    if not text: return ""
    return text.strip().replace('\r', '').replace('\x07', '')

def clean_task_name(name):
    name = clean_text(name)
    name = re.sub(r'^(Eylem|Görev|Sıra)?\s*\d+[\.\s:]*', '', name, flags=re.I).strip()
    return name

def clean_for_match(text):
    if not text: return ""
    text = text.lower()
    rep = {'ı':'i', 'ü':'u', 'ö':'o', 'ş':'s', 'ç':'c', 'ğ':'g', 'İ':'i', 'Ü':'u', 'Ö':'o', 'Ş':'s', 'Ç':'c', 'Ğ':'g'}
    for k, v in rep.items(): text = text.replace(k, v)
    return re.sub(r'[^a-z0-9]', '', text)

def run_debug():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    tasks = []
    doc = word.Documents.Open(os.path.abspath(EYLEM_PLANI_DOC))
    for t in doc.Tables:
        h = clean_text(t.Range.Cells(1).Range.Text)
        if "Eylemler / Görevler" in h:
            for cell in t.Range.Cells:
                if cell.RowIndex > 1 and cell.ColumnIndex == 1:
                    name = clean_task_name(cell.Range.Text)
                    key = clean_for_match(name)
                    if name: tasks.append(key)
    doc.Close(False)
    print(f"Plan Keys: {tasks[:5]}...")

    doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    cal_keys = []
    for cell in doc.Tables(1).Range.Cells:
        if cell.RowIndex >= 3 and cell.ColumnIndex == 1:
            name = clean_task_name(cell.Range.Text)
            key = clean_for_match(name)
            if key: cal_keys.append(key)
    doc.Close(False)
    print(f"Cal Keys: {cal_keys[:5]}...")
    
    for pk in tasks:
        for ck in cal_keys:
            if pk and ck and (pk in ck or ck in pk):
                print(f"MATCH FOUND: {pk[:30]} == {ck[:30]}")
    
    word.Quit()

if __name__ == "__main__":
    run_debug()
