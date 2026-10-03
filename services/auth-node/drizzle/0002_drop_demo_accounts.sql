-- ADR-015: the public demo is gone; every user signs up.
-- A demo account could never sign in (it stores a sentinel hash), but its
-- refresh token would have kept a session alive after the endpoint was
-- removed. Revoke those first, while the column still says which rows they are.
-- The accounts themselves are not deleted here: a SQL delete cannot publish
-- user.deleted, so the data service would orphan their objects.
DELETE FROM "auth"."refresh_tokens" WHERE "user_id" IN (SELECT "id" FROM "auth"."users" WHERE "is_demo");--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "is_demo";
