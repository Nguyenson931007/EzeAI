import os
import json
import sqlite3
import base64
import io
from PIL import Image

def convert_jobs_to_jpg():
    # 1. Create output folder
    output_folder = "test_door"
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Created folder: {output_folder}")

    # 2. Connect to database
    db_path = "ezefloor.db"
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 3. Query all jobs
    cursor.execute("SELECT id, project_name, data FROM jobs")
    jobs = cursor.fetchall()
    print(f"Found {len(jobs)} jobs in database.")

    count = 0
    for job in jobs:
        job_id = job['id']
        project_name = job['project_name'].replace(" ", "_").replace("/", "_").replace("\\", "_")
        try:
            data = json.loads(job['data'])
            pages = data.get('pages', [])
            
            for i, page in enumerate(pages):
                img_data_url = page.get('image')
                if not img_data_url:
                    continue

                # Handle base64
                if "," in img_data_url:
                    header, b64_str = img_data_url.split(",")
                else:
                    b64_str = img_data_url

                img_bytes = base64.b64decode(b64_str)
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

                # 4. Resize to imgsz 2048
                # We maintain aspect ratio. 2048 is the max dimension.
                w, h = img.size
                if w > h:
                    new_w = 2048
                    new_h = int(h * (2048 / w))
                else:
                    new_h = 2048
                    new_w = int(w * (2048 / h))
                
                img = img.resize((new_w, new_h), Image.LANCZOS)

                # 5. Save as JPG
                filename = f"{project_name}_job{job_id}_pg{i+1}.jpg"
                save_path = os.path.join(output_folder, filename)
                img.save(save_path, "JPEG", quality=90)
                print(f"Saved: {save_path} ({new_w}x{new_h})")
                count += 1
        except Exception as e:
            print(f"Error processing job {job_id}: {e}")

    conn.close()
    print(f"Finished! Total images saved: {count}")

if __name__ == "__main__":
    convert_jobs_to_jpg()
