import json
import os

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
JSON_FILE = os.path.join(BASE_DIR, "combined_db.json")
JS_FILE = os.path.join(BASE_DIR, "db_data.js")

def convert():
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    with open(JS_FILE, 'w', encoding='utf-8') as f:
        f.write("const COMBINED_DB = " + json.dumps(data, ensure_ascii=False, indent=2) + ";")
    
    print(f"Created: {JS_FILE}")

if __name__ == "__main__":
    convert()
