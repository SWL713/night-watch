"""
CME Pipeline Utilities
"""

def check_removals(queue, classification_data, log):
    """Check if any CMEs should be removed from active queue"""
    
    cmes_to_remove = []
    
    for cme in queue['cmes']:
        if cme['state']['current'] == 'SUBSIDING':
            # Check if next CME classified OR 12h elapsed
            from datetime import datetime, timezone, timedelta
            
            entered_subsiding = datetime.fromisoformat(cme['state']['entered_at'].replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            hours_in_subsiding = (now - entered_subsiding).total_seconds() / 3600
            
            # Check for next classified CME
            next_classified = False
            for other_cme in queue['cmes']:
                if other_cme['id'] != cme['id']:
                    if other_cme['id'] in classification_data['classifications']:
                        if classification_data['classifications'][other_cme['id']].get('current', {}).get('confidence', 0) >= 55:
                            next_classified = True
                            break
            
            if next_classified or hours_in_subsiding >= 12:
                cmes_to_remove.append(cme['id'])
                log.info(f"Removing CME {cme['id']} from queue")
    
    # Remove from queue
    queue['cmes'] = [c for c in queue['cmes'] if c['id'] not in cmes_to_remove]
    
    # Archive removed CMEs (placeholder - implement actual archiving)
    for cme_id in cmes_to_remove:
        log.info(f"Archived {cme_id}")
    
    return queue
