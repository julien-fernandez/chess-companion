"""Les raisons qu'on choisit au verso sont des clés de l'ontologie des échecs, et les mêmes partout."""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def _yaml(name: str) -> dict:
    return yaml.safe_load((ROOT / "data/ontology" / name).read_text(encoding="utf-8"))


def _chess_keys() -> set[str]:
    vocab = _yaml("chess-vocabulary.yaml")
    keys = {r["key"] for r in vocab["relationship_types"]} | {a["key"] for a in vocab["axes"]}
    for entity in vocab["entity_types"]:
        keys |= {s["key"] for s in (entity.get("subtypes") or [])}
    return keys


def _reason_keys() -> list[str]:
    return [v["key"] for v in _yaml("chess-repertoire-vocabulary.yaml")["axes"]["judgment_reason"]["values"]]


def test_chaque_raison_est_une_cle_de_lontologie_des_echecs():
    assert set(_reason_keys()) - {"other"} <= _chess_keys()


def test_les_boutons_du_verso_sont_les_raisons_de_la_base():
    js = (ROOT / "web/src/chess/judgment.js").read_text(encoding="utf-8")
    listed = re.search(r"export const REASON_TAGS = \[([^\]]*)\]", js)
    assert listed, "REASON_TAGS introuvable dans judgment.js"
    assert re.findall(r"'([a-z_]+)'", listed.group(1)) == _reason_keys()
