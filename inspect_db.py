import pandas as pd
import os

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"

def inspect(filename):
    path = os.path.join(BASE_DIR, filename)
    if os.path.exists(path):
        print(f"\n--- {filename} ---")
        df = pd.read_excel(path)
        print(f"Columns: {df.columns.tolist()}")
        print(df.head())
    else:
        print(f"{filename} not found.")

if __name__ == "__main__":
    inspect("OG DB.xlsx")
    inspect("OO DB.xlsx")
