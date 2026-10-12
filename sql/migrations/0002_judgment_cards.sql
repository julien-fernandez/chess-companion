-- Ajout seul, pour les bases existantes (VPS, locale) : migrate_repertoire.py refuse une base peuplée.
-- Recopié de sql/schema.sql ; tests/test_schema.py vérifie qu'il n'en diverge pas.

CREATE TYPE judgment_verdict AS ENUM (
    'kept',
    'slipped',
    'mistake',
    'blunder'
);

CREATE TYPE judgment_role AS ENUM (
    'own',
    'control',
    'opponent_gift'
);

CREATE TYPE judgment_reason AS ENUM (
    'hanging_piece',
    'allows',
    'forgoes',
    'ignores',
    'weakens',
    'shelter_integrity',
    'function_overload',
    'other'
);
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
                 + make_interval(days => 1 * power(2, s.recalled_in_a_row - 1)::int)
       END AS due_at
FROM judgment_card k
LEFT JOIN latest l ON l.game_id = k.game_id AND l.ply = k.ply
LEFT JOIN streak s ON s.game_id = k.game_id AND s.ply = k.ply;
