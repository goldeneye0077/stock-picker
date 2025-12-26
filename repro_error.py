import requests

url = "http://localhost:8002/api/advanced-selection/advanced/run"
params = {
    "min_score": 50,
    "max_results": 20,
    "require_uptrend": "true",
    "require_hot_sector": "true"
}

try:
    print(f"Calling {url} with params {params}...")
    response = requests.post(url, params=params, timeout=310)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
