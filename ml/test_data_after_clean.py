import pandas as pd

# הנתיב לקובץ המוכן שלך
FILE_PATH = r"C:\Users\Admin\OneDrive\Documents\data for the project\flight_data_for_project\model_ready_data.csv"

def sanity_check():
    print("🕵️‍♂️ Checking data file...")
    try:
        df = pd.read_csv(FILE_PATH)
        
        # 1. בדיקת הזמן
        print("\n1. Time Column Sample (First 5):")
        print(df['time'].head())
        if df['time'].isnull().all():
            print("❌ WARNING: Time column looks empty!")
        else:
            print("✅ Time column looks GOOD.")

        # 2. בדיקת טווחים
        print("\n2. Data Ranges:")
        print(f"   Altitude: {df['geoaltitude'].min():.1f}m to {df['geoaltitude'].max():.1f}m")
        print(f"   Velocity: {df['velocity'].min():.1f}kts to {df['velocity'].max():.1f}kts")
        
        # 3. בדיקת כמות
        print(f"\n3. Total Rows: {len(df)}")
        print("✅ Ready for training!")
        
    except Exception as e:
        print(f"❌ Error reading file: {e}")

if __name__ == "__main__":
    sanity_check()