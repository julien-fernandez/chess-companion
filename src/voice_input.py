"""Reconnaissance vocale française vers la notation UCI."""
import re
import logging
import numpy as np
import speech_recognition as sr
import chess

logger = logging.getLogger(__name__)

_noisereduce = None
_silero = None

SAMPLE_RATE_HZ = 16000

_NUMBERS_FR = {
    'un': '1', 'deux': '2', 'trois': '3', 'quatre': '4',
    'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8',
}

_FILE_PHONETIC = {
    r'\ble\b': 'e',
    r'\bla\b': 'a',
    r'\bsi\b': 'c',
    r'\bcé\b': 'c',
    r'\bdi\b': 'd',
    r'\bde\b': 'd',
    r'\béf\b': 'f', r'\beff\b': 'f',
    r'\bjé\b': 'g', r'\bji\b': 'g',
    r'\bach\b': 'h', r'\bhache\b': 'h',
    r'\bbé\b': 'b',
    r'\b[àâ]\b': 'a',
}

_PIECE_FUZZY_LONGEST_FIRST: list[tuple[str, str]] = [
    (r'\bcavaliers?\b', 'cavalier'),
    (r'\bcavalié\b',    'cavalier'),
    (r'\bcavale\b',     'cavalier'),
    (r'\bcava\b',       'cavalier'),
    (r'\bdames?\b',     'dame'),
    (r'\bzam\b',        'dame'),
    (r'\bdam\b',        'dame'),
    (r'\bdamn\b',       'dame'),
    (r'\btours?\b',     'tour'),
    (r'\btur\b',        'tour'),
    (r'\bfous?\b',      'fou'),
    (r'\bfu\b',         'fou'),
    (r'\bpions?\b',     'pion'),
    (r'\brois?\b',      'roi'),
    (r'\broua\b',       'roi'),
]


def normalize_fr(text: str) -> str:
    """Normalise le texte STT français vers une notation proche des coups d'échecs."""
    t = text.strip().lower()

    for pattern, right in _PIECE_FUZZY_LONGEST_FIRST:
        t = re.sub(pattern, right, t)

    for word, digit in _NUMBERS_FR.items():
        t = re.sub(rf'\b{word}\b', digit, t)

    for pattern, letter in _FILE_PHONETIC.items():
        t = re.sub(pattern + r'(?=\s*[1-8]|\s*$)', letter, t)

    parts = re.split(r'\s+et\s+', t)
    t = parts[0].strip()

    t = re.sub(r'([a-h])\s+([1-8])', r'\1\2', t)

    return t


def _get_nr():
    global _noisereduce
    if _noisereduce is False:
        return None
    if _noisereduce is None:
        try:
            import noisereduce
            _noisereduce = noisereduce
            logger.info("noisereduce chargé")
        except ImportError:
            logger.warning("noisereduce non installé — débruitage désactivé")
            _noisereduce = False
    return _noisereduce if _noisereduce is not False else None


def _get_silero():
    global _silero
    if _silero is False:
        return None
    if _silero is None:
        try:
            from silero_vad import load_silero_vad, get_speech_timestamps
            model = load_silero_vad()
            _silero = (model, get_speech_timestamps)
            logger.info("silero-vad chargé")
        except ImportError:
            logger.warning("silero-vad non installé — filtre VAD désactivé")
            _silero = False
    return _silero if _silero is not False else None


def _raw_to_f32(raw: bytes) -> np.ndarray:
    """PCM int16 LE → float32 [-1, 1]."""
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _f32_to_raw(arr: np.ndarray) -> bytes:
    return (arr * 32768.0).clip(-32768, 32767).astype(np.int16).tobytes()


def _to_audio_data(raw: bytes) -> sr.AudioData:
    return sr.AudioData(raw, SAMPLE_RATE_HZ, 2)


def denoise(raw: bytes) -> bytes:
    """Réduction spectrale du bruit (noisereduce). Retourne raw inchangé si lib absente."""
    nr = _get_nr()
    if nr is None:
        return raw
    samples = _raw_to_f32(raw)
    cleaned = nr.reduce_noise(y=samples, sr=SAMPLE_RATE_HZ, stationary=False, prop_decrease=0.75)
    return _f32_to_raw(cleaned)


def has_speech(raw: bytes, threshold: float = 0.45) -> bool:
    """Retourne True si silero-vad détecte de la parole. True par défaut si lib absente."""
    silero = _get_silero()
    if silero is None:
        return True
    import torch
    model, get_ts = silero
    tensor = torch.from_numpy(_raw_to_f32(raw))
    ts = get_ts(tensor, model, sampling_rate=SAMPLE_RATE_HZ, threshold=threshold)
    return len(ts) > 0


def _process_audio(audio: sr.AudioData) -> sr.AudioData:
    """Pipeline complet : resample → silero-vad → noisereduce."""
    raw = audio.get_raw_data(convert_rate=SAMPLE_RATE_HZ, convert_width=2)
    raw = denoise(raw)
    return _to_audio_data(raw)


PIECES = {
    'roi': chess.KING,
    'dame': chess.QUEEN,
    'tour': chess.ROOK,
    'fou': chess.BISHOP,
    'cavalier': chess.KNIGHT,
    'pion': chess.PAWN,
}

PROMOTIONS = {
    'dame': chess.QUEEN,
    'tour': chess.ROOK,
    'fou': chess.BISHOP,
    'cavalier': chess.KNIGHT,
}

CASTLING = {
    'petit roque': {'w': 'e1g1', 'b': 'e8g8'},
    'grand roque': {'w': 'e1c1', 'b': 'e8c8'},
}


class VoiceInput:
    def __init__(self, board: chess.Board, device_index: int | None = None):
        self.board = board
        self.device_index = device_index
        self.recognizer = sr.Recognizer()
        self.recognizer.dynamic_energy_threshold = True
        self._stop_vad = None

    def start_vad(self, callback) -> None:
        """Démarre l'écoute continue. callback(text: str | None) appelé à chaque phrase."""
        if self._stop_vad:
            return

        def _on_audio(recognizer: sr.Recognizer, audio: sr.AudioData) -> None:
            raw = audio.get_raw_data(convert_rate=SAMPLE_RATE_HZ, convert_width=2)

            raw = denoise(raw)
            audio_clean = _to_audio_data(raw)

            try:
                text = recognizer.recognize_google(audio_clean, language="fr-FR").lower()
                logger.info(f"VAD reconnu: {text}")
            except sr.UnknownValueError:
                text = None
            except sr.RequestError as e:
                logger.error(f"VAD erreur STT: {e}")
                text = None
            callback(text)

        mic = sr.Microphone(device_index=self.device_index)
        with mic as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
        self._stop_vad = self.recognizer.listen_in_background(mic, _on_audio, phrase_time_limit=4)
        logger.info("VAD démarré")

    def stop_vad(self) -> None:
        if self._stop_vad:
            self._stop_vad(wait_for_stop=False)
            self._stop_vad = None
            logger.info("VAD arrêté")

    def listen(self) -> str | None:
        with sr.Microphone(device_index=self.device_index) as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.3)
            logger.info("Écoute...")
            try:
                audio = self.recognizer.listen(source, timeout=10)
            except sr.WaitTimeoutError:
                return None

        try:
            audio_clean = _process_audio(audio)
            text = self.recognizer.recognize_google(audio_clean, language="fr-FR")
            logger.info(f"Reconnu: {text}")
            return text.lower()
        except sr.UnknownValueError:
            logger.warning("Non reconnu")
            return None
        except sr.RequestError as e:
            logger.error(f"Erreur STT: {e}")
            return None

    def parse(self, command: str) -> str | None:
        """Convertit une commande vocale FR en notation UCI."""
        if not command:
            return None
        raw = command
        command = normalize_fr(command)
        logger.info(f"parse: {raw!r} → norm: {command!r}")

        if command in ('quitter', 'quit', 'stop', 'fin'):
            return 'quit'
        if command in ('annuler', 'undo', 'retour'):
            return 'undo'

        for roque_text, moves in CASTLING.items():
            if roque_text in command:
                side = 'w' if self.board.turn == chess.WHITE else 'b'
                uci = moves[side]
                move = chess.Move.from_uci(uci)
                if move in self.board.legal_moves:
                    return uci
                logger.warning(f"Roque impossible: {roque_text}")
                return None

        promo_piece = None
        promo_match = re.search(r'promotion\s+(?:en\s+)?(\w+)', command)
        if promo_match:
            promo_piece = PROMOTIONS.get(promo_match.group(1))
            command = re.sub(r'promotion\s+(?:en\s+)?\w+', '', command).strip()

        is_ep = 'en passant' in command
        if is_ep:
            command = command.replace('en passant', '').strip()

        piece_move = re.search(r'(roi|dame|tour|fou|cavalier|pion)\s+([a-h][1-8])', command)
        if piece_move:
            result = self._find_piece_move(piece_move.group(1), piece_move.group(2), promo_piece, is_ep)
            logger.info(f"  branche pièce+case [{piece_move.group(1)} {piece_move.group(2)}] → {result!r}")
            return result

        direct = re.search(r'([a-h][1-8])\s*([a-h][1-8])', command)
        if direct:
            result = self._build_uci(direct.group(1) + direct.group(2), promo_piece, is_ep)
            logger.info(f"  branche UCI direct [{direct.group(0)}] → {result!r}")
            return result

        single = re.search(r'\b([a-h][1-8])\b', command)
        if single:
            result = self._find_pawn_move(single.group(1), promo_piece, is_ep)
            logger.info(f"  branche pion [{single.group(1)}] → {result!r}")
            return result

        piece_file = re.search(r'(roi|dame|tour|fou|cavalier|pion)\s+([a-h])$', command)
        if piece_file:
            result = self._find_piece_on_file(piece_file.group(1), piece_file.group(2))
            logger.info(f"  branche pièce+colonne [{piece_file.group(1)} {piece_file.group(2)}] → {result!r}")
            return result

        piece_only = re.search(r'^(roi|dame|tour|fou|cavalier|pion)$', command.strip())
        if piece_only:
            result = self._piece_only(piece_only.group(1))
            logger.info(f"  branche pièce seule [{piece_only.group(1)}] → {result!r}")
            return result

        logger.warning(f"Format non reconnu: {command!r} (aucune branche ne correspond)")
        return None

    def _build_uci(self, base: str, promo=None, is_ep=False) -> str | None:
        from_sq = chess.parse_square(base[:2])
        to_sq = chess.parse_square(base[2:])
        if promo is None:
            piece = self.board.piece_type_at(from_sq)
            if piece == chess.PAWN and chess.square_rank(to_sq) in (0, 7):
                promo = chess.QUEEN
        uci = base + (chess.piece_symbol(promo) if promo else '')
        try:
            move = chess.Move.from_uci(uci)
            if move in self.board.legal_moves:
                if is_ep and not self.board.is_en_passant(move):
                    logger.warning("Prise en passant impossible ici")
                    return None
                return uci
        except ValueError:
            pass
        return None

    def _find_pawn_move(self, target: str, promo=None, is_ep=False) -> str | None:
        to_sq = chess.parse_square(target)
        for move in self.board.legal_moves:
            if move.to_square == to_sq and self.board.piece_type_at(move.from_square) == chess.PAWN:
                if is_ep and not self.board.is_en_passant(move):
                    continue
                base = chess.square_name(move.from_square) + target
                return self._build_uci(base, promo, is_ep)
        return None

    def _find_piece_move(self, piece_name: str, target: str, promo=None, is_ep=False) -> str | None:
        piece_type = PIECES.get(piece_name)
        to_sq = chess.parse_square(target)
        candidates = [
            m for m in self.board.legal_moves
            if m.to_square == to_sq and self.board.piece_type_at(m.from_square) == piece_type
        ]
        if len(candidates) == 1:
            base = chess.square_name(candidates[0].from_square) + target
            return self._build_uci(base, promo, is_ep)
        if len(candidates) > 1:
            logger.warning(f"Coup ambigu pour {piece_name} vers {target}")
        return None

    def _find_piece_on_file(self, piece_name: str, file_letter: str) -> str | None:
        """Pièce + colonne seulement : 'dame d' → cherche coup unique sur colonne d."""
        piece_type = PIECES.get(piece_name)
        file_idx = ord(file_letter) - ord('a')
        candidates = [
            m for m in self.board.legal_moves
            if (self.board.piece_type_at(m.from_square) == piece_type
                and chess.square_file(m.to_square) == file_idx)
        ]
        if len(candidates) == 1:
            return candidates[0].uci()
        if candidates:
            squares = ", ".join(sorted({chess.square_name(m.to_square) for m in candidates}))
            logger.warning(f"{piece_name} colonne {file_letter} ambigu: {squares}")
            return f"AMBIG:{piece_name}:{squares}"
        return None

    def _piece_only(self, piece_name: str) -> str | None:
        piece_type = PIECES.get(piece_name)
        candidates = [
            m for m in self.board.legal_moves
            if self.board.piece_type_at(m.from_square) == piece_type
        ]
        if len(candidates) == 1:
            return candidates[0].uci()
        if candidates:
            squares = ", ".join(sorted({chess.square_name(m.to_square) for m in candidates}))
            logger.warning(f"{piece_name} ambigu — cases possibles: {squares}")
            return f"AMBIG:{piece_name}:{squares}"
        logger.warning(f"{piece_name} ne peut pas bouger")
        return None
