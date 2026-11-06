BEGIN;
ALTER TABLE "AccountSecurityToken" DROP CONSTRAINT "AccountSecurityToken_purpose_check";
ALTER TABLE "AccountSecurityToken" ADD CONSTRAINT "AccountSecurityToken_purpose_check"
  CHECK ("purpose" IN ('RESET_PASSWORD', 'VERIFY_EMAIL', 'ACCEPT_INVITE'));
COMMIT;
