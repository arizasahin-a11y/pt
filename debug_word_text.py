import os
import win32com.client

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")

def run_debug():
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
    table = doc.Tables(1)
    
    # Tüm tablo metnini al
    text = table.Range.Text
    # İlk 500 karakteri ve karakter kodlarını göster
    print(f"RAW TEXT (First 500): {repr(text[:500])}")
    
    # Satır sonlarını tespit et
    # Word'de hücre sonu \x07, satır sonu \x07\r dir.
    rows = text.split('\x07\r')
    print(f"Total rows detected by split: {len(rows)}")
    for i, r in enumerate(rows[:10]):
        print(f"Row {i+1}: {repr(r)}")

    doc.Close(False)
    word.Quit()

if __name__ == "__main__":
    run_debug()
