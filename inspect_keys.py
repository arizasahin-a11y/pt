import os
import win32com.client
import re

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_for_match(text):
    if not text: return ""
    text = text.lower()
    rep = {'ı':'i', 'ü':'u', 'ö':'o', 'ş':'s', 'ç':'c', 'ğ':'g', 'İ':'i', 'Ü':'u', 'Ö':'o', 'Ş':'s', 'Ç':'c', 'Ğ':'g'}
    for k, v in rep.items(): text = text.replace(k, v)
    return re.sub(r'[^a-z0-9]', '', text)

def run_check():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    table = doc.Tables(1)
    
    print("--- CALENDAR ROW 1 (DEBUG) ---")
    for r in range(1, table.Rows.Count + 1):
        try:
            cell = table.Cell(r, 1)
            txt = cell.Range.Text.strip().replace('\r', '').replace('\x07', '')
            key = clean_for_match(txt)
            print(f"Row {r} C1: [{txt}] -> [{key}]")
        except:
            print(f"Row {r} ERR")
    
    doc.Close(False)
    word.Quit()

if __name__ == "__main__":
    run_check()
