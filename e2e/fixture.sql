-- Two books in one series so the book page can show "More from ...".
INSERT INTO series (id, name, normalized_name, primary_author)
VALUES ('11111111-1111-4111-8111-111111111111', 'Discworld', 'discworld', 'Terry Pratchett')
ON CONFLICT DO NOTHING;

INSERT INTO books (id, google_id, isbn13, title, authors, publisher, published_date, description, page_count, categories, language, cover_url, thumbnail_url, series_id, series_position, series_source)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'fixture-equal-rites', '9780062225696', 'Equal Rites', ARRAY['Terry Pratchett'], 'Harper', '1987', '<p>The last thing the wizard Drum Billet did, before Death laid a bony hand on his shoulder, was to pass on his staff of power to the eighth son of an eighth son. Unfortunately for his colleagues in the chauvinistic (not to say misogynistic) world of magic, he failed to check that the baby in question was a son. Everybody knows that there''s no such thing as a female wizard. But now it''s gone and happened, there''s nothing much anyone can do about it. Let the battle of the sexes begin...</p>', 283, ARRAY['Fiction','Fantasy'], 'en', 'https://covers.openlibrary.org/b/isbn/9780062225696-L.jpg', 'https://covers.openlibrary.org/b/isbn/9780062225696-M.jpg', '11111111-1111-4111-8111-111111111111', 3, 'openlibrary'),
  ('33333333-3333-4333-8333-333333333333', 'fixture-mort', '9780062225719', 'Mort', ARRAY['Terry Pratchett'], 'Harper', '1987', 'Death comes to us all. When he came to Mort, he offered him a job.', 272, ARRAY['Fiction','Fantasy'], 'en', 'https://covers.openlibrary.org/b/isbn/9780062225719-L.jpg', 'https://covers.openlibrary.org/b/isbn/9780062225719-M.jpg', '11111111-1111-4111-8111-111111111111', 4, 'openlibrary'),
  ('44444444-4444-4444-8444-444444444444', 'fixture-no-cover', NULL, 'A Book Without Any Cover Art', ARRAY['Anonymous'], NULL, '2001', NULL, 120, ARRAY[]::text[], 'en', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;
