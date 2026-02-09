import pandas as pd
import numpy as np
import tarfile
import gzip
import os
import glob
from scipy.signal import savgol_filter
from tqdm import tqdm

# --- הגדרות נתיבים ---
# התיקייה שבה נמצאים כל קבצי ה-TAR שלך
INPUT_FOLDER = r"C:\Users\Admin\OneDrive\Documents\data for the project\flight_data_for_project"

# הקובץ הסופי הענקי שייווצר
OUTPUT_MASTER_FILE = os.path.join(INPUT_FOLDER, "master_training_dataset.csv")

def process_single_file(file_path):
    """מעבד קובץ בודד ומחזיר DataFrame נקי"""
    try:
        with tarfile.open(file_path, "r") as tar:
            # מציאת קובץ ה-CSV
            csv_member = [m for m in tar.getmembers() if '.csv' in m.name][0]
            f = tar.extractfile(csv_member)
            
            # בדיקת דחיסת GZIP
            magic = f.read(2)
            f.seek(0)
            stream = gzip.GzipFile(fileobj=f) if magic == b'\x1f\x8b' else f
            
            # טעינת עמודות רלוונטיות
            cols = ['time', 'icao24', 'lat', 'lon', 'velocity', 'heading', 'geoaltitude', 'onground']
            df = pd.read_csv(stream, usecols=lambda c: c in cols)
            
    except Exception as e:
        print(f"⚠️  Skipping {os.path.basename(file_path)}: {e}")
        return None

    # --- שלב הניקוי והפיזיקה (זהה לקוד הקודם) ---
    
    # 1. המרה ל-DateTime
    df['time'] = pd.to_datetime(df['time'], unit='s')
    
    # 2. ניקוי בסיסי
    df = df[df['onground'] == False].dropna(subset=['lat', 'lon', 'velocity', 'heading', 'geoaltitude'])
    df = df[df['velocity'] < 1200] 
    
    # 3. הפרדת טיסות (Teleportation Fix)
    df.sort_values(['icao24', 'time'], inplace=True)
    time_diff = df.groupby('icao24')['time'].diff()
    df['new_flight'] = (time_diff > pd.Timedelta(minutes=15)).astype(int)
    df['segment'] = df.groupby('icao24')['new_flight'].cumsum()
    
    # יצירת מזהה ייחודי: 'icao24_segment_filename' (כדי למנוע התנגשויות בין ימים שונים)
    file_id = os.path.basename(file_path).split('.')[0] # לוקח חלק משם הקובץ
    df['icao24'] = df['icao24'] + '_' + df['segment'].astype(str) + '_' + file_id
    
    # 4. החלקה (Smoothing)
    optimized_flights = []
    
    # שימוש ב-groupby בלי tqdm פנימי כדי לא להעמיס על המסך
    for fid, group in df.groupby('icao24'):
        if len(group) < 210: continue
            
        try:
            group['lat'] = savgol_filter(group['lat'].values, 11, 2)
            group['lon'] = savgol_filter(group['lon'].values, 11, 2)
            group['geoaltitude'] = savgol_filter(group['geoaltitude'].values, 11, 2)
            group['heading'] = savgol_filter(group['heading'].values, 11, 2)
            optimized_flights.append(group)
        except ValueError:
            pass 

    if not optimized_flights:
        return None

    final_df = pd.concat(optimized_flights)
    final_cols = ['time', 'icao24', 'lat', 'lon', 'geoaltitude', 'velocity', 'heading']
    return final_df[final_cols]

def main_batch_processing():
    # מחיקת קובץ ישן אם קיים
    if os.path.exists(OUTPUT_MASTER_FILE):
        os.remove(OUTPUT_MASTER_FILE)
        print("🗑️  Removed old master file.")

    # מציאת כל קבצי ה-tar בתיקייה
    all_files = glob.glob(os.path.join(INPUT_FOLDER, "*.tar"))
    print(f"🚀 Found {len(all_files)} files to process in:\n   {INPUT_FOLDER}")
    
    total_rows = 0
    files_processed = 0
    
    # לולאה ראשית על כל הקבצים
    with tqdm(total=len(all_files), desc="Overall Progress", unit="file") as pbar:
        for file_path in all_files:
            
            # עיבוד הקובץ הבודד
            clean_df = process_single_file(file_path)
            
            if clean_df is not None and not clean_df.empty:
                # שמירה לקובץ המרכזי
                # אם זה הקובץ הראשון - כותבים כותרות (header=True)
                # אם זה לא הראשון - מוסיפים לסוף (mode='a') בלי כותרות
                if total_rows == 0:
                    clean_df.to_csv(OUTPUT_MASTER_FILE, index=False, mode='w')
                else:
                    clean_df.to_csv(OUTPUT_MASTER_FILE, index=False, mode='a', header=False)
                
                total_rows += len(clean_df)
                files_processed += 1
            
            pbar.update(1)
            pbar.set_postfix({"Total Rows": f"{total_rows:,}"})

    print("\n" + "="*50)
    print(f"✅ DONE! Combined {files_processed} files.")
    print(f"📊 Total Dataset Size: {total_rows:,} rows.")
    print(f"💾 Saved to: {OUTPUT_MASTER_FILE}")
    print("="*50)

if __name__ == "__main__":
    if os.path.exists(INPUT_FOLDER):
        main_batch_processing()
    else:
        print(f"❌ Error: Folder not found: {INPUT_FOLDER}")