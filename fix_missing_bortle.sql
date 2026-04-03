-- Find spots with null or zero bortle
SELECT id, name, lat, lon, bortle
FROM spots
WHERE bortle IS NULL OR bortle = 0
ORDER BY name;
