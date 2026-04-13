import os
import win32com.client
import re

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
EYLEM_PLANI_DOC = os.path.join(BASE_DIR, "OÖP OKUL EYLEM PLANI.doc")
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_text(text):
    if not text: return ""
    return text.strip().replace('\r', '').replace('\x07', '')

def run_check():
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        
        print("--- EYLEM PLANI GÖREVLERİ ---")
        doc = word.Documents.Open(os.path.abspath(EYLEM_PLANI_DOC))
        for table in doc.Tables:
            try:
                for r in range(2, table.Rows.Count + 1):
                    txt = clean_text(table.Cell(r, 1).Range.Text)
                    if txt: print(f"[{txt}]")
            except: pass
        doc.Close(False)

        print("\n--- TAKVİM SATIRLARI ---")
        doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
        for table in doc.Tables:
            try:
                for r in range(3, table.Rows.Count + 1):
                    txt = clean_text(table.Cell(r, 1).Range.Text)
                    if txt: print(f"[{txt}]")
            except: pass
        doc.Close(False)

        word.Quit()
    except Exception as e:
        print(f"HATA: {e}")

if __name__ == "__main__":
    run_check()
