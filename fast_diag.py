import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def run_diagnostic():
    print("Fast Diagnostic baslatiliyor...")
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
        
        for t_idx, table in enumerate(doc.Tables, 1):
            print(f"\nTablo {t_idx}: {len(table.Range.Cells)} hucre")
            colors = {}
            for i, cell in enumerate(table.Range.Cells):
                if i > 500: break # Sınırla
                color = cell.Shading.BackgroundPatternColor
                if color not in [-16777216, 16777215]:
                    colors[color] = colors.get(color, 0) + 1
                if i % 100 == 0:
                    print(f"Hücre {i} tarandi...")
            
            print(f"Bulunan renkler: {colors}")
            
            # İlk satırdaki metinlerden bir parça
            for i in range(1, min(10, len(table.Range.Cells) + 1)):
                try:
                    text = table.Range.Cells(i).Range.Text.strip().replace('\r', '').replace('\x07', '')
                    print(f"Cell {i}: {text}")
                except:
                    pass
        
        doc.Close(False)
        word.Quit()
    except Exception as e:
        print(f"HATA: {e}")

if __name__ == "__main__":
    run_diagnostic()
