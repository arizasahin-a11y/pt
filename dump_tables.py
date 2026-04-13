import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def clean_text(text):
    if not text: return ""
    return text.strip().replace('\r', '').replace('\x07', '')

def run_dump():
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
        
        print(f"Dosya: {TAKTAK_DOC}")
        print(f"Toplam Tablo Sayısı: {doc.Tables.Count}")
        
        for i, table in enumerate(doc.Tables, 1):
            # Sütun sayısını güvenli alalım (Merged cells varsa Columns.Count hata verebilir)
            cols = 0
            try:
                cols = table.Columns.Count
            except:
                # Eğer Columns.Count hata verirse ilk satırdaki hücreleri sayalım
                try:
                    cols = len(table.Rows(1).Cells)
                except:
                    cols = "Unknown (Merged)"
            
            print(f"\nTablo {i}: {table.Rows.Count} satır, {cols} sütun")
            
            # İlk 3 satırın ilk 3 hücresini yazdıralım
            for r in range(1, min(4, table.Rows.Count + 1)):
                row_txt = []
                for c in range(1, 5):
                    try:
                        cell_txt = clean_text(table.Cell(r, c).Range.Text)
                        row_txt.append(f"[{cell_txt}]")
                    except:
                        pass
                print(f"  R{r}: {' '.join(row_txt)}")

        doc.Close(False)
        word.Quit()
    except Exception as e:
        print(f"HATA: {e}")

if __name__ == "__main__":
    run_dump()
