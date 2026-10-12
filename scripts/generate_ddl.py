"""Rend sql/schema.sql depuis data/ontology/chess-repertoire-vocabulary.yaml (ADR 0012)."""
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data/ontology/chess-repertoire-vocabulary.yaml"
OUT = ROOT / "sql/schema.sql"

LEITNER_BASE_DAYS = 1

TABLES = f"""
CREATE TABLE position (
    epd               text PRIMARY KEY,
    CONSTRAINT position_epd_has_four_fields
        CHECK (array_length(regexp_split_to_array(epd, ' '), 1) = 4),
    CONSTRAINT position_epd_side_to_move CHECK (split_part(epd, ' ', 2) IN ('w', 'b'))
);

CREATE TABLE chapter (
    slug              text PRIMARY KEY,
    label             text NOT NULL,
    side              side NOT NULL,
    opening_prefix    text[] NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chapter_prefix_not_empty CHECK (cardinality(opening_prefix) > 0)
);

CREATE TABLE source (
    id                bigserial PRIMARY KEY,
    kind              source_kind NOT NULL,
    title             text NOT NULL,
    author            text,
    url               text,
    elo_min           int,
    elo_max           int,
    retrieved_at      timestamptz,
    CONSTRAINT source_title_not_empty CHECK (length(btrim(title)) > 0),
    CONSTRAINT source_video_has_url CHECK (kind <> 'coach_video' OR url IS NOT NULL),
    CONSTRAINT source_hand_written_has_no_author
        CHECK (kind <> 'hand_written' OR (author IS NULL AND url IS NULL)),
    CONSTRAINT source_elo_band CHECK (elo_min IS NULL OR elo_max IS NULL OR elo_min <= elo_max)
);

CREATE UNIQUE INDEX source_unique_url ON source (url) WHERE url IS NOT NULL;

CREATE TABLE variation (
    id                bigserial PRIMARY KEY,
    chapter_slug      text NOT NULL REFERENCES chapter (slug) ON DELETE RESTRICT,
    ord               int NOT NULL,
    label             text NOT NULL,
    source_id         bigint NOT NULL REFERENCES source (id) ON DELETE RESTRICT,
    source_locator    text NOT NULL DEFAULT '',
    admission         admission_reason NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT variation_label_not_empty CHECK (length(btrim(label)) > 0),
    UNIQUE (chapter_slug, ord)
);

CREATE TABLE variation_move (
    variation_id      bigint NOT NULL REFERENCES variation (id) ON DELETE CASCADE,
    ply               int NOT NULL,
    san               text NOT NULL,
    from_epd          text NOT NULL REFERENCES position (epd) ON DELETE RESTRICT,
    to_epd            text NOT NULL REFERENCES position (epd) ON DELETE RESTRICT,
    PRIMARY KEY (variation_id, ply),
    CONSTRAINT variation_move_ply_positive CHECK (ply >= 1),
    CONSTRAINT variation_move_changes_position CHECK (from_epd <> to_epd)
);

CREATE INDEX variation_move_by_from ON variation_move (from_epd);

CREATE TABLE claim (
    id                bigserial PRIMARY KEY,
    variation_id      bigint NOT NULL,
    ply               int NOT NULL,
    nature            claim_nature NOT NULL,
    statement         text NOT NULL,
    verification      claim_check,
    check_expression  text,
    FOREIGN KEY (variation_id, ply) REFERENCES variation_move (variation_id, ply) ON DELETE CASCADE,
    CONSTRAINT claim_statement_not_empty CHECK (length(btrim(statement)) > 0),
    CONSTRAINT claim_checked_iff_objective CHECK ((nature = 'objective') = (verification IS NOT NULL)),
    CONSTRAINT claim_verified_has_expression
        CHECK (verification IS DISTINCT FROM 'verified' OR check_expression IS NOT NULL)
);

CREATE TABLE intended_alternative (
    side              side NOT NULL,
    epd               text NOT NULL REFERENCES position (epd) ON DELETE RESTRICT,
    reason            text NOT NULL,
    declared_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (side, epd),
    CONSTRAINT intended_alternative_reason_not_empty CHECK (length(btrim(reason)) > 0)
);

CREATE TABLE card (
    epd               text NOT NULL REFERENCES position (epd) ON DELETE RESTRICT,
    san               text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (epd, san)
);

CREATE TABLE review (
    id                bigserial PRIMARY KEY,
    epd               text NOT NULL,
    san               text NOT NULL,
    reviewed_at       timestamptz NOT NULL DEFAULT now(),
    outcome           review_outcome NOT NULL,
    heard             text NOT NULL DEFAULT '',
    FOREIGN KEY (epd, san) REFERENCES card (epd, san) ON DELETE RESTRICT
);

CREATE INDEX review_by_card ON review (epd, san, reviewed_at DESC);

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

CREATE TABLE played_game (
    id                bigserial PRIMARY KEY,
    platform          game_platform NOT NULL,
    external_id       text NOT NULL,
    played_at         timestamptz,
    white             text NOT NULL,
    black             text NOT NULL,
    julien_side       side NOT NULL,
    time_control      text,
    result            text NOT NULL,
    pgn               text NOT NULL,
    UNIQUE (platform, external_id),
    CONSTRAINT played_game_result CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*'))
);

CREATE TABLE game_move (
    game_id           bigint NOT NULL REFERENCES played_game (id) ON DELETE CASCADE,
    ply               int NOT NULL,
    san               text NOT NULL,
    from_epd          text NOT NULL,
    to_epd            text NOT NULL,
    PRIMARY KEY (game_id, ply),
    CONSTRAINT game_move_ply_positive CHECK (ply >= 1)
);

CREATE INDEX game_move_by_from ON game_move (from_epd);

CREATE TABLE move_eval (
    game_id           bigint NOT NULL,
    ply               int NOT NULL,
    engine            text NOT NULL,
    depth             int NOT NULL,
    eval_before_cp    int NOT NULL,
    eval_after_cp     int NOT NULL,
    best_san          text NOT NULL,
    best_pv           text[] NOT NULL,
    win_pct_lost      real NOT NULL,
    PRIMARY KEY (game_id, ply),
    FOREIGN KEY (game_id, ply) REFERENCES game_move (game_id, ply) ON DELETE CASCADE,
    CONSTRAINT move_eval_depth_positive CHECK (depth > 0)
);

CREATE TABLE judgment_card (
    game_id           bigint NOT NULL,
    ply               int NOT NULL,
    role              judgment_role NOT NULL,
    expected_verdict  judgment_verdict NOT NULL,
    generated_reason  jsonb,
    vocabulary_version text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, ply),
    FOREIGN KEY (game_id, ply) REFERENCES move_eval (game_id, ply) ON DELETE CASCADE
);

CREATE TABLE judgment_review (
    id                bigserial PRIMARY KEY,
    game_id           bigint NOT NULL,
    ply               int NOT NULL,
    reviewed_at       timestamptz NOT NULL DEFAULT now(),
    verdict           judgment_verdict NOT NULL,
    outcome           review_outcome NOT NULL,
    reason_tag        judgment_reason,
    note              text NOT NULL DEFAULT '',
    reason_wrong      boolean NOT NULL DEFAULT false,
    FOREIGN KEY (game_id, ply) REFERENCES judgment_card (game_id, ply) ON DELETE RESTRICT,
    CONSTRAINT judgment_review_outcome_not_voice CHECK (outcome <> 'unrecognized')
);

CREATE INDEX judgment_review_by_card ON judgment_review (game_id, ply, reviewed_at DESC);

CREATE VIEW repertoire_move AS
SELECT DISTINCT
       vm.from_epd,
       vm.san,
       vm.to_epd,
       c.side AS chapter_side,
       CASE WHEN split_part(vm.from_epd, ' ', 2) = left(c.side::text, 1)
            THEN 'own'::move_role ELSE 'opponent'::move_role END AS role
FROM variation_move vm
JOIN variation v ON v.id = vm.variation_id
JOIN chapter c ON c.slug = v.chapter_slug;

CREATE VIEW own_move_conflict AS
SELECT chapter_side, from_epd, array_agg(DISTINCT san ORDER BY san) AS answers
FROM repertoire_move rm
WHERE role = 'own'
  AND NOT EXISTS (SELECT 1 FROM intended_alternative a WHERE a.side = rm.chapter_side AND a.epd = rm.from_epd)
GROUP BY chapter_side, from_epd
HAVING count(DISTINCT san) > 1;

CREATE VIEW card_missing AS
SELECT rm.from_epd AS epd, rm.san
FROM repertoire_move rm
WHERE rm.role = 'own'
  AND NOT EXISTS (SELECT 1 FROM card k WHERE k.epd = rm.from_epd AND k.san = rm.san);

CREATE VIEW card_schedule AS
WITH counted AS (
    SELECT r.epd, r.san, r.reviewed_at, r.outcome,
           count(*) FILTER (WHERE r.outcome IN ('failed', 'recalled_after_retry'))
               OVER (PARTITION BY r.epd, r.san ORDER BY r.reviewed_at
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS lapses
    FROM review r
    WHERE r.outcome <> 'unrecognized'
),
latest AS (
    SELECT epd, san, max(reviewed_at) AS last_reviewed_at, max(lapses) AS lapses
    FROM counted
    GROUP BY epd, san
),
streak AS (
    SELECT c.epd, c.san, count(*) AS recalled_in_a_row
    FROM counted c
    JOIN latest l ON l.epd = c.epd AND l.san = c.san AND c.lapses = l.lapses
    WHERE c.outcome = 'recalled'
    GROUP BY c.epd, c.san
)
SELECT k.epd,
       k.san,
       l.last_reviewed_at,
       coalesce(s.recalled_in_a_row, 0) AS recalled_in_a_row,
       CASE WHEN l.last_reviewed_at IS NULL THEN k.created_at
            WHEN coalesce(s.recalled_in_a_row, 0) = 0 THEN l.last_reviewed_at
            ELSE l.last_reviewed_at
                 + make_interval(days => {LEITNER_BASE_DAYS} * power(2, s.recalled_in_a_row - 1)::int)
       END AS due_at
FROM card k
LEFT JOIN latest l ON l.epd = k.epd AND l.san = k.san
LEFT JOIN streak s ON s.epd = k.epd AND s.san = k.san;

CREATE VIEW judgment_card_schedule AS
WITH counted AS (
    SELECT r.game_id, r.ply, r.reviewed_at, r.outcome,
           count(*) FILTER (WHERE r.outcome IN ('failed', 'recalled_after_retry'))
               OVER (PARTITION BY r.game_id, r.ply ORDER BY r.reviewed_at
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS lapses
    FROM judgment_review r
),
latest AS (
    SELECT game_id, ply, max(reviewed_at) AS last_reviewed_at, max(lapses) AS lapses
    FROM counted
    GROUP BY game_id, ply
),
streak AS (
    SELECT c.game_id, c.ply, count(*) AS recalled_in_a_row
    FROM counted c
    JOIN latest l ON l.game_id = c.game_id AND l.ply = c.ply AND c.lapses = l.lapses
    WHERE c.outcome = 'recalled'
    GROUP BY c.game_id, c.ply
)
SELECT k.game_id,
       k.ply,
       l.last_reviewed_at,
       coalesce(s.recalled_in_a_row, 0) AS recalled_in_a_row,
       CASE WHEN l.last_reviewed_at IS NULL THEN k.created_at
            WHEN coalesce(s.recalled_in_a_row, 0) = 0 THEN l.last_reviewed_at
            ELSE l.last_reviewed_at
                 + make_interval(days => {LEITNER_BASE_DAYS} * power(2, s.recalled_in_a_row - 1)::int)
       END AS due_at
FROM judgment_card k
LEFT JOIN latest l ON l.game_id = k.game_id AND l.ply = k.ply
LEFT JOIN streak s ON s.game_id = k.game_id AND s.ply = k.ply;

CREATE VIEW repertoire_position AS
SELECT DISTINCT c.side, vm.from_epd AS epd
FROM variation_move vm JOIN variation v ON v.id = vm.variation_id JOIN chapter c ON c.slug = v.chapter_slug
UNION
SELECT DISTINCT c.side, vm.to_epd
FROM variation_move vm JOIN variation v ON v.id = vm.variation_id JOIN chapter c ON c.slug = v.chapter_slug;

CREATE VIEW game_exit AS
SELECT g.id AS game_id,
       g.julien_side,
       x.exit_ply,
       (x.exit_ply + 1) / 2 AS exit_move_number
FROM played_game g
LEFT JOIN LATERAL (
    SELECT min(m.ply) AS exit_ply
    FROM game_move m
    WHERE m.game_id = g.id
      AND NOT EXISTS (
          SELECT 1 FROM repertoire_position p WHERE p.side = g.julien_side AND p.epd = m.to_epd
      )
) x ON true;

CREATE VIEW position_status AS
SELECT p.side,
       p.epd,
       CASE
           WHEN EXISTS (
               SELECT 1 FROM game_move m JOIN played_game g ON g.id = m.game_id
               WHERE g.julien_side = p.side AND m.from_epd = p.epd
                 AND NOT EXISTS (SELECT 1 FROM repertoire_position q
                                 WHERE q.side = p.side AND q.epd = m.to_epd)
           ) THEN 'missed'::node_status
           WHEN EXISTS (
               SELECT 1 FROM card_schedule s
               WHERE s.epd = p.epd AND s.recalled_in_a_row > 0
           ) THEN 'known'::node_status
           ELSE 'seen'::node_status
       END AS status
FROM repertoire_position p;
"""


def _enums(axes):
    blocks = []
    for name, axis in axes.items():
        values = ",\n    ".join(f"'{v['key']}'" for v in axis["values"])
        blocks.append(f"CREATE TYPE {name} AS ENUM (\n    {values}\n);")
    return "\n\n".join(blocks)


def _used_types(sql, known):
    words = set(re.findall(r"\b(\w+)\b", sql))
    return {w for w in known if w in words}


def _selfcheck(axes, rendered):
    known = set(axes)
    relations = set(re.findall(r"CREATE (?:TABLE|VIEW) (\w+)", TABLES))
    clashes = sorted(known & relations)
    assert not clashes, f"table ou vue homonyme d'un enum, refusée par Postgres : {clashes}"
    orphans = sorted(known - _used_types(TABLES, known))
    assert not orphans, f"axes déclarés mais jamais employés par le schéma : {orphans}"
    for name, axis in axes.items():
        assert f"CREATE TYPE {name} AS ENUM" in rendered, f"enum {name} absent du rendu"
    values = {v["key"] for axis in axes.values() for v in axis["values"]}
    literals = set(re.findall(r"'([a-z_]+)'::(\w+)", TABLES)) | {
        (lit, "") for lit in re.findall(r"outcome (?:<>|IN \()\s*'([a-z_]+)'", TABLES)
    }
    for literal, _type in literals:
        assert literal in values, f"littéral '{literal}' hors vocabulaire"


def render():
    """Texte exact de sql/schema.sql, pour l'écrire et pour détecter la dérive."""
    source = yaml.safe_load(SOURCE.read_text(encoding="utf-8"))
    axes = source["axes"]
    rendered = (
        f"-- Généré par scripts/generate_ddl.py depuis {SOURCE.name} "
        f"v{source['version']} — ne pas éditer à la main (ADR 0012).\n\n"
        f"{_enums(axes)}\n{TABLES}"
    )
    _selfcheck(axes, rendered)
    return rendered


def main():
    rendered = render()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"{OUT} — {rendered.count('CREATE TYPE')} enums, {rendered.count('CREATE TABLE')} tables, "
          f"{rendered.count('CREATE VIEW')} vues")
    return 0


if __name__ == "__main__":
    sys.exit(main())
