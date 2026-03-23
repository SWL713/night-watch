"""
Night Watch — Supabase Seed Script
Run once to import your 35 spots into Supabase.

Usage:
    pip install supabase
    python pipeline/seed_supabase.py

Set environment variables first:
    export SUPABASE_URL=your_project_url
    export SUPABASE_SERVICE_KEY=your_service_role_key   (NOT the anon key — needs write access)
"""

import json
import os
import sys

try:
    from supabase import create_client
except ImportError:
    print('Run: pip install supabase')
    sys.exit(1)

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables')
    sys.exit(1)

spots_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'spots.json')
with open(spots_path) as f:
    spots = json.load(f)

client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Insert all spots (strip the 'id' field — let Supabase auto-assign)
rows = []
for s in spots:
    rows.append({
        'name':           s['name'],
        'lat':            s['lat'],
        'lon':            s['lon'],
        'bortle':         s['bortle'],
        'view_direction': s.get('view_direction', 'N'),
        'access_notes':   s.get('access_notes', ''),
        'horizon_rating': s.get('horizon_rating', 3),
        'submitted_by':   'admin',
        'approved':       True,
    })

result = client.table('spots').insert(rows).execute()
print(f'Inserted {len(result.data)} spots successfully')
