import requests
import json

def check_openapi():
    url = "http://localhost:8003/openapi.json"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            openapi = response.json()
            paths = openapi.get('paths', {})
            target_path = "/api/fundamental/stock/{stock_code}/analysis"
            if target_path in paths:
                print(f"Path {target_path} FOUND in OpenAPI spec.")
            else:
                print(f"Path {target_path} NOT FOUND in OpenAPI spec.")
                print("Available paths under /api/fundamental:")
                for path in paths:
                    if path.startswith("/api/fundamental"):
                        print(path)
        else:
            print(f"Failed to fetch OpenAPI spec: {response.status_code}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    check_openapi()
