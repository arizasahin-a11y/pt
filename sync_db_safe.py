import json

def sync():
    try:
        with open('combined_db.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Clean NaN values just in case (though I already tried with PowerShell)
        # JSON load would fail if there were raw NaN. Since it's likely a string ": NaN" in the file:
        with open('combined_db.json', 'r', encoding='utf-8') as f:
            content = f.read()
        
        clean_content = content.replace(': NaN', ': null').replace(':NaN', ':null')
        
        with open('db_data.js', 'w', encoding='utf-8') as f:
            f.write("const COMBINED_DB = " + clean_content + ";")
        
        print("Sync successful: combined_db.json -> db_data.js")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    sync()
