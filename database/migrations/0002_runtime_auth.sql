-- Applied only after the verified bootstrap import; never on application startup.
CREATE TABLE auth_accounts (
  provider text NOT NULL CHECK (provider = 'google'),
  provider_account_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(provider, provider_account_id),
  UNIQUE(provider, user_id)
);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires);
CREATE TABLE app_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- Retain immutable chapter text snapshots on every text/title edit. The nested
-- pointer update is skipped by the trigger's content comparison.
CREATE FUNCTION record_chapter_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_id uuid; next_number integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.text_content IS NOT DISTINCT FROM OLD.text_content AND NEW.word_count IS NOT DISTINCT FROM OLD.word_count THEN RETURN NEW; END IF;
  END IF;
  SELECT COALESCE(MAX(revision_number),0)+1 INTO next_number FROM chapter_revisions WHERE chapter_id=NEW.id;
  revision_id := gen_random_uuid();
  INSERT INTO chapter_revisions(id,chapter_id,revision_number,title,text_content,word_count,content_sha256,origin)
    VALUES(revision_id,NEW.id,next_number,NEW.title,NEW.text_content,NEW.word_count,encode(sha256(convert_to(NEW.text_content,'UTF8')),'hex'),CASE WHEN TG_OP='INSERT' THEN 'extraction' ELSE 'edit' END);
  UPDATE chapters SET current_revision_id=revision_id WHERE id=NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_chapter_revision AFTER INSERT OR UPDATE OF title,text_content,word_count ON chapters FOR EACH ROW EXECUTE FUNCTION record_chapter_revision();

-- Explicit chapter/book deletion removes chapter snapshots, as the existing
-- destructive UI promises. Text edits never overwrite or delete a snapshot.
ALTER TABLE chapter_revisions DROP CONSTRAINT chapter_revisions_chapter_id_fkey;
ALTER TABLE chapter_revisions ADD CONSTRAINT chapter_revisions_chapter_id_fkey FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
CREATE FUNCTION detach_deleted_chapter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE vocabulary_items SET chapter_id=NULL, chapter_revision_id=NULL WHERE chapter_id=OLD.id;
  UPDATE multiple_choice_questions SET chapter_id=NULL, chapter_revision_id=NULL WHERE chapter_id=OLD.id;
  UPDATE short_answer_questions SET chapter_id=NULL, chapter_revision_id=NULL WHERE chapter_id=OLD.id;
  UPDATE chapter_summaries SET chapter_id=NULL, chapter_revision_id=NULL WHERE chapter_id=OLD.id;
  UPDATE study_sets SET chapter_id=NULL WHERE chapter_id=OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER detach_deleted_chapter BEFORE DELETE ON chapters FOR EACH ROW EXECUTE FUNCTION detach_deleted_chapter();
CREATE FUNCTION detach_deleted_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE books SET active_generation_run_id=NULL WHERE active_generation_run_id=OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER detach_deleted_run BEFORE DELETE ON generation_runs FOR EACH ROW EXECUTE FUNCTION detach_deleted_run();

CREATE FUNCTION assign_item_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT book_id INTO NEW.book_id FROM study_sets WHERE id=NEW.study_set_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assign_item_provenance BEFORE INSERT ON vocabulary_items FOR EACH ROW EXECUTE FUNCTION assign_item_provenance();
CREATE TRIGGER assign_item_provenance BEFORE INSERT ON multiple_choice_questions FOR EACH ROW EXECUTE FUNCTION assign_item_provenance();
CREATE TRIGGER assign_item_provenance BEFORE INSERT ON short_answer_questions FOR EACH ROW EXECUTE FUNCTION assign_item_provenance();
CREATE TRIGGER assign_item_provenance BEFORE INSERT ON chapter_summaries FOR EACH ROW EXECUTE FUNCTION assign_item_provenance();

-- Bind trigger lookups to the schema in which this migration runs.
DO $$
DECLARE function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['record_chapter_revision','detach_deleted_chapter','detach_deleted_run','assign_item_provenance'] LOOP
    EXECUTE format('ALTER FUNCTION %I.%I() SET search_path TO %I, pg_catalog', current_schema(), function_name, current_schema());
  END LOOP;
END;
$$;
