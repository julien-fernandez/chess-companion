"""Sert web/dist et une fausse API de révision, sans base ni décideur, sur le port 8119."""
import json
import pathlib
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIST = pathlib.Path(__file__).resolve().parent.parent / "web/dist"
SANS = ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4"]
VARIATION = {
    "id": 1, "chapter": "ecossaise", "chapter_label": "Écossaise", "side": "white",
    "label": "Gambit écossais", "due_at": None,
    "moves": [{"ply": i + 1, "san": s, "epd": f"epd{i}", "own": i % 2 == 0,
               **({"answers": [s], "due_at": None} if i % 2 == 0 else {})} for i, s in enumerate(SANS)],
}
JUDGMENT = {
    "game_id": 1, "ply": 71, "fen": "r7/2pk1p1p/3p4/1p6/1n2R3/pP5P/P4P1r/2B1RK2 w - - 1 36",
    "san": "Re7+", "mover": "white", "julien_side": "white", "opponent": "Shiasushi",
    "eval_before_cp": 325, "eval_after_cp": -684, "best_san": "Rxb4", "best_pv": ["Rxb4", "c5", "Rh4", "Rh1+"],
    "win_pct_lost": 69.3, "expected_verdict": "blunder", "due_at": "2026-10-06T00:00:00+00:00",
    "reason": {"primary": 0, "vocabularyVersion": "0.7.0", "changes": [{"layer": 1, "label": "relations", "items": [
        {"type": "pins", "why": "la tour b4 est désormais attaquée par Te7+"}]}],
        "layers": [{"layer": 0, "label": "matériel", "items": [
        {"type": "forgoes", "san": "Rxb4", "square": "b4", "why": "Te7+ renonce à Txb4 : rien ne défend b4"}]}]},
}


class Handler(SimpleHTTPRequestHandler):
    def _json(self, code: int, body: object) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/variations"):
            return self._json(200, [VARIATION])
        if self.path.startswith("/api/judgments"):
            return self._json(200, [JUDGMENT])
        return super().do_GET()

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path == "/api/resolve":
            return self._json(200, {"san": None, "confidence": None, "decider": "none", "latency_ms": 0})
        if self.path == "/api/judgment-review":
            return self._json(201, {"id": 1, "outcome": "recalled" if body.get("verdict") == "blunder" else "failed"})
        print(self.path, {k: v for k, v in body.items() if k != "audio"}, "audio" if body.get("audio") else "")
        return self._json(201, {"id": 1})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8119), partial(Handler, directory=str(DIST))).serve_forever()
