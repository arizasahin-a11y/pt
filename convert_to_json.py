import pandas as pd
import json
import os
import re

BASE_DIR = r"a:\TOOLS\kodlama\km\PTS"
OG_XLSX = os.path.join(BASE_DIR, "OG DB.xlsx")
OO_XLSX = os.path.join(BASE_DIR, "OO DB.xlsx")
OUTPUT_JSON = os.path.join(BASE_DIR, "combined_db.json")

def sanitize_key(key):
    # Anahtarları JSON dostu yap: Küçük harf, boşluk yerine alt çizgi, özel karakterleri temizle
    key = str(key).strip().lower()
    key = key.replace('ı', 'i').replace('İ', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c')
    key = re.sub(r'[^a-z0-9_]', '_', key)
    key = re.sub(r'_+', '_', key).strip('_')
    return key

def clean_dataframe(df):
    # Unnamed sütunları uçur
    df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
    # Anahtar isimlerini temizle
    df.columns = [sanitize_key(c) for c in df.columns]
    
    # Tüm hücreleri tara ve datetime olanları string'e çevir
    for col in df.columns:
        df[col] = df[col].apply(lambda x: x.strftime('%Y-%m-%d %H:%M:%S') if hasattr(x, 'strftime') else x)
    
    # NaN değerleri temizle (JSON için null/temiz string)
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient='records')

def run_conversion():
    print("Veritabanı dönüşümü başlatıldı...")
    
    try:
        combined_data = {}
        
        # OG DB
        if os.path.exists(OG_XLSX):
            print(f"İşleniyor: {OG_XLSX}")
            df_og = pd.read_excel(OG_XLSX)
            combined_data["og_db"] = clean_dataframe(df_og)
        
        # OO DB
        if os.path.exists(OO_XLSX):
            print(f"İşleniyor: {OO_XLSX}")
            df_oo = pd.read_excel(OO_XLSX)
            combined_data["oo_db"] = clean_dataframe(df_oo)
            
        # JSON Kaydet
        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, ensure_ascii=False, indent=2)
            
        print(f"\n[OK] Dönüşüm başarıyla tamamlandı! Dosya: {OUTPUT_JSON}")
        print(f"Toplam Kayıt: OG({len(combined_data.get('og_db', []))}), OO({len(combined_data.get('oo_db', []))})")
        
    except Exception as e:
        print(f"HATA: {e}")

if __name__ == "__main__":
    run_conversion()
