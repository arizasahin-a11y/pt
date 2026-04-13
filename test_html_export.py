import os
import win32com.client
import re

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
TAKTAK_DOC = os.path.join(BASE_DIR, "OGP FAALİYET TAKVİMİ.doc")
TEMP_HTML = os.path.join(BASE_DIR, "temp_calendar.html")

def run_test():
    try:
        word = win32com.client.Dispatch("Word.Application")
        doc = word.Documents.Open(os.path.abspath(TAKTAK_DOC))
        # wdFormatHTML = 8
        print(f"Exporting to {TEMP_HTML}...")
        doc.SaveAs(os.path.abspath(TEMP_HTML), 8)
        doc.Close()
        word.Quit()
        
        if os.path.exists(TEMP_HTML):
            print("Export successful!")
            with open(TEMP_HTML, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                # Check for bgcolor or shading
                green_matches = re.findall(r'bgcolor=["\']?#?[0-9a-fA-F]+["\']?', content, re.I)
                print(f"Found {len(green_matches)} bgcolor tags.")
                if len(green_matches) > 0:
                    print(f"Sample colors: {green_matches[:5]}")
        else:
            print("Export failed.")
    except Exception as e:
        print(f"HATA: {e}")

if __name__ == "__main__":
    run_test()
