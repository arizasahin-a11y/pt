import json
import os
from datetime import datetime, timedelta

# Helper to parse dates like "DD.MM.YYYY"
def parse_date(d):
    if not d or d == "NaN" or not isinstance(d, str): return None
    try:
        return datetime.strptime(d.strip(), "%d.%m.%Y")
    except:
        return None

# Helper to format dates back to "DD.MM.YYYY"
def format_date(dt):
    return dt.strftime("%d.%m.%Y")

def get_year_index(edu_year):
    """
    Determines Year Index (1-4) based on Academic Year string.
    Base year is 2025 (2025-2026 -> 1)
    """
    try:
        start_year = int(edu_year.split('-')[0].strip())
        return (start_year - 2025) + 1
    except:
        return 1

def update_master():
    # Configuration
    sync_file = "sync_updates.json"
    master_json = "combined_db.json"
    master_js = "db_data.js"
    
    # Check if files exist
    if not os.path.exists(sync_file):
        print(f"\nHATA: '{sync_file}' bulunamadı.")
        print("Lütfen web uygulamasından 'Güncellemeleri Aktar' butonuna basarak dosyayı indirin ve buraya koyun.")
        return

    print("--- Veritabanı Senkronizasyonu Başlatıldı ---")

    with open(sync_file, 'r', encoding='utf-8') as f:
        updates = json.load(f)

    with open(master_json, 'r', encoding='utf-8') as f:
        db = json.load(f)

    updated_count = 0

    for up in updates:
        name = up.get("activityName")
        proj_type = up.get("projectType")
        edu_year = up.get("eduYear")
        
        # Decide which database part to look into
        db_key = "og_db" if proj_type == "OKUL GELİŞİM PROJESİ" else "oo_db"
        target_list = db.get(db_key)
        if not target_list: continue

        # Find matching task by name
        item = next((i for i in target_list if i.get("eylem_adi") == name or i.get("eylem_gorev") == name), None)
        if not item:
            print(f"Uyarı: '{name}' bulunamadı.")
            continue

        # Get year index (e.g. 2025-2026 -> 1)
        n = get_year_index(edu_year)
        if n < 1 or n > 4:
            print(f"Uyarı: {edu_year} yılı aralık dışı ({n}).")
            continue

        # Parse new dates from report
        new_start = parse_date(up.get("startDate"))
        new_end = parse_date(up.get("endDate"))
        if not new_start or not new_end: continue

        # Identify DB keys
        prefix = f"y{n}_" if db_key == "og_db" else f"baslangic_"
        suffix_s = "bas" if db_key == "og_db" else f"{n}"
        suffix_e = "bit" if db_key == "og_db" else f"{n}"
        
        start_key = prefix + suffix_s
        end_key = (f"y{n}_bit") if db_key == "og_db" else f"bitis_{n}"

        # Capture original state to calculate delta for future years
        old_start = parse_date(item.get(start_key))
        
        # Duration preservation/adjustment
        new_duration = (new_end - new_start).days
        
        # 1. Update Current Year
        print(f"Güncelleniyor: [{db_key}] {name} (Yıl {n})")
        item[start_key] = format_date(new_start)
        item[end_key] = format_date(new_end)
        
        # Sync common text fields
        if db_key == "og_db":
            item["sorumlu"] = up.get("teacher")
        else:
            item["sorumlu_verisi"] = up.get("teacher")

        # 2. Timeline Redistribution (Propagate to future years)
        if old_start:
            delta_days = (new_start - old_start).days
            for next_n in range(n + 1, 5):
                ns_key = f"y{next_n}_bas" if db_key == "og_db" else f"baslangic_{next_n}"
                ne_key = f"y{next_n}_bit" if db_key == "og_db" else f"bitis_{next_n}"
                
                curr_next_s = parse_date(item.get(ns_key))
                if curr_next_s:
                    # Maintain start rhythm + new duration
                    shifted_s = curr_next_s + timedelta(days=delta_days)
                    shifted_e = shifted_s + timedelta(days=new_duration)
                    item[ns_key] = format_date(shifted_s)
                    item[ne_key] = format_date(shifted_e)
        
        updated_count += 1

    # 3. Save Results
    with open(master_json, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    # Wrap as JS file
    with open(master_js, 'w', encoding='utf-8') as f:
        f.write(f"const COMBINED_DB = {json.dumps(db, ensure_ascii=False, indent=2)};")

    print(f"\nTamamlandı! {updated_count} kayıt master veritabanına işlendi.")
    print(f"'{master_json}' ve '{master_js}' güncellendi.")

if __name__ == "__main__":
    update_master()
