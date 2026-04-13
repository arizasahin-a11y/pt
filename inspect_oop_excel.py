import openpyxl
import os

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
EYLEM_XLSX = os.path.join(BASE_DIR, "OÖP OKUL EYLEM PLANI.xlsx")

def run_check():
    wb = openpyxl.load_workbook(EYLEM_XLSX, data_only=True)
    ws = wb.active
    print(f"OÖP Excel Sayfası: {ws.title}")
    
    for r in range(1, 40):
        row_vals = [str(ws.cell(r, c).value or "").strip() for c in range(1, 6)]
        print(f"Row {r}: {row_vals}")

if __name__ == "__main__":
    run_check()
