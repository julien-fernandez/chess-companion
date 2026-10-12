"""API de révision : répertoire vocal (ADR 0011) et cartes de jugement (spec 2026-10-06)."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from base64 import b64decode, urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import psycopg

LINK_KEY = re.compile(r"(key=)[^&\s'\"]*")
COOKIE = "chess_session"
COOKIE_MAX_AGE = 365 * 24 * 3600
PBKDF2_ITERATIONS = 210_000
MAX_BODY = 16_384
OUTCOMES = {"recalled", "recalled_after_retry", "failed", "unrecognized"}
DECIDERS = {"phonetic", "laya", "jev", "confirmation", "typed", "none"}
VERDICTS = ("kept", "slipped", "mistake", "blunder")
REASON_TAGS = {"hanging_piece", "allows", "forgoes", "ignores", "weakens", "shelter_integrity",
               "function_overload", "other"}
MAX_NOTE = 500
MAX_UTTERANCE_BODY = 512_000
MAX_AUDIO_BYTES = 300_000
MAX_OPTIONS = 255
MAX_LATENCY_MS = 600_000
MAX_LOG_BODY = 65_536
MAX_LOG_ENTRIES = 50
MAX_LOG_DATA = 2_000
LOG_LEVELS = {"info", "warn", "error"}
NONE_OF_THESE = "none"
NONE_OF_THESE_LABEL = "aucun de ces coups, autre chose"
WHISPER_URL = "https://api.groq.com/openai/v1"
WHISPER_MODEL = "whisper-large-v3-turbo"
# Le vocabulaire des coups oriente l'orthographe ; le coup attendu n'y entre jamais.
WHISPER_PROMPT = ("Coups d'échecs dictés en français : e4, d4, cavalier f3, fou c4, dame d1, tour e1, roi e2, "
                  "pion prend d5, petit roque, grand roque, échec, promotion. Oui. Non. Annule.")
AUDIO_EXTENSIONS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3",
                    "audio/wav": "wav"}
TTS_VOICE = "fr-FR-HenriNeural"
TTS_RATE = "+10%"
TTS_TIMEOUT = 8.0
MAX_SPEAK_CHARS = 400
DECIDER_QUESTION = ("Quel coup d'échecs le joueur a-t-il dit ? Les transcriptions viennent d'une "
                    "reconnaissance vocale française et peuvent être déformées.")

VARIATIONS_SQL = """
SELECT v.id, c.slug, c.label, c.side::text, v.label, vm.ply, vm.san, vm.from_epd,
       split_part(vm.from_epd, ' ', 2) = left(c.side::text, 1) AS own,
       s.due_at
FROM variation v
JOIN chapter c ON c.slug = v.chapter_slug
JOIN variation_move vm ON vm.variation_id = v.id
LEFT JOIN card_schedule s ON s.epd = vm.from_epd AND s.san = vm.san
ORDER BY v.id, vm.ply
"""

ANSWERS_SQL = """
SELECT chapter_side::text, from_epd, array_agg(DISTINCT san ORDER BY san)
FROM repertoire_move WHERE role = 'own' GROUP BY 1, 2
"""

JUDGMENTS_SQL = """
SELECT k.game_id, k.ply, m.from_epd, m.san, g.julien_side::text, g.white, g.black,
       e.eval_before_cp, e.eval_after_cp, e.best_san, e.best_pv, e.win_pct_lost,
       k.expected_verdict::text, k.generated_reason, s.due_at
FROM judgment_card k
JOIN move_eval e ON e.game_id = k.game_id AND e.ply = k.ply
JOIN game_move m ON m.game_id = k.game_id AND m.ply = k.ply
JOIN played_game g ON g.id = k.game_id
JOIN judgment_card_schedule s ON s.game_id = k.game_id AND s.ply = k.ply
ORDER BY s.due_at, k.game_id, k.ply
"""


def setting(name: str) -> str | None:
    """Valeur d'un réglage : credential systemd d'abord, variable d'environnement sinon."""
    directory = os.environ.get("CREDENTIALS_DIRECTORY")
    if directory:
        path = Path(directory) / name.lower().replace("_", "-")
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
    value = os.environ.get(name)
    return value.strip() if value else value


def hash_password(password: str, salt: bytes | None = None) -> str:
    """Empreinte PBKDF2 au format `pbkdf2_sha256$itérations$sel$empreinte`."""
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return (f"pbkdf2_sha256${PBKDF2_ITERATIONS}${urlsafe_b64encode(salt).decode()}"
            f"${urlsafe_b64encode(digest).decode()}")


def password_matches(password: str, record: str) -> bool:
    """Vrai si le mot de passe correspond à l'empreinte."""
    try:
        _, iterations, salt, expected = record.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), urlsafe_b64decode(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, urlsafe_b64decode(expected))


def session_token(secret: str) -> str:
    """Jeton de session : HMAC du secret, révoqué en changeant le secret."""
    return hmac.new(secret.encode(), b"chess-review-session", hashlib.sha256).hexdigest()


def link_token(secret: str) -> str:
    """Clé du lien de connexion envoyé au téléphone, révoquée avec le secret."""
    return hmac.new(secret.encode(), b"chess-review-link", hashlib.sha256).hexdigest()


def list_variations(cur: psycopg.Cursor) -> list[dict]:
    """Variantes avec leurs coups, les réponses admises à chaque coup de Julien, triées par échéance."""
    cur.execute(ANSWERS_SQL)
    answers = {(side, epd): list(sans) for side, epd, sans in cur.fetchall()}
    cur.execute(VARIATIONS_SQL)
    variations: dict[int, dict] = {}
    for vid, slug, chapter_label, side, label, ply, san, epd, own, due_at in cur.fetchall():
        v = variations.setdefault(vid, {
            "id": vid, "chapter": slug, "chapter_label": chapter_label, "side": side,
            "label": label, "moves": [], "due_at": None,
        })
        move = {"ply": ply, "san": san, "epd": epd, "own": own}
        if own:
            move["answers"] = answers.get((side, epd), [san])
            move["due_at"] = due_at.isoformat() if due_at else None
            if due_at and (v["due_at"] is None or due_at.isoformat() < v["due_at"]):
                v["due_at"] = due_at.isoformat()
        v["moves"].append(move)
    return sorted(variations.values(), key=lambda v: (v["due_at"] is None, v["due_at"] or "", v["id"]))


def save_audio(audio_dir: Path, utterance_id: int, encoded: str, when: datetime) -> str:
    """Écrit le clip d'un énoncé sous `AAAA-MM/<id>.webm` et rend ce chemin relatif ; ValueError s'il est illisible."""
    data = b64decode(encoded, validate=True)
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise ValueError("audio vide ou trop long")
    relative = f"{when:%Y-%m}/{utterance_id}.webm"
    path = audio_dir / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return relative


def _optional(payload: dict, key: str, kind: type) -> object:
    value = payload.get(key)
    if value is None:
        return None
    if kind is float and isinstance(value, int) and not isinstance(value, bool):
        value = float(value)
    if not isinstance(value, kind) or (isinstance(value, bool) and kind is not bool):
        raise ValueError(f"{key} invalide")
    return value


def record_utterance(cur: psycopg.Cursor, payload: dict, audio_dir: Path | None) -> int:
    """Écrit la trace d'un énoncé, et son audio s'il y en a un ; ValueError si la trace est mal formée."""
    epd, expected, transcripts = payload.get("epd"), payload.get("expected_san"), payload.get("transcripts")
    decider = payload.get("decider")
    if not isinstance(epd, str) or not isinstance(expected, str) or decider not in DECIDERS:
        raise ValueError("epd, expected_san et decider requis")
    if (not isinstance(transcripts, list) or len(transcripts) > 10
            or not all(isinstance(t, str) and len(t) <= 200 for t in transcripts)):
        raise ValueError("transcripts : liste d'au plus 10 textes")
    margin, confidence = _optional(payload, "phonetic_margin", float), _optional(payload, "confidence", float)
    latency = _optional(payload, "latency_ms", int)
    for key, value in (("phonetic_margin", margin), ("confidence", confidence)):
        if value is not None and not (math.isfinite(value) and 0 <= value <= 1):
            raise ValueError(f"{key} hors de [0, 1]")
    if latency is not None and not 0 <= latency <= MAX_LATENCY_MS:
        raise ValueError("latency_ms hors bornes")
    row = (epd, expected, transcripts, _optional(payload, "phonetic_san", str), margin, decider,
           _optional(payload, "decided_san", str), confidence, _optional(payload, "confirmed", bool), latency)
    try:
        cur.execute(
            """INSERT INTO utterance (epd, expected_san, transcripts, phonetic_san, phonetic_margin, decider,
                                      decided_san, confidence, confirmed, latency_ms)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, said_at""",
            row,
        )
    except (psycopg.errors.IntegrityError, psycopg.errors.DataError) as exc:
        raise ValueError(f"trace refusée par la base : {exc.diag.message_primary}") from exc
    inserted = cur.fetchone()
    assert inserted is not None
    utterance_id, said_at = inserted
    audio = payload.get("audio")
    if isinstance(audio, str) and audio and audio_dir is not None:
        try:
            relative = save_audio(audio_dir, utterance_id, audio, said_at)
            cur.execute("UPDATE utterance SET audio_file = %s WHERE id = %s", (relative, utterance_id))
        except (ValueError, OSError) as exc:
            print(f"audio de l'énoncé {utterance_id} non écrit : {exc}", file=sys.stderr, flush=True)
    return utterance_id


def decider_request(payload: dict) -> dict:
    """Requête `/v1/systemone` (Jev, Laya) : un choix parmi les coups légaux dits en français."""
    transcripts, options = payload.get("transcripts"), payload.get("options")
    phonetic = payload.get("phonetic") or []
    if not isinstance(transcripts, list) or not all(isinstance(t, str) for t in transcripts):
        raise ValueError("transcripts requis")
    if (not isinstance(options, list) or not 0 < len(options) <= MAX_OPTIONS
            or not all(isinstance(o, dict) and isinstance(o.get("san"), str)
                       and isinstance(o.get("spoken"), str) for o in options)):
        raise ValueError(f"options : de 1 à {MAX_OPTIONS} coups {{san, spoken}}")
    criteria = {o["san"]: o["spoken"] for o in options}
    ranked = [f"{criteria[p['san']]} ({float(p['score']):.2f})" for p in phonetic
              if isinstance(p, dict) and p.get("san") in criteria and isinstance(p.get("score"), (int, float))]
    criteria[NONE_OF_THESE] = NONE_OF_THESE_LABEL
    return {
        "state": {"transcriptions": transcripts, "classement_phonetique": ranked},
        "questions": {"move": {"type": "choice", "instructions": DECIDER_QUESTION, "criteria": criteria}},
    }


def resolve_move(payload: dict, url: str, key: str | None, name: str, timeout: float) -> dict:
    """Demande au décideur le coup dit ; rend `decider: none` s'il est absent, lent, en erreur ou hors liste."""
    request = decider_request(payload)
    if name == "laya":
        request["model"] = "multilingual"
    started = time.monotonic()

    def result(san: str | None = None, confidence: float | None = None, decider: str = "none") -> dict:
        return {"san": san, "confidence": confidence, "decider": decider,
                "latency_ms": round((time.monotonic() - started) * 1000)}

    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    http_request = urllib.request.Request(f"{url.rstrip('/')}/v1/systemone",
                                          data=json.dumps(request).encode(), headers=headers)
    try:
        with urllib.request.urlopen(http_request, timeout=timeout) as response:
            answer = json.loads(response.read())["answers"]["move"]
        san, confidence = answer["choice"], float(answer["confidence"])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"décideur indisponible : {exc}", file=sys.stderr, flush=True)
        return result()
    if (san == NONE_OF_THESE or san not in request["questions"]["move"]["criteria"]
            or not math.isfinite(confidence) or not 0 <= confidence <= 1):
        return result()
    return result(san, confidence, name)


class TranscribeError(Exception):
    """La reconnaissance serveur n'a pas rendu de texte : clé absente, Whisper en erreur ou injoignable."""


def _multipart(fields: dict[str, str], filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
             for name, value in fields.items()]
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                 "Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n")
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def transcribe_audio(payload: dict, url: str, key: str | None, timeout: float) -> dict:
    """Transcrit un énoncé par Whisper (Groq), pour un navigateur sans reconnaissance vocale (Chromium sous Linux)."""
    encoded, mime = payload.get("audio"), str(payload.get("mime") or "audio/webm")
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("audio requis")
    try:
        audio = b64decode(encoded, validate=True)
    except ValueError as exc:
        raise ValueError("audio illisible") from exc
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise ValueError("audio vide ou trop long")
    if not key:
        raise TranscribeError("reconnaissance serveur non configurée")
    extension = AUDIO_EXTENSIONS.get(mime.split(";")[0].strip(), "webm")
    body, content_type = _multipart({"model": WHISPER_MODEL, "language": "fr", "temperature": "0",
                                     "prompt": WHISPER_PROMPT}, f"enonce.{extension}", audio)
    request = urllib.request.Request(f"{url.rstrip('/')}/audio/transcriptions", data=body,
                                     # Cloudflare, devant Groq, refuse « Python-urllib » (403, erreur 1010).
                                     headers={"Content-Type": content_type, "Authorization": f"Bearer {key}",
                                              "User-Agent": "chess-companion/1.0"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = json.loads(response.read())["text"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        detail = f"HTTP {exc.code}" if isinstance(exc, urllib.error.HTTPError) else str(exc)
        raise TranscribeError(f"Whisper : {detail}") from exc
    text = str(text).strip()
    return {"transcripts": [text] if text else [], "latency_ms": round((time.monotonic() - started) * 1000)}


class SpeakError(Exception):
    """La voix serveur n'a pas rendu d'audio : edge-tts absent, injoignable ou muet."""


def edge_engine(text: str, voice: str) -> bytes:
    """Synthèse Edge (edge-tts) ; importée ici : seule cette route en dépend."""
    import edge_tts

    async def run() -> bytes:
        chunks = []
        async for chunk in edge_tts.Communicate(text, voice, rate=TTS_RATE).stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    return asyncio.run(asyncio.wait_for(run(), TTS_TIMEOUT))


def synthesize(payload: dict, cache_dir: Path | None, engine=edge_engine, voice: str = TTS_VOICE) -> bytes:
    """MP3 d'une phrase, pour un navigateur sans voix (Chromium sous Linux) ; chaque phrase n'est synthétisée qu'une fois."""
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text requis")
    text = " ".join(text.split())
    if len(text) > MAX_SPEAK_CHARS:
        raise ValueError(f"text : {MAX_SPEAK_CHARS} caractères au plus")
    digest = hashlib.sha256(f"{voice}|{TTS_RATE}|{text}".encode()).hexdigest()
    cached = cache_dir / f"{digest}.mp3" if cache_dir else None
    if cached and cached.exists():
        return cached.read_bytes()
    try:
        audio = engine(text, voice)
    except Exception as exc:  # edge-tts lève ses propres types, plus ImportError s'il manque
        raise SpeakError(f"synthèse : {exc!r}") from exc
    if not audio:
        raise SpeakError("synthèse : audio vide")
    if cached:
        cache_dir.mkdir(parents=True, exist_ok=True)
        partial = cached.with_suffix(".part")
        partial.write_bytes(audio)
        partial.replace(cached)
    return audio


def record_review(cur: psycopg.Cursor, payload: dict) -> int:
    """Écrit un rappel, relié à l'énoncé qui l'a produit ; lève ValueError si la carte ou l'issue est inconnue."""
    epd, san, outcome = payload.get("epd"), payload.get("san"), payload.get("outcome")
    heard = str(payload.get("heard", ""))[:500]
    if outcome not in OUTCOMES or not isinstance(epd, str) or not isinstance(san, str):
        raise ValueError("epd, san et outcome requis")
    cur.execute("SELECT 1 FROM card WHERE epd = %s AND san = %s", (epd, san))
    if cur.fetchone() is None:
        raise ValueError(f"carte inconnue : {san}")
    cur.execute(
        "INSERT INTO review (epd, san, outcome, heard) VALUES (%s, %s, %s, %s) RETURNING id",
        (epd, san, outcome, heard),
    )
    row = cur.fetchone()
    assert row is not None
    utterance_id = payload.get("utterance_id")
    if isinstance(utterance_id, int) and not isinstance(utterance_id, bool):
        cur.execute("UPDATE utterance SET review_id = %s WHERE id = %s AND review_id IS NULL", (row[0], utterance_id))
    return row[0]


def grade_verdict(expected: str, given: str) -> str:
    """Niveau exact : rappelé ; un cran d'écart dans le même sens : après essai ; sinon oublié."""
    i, j = VERDICTS.index(expected), VERDICTS.index(given)
    if i == j:
        return "recalled"
    if (i == 0) != (j == 0) or abs(i - j) > 1:
        return "failed"
    return "recalled_after_retry"


def list_judgments(cur: psycopg.Cursor) -> list[dict]:
    """Cartes de jugement triées par échéance ; la FEN est rebâtie de l'EPD pour l'échiquier."""
    cur.execute(JUDGMENTS_SQL)
    cards = []
    for (game_id, ply, epd, san, side, white, black, before, after, best_san, best_pv, lost,
         expected, reason, due_at) in cur.fetchall():
        cards.append({
            "game_id": game_id, "ply": ply, "fen": f"{epd} 0 {(ply + 1) // 2}", "san": san,
            "mover": "white" if ply % 2 else "black", "julien_side": side,
            "opponent": black if side == "white" else white,
            "eval_before_cp": before, "eval_after_cp": after, "best_san": best_san, "best_pv": best_pv,
            "win_pct_lost": lost, "expected_verdict": expected, "reason": reason,
            "due_at": due_at.isoformat() if due_at else None,
        })
    return cards


def _clip(value: object, limit: int) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit - 1] + "…"


def client_log_lines(payload: dict) -> list[str]:
    """Un lot du journal du navigateur → lignes JSON pour journald ; debug écarté, clé du lien masquée."""
    entries = payload.get("entries")
    if not isinstance(payload.get("session"), str) or not isinstance(entries, list):
        raise ValueError("lot de journal mal formé")
    if len(entries) > MAX_LOG_ENTRIES:
        raise ValueError(f"plus de {MAX_LOG_ENTRIES} événements dans un lot")
    lines = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("événement mal formé")
        level = entry.get("level")
        if level == "debug":
            continue
        if level not in LOG_LEVELS:
            raise ValueError(f"niveau inconnu : {level}")
        data = entry.get("data")
        event = {"client": True, "session": _clip(payload["session"], 64), "page": _clip(payload.get("page", ""), 32),
                 "ts": _clip(entry.get("ts", ""), 40), "level": level, "module": _clip(entry.get("module", ""), 40),
                 "msg": _clip(entry.get("msg", ""), 200),
                 "data": None if data is None else data if len(json.dumps(data, ensure_ascii=False)) <= MAX_LOG_DATA
                 else _clip(data, MAX_LOG_DATA)}
        lines.append(LINK_KEY.sub(r"\1<masqué>", json.dumps(event, ensure_ascii=False)))
    return lines


def _int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def record_judgment_review(cur: psycopg.Cursor, payload: dict) -> dict:
    """Note un verdict contre celui de la carte ; la note se calcule ici, jamais chez le client."""
    game_id, ply, verdict = payload.get("game_id"), payload.get("ply"), payload.get("verdict")
    if not _int(game_id) or not _int(ply) or verdict not in VERDICTS:
        raise ValueError("game_id, ply et verdict requis")
    cur.execute("SELECT expected_verdict::text FROM judgment_card WHERE game_id = %s AND ply = %s", (game_id, ply))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"carte de jugement inconnue : {game_id}/{ply}")
    outcome = grade_verdict(row[0], str(verdict))
    cur.execute(
        "INSERT INTO judgment_review (game_id, ply, verdict, outcome) VALUES (%s, %s, %s, %s) RETURNING id",
        (game_id, ply, verdict, outcome),
    )
    created = cur.fetchone()
    assert created is not None
    return {"id": created[0], "outcome": outcome}


def annotate_judgment_review(cur: psycopg.Cursor, payload: dict) -> None:
    """Ajoute à une révision la raison de Julien, sa note, et « raison fausse »."""
    review_id, tag = payload.get("id"), payload.get("reason_tag")
    note, wrong = str(payload.get("note", ""))[:MAX_NOTE], payload.get("reason_wrong", False)
    if not _int(review_id) or (tag is not None and tag not in REASON_TAGS) or not isinstance(wrong, bool):
        raise ValueError("id, reason_tag ou reason_wrong invalide")
    cur.execute("UPDATE judgment_review SET reason_tag = %s, note = %s, reason_wrong = %s WHERE id = %s",
                (tag, note, wrong, review_id))
    if cur.rowcount == 0:
        raise ValueError(f"révision inconnue : {review_id}")


RETURN_HASH = re.compile(r"#[a-z-]{1,30}")


def connexion_target(path: str, remote_user: str | None) -> str | None:
    """Où renvoyer après `/api/connexion`, ou None si nginx n'a authentifié personne.

    nginx garde `/api/` derrière l'authentification basique et y transmet `X-Remote-User` (en
    écrasant celui du client) ; l'API n'écoute que sur 127.0.0.1. La fenêtre du navigateur vaut
    donc connexion : une seule, au lieu d'un second mot de passe pour le cookie.
    """
    if not remote_user:
        return None
    back = parse_qs(urlsplit(path).query).get("retour", [""])[0]
    return f"/{back}" if RETURN_HASH.fullmatch(back) else "/"


class Handler(BaseHTTPRequestHandler):
    """Routes `/api/*` ; le reste est servi par nginx."""

    db_url = ""
    secret = ""
    password_record = ""
    audio_dir: Path | None = None
    decider_url = "http://127.0.0.1:8111"
    decider_key: str | None = None
    decider_name = "laya"
    decider_timeout = 1.5
    whisper_url = WHISPER_URL
    whisper_key: str | None = None
    tts_cache: Path | None = None

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        """Un lot du journal accepté n'ajoute pas sa propre ligne : elle noierait les événements qu'il porte."""
        # Une requête mal formée n'a pas encore de `path` quand elle se journalise.
        if getattr(self, "path", None) == "/api/log" and code == HTTPStatus.NO_CONTENT:
            return
        super().log_request(code, size)

    def log_message(self, format: str, *args: object) -> None:
        """La clé du lien de connexion vaut une session : journald n'en garde que la place."""
        sys.stderr.write(LINK_KEY.sub(r"\1<masqué>", f"{self.address_string()} - - "
                                      f"[{self.log_date_time_string()}] {format % args}") + "\n")

    def _session_cookie(self) -> str:
        return (f"{COOKIE}={session_token(self.secret)}; Max-Age={COOKIE_MAX_AGE}; Path=/api; "
                "HttpOnly; Secure; SameSite=Lax")

    def _login_by_link(self) -> None:
        key = parse_qs(urlsplit(self.path).query).get("key", [""])[0]
        if not hmac.compare_digest(key, link_token(self.secret)):
            self._send(HTTPStatus.UNAUTHORIZED, {"error": "lien de connexion invalide"})
            return
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Set-Cookie", self._session_cookie())
        self.send_header("Location", "/#revision")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _login_by_nginx(self) -> None:
        target = connexion_target(self.path, self.headers.get("X-Remote-User"))
        if target is None:
            self._send(HTTPStatus.UNAUTHORIZED, {"error": "authentification nginx absente"})
            return
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Set-Cookie", self._session_cookie())
        self.send_header("Location", target)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _send(self, status: HTTPStatus, body: object = None, cookie: str | None = None) -> None:
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def _send_audio(self, audio: bytes) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "private, max-age=86400")
        self.end_headers()
        self.wfile.write(audio)

    def _body(self, limit: int = MAX_BODY) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ValueError("corps trop long")
        parsed = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(parsed, dict):
            raise ValueError("objet JSON attendu")
        return parsed

    def _authenticated(self) -> bool:
        morsel = SimpleCookie(self.headers.get("Cookie", "")).get(COOKIE)
        return morsel is not None and hmac.compare_digest(morsel.value, session_token(self.secret))

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self._send(HTTPStatus.OK, {"ok": True})
        elif urlsplit(self.path).path == "/api/login":
            self._login_by_link()
        elif urlsplit(self.path).path == "/api/connexion":
            self._login_by_nginx()
        elif not self._authenticated():
            self._send(HTTPStatus.UNAUTHORIZED, {"error": "connexion requise"})
        elif self.path == "/api/session":
            self._send(HTTPStatus.OK, {"ok": True})
        elif self.path == "/api/variations":
            with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
                self._send(HTTPStatus.OK, list_variations(cur))
        elif self.path == "/api/judgments":
            with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
                self._send(HTTPStatus.OK, list_judgments(cur))
        else:
            self._send(HTTPStatus.NOT_FOUND, {"error": "route inconnue"})

    def do_POST(self) -> None:
        try:
            payload = self._body({"/api/utterance": MAX_UTTERANCE_BODY, "/api/transcribe": MAX_UTTERANCE_BODY, "/api/log": MAX_LOG_BODY}.get(self.path, MAX_BODY))
        except ValueError as exc:
            self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        if self.path == "/api/login":
            if not password_matches(str(payload.get("password", "")), self.password_record):
                self._send(HTTPStatus.UNAUTHORIZED, {"error": "mot de passe refusé"})
                return
            self._send(HTTPStatus.OK, {"ok": True}, cookie=self._session_cookie())
        elif not self._authenticated():
            self._send(HTTPStatus.UNAUTHORIZED, {"error": "connexion requise"})
        elif self.path == "/api/log":
            try:
                lines = client_log_lines(payload)
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
                return
            for line in lines:
                sys.stderr.write(line + "\n")
            sys.stderr.flush()
            self._send(HTTPStatus.NO_CONTENT)
        elif self.path == "/api/review":
            try:
                with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
                    self._send(HTTPStatus.CREATED, {"id": record_review(cur, payload)})
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        elif self.path == "/api/utterance":
            try:
                with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
                    self._send(HTTPStatus.CREATED, {"id": record_utterance(cur, payload, self.audio_dir)})
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        elif self.path in ("/api/judgment-review", "/api/judgment-annotation"):
            try:
                with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
                    if self.path == "/api/judgment-review":
                        self._send(HTTPStatus.CREATED, record_judgment_review(cur, payload))
                    else:
                        annotate_judgment_review(cur, payload)
                        self._send(HTTPStatus.CREATED, {"ok": True})
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        elif self.path == "/api/resolve":
            try:
                self._send(HTTPStatus.OK, resolve_move(payload, self.decider_url, self.decider_key,
                                                       self.decider_name, self.decider_timeout))
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        elif self.path == "/api/speak":
            try:
                self._send_audio(synthesize(payload, self.tts_cache))
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            except SpeakError as exc:
                print(f"voix serveur : {exc}", file=sys.stderr, flush=True)
                self._send(HTTPStatus.BAD_GATEWAY, {"error": str(exc)})
        elif self.path == "/api/transcribe":
            try:
                self._send(HTTPStatus.OK, transcribe_audio(payload, self.whisper_url, self.whisper_key, 10.0))
            except ValueError as exc:
                self._send(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            except TranscribeError as exc:
                print(f"reconnaissance serveur : {exc}", file=sys.stderr, flush=True)
                self._send(HTTPStatus.BAD_GATEWAY, {"error": str(exc)})
        else:
            self._send(HTTPStatus.NOT_FOUND, {"error": "route inconnue"})


def main() -> int:
    """Lance le serveur ; `hash` rend l'empreinte d'un mot de passe lu sur stdin, `link <url>` le lien de connexion."""
    if sys.argv[1:] == ["hash"]:
        print(hash_password(sys.stdin.readline().rstrip("\n")))
        return 0
    if sys.argv[1:2] == ["link"] and len(sys.argv) == 3:
        secret = setting("CHESS_REVIEW_SECRET")
        if not secret:
            raise SystemExit("CHESS_REVIEW_SECRET absent")
        print(f"{sys.argv[2].rstrip('/')}/api/login?key={link_token(secret)}")
        return 0
    values = {name: setting(name) for name in ("CHESS_DB_URL", "CHESS_REVIEW_SECRET", "CHESS_REVIEW_PASSWORD")}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise SystemExit(f"réglages absents : {', '.join(missing)}")
    Handler.db_url = values["CHESS_DB_URL"] or ""
    Handler.secret = values["CHESS_REVIEW_SECRET"] or ""
    Handler.password_record = values["CHESS_REVIEW_PASSWORD"] or ""
    audio_dir = setting("CHESS_AUDIO_DIR")
    Handler.audio_dir = Path(audio_dir) if audio_dir else None
    Handler.decider_url = setting("CHESS_DECIDER_URL") or Handler.decider_url
    Handler.decider_key = setting("CHESS_DECIDER_KEY") or None
    Handler.decider_name = setting("CHESS_DECIDER_NAME") or Handler.decider_name
    Handler.decider_timeout = float(setting("CHESS_DECIDER_TIMEOUT") or Handler.decider_timeout)
    Handler.whisper_key = setting("CHESS_GROQ_KEY") or None
    tts_cache = setting("CHESS_TTS_CACHE")
    Handler.tts_cache = Path(tts_cache) if tts_cache else None
    port = int(os.environ.get("CHESS_REVIEW_PORT", "8110"))
    print(f"chess-review sur 127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
