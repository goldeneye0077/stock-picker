import requests
import sys

try:
    print("Triggering data collection on http://localhost:8001/api/data/batch-collect-7days ...")
    response = requests.post("http://localhost:8001/api/data/batch-collect-7days", timeout=10)
    if response.status_code == 200:
        print("Success! Data collection task started.")
        print(response.json())
    else:
        print(f"Failed with status code {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"Error: {e}")
