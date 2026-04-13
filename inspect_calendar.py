import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_text(text):
    if not text: return ""
    return text.strip().replace('\r', '').replace('\x07', '')

def run_inspect():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    
    table = doc.Tables(1)
    print(f"Tablo Dimensions: {table.Rows.Count} x {table.Columns.Count} (reported)")
    
    # Grid dump (First 10 rows, First 10 columns)
    for r in range(1, min(11, table.Rows.Count + 1)):
        row_data = []
        for c in range(1, min(11, table.Columns.Count + 1)):
            try:
                cell = table.Cell(r, c)
                txt = clean_text(cell.Range.Text)
                row_data.append(f"{txt}")
            except:
                row_data.append("?")
        print(f"R{r}: | " + " | ".join(row_data))

    doc.Close(False)
    word.Quit()

if __name__ == "__main__":
    run_inspect()
