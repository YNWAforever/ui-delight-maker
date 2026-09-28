-- User-authorized read-only aggregate inventory. Does not repair data.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';

SET LOCAL lock_timeout='1s';

SELECT now() AS checked_at,current_setting('transaction_read_only') AS read_only;

SELECT 'duplicate_open_approval_groups' AS issue,count(*) AS rows FROM (SELECT context_data->>'quote_id' FROM human_approvals WHERE approval_type='quote_send' AND status IN ('pending','escalated') AND context_data->>'quote_id' IS NOT NULL GROUP BY context_data->>'quote_id' HAVING count(*)>1) x UNION ALL SELECT 'open_quote_approval_missing_quote_id',count(*) FROM human_approvals WHERE approval_type='quote_send' AND status IN ('pending','escalated') AND context_data->>'quote_id' IS NULL UNION ALL SELECT 'duplicate_job_sheet_groups',count(*) FROM (SELECT quote_id FROM job_sheets WHERE quote_id IS NOT NULL GROUP BY quote_id HAVING count(*)>1) x;

SELECT count(*) FILTER(WHERE q.status IN ('sent','viewed','accepted')) AS issued_or_accepted_quotes,count(*) FILTER(WHERE q.status IN ('sent','viewed','accepted') AND q.issued_version_id IS NULL) AS missing_issued_pointer,count(*) FILTER(WHERE q.status IN ('sent','viewed','accepted') AND q.issued_version_id IS NOT NULL AND (iv.id IS NULL OR iv.reason IS DISTINCT FROM 'issued')) AS invalid_issued_version,count(*) FILTER(WHERE q.status='accepted' AND q.accepted_version_id IS NULL) AS missing_accepted_pointer,count(*) FILTER(WHERE q.status='accepted' AND q.accepted_version_id IS NOT NULL AND (av.id IS NULL OR av.reason IS DISTINCT FROM 'accepted')) AS invalid_accepted_version,count(*) FILTER(WHERE q.status='accepted' AND q.accepted_at IS NULL) AS missing_accepted_at FROM quotes q LEFT JOIN quote_versions iv ON iv.id=q.issued_version_id AND iv.quote_id=q.id LEFT JOIN quote_versions av ON av.id=q.accepted_version_id AND av.quote_id=q.id;

SELECT count(*) AS accepted_quotes,count(*) FILTER(WHERE av.id IS NOT NULL AND (av.snapshot->>'currency' IS NULL OR av.snapshot->>'currency' !~ '^[A-Z]{3}$' OR av.snapshot->>'total_value' IS NULL OR av.snapshot->>'total_value' !~ '^[0-9]+([.][0-9]{1,2})?$')) AS invalid_snapshot_money FROM quotes q LEFT JOIN quote_versions av ON av.id=q.accepted_version_id WHERE q.status='accepted';

WITH classified AS (SELECT status,xero_notes,xero_invoice_date,xero_confirmed_at,xero_confirmed_by,(nullif(btrim(coalesce(xero_invoice_number,'')),'') IS NOT NULL OR nullif(btrim(coalesce(xero_invoice_reference,'')),'') IS NOT NULL) AS has_identity FROM job_sheet_portions) SELECT count(*) AS total_portions,count(*) FILTER(WHERE status='entered_in_xero' AND NOT has_identity) AS entered_missing_identity,count(*) FILTER(WHERE status='entered_in_xero' AND xero_invoice_date IS NULL) AS entered_missing_date,count(*) FILTER(WHERE status='entered_in_xero' AND (xero_confirmed_at IS NULL OR xero_confirmed_by IS NULL)) AS entered_missing_confirmation_metadata,count(*) FILTER(WHERE status='planned' AND (has_identity OR xero_invoice_date IS NOT NULL)) AS planned_with_invoice_evidence,count(*) FILTER(WHERE status='planned' AND xero_notes IS NOT NULL AND NOT has_identity) AS planned_with_notes_only FROM classified;
ROLLBACK;

