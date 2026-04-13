import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def run_diagnostic():
    print("Word Diagnostic baslatiliyor...")
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
    except Exception as e:
        print(f"HATA: Word baslatilamadi: {e}")
        return

    try:
        abs_takv = os.path.abspath(TAKTAK_DOC)
        if os.path.exists(abs_takv):
            doc = word.Documents.Open(abs_takv)
            print(f"Dosya acildi. Toplam tablo sayisi: {doc.Tables.Count}")
            
            for t_idx, table in enumerate(doc.Tables, 1):
                print(f"\nTablo {t_idx}: {table.Rows.Count} satir, {table.Columns.Count} sutun")
                
                # İlk 5 satırın 1. ve 2. kolonlarını yazdır
                for r in range(1, min(6, table.Rows.Count + 1)):
                    row_info = []
                    for c in range(1, min(table.Columns.Count + 1, 4)):
                        try:
                            cell = table.Cell(r, c)
                            text = cell.Range.Text.strip().replace('\r', '').replace('\x07', '')
                            color = cell.Shading.BackgroundPatternColor
                            row_info.append(f"C{c}:[{text}] Col:{color}")
                        except:
                            row_info.append(f"C{c}:ERR")
                    print(f"R{r}: " + " | ".join(row_info))
                
                # Yeşil hücre ara (herhangi bir satırda)
                print("Renkli hücre tespiti örneği (ilk 15 satir):")
                for r in range(1, min(16, table.Rows.Count + 1)):
                    colors_found = []
                    for c in range(1, table.Columns.Count + 1):
                        try:
                            cell = table.Cell(r, c)
                            color = cell.Shading.BackgroundPatternColor
                            if color != -16777216 and color != 16777215:
                                colors_found.append(f"C{c}:{color}")
                        except:
                            continue
                    if colors_found:
                        print(f"R{r} renkli hücreler: {', '.join(colors_found)}")
            
            doc.Close(False)
        else:
            print("HATA: Dosya bulunamadi.")
    except Exception as e:
        print(f"Genel HATA: {e}")
    finally:
        word.Quit()

if __name__ == "__main__":
    run_diagnostic()
