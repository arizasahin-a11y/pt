import json

with open('db_data.js', 'r', encoding='utf-8') as f:
    content = f.read()
    
# Strip const COMBINED_DB = 
if content.startswith('const COMBINED_DB = '):
    content = content[len('const COMBINED_DB = '):]
    
if content.endswith(';'):
    content = content[:-1]

data = json.loads(content)

for item in data.get('og_db', []):
    name = item.get('eylem_adi', '')
    if 'Farkındalığı' in name or 'Tanita' in name:
        print(f"OG_DB Item: {item}")

for item in data.get('oo_db', []):
    name = item.get('eylem_gorev', '')
    if 'Farkındalığı' in name or 'Tanita' in name:
        print(f"OO_DB Item: {item}")
