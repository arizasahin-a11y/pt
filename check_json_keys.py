import json
import os

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
DATA_JSON = os.path.join(BASE_DIR, "combined_db.json")

def run_check():
    with open(DATA_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if data.get('og_db'):
            print("OG DB Keys:", list(data['og_db'][0].keys()))
            # Print sample responsible values
            resp_keys = [k for k in data['og_db'][0].keys() if 'sorumlu' in k.lower()]
            print("Possible OG Responsible Keys:", resp_keys)
            if resp_keys:
                print("Sample OG values:", [r.get(resp_keys[0]) for r in data['og_db'][:3]])
        
        if data.get('oo_db'):
            print("\nOO DB Keys:", list(data['oo_db'][0].keys()))
            resp_keys = [k for k in data['oo_db'][0].keys() if 'sorumlu' in k.lower()]
            print("Possible OO Responsible Keys:", resp_keys)
            if resp_keys:
                print("Sample OO values:", [r.get(resp_keys[0]) for r in data['oo_db'][:3]])

if __name__ == "__main__":
    run_check()
