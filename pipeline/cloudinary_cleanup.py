"""
Nightly Cloudinary cleanup — deletes photos marked deleted=true in Supabase.

Requires GitHub secrets:
  SUPABASE_URL          — your Supabase project URL
  SUPABASE_SERVICE_KEY  — service role key (not anon key — needed to bypass RLS)
  CLOUDINARY_CLOUD      — cloud name
  CLOUDINARY_API_KEY    — API key
  CLOUDINARY_SECRET     — API secret
"""
import os, re, hashlib, time, requests, logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

SUPABASE_URL        = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
CLOUDINARY_CLOUD    = os.environ.get('CLOUDINARY_CLOUD', '')
CLOUDINARY_API_KEY  = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_SECRET   = os.environ.get('CLOUDINARY_SECRET', '')


def supabase_headers():
    return {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
    }


def get_deleted_photos():
    """Fetch all photos marked deleted=true from Supabase."""
    url = f'{SUPABASE_URL}/rest/v1/photos?deleted=eq.true&select=id,photo_url'
    r = requests.get(url, headers=supabase_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def extract_public_id(photo_url):
    """Extract Cloudinary public_id from a secure URL."""
    # https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.<ext>
    m = re.search(r'/upload/(?:v\d+/)?(.+?)(?:\.\w+)?$', photo_url)
    return m.group(1) if m else None


def cloudinary_delete(public_id):
    """Delete an asset from Cloudinary using their signed API."""
    timestamp = int(time.time())
    sig_str = f'public_id={public_id}&timestamp={timestamp}{CLOUDINARY_SECRET}'
    signature = hashlib.sha256(sig_str.encode()).hexdigest()
    url = f'https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD}/image/destroy'
    r = requests.post(url, data={
        'public_id': public_id,
        'timestamp': timestamp,
        'api_key': CLOUDINARY_API_KEY,
        'signature': signature,
    }, timeout=15)
    return r.json()


def hard_delete_from_supabase(photo_id):
    """Permanently remove the row after Cloudinary asset is gone."""
    url = f'{SUPABASE_URL}/rest/v1/photos?id=eq.{photo_id}'
    r = requests.delete(url, headers=supabase_headers(), timeout=15)
    r.raise_for_status()


def main():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, CLOUDINARY_SECRET]):
        log.warning('Missing env vars — skipping cleanup')
        return

    photos = get_deleted_photos()
    log.info(f'Found {len(photos)} deleted photos to clean up')

    for photo in photos:
        pid = photo['id']
        url = photo.get('photo_url', '')
        public_id = extract_public_id(url)
        if public_id:
            result = cloudinary_delete(public_id)
            log.info(f'Cloudinary delete {public_id}: {result.get("result")}')
        else:
            log.warning(f'Could not extract public_id from {url}')

        hard_delete_from_supabase(pid)
        log.info(f'Hard deleted photo {pid} from Supabase')

    log.info('Cleanup complete')


if __name__ == '__main__':
    main()
