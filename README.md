# Chess Companion

Voice-first review of a chess opening repertoire, on a phone, with spaced repetition: 40
variations, every line checked by a chess engine, eight of them extracted from a two-hour video.

**Stage:** the voice review has been live since September 2026, for a single user. Playing on a
real board by voice (dictating moves, recording the game, analysing it) has its code in this
repository but is not in service yet.

## What it does

- **Voice review (PWA, `web/`)**: the app plays the opponent's move, you say yours out loud
  (in French), it checks it against the repertoire and schedules the next review of that
  position (Leitner-style spaced repetition, indexed by position, not by line).
- **Hearing a move right**: a spoken move is decided in stages: phonetic matching in the
  browser first, then an optional language-model decider, then a spoken confirmation. Every
  utterance is logged so the decision chain can be replayed and measured. The model stage is
  switched off today: measured on real cases, it never beat phonetics (it compares meanings,
  while the problem is sound).
- **Repertoire as data**: the repertoire lives in PostgreSQL (`sql/`), the vocabulary of the
  game state in an ontology (`data/ontology/`), from which the schema is derived.
- **Over-the-board companion (`main.py`, `src/`)**: voice input, Stockfish analysis, game
  recording. Not in service yet.

## Architecture decisions

Every structural choice is recorded in [`docs/decisions/`](docs/decisions/) — 17 decision
records (in French). Examples:

- a repertoire node is indexed by EPD, never by FEN (0006);
- a forcing search may remove a candidate move, never produce one (0004);
- a line extracted from a video must pass two guards, and no engine (0009);
- the review is served from a VPS behind a cookie session; the app code is open, the data is not
  (0014).

`docs/specs/` holds the design specs, `docs/conception/` the use cases.

## Run

```bash
uv sync
uv run pytest -q                    # 97 passed, 12 skipped
cd web && npm ci && npm run dev     # the PWA, proxies /api to the review API on port 8110
```

The review API (`src/review_api.py`, standard library + psycopg) needs PostgreSQL (`sql/schema.sql`, then `sql/migrations/`). The
over-the-board companion needs `stockfish` on the `PATH`.

## License

MIT, see [`LICENSE`](LICENSE).
