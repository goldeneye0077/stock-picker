with open(r'e:/stock_an/stock-picker-latest/backend/src/repositories/AnalysisRepository.ts', 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8', errors='replace')

# Find key methods
for method_name in ['getSuperMainForcePeriodStats', 'getMarketLimitUpSnapshot']:
    idx = text.find(method_name)
    if idx >= 0:
        print(f"\n=== {method_name} (offset {idx}) ===")
        print(text[idx:idx+800])
        print("---")
