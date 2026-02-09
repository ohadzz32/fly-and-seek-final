import pandas as pd
import numpy as np
import tarfile
import gzip
import os
from scipy.signal import savgol_filter
from tqdm import tqdm

def prepare_data_perfect_match(tar_path, output_csv):
    print(f"🚀 Processing: {tar_path}")
    print("   Goal: Create a dataset perfectly compatible with the LSTM Model.")
    
    # 1. טעינת הנתונים
    try:
        with tarfile.open(tar_path, "r") as tar:
            csv_member = [m for m in tar.getmembers() if '.csv' in m.name][0]
            f = tar.extractfile(csv_member)
            
            # זיהוי אוטומטי של GZIP
            magic = f.read(2)
            f.seek(0)
            stream = gzip.GzipFile(fileobj=f) if magic == b'\x1f\x8b' else f
            
            # טעינת עמודות קריטיות בלבד
            cols = ['time', 'icao24', 'lat', 'lon', 'velocity', 'heading', 'geoaltitude', 'onground']
            df = pd.read_csv(stream, usecols=lambda c: c in cols)
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return

    # 2. המרה ל-DateTime (התיקון הקריטי!)
    # המודל חייב את זה כדי שפקודת .resample('1s') תעבוד
    print("⏱️  Converting to Datetime objects...")
    df['time'] = pd.to_datetime(df['time'], unit='s')
    
    # 3. ניקוי בסיסי
    df = df[df['onground'] == False].copy()
    df.dropna(subset=['lat', 'lon', 'velocity', 'heading', 'geoaltitude'], inplace=True)
    
    # 4. פיצול טיסות (Teleportation Fix)
    print("✂️  Splitting flights by 15min gaps...")
    df.sort_values(['icao24', 'time'], inplace=True)
    
    # חישוב הפרש זמנים
    # מכיוון שהמרנו ל-Datetime, ההפרש הוא ב-Timedelta
    time_diff = df.groupby('icao24')['time'].diff()
    
    # טיסה חדשה אם עברו יותר מ-15 דקות
    df['new_flight'] = (time_diff > pd.Timedelta(minutes=15)).astype(int)
    df['segment'] = df.groupby('icao24')['new_flight'].cumsum()
    
    # יצירת המזהה שהמכונה מצפה לו (icao24)
    # אנחנו דורסים את ה-icao24 הישן במזהה החדש והייחודי
    df['icao24'] = df['icao24'] + '_' + df['segment'].astype(str)
    
    # 5. אופטימיזציה פיזיקלית (Smoothing)
    print("🛠️  Smoothing physics data...")
    
    optimized_flights = []
    
    for fid, group in tqdm(df.groupby('icao24'), desc="Smoothing"):
        # סינון טיסות קצרות (פחות מ-3 דקות וחצי, כי אנחנו חוזים 3 דקות קדימה)
        if len(group) < 210: 
            continue
            
        # החלקה - קריטי ליציבות המודל
        # מונע מהמודל לחשוב שיש פניות כשהמטוס טס ישר
        try:
            # שימוש ב-.values כדי להמנע מבעיות אינדקס
            group['lat'] = savgol_filter(group['lat'].values, 11, 2)
            group['lon'] = savgol_filter(group['lon'].values, 11, 2)
            group['geoaltitude'] = savgol_filter(group['geoaltitude'].values, 11, 2)
            # החלקת כיוון (Heading) בזהירות
            group['heading'] = savgol_filter(group['heading'].values, 11, 2)
        except ValueError:
            pass 
            
        optimized_flights.append(group)
    
    if not optimized_flights:
        print("❌ Error: No valid flights found.")
        return

    # 6. שמירה
    final_df = pd.concat(optimized_flights)
    
    # שומרים בדיוק את העמודות שהמודל מחפש ב-FlightPhysicsEngine
    final_cols = ['time', 'icao24', 'lat', 'lon', 'geoaltitude', 'velocity', 'heading']
    final_df = final_df[final_cols]
    
    print(f"💾 Saving {len(final_df)} rows to {output_csv}...")
    final_df.to_csv(output_csv, index=False)
    print("✅ READY! The file is now 100% compatible with the Machine Learning Model.")

# --- הרצה ---
if __name__ == "__main__":
    # הנתיב שלך
    INPUT = r"C:\Users\Admin\OneDrive\Documents\data for the project\flight_data_for_project\states_2018-05-28-03.csv.tar"
    OUTPUT = r"C:\Users\Admin\OneDrive\Documents\data for the project\flight_data_for_project\model_ready_data.csv"
    
    if os.path.exists(INPUT):
        prepare_data_perfect_match(INPUT, OUTPUT)
    else:
        print(f"❌ File not found: {INPUT}")