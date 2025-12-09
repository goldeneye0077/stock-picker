import sqlite3
import os

db_path = 'data/stock_picker.db'
backup_path = 'data/stock_picker.db.repair_bak'

print(f"Backing up {db_path} to {backup_path}...")
# simple file copy
try:
    with open(db_path, 'rb') as src, open(backup_path, 'wb') as dst:
        dst.write(src.read())
    print("Backup successful.")
except Exception as e:
    print(f"Backup failed: {e}")
    exit(1)

print("Attempting to VACUUM the database...")
try:
    conn = sqlite3.connect(db_path)
    conn.execute("VACUUM")
    conn.close()
    print("VACUUM successful. Database should be repaired.")
except Exception as e:
    print(f"VACUUM failed: {e}")
    print("Restoring from backup...")
    try:
        with open(backup_path, 'rb') as src, open(db_path, 'wb') as dst:
            dst.write(src.read())
        print("Restore successful.")
    except Exception as restore_error:
        print(f"Restore failed: {restore_error}")
