-- Ordinary compilation, exports and execution are free. Preserve every original
-- reservation and settlement; credit only the former non-AI runtime meter.
ALTER TABLE usage_ledger DROP CONSTRAINT usage_ledger_kind_check;
ALTER TABLE usage_ledger ADD CONSTRAINT usage_ledger_kind_check
  CHECK (kind IN ('reserve','settle','release','grant','refund'));

WITH credited AS (
  INSERT INTO usage_ledger(account_id,reservation_id,operation_id,kind,amount_minor,meter)
  SELECT settled.account_id,settled.reservation_id,settled.operation_id,'refund',-settled.amount_minor,'runtime'
  FROM usage_ledger settled
  JOIN reservations reservation ON reservation.id=settled.reservation_id
    AND reservation.account_id=settled.account_id
    AND reservation.operation_id=settled.operation_id
  WHERE settled.kind='settle' AND settled.meter='runtime' AND settled.amount_minor>0
    AND reservation.meter='runtime' AND reservation.state='settled'
    AND reservation.actual_minor=settled.amount_minor
  ON CONFLICT(account_id,operation_id,kind) DO NOTHING
  RETURNING account_id,reservation_id,operation_id,amount_minor
), by_period AS (
  SELECT credit.account_id,reservation.period_start,-sum(credit.amount_minor) AS amount
  FROM credited credit JOIN reservations reservation ON reservation.id=credit.reservation_id
  GROUP BY credit.account_id,reservation.period_start
), adjusted AS (
  UPDATE usage_periods period SET consumed_minor=period.consumed_minor-refund.amount
  FROM by_period refund
  WHERE period.account_id=refund.account_id AND period.period_start=refund.period_start
  RETURNING period.account_id,period.period_start
)
INSERT INTO audit_events(space_id,user_id,action,target,details)
SELECT (SELECT id FROM spaces WHERE billing_account_id=credit.account_id ORDER BY created_at,id LIMIT 1),
  NULL,'usage.nonai-runtime-refunded',credit.reservation_id::text,
  jsonb_build_object('accountId',credit.account_id,'operationId',credit.operation_id,
    'amountMinor',-credit.amount_minor,'meter','runtime','reason','ordinary-operations-free')
FROM credited credit
WHERE EXISTS (SELECT 1 FROM adjusted WHERE adjusted.account_id=credit.account_id);
