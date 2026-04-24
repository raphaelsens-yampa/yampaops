UPDATE opportunities 
SET origin = 'freetrial'
WHERE opportunity_created_at::date = '2026-03-01'
  AND converted_at IS NOT NULL
  AND origin = 'outbound'
  AND consultant_id = (SELECT user_id FROM profiles WHERE full_name ILIKE '%duarda%' OR email ILIKE '%duda%' LIMIT 1);