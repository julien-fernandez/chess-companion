-- Ajout seul, pour les bases existantes (VPS, locale) : migrate_repertoire.py refuse une base peuplée.
-- Recopié de sql/schema.sql ; tests/test_schema.py vérifie qu'il n'en diverge pas.

CREATE TYPE utterance_decider AS ENUM (
    'phonetic',
    'laya',
    'jev',
    'confirmation',
    'typed',
    'none'
);

CREATE TABLE utterance (
    id                bigserial PRIMARY KEY,
    said_at           timestamptz NOT NULL DEFAULT now(),
    epd               text NOT NULL REFERENCES position (epd) ON DELETE RESTRICT,
    expected_san      text NOT NULL,
    transcripts       text[] NOT NULL,
    phonetic_san      text,
    phonetic_margin   real,
    decider           utterance_decider NOT NULL,
    decided_san       text,
    confidence        real,
    confirmed         boolean,
    latency_ms        int,
    audio_file        text,
    review_id         bigint REFERENCES review (id) ON DELETE SET NULL,
    CONSTRAINT utterance_confidence_is_probability CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE INDEX utterance_by_position ON utterance (epd, said_at DESC);
