import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
EYLEM_PLANI_DOC = os.path.join(BASE_DIR, "OÖP OKUL EYLEM PLANI.doc")
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_text(text):
    if not text: return ""
    return text.strip().replace('\r', '').replace('\x07', '')

def run_debug():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    print("--- EYLEM PLANI GÖREVLERİ ---")
    doc_e = word.Documents.Open(os.path.abspath(EYLEM_PLANI_DOC))
    for table in doc_e.Tables:
        try:
            h = clean_text(table.Range.Cells(1).Range.Text)
            if "Eylemler / Görevler" in h:
                for r in range(2, min(6, table.Rows.Count + 1)):
                    print(f"Task: {clean_text(table.Cell(r, 1).Range.Text)}")
        except: pass
    doc_e.Close(False)

    print("\n--- TAKVİM TABLOSU DETAYLI ANALİZ ---")
    doc_t = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    calendar_table = doc_t.Tables(1)
    
    print(f"Header Rows Analysis (1-4):")
    for r in range(1, 5):
        cells = []
        for cell in calendar_table.Rows(r).Cells:
            txt = clean_text(cell.Range.Text)
            idx = cell.ColumnIndex
            cells.append(f"C{idx}:[{txt}]")
        print(f"R{r}: {' | '.join(cells)}")

    # Örnek renk analizi (Satır 4-10 arası renkli hücre ara)
    print("\nRenk Analizi:")
    for r in range(4, min(15, calendar_table.Rows.Count + 1)):
        row_name = clean_text(calendar_table.Cell(r, 1).Range.Text)
        colors = []
        for cell in calendar_table.Rows(r).Cells:
            shade = cell.Shading.BackgroundPatternColor
            hi = cell.Range.HighlightColorIndex
            if shade != -16777216 and shade != 16777215:
                colors.append(f"C{cell.ColumnIndex}:Shade({shade})")
            if hi != 0 and hi != 9999999: # 0 = wdNoHighlight
                colors.append(f"C{cell.ColumnIndex}:Highlight({hi})")
        if colors:
            print(f"R{r} [{row_name}]: {', '.join(colors)}")

    doc_t.Close(False)
    word.Quit()

if __name__ == "__main__":
    run_debug()
