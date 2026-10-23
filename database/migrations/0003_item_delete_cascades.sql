-- Each item belongs to both a book and a study set. Make both ownership
-- references cascade so PostgreSQL can delete a populated book regardless of
-- the order in which the other chapter/run/set cascades are processed.
DO $$
DECLARE item_table text;
BEGIN
  FOREACH item_table IN ARRAY ARRAY['vocabulary_items','multiple_choice_questions','short_answer_questions','chapter_summaries'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', item_table, item_table || '_book_id_fkey');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE', item_table, item_table || '_book_id_fkey');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', item_table, item_table || '_set_book_fk');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(study_set_id,book_id) REFERENCES study_sets(id,book_id) ON DELETE CASCADE', item_table, item_table || '_set_book_fk');
  END LOOP;
END;
$$;
