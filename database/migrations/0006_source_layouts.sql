-- Keep previous chapters and their generated items when re-splitting a book.
ALTER TABLE books ADD COLUMN active_layout_id uuid;
ALTER TABLE chapters ADD COLUMN layout_id uuid;
ALTER TABLE generation_runs ADD COLUMN layout_id uuid;
DROP INDEX chapters_book_number_idx;
CREATE UNIQUE INDEX chapters_legacy_number_idx ON chapters(book_id,chapter_number) WHERE layout_id IS NULL;
CREATE UNIQUE INDEX chapters_layout_number_idx ON chapters(book_id,layout_id,chapter_number) WHERE layout_id IS NOT NULL;
