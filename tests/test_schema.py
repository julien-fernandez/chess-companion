"""Le schéma SQL versionné est exactement le rendu de l'ontologie du répertoire (ADR 0012)."""
import pytest

from scripts.generate_ddl import OUT, render


def test_le_schema_versionne_est_le_rendu_de_lontologie():
    assert OUT.read_text(encoding="utf-8") == render(), (
        "sql/schema.sql a dérivé : lancer uv run python scripts/generate_ddl.py"
    )


MIGRATIONS = {"0001_utterance.sql": 3, "0002_judgment_cards.sql": 8}


@pytest.mark.parametrize(("name", "count"), MIGRATIONS.items())
def test_chaque_migration_reprend_le_schema_a_lidentique(name, count):
    schema = OUT.read_text(encoding="utf-8")
    body = "\n".join(line for line in (OUT.parent / "migrations" / name).read_text(encoding="utf-8").splitlines()
                     if not line.startswith("--"))
    statements = [s.strip() + ";" for s in body.split(";") if s.strip()]
    assert len(statements) == count
    for statement in statements:
        assert statement in schema, f"la migration diverge du schéma : {statement[:60]}…"
