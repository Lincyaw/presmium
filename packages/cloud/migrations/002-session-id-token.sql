-- The identity provider's ID token of each sign-in: signing out hands it back (id_token_hint), so the provider ends its
-- session without asking the author to confirm.
ALTER TABLE sessions ADD COLUMN id_token text;
