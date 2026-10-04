import requests, json
base = 'http://127.0.0.1:5001'

query_attack = "admin OR 1=1"
query_benign = "john doe 2024"

# Test /api/scan
r = requests.post(f'{base}/api/scan', json={'query': query_attack, 'source': 'test'}).json()
print('SCAN action:', r.get('action'))
print('SCAN detectors:', [d['name'] for d in r.get('detectors', [])])
print('SCAN latency_ms:', r.get('latency_ms'))

# Test /api/detectors
d = requests.get(f'{base}/api/detectors').json()
print('DETECTORS:', [x['name'] for x in d['detectors']])

# Test /api/evaluate
ev = requests.post(f'{base}/api/evaluate', json={
    'query': query_attack,
    'expected_verdict': 'Suspicious',
    'session_id': 'test-session-1'
}).json()
print('EVALUATE correct:', ev.get('correct'))

# Benign eval
ev2 = requests.post(f'{base}/api/evaluate', json={
    'query': query_benign,
    'expected_verdict': 'Normal',
    'session_id': 'test-session-1'
}).json()
print('EVALUATE benign correct:', ev2.get('correct'))

# Test /api/sessions
sess = requests.get(f'{base}/api/sessions').json()
print('SESSIONS count:', len(sess['sessions']))

# Test /api/sessions/test-session-1
detail = requests.get(f'{base}/api/sessions/test-session-1').json()
print('SESSION DETAIL labeled_events:', detail.get('labeled_events'))
print('SESSION DETAIL ensemble recall:', detail.get('ensemble', {}).get('recall'))
print('SESSION DETAIL detectors:', list(detail.get('detectors', {}).keys()))

# Test /api/stats
stats = requests.get(f'{base}/api/stats').json()
print('STATS action_breakdown:', stats.get('action_breakdown'))
print('STATS latency:', stats.get('latency'))
print('STATS detector_stats:', list(stats.get('detector_stats', {}).keys()))
print('ALL OK!')
