"""Interface graphique pygame — échiquier cliquable + panneau coaching."""
import math
import struct
import threading
import random
from collections import deque
import chess
import pygame
from src.voice_input import VoiceInput, normalize_fr

SQ = 80
BOARD_PX = SQ * 8
PANEL_W = 300
WIN_W = BOARD_PX + PANEL_W
WIN_H = BOARD_PX

LIGHT      = (240, 217, 181)
DARK       = (181, 136, 99)
HL_SEL     = (130, 151, 105)
HL_LEGAL   = (100, 111, 64)
HL_LAST    = (205, 210, 106)
PANEL_BG   = (28, 28, 28)
TEXT_COL   = (220, 220, 220)
DIM_COL    = (140, 140, 140)
RED        = (210, 60, 60)
ORANGE     = (210, 150, 50)
GREEN      = (80, 190, 80)
BLUE       = (80, 140, 220)
DROPDOWN_BG = (45, 45, 45)
DROPDOWN_HL = (65, 65, 90)

PIECES = {
    (chess.PAWN,   chess.WHITE): "♙",
    (chess.KNIGHT, chess.WHITE): "♘",
    (chess.BISHOP, chess.WHITE): "♗",
    (chess.ROOK,   chess.WHITE): "♖",
    (chess.QUEEN,  chess.WHITE): "♕",
    (chess.KING,   chess.WHITE): "♔",
    (chess.PAWN,   chess.BLACK): "♟",
    (chess.KNIGHT, chess.BLACK): "♞",
    (chess.BISHOP, chess.BLACK): "♝",
    (chess.ROOK,   chess.BLACK): "♜",
    (chess.QUEEN,  chess.BLACK): "♛",
    (chess.KING,   chess.BLACK): "♚",
}

DD_ITEM_H = 26
DD_MAX_VISIBLE = 7


def _wrap(font: pygame.font.Font, text: str, max_w: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            candidate = line + word + " "
            if font.size(candidate)[0] > max_w and line:
                lines.append(line.rstrip())
                line = word + " "
            else:
                line = candidate
        if line:
            lines.append(line.rstrip())
    return lines or [""]


def _list_input_devices() -> list[tuple[int | None, str]]:
    result: list[tuple[int | None, str]] = [(None, "Défaut système")]
    try:
        import pyaudio
        p = pyaudio.PyAudio()
        seen: set[str] = set()
        for i in range(p.get_device_count()):
            info = p.get_device_info_by_index(i)
            if info["maxInputChannels"] > 0:
                name = info["name"]
                if name not in seen:
                    seen.add(name)
                    result.append((i, name[:42]))
        p.terminate()
    except Exception:
        pass
    return result


class ChessGUI:
    def __init__(self, coach=None, vs_ai: bool = False):
        pygame.init()
        self.screen = pygame.display.set_mode((WIN_W, WIN_H))
        pygame.display.set_caption("Chess Companion ♟")
        self.clock = pygame.time.Clock()

        self.f_piece  = pygame.font.SysFont("segoeuisymbol,symbola,unifont", 58)
        self.f_coord  = pygame.font.SysFont("segoeui", 13)
        self.f_ui     = pygame.font.SysFont("segoeui", 17)
        self.f_big    = pygame.font.SysFont("segoeui", 20, bold=True)
        self.f_input  = pygame.font.SysFont("consolas", 17)
        self.f_log    = pygame.font.SysFont("consolas", 12)

        self.board = chess.Board()
        self.coach = coach

        self.selected: int | None = None
        self.legal_dests: set[int] = set()
        self.last_move: chess.Move | None = None

        self.feedback_text = ""
        self.feedback_type = "ok"

        self.move_history_san: list[str] = []
        self.move_history: list[tuple[chess.Board, chess.Move]] = []

        self.input_text = ""
        self.running = True
        self._tts_lock = threading.Lock()

        self.vs_ai = vs_ai
        self._engine_thinking = False
        self._player_color: bool = chess.WHITE

        self._log_lines: deque[tuple[str, str]] = deque(maxlen=6)
        self._log_lock = threading.Lock()

        self._mic_devices = _list_input_devices()
        self._mic_sel_idx = 0
        self._mic_dropdown_open = False
        self._mic_level = 0.0
        self._mic_dd_scroll = 0

        self._mic_dd_trigger = pygame.Rect(BOARD_PX + 8, WIN_H - 172, PANEL_W - 16, 28)
        btn_y = WIN_H - 106
        btn_w = (PANEL_W - 24) // 3
        self._mic_btn  = pygame.Rect(BOARD_PX + 8,                  btn_y, btn_w, 34)
        self._vad_btn  = pygame.Rect(BOARD_PX + 10 + btn_w,         btn_y, btn_w, 34)
        self._vsai_btn = pygame.Rect(BOARD_PX + 12 + btn_w * 2,     btn_y, btn_w, 34)

        self._vad_active = False

        self._voice = VoiceInput(self.board, device_index=None)
        self._listening = False

        self._start_level_monitor()


    def _add_log(self, msg: str, typ: str = "info") -> None:
        """typ: info | ok | err | dim"""
        with self._log_lock:
            self._log_lines.append((msg[:52], typ))


    def _current_device_idx(self) -> int | None:
        return self._mic_devices[self._mic_sel_idx][0]

    def _set_mic_device(self, list_idx: int) -> None:
        self._mic_sel_idx = list_idx
        self._mic_dropdown_open = False
        dev_idx = self._mic_devices[list_idx][0]
        self._voice = VoiceInput(self.board, device_index=dev_idx)
        self._add_log(f"Micro: {self._mic_devices[list_idx][1][:30]}", "info")

    def _start_level_monitor(self) -> None:
        def _run():
            import pyaudio
            CHUNK = 512
            while self.running:
                dev_idx = self._current_device_idx()
                try:
                    p = pyaudio.PyAudio()
                    stream = p.open(
                        format=pyaudio.paInt16, channels=1, rate=16000,
                        input=True, frames_per_buffer=CHUNK,
                        input_device_index=dev_idx,
                    )
                    while self.running and self._current_device_idx() == dev_idx:
                        data = stream.read(CHUNK, exception_on_overflow=False)
                        samples = struct.unpack(f"<{len(data)//2}h", data)
                        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
                        self._mic_level = min(1.0, rms / 2500)
                    stream.stop_stream(); stream.close(); p.terminate()
                except Exception:
                    self._mic_level = 0.0
                    import time; time.sleep(1)
        threading.Thread(target=_run, daemon=True).start()


    def _sq_px(self, sq: int) -> tuple[int, int]:
        f, r = chess.square_file(sq), chess.square_rank(sq)
        if self._player_color == chess.BLACK:
            return (7 - f) * SQ, r * SQ
        return f * SQ, (7 - r) * SQ

    def _px_sq(self, x: int, y: int) -> int | None:
        if not (0 <= x < BOARD_PX and 0 <= y < WIN_H):
            return None
        if self._player_color == chess.BLACK:
            return chess.square(7 - x // SQ, y // SQ)
        return chess.square(x // SQ, 7 - y // SQ)


    def _draw_board(self) -> None:
        for sq in chess.SQUARES:
            f, r = chess.square_file(sq), chess.square_rank(sq)
            if self._player_color == chess.BLACK:
                x, y = (7 - f) * SQ, r * SQ
            else:
                x, y = f * SQ, (7 - r) * SQ
            col = LIGHT if (f + r) % 2 == 1 else DARK
            if sq == self.selected:
                col = HL_SEL
            elif self.last_move and sq in (self.last_move.from_square, self.last_move.to_square):
                col = HL_LAST
            pygame.draw.rect(self.screen, col, (x, y, SQ, SQ))
            if sq in self.legal_dests:
                cx, cy = x + SQ // 2, y + SQ // 2
                if self.board.piece_at(sq):
                    pygame.draw.circle(self.screen, HL_LEGAL, (cx, cy), SQ // 2 - 4, 5)
                else:
                    pygame.draw.circle(self.screen, HL_LEGAL, (cx, cy), 11)

    def _draw_pieces(self) -> None:
        for sq in chess.SQUARES:
            piece = self.board.piece_at(sq)
            if not piece:
                continue
            glyph = PIECES[(piece.piece_type, piece.color)]
            x, y = self._sq_px(sq)
            cx, cy = x + SQ // 2, y + SQ // 2
            shadow = self.f_piece.render(glyph, True, (0, 0, 0))
            self.screen.blit(shadow, shadow.get_rect(center=(cx + 2, cy + 2)))
            col = (255, 255, 255) if piece.color == chess.WHITE else (15, 15, 15)
            surf = self.f_piece.render(glyph, True, col)
            self.screen.blit(surf, surf.get_rect(center=(cx, cy)))

    def _draw_coords(self) -> None:
        for f in range(8):
            col = DARK if f % 2 == 1 else LIGHT
            letter = chr(ord("a") + (7 - f if self._player_color == chess.BLACK else f))
            s = self.f_coord.render(letter, True, col)
            self.screen.blit(s, (f * SQ + SQ - 13, WIN_H - 15))
        for r in range(8):
            col = LIGHT if r % 2 == 1 else DARK
            rank_num = r + 1 if self._player_color == chess.BLACK else 8 - r
            s = self.f_coord.render(str(rank_num), True, col)
            self.screen.blit(s, (3, r * SQ + 3))

    def _draw_panel(self) -> None:
        pygame.draw.rect(self.screen, PANEL_BG, (BOARD_PX, 0, PANEL_W, WIN_H))
        x0 = BOARD_PX + 14
        max_w = PANEL_W - 28
        y = 14

        self.screen.blit(self.f_big.render("♟  Chess Companion", True, TEXT_COL), (x0, y)); y += 34

        if self.board.is_checkmate():
            winner = "Noirs" if self.board.turn == chess.WHITE else "Blancs"
            status, scol = f"♚ Mat — {winner} gagnent!", RED
        elif self.board.is_stalemate():
            status, scol = "½ Pat — match nul", DIM_COL
        elif self.board.is_check():
            status, scol = "⚠  ÉCHEC !", ORANGE
        else:
            turn = "Blancs" if self.board.turn == chess.WHITE else "Noirs"
            you = "Blancs" if self._player_color == chess.WHITE else "Noirs"
            mode = f" [vs IA, tu joues {you}]" if self.vs_ai else ""
            status, scol = f"▶  Trait aux {turn}  ({self.board.fullmove_number}){mode}", GREEN
        self.screen.blit(self.f_ui.render(status, True, scol), (x0, y)); y += 28

        pygame.draw.line(self.screen, (70, 70, 70), (x0, y), (x0 + max_w, y)); y += 10

        if self._engine_thinking:
            dots = "." * (1 + (pygame.time.get_ticks() // 400) % 3)
            self.screen.blit(self.f_ui.render(f"♟ Stockfish réfléchit{dots}", True, ORANGE), (x0, y)); y += 26

        if self.feedback_text:
            fcol = RED if self.feedback_type == "blunder" else (ORANGE if self.feedback_type == "mistake" else GREEN)
            for line in _wrap(self.f_ui, self.feedback_text, max_w):
                self.screen.blit(self.f_ui.render(line, True, fcol), (x0, y)); y += 22
            y += 4

        pygame.draw.line(self.screen, (70, 70, 70), (x0, y), (x0 + max_w, y)); y += 8

        self.screen.blit(self.f_coord.render("HISTORIQUE", True, DIM_COL), (x0, y)); y += 16
        half_moves = self.move_history_san
        start_pair = max(0, (len(half_moves) - 1) // 2 - 4)
        LOG_SECTION_PX = 80
        log_top = self._mic_dd_trigger.top - LOG_SECTION_PX
        for pair in range(start_pair, (len(half_moves) + 1) // 2):
            if y + 18 > log_top:
                break
            w_idx, b_idx = pair * 2, pair * 2 + 1
            w = half_moves[w_idx] if w_idx < len(half_moves) else ""
            b = half_moves[b_idx] if b_idx < len(half_moves) else ""
            self.screen.blit(self.f_ui.render(f"{pair + 1}.  {w:<8} {b}", True, (175, 175, 175)), (x0, y)); y += 18

        log_y = self._mic_dd_trigger.top - 78
        pygame.draw.line(self.screen, (70, 70, 70), (x0, log_y), (x0 + max_w, log_y)); log_y += 6
        self.screen.blit(self.f_coord.render("LOG VOIX", True, DIM_COL), (x0, log_y)); log_y += 14
        LOG_TYPE_COL = {"info": DIM_COL, "ok": GREEN, "err": RED, "dim": (110, 110, 110)}
        with self._log_lock:
            lines_snap = list(self._log_lines)
        for msg, typ in lines_snap[-4:]:
            col = LOG_TYPE_COL.get(typ, DIM_COL)
            self.screen.blit(self.f_log.render(msg, True, col), (x0, log_y)); log_y += 13

        mic_x = BOARD_PX + 8
        mic_label_y = self._mic_dd_trigger.top - 18
        self.screen.blit(self.f_coord.render("MICROPHONE", True, DIM_COL), (x0, mic_label_y))

        tr = self._mic_dd_trigger
        pygame.draw.rect(self.screen, (50, 50, 50), tr, border_radius=4)
        pygame.draw.rect(self.screen, (100, 100, 100), tr, 1, border_radius=4)
        dev_name = self._mic_devices[self._mic_sel_idx][1]
        name_surf = self.f_coord.render(dev_name[:38], True, TEXT_COL)
        arrow = self.f_coord.render("▾", True, DIM_COL)
        self.screen.blit(name_surf, (tr.x + 6, tr.y + 7))
        self.screen.blit(arrow, (tr.right - 18, tr.y + 7))

        bar_y = tr.bottom + 5
        bar_w = PANEL_W - 16
        bar_h = 8
        pygame.draw.rect(self.screen, (50, 50, 50), (mic_x, bar_y, bar_w, bar_h), border_radius=3)
        fill = int(bar_w * self._mic_level)
        if fill > 0:
            lvl_col = GREEN if self._mic_level < 0.7 else (ORANGE if self._mic_level < 0.9 else RED)
            pygame.draw.rect(self.screen, lvl_col, (mic_x, bar_y, fill, bar_h), border_radius=3)
        lvl_pct = self.f_coord.render(f"Niveau : {int(self._mic_level * 100)}%", True, DIM_COL)
        self.screen.blit(lvl_pct, (mic_x, bar_y + bar_h + 2))

        pulse = abs((pygame.time.get_ticks() % 800) - 400) / 400
        if self._listening:
            ptt_col, ptt_label = (int(180 + 40 * pulse), 50, 50), "Écoute…"
        else:
            ptt_col, ptt_label = (55, 55, 55), "🎤 [Spc]"
        pygame.draw.rect(self.screen, ptt_col, self._mic_btn, border_radius=6)
        pygame.draw.rect(self.screen, (110, 110, 110), self._mic_btn, 1, border_radius=6)
        self.screen.blit(
            self.f_ui.render(ptt_label, True, TEXT_COL),
            self.f_ui.render(ptt_label, True, TEXT_COL).get_rect(center=self._mic_btn.center)
        )

        if self._vad_active:
            vad_col, vad_label = (40, int(130 + 50 * pulse), 40), "VAD ON"
        else:
            vad_col, vad_label = (55, 55, 55), "VAD"
        pygame.draw.rect(self.screen, vad_col, self._vad_btn, border_radius=6)
        pygame.draw.rect(self.screen, (110, 110, 110), self._vad_btn, 1, border_radius=6)
        self.screen.blit(
            self.f_ui.render(vad_label, True, TEXT_COL),
            self.f_ui.render(vad_label, True, TEXT_COL).get_rect(center=self._vad_btn.center)
        )

        if self.vs_ai:
            vsai_col = (40, 80, int(160 + 50 * pulse))
            you = "B" if self._player_color == chess.WHITE else "N"
            vsai_label = f"IA ({you})"
        else:
            vsai_col, vsai_label = (55, 55, 55), "VS IA"
        pygame.draw.rect(self.screen, vsai_col, self._vsai_btn, border_radius=6)
        pygame.draw.rect(self.screen, (110, 110, 110), self._vsai_btn, 1, border_radius=6)
        self.screen.blit(
            self.f_ui.render(vsai_label, True, TEXT_COL),
            self.f_ui.render(vsai_label, True, TEXT_COL).get_rect(center=self._vsai_btn.center)
        )

        iy = WIN_H - 60
        pygame.draw.rect(self.screen, (50, 50, 50), (mic_x, iy, PANEL_W - 16, 32), border_radius=5)
        pygame.draw.rect(self.screen, (110, 110, 110), (mic_x, iy, PANEL_W - 16, 32), 1, border_radius=5)
        blink = "|" if pygame.time.get_ticks() % 900 < 450 else ""
        self.screen.blit(self.f_input.render(self.input_text + blink, True, TEXT_COL), (mic_x + 6, iy + 7))

        hint = self.f_coord.render("clique · [Spc]=micro · [Enter] · undo · quit", True, (75, 75, 75))
        self.screen.blit(hint, (mic_x, WIN_H - 16))

        if self._mic_dropdown_open:
            self._draw_dropdown()

    def _draw_dropdown(self) -> None:
        devices = self._mic_devices
        visible = min(len(devices), DD_MAX_VISIBLE)
        list_h = visible * DD_ITEM_H
        lx = self._mic_dd_trigger.x
        ly = self._mic_dd_trigger.top - list_h - 2
        lw = self._mic_dd_trigger.width

        pygame.draw.rect(self.screen, DROPDOWN_BG, (lx, ly, lw, list_h), border_radius=4)
        pygame.draw.rect(self.screen, (110, 110, 110), (lx, ly, lw, list_h), 1, border_radius=4)

        mx, my = pygame.mouse.get_pos()
        for i, (dev_idx, name) in enumerate(devices[self._mic_dd_scroll: self._mic_dd_scroll + visible]):
            real_i = i + self._mic_dd_scroll
            iy = ly + i * DD_ITEM_H
            row_rect = pygame.Rect(lx + 1, iy, lw - 2, DD_ITEM_H)
            if row_rect.collidepoint(mx, my):
                pygame.draw.rect(self.screen, DROPDOWN_HL, row_rect)
            if real_i == self._mic_sel_idx:
                pygame.draw.rect(self.screen, (70, 90, 70), row_rect)
            label = ("✓ " if real_i == self._mic_sel_idx else "  ") + name[:38]
            self.screen.blit(self.f_coord.render(label, True, TEXT_COL), (lx + 6, iy + 6))

        self._dropdown_list_rect = pygame.Rect(lx, ly, lw, list_h)
        self._dropdown_list_top_y = ly


    def _show_color_picker(self) -> None:
        """Blocking overlay: user picks Blancs / Noirs / Hasard."""
        overlay = pygame.Surface((WIN_W, WIN_H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))

        bw, bh = 180, 60
        gap = 24
        total_w = bw * 3 + gap * 2
        bx0 = (WIN_W - total_w) // 2
        by = WIN_H // 2 + 10

        btn_white  = pygame.Rect(bx0,              by, bw, bh)
        btn_black  = pygame.Rect(bx0 + bw + gap,   by, bw, bh)
        btn_rand   = pygame.Rect(bx0 + (bw + gap)*2, by, bw, bh)

        f_title = pygame.font.SysFont("segoeui", 28, bold=True)
        f_btn   = pygame.font.SysFont("segoeui", 20, bold=True)

        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                    return
                if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    self.running = False
                    return
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if btn_white.collidepoint(event.pos):
                        self._player_color = chess.WHITE
                        return
                    if btn_black.collidepoint(event.pos):
                        self._player_color = chess.BLACK
                        return
                    if btn_rand.collidepoint(event.pos):
                        self._player_color = random.choice([chess.WHITE, chess.BLACK])
                        return

            self.screen.fill((20, 20, 20))
            self._draw_board()
            self._draw_pieces()
            self._draw_panel()
            self.screen.blit(overlay, (0, 0))

            title = f_title.render("Choisir ta couleur", True, (230, 230, 230))
            self.screen.blit(title, title.get_rect(center=(WIN_W // 2, WIN_H // 2 - 48)))

            mx, my = pygame.mouse.get_pos()
            for btn, label, base_col in [
                (btn_white, "♔ Blancs",  (220, 220, 200)),
                (btn_black, "♚ Noirs",   (40, 40, 40)),
                (btn_rand,  "?  Hasard", (80, 80, 120)),
            ]:
                hover = btn.collidepoint(mx, my)
                col = tuple(min(255, c + 30) for c in base_col) if hover else base_col
                pygame.draw.rect(self.screen, col, btn, border_radius=8)
                pygame.draw.rect(self.screen, (180, 180, 180), btn, 2, border_radius=8)
                text_col = (20, 20, 20) if label.startswith("♔") else (220, 220, 220)
                surf = f_btn.render(label, True, text_col)
                self.screen.blit(surf, surf.get_rect(center=btn.center))

            pygame.display.flip()
            self.clock.tick(60)


    def _tts(self, text: str) -> None:
        def _run():
            with self._tts_lock:
                from src.tts import speak
                speak(text)
        threading.Thread(target=_run, daemon=True).start()

    def _coach_async(self, board_snap: chess.Board, move: chess.Move) -> None:
        def _run():
            try:
                ev = self.coach.assess_move(board_snap, move)
                fb = ev.feedback(board_snap, move)
                self.feedback_text = fb
                self.feedback_type = "blunder" if ev.is_blunder else ("mistake" if ev.is_mistake else "ok")
                if fb:
                    self._tts(fb)
                    self._add_log(f"Coach: {fb[:45]}", "ok" if not ev.is_blunder else "err")
            except Exception as e:
                self._add_log(f"Coach err: {e}", "err")
        threading.Thread(target=_run, daemon=True).start()

    def execute_move(self, move: chess.Move) -> None:
        if move not in self.board.legal_moves:
            return
        from src.tts import describe_move
        self._tts(describe_move(self.board, move))
        if self.coach:
            self._coach_async(self.board.copy(), move)
        san = self.board.san(move)
        self.move_history_san.append(san)
        self.move_history.append((self.board.copy(), move))
        self.board.push(move)
        self.last_move = move
        self.selected = None
        self.legal_dests = set()
        if self.vs_ai and not self.board.is_game_over() and self.board.turn == self._ai_color():
            self._trigger_engine()

    def _ai_color(self) -> bool:
        return chess.BLACK if self._player_color == chess.WHITE else chess.WHITE

    def _trigger_engine(self) -> None:
        if not self.coach or self._engine_thinking or self.board.is_game_over():
            return
        if not self.vs_ai:
            return
        self._engine_thinking = True
        self._add_log("Stockfish réfléchit…", "info")

        def _run():
            try:
                move = self.coach.best_move(self.board)
                if move and move in self.board.legal_moves:
                    from src.tts import describe_move
                    san = self.board.san(move)
                    self._tts(describe_move(self.board, move))
                    self.move_history_san.append(san)
                    self.move_history.append((self.board.copy(), move))
                    self.board.push(move)
                    self.last_move = move
                    self.feedback_text = f"Stockfish joue {san}"
                    self.feedback_type = "ok"
                    self._add_log(f"Stockfish: {san}", "ok")
            except Exception as e:
                self.feedback_text = f"Erreur engine: {e}"
                self._add_log(f"Engine err: {e}", "err")
            finally:
                self._engine_thinking = False

        threading.Thread(target=_run, daemon=True).start()

    def _toggle_vsai(self) -> None:
        if not self.coach:
            self.feedback_text = "Stockfish non disponible — lance avec --vs-ai"
            self.feedback_type = "ok"
            self._add_log("Pas de Stockfish", "err")
            return
        self.vs_ai = not self.vs_ai
        if self.vs_ai:
            self._add_log("VS IA activé", "ok")
            self.feedback_text = "Mode VS IA activé"
            if self.board.turn == self._ai_color():
                self._trigger_engine()
        else:
            self._add_log("VS IA désactivé", "info")
            self.feedback_text = "Mode VS IA désactivé"

    def _toggle_vad(self) -> None:
        if self._vad_active:
            self._voice.stop_vad()
            self._vad_active = False
            self.feedback_text = "VAD désactivé"
            self._add_log("VAD OFF", "info")
        else:
            def _vad_callback(text: str | None) -> None:
                if not text:
                    return
                self._add_log(f"STT: {text!r}", "dim")
                normalized = normalize_fr(text)
                self._add_log(f"→ norm: {normalized!r}", "dim")
                uci = self._voice.parse(text)
                self._add_log(f"→ UCI: {uci!r}", "ok" if uci else "err")
                if not uci:
                    return
                if uci == "quit":
                    self.running = False
                elif uci == "undo":
                    if self.board.move_stack:
                        self.board.pop()
                        if self.move_history: self.move_history.pop()
                        if self.move_history_san: self.move_history_san.pop()
                        self.last_move = self.board.peek() if self.board.move_stack else None
                        self.feedback_text = ""
                elif uci.startswith("AMBIG:"):
                    _, piece, squares = uci.split(":", 2)
                    self.feedback_text = f"Précise la case pour le {piece} : {squares}"
                    self.feedback_type = "ok"
                else:
                    try:
                        move = chess.Move.from_uci(uci)
                        if move in self.board.legal_moves:
                            self.execute_move(move)
                        else:
                            self.feedback_text = f"Coup illégal : {uci}"
                            self._add_log(f"Illégal: {uci}", "err")
                    except ValueError:
                        self.feedback_text = f"Non reconnu : {text}"
                        self._add_log(f"ValueError: {uci}", "err")

            try:
                self._voice.start_vad(_vad_callback)
                self._vad_active = True
                self.feedback_text = "VAD activé — parle librement"
                self._add_log("VAD ON", "ok")
            except Exception as e:
                self.feedback_text = f"VAD impossible : {e}"
                self._add_log(f"VAD err: {e}", "err")

    def _start_listening(self) -> None:
        if self._listening:
            return
        self._listening = True

        def _worker():
            try:
                text = self._voice.listen()
                if text:
                    self._add_log(f"STT: {text!r}", "dim")
                    normalized = normalize_fr(text)
                    self._add_log(f"→ norm: {normalized!r}", "dim")
                    uci = self._voice.parse(text)
                    self._add_log(f"→ UCI: {uci!r}", "ok" if uci else "err")
                    if uci == "quit":
                        self.running = False
                    elif uci == "undo":
                        if self.board.move_stack:
                            self.board.pop()
                            if self.move_history: self.move_history.pop()
                            if self.move_history_san: self.move_history_san.pop()
                            self.last_move = self.board.peek() if self.board.move_stack else None
                            self.feedback_text = ""
                    elif uci:
                        if uci.startswith("AMBIG:"):
                            _, piece, squares = uci.split(":", 2)
                            self.feedback_text = f"Précise la case pour le {piece} : {squares}"
                            self.feedback_type = "ok"
                        else:
                            try:
                                move = chess.Move.from_uci(uci)
                                if move in self.board.legal_moves:
                                    self.execute_move(move)
                                else:
                                    self.feedback_text = f"Coup illégal : {uci}"
                                    self._add_log(f"Illégal: {uci}", "err")
                            except ValueError:
                                self.feedback_text = f"Non reconnu : {text}"
                                self._add_log(f"ValueError: {uci}", "err")
                    else:
                        self.feedback_text = f"Non reconnu : {text!r}"
                        self._add_log(f"Non reconnu: {text!r}", "err")
                else:
                    self.feedback_text = "Rien capté — vérifie le micro"
                    self._add_log("Rien capté", "err")
            finally:
                self._listening = False

        threading.Thread(target=_worker, daemon=True).start()

    def _handle_panel_click(self, pos: tuple[int, int]) -> None:
        x, y = pos

        if self._mic_dropdown_open and hasattr(self, "_dropdown_list_rect"):
            if self._dropdown_list_rect.collidepoint(x, y):
                item_i = (y - self._dropdown_list_top_y) // DD_ITEM_H + self._mic_dd_scroll
                if 0 <= item_i < len(self._mic_devices):
                    self._set_mic_device(item_i)
                return
            else:
                self._mic_dropdown_open = False
                return

        if self._mic_dd_trigger.collidepoint(x, y):
            self._mic_dropdown_open = not self._mic_dropdown_open
            self._mic_dd_scroll = max(0, self._mic_sel_idx - DD_MAX_VISIBLE + 1)
            return

        if self._mic_btn.collidepoint(x, y):
            self._start_listening()
            return

        if self._vad_btn.collidepoint(x, y):
            self._toggle_vad()
            return

        if self._vsai_btn.collidepoint(x, y):
            self._toggle_vsai()
            return

    def _handle_click(self, pos: tuple[int, int]) -> None:
        x, y = pos
        if x >= BOARD_PX:
            self._handle_panel_click(pos)
            return
        if self._mic_dropdown_open:
            self._mic_dropdown_open = False

        sq = self._px_sq(x, y)
        if sq is None:
            return

        if self.selected is None:
            piece = self.board.piece_at(sq)
            if piece and piece.color == self.board.turn:
                self.selected = sq
                self.legal_dests = {m.to_square for m in self.board.legal_moves if m.from_square == sq}
        else:
            if sq in self.legal_dests:
                move = chess.Move(self.selected, sq)
                p = self.board.piece_at(self.selected)
                if p and p.piece_type == chess.PAWN and chess.square_rank(sq) in (0, 7):
                    move = chess.Move(self.selected, sq, promotion=chess.QUEEN)
                self.execute_move(move)
            elif self.board.piece_at(sq) and self.board.piece_at(sq).color == self.board.turn:
                self.selected = sq
                self.legal_dests = {m.to_square for m in self.board.legal_moves if m.from_square == sq}
            else:
                self.selected = None
                self.legal_dests = set()

    def _handle_enter(self) -> None:
        text = self.input_text.strip().lower()
        self.input_text = ""
        if not text:
            return
        if text in ("quit", "q", "exit"):
            self.running = False
            return
        if text in ("undo", "u"):
            if self.board.move_stack:
                self.board.pop()
                if self.move_history: self.move_history.pop()
                if self.move_history_san: self.move_history_san.pop()
                self.last_move = self.board.peek() if self.board.move_stack else None
                self.feedback_text = ""
            return
        self._add_log(f"Texte: {text!r}", "dim")
        normalized = normalize_fr(text)
        self._add_log(f"→ norm: {normalized!r}", "dim")
        uci = VoiceInput(self.board, device_index=self._current_device_idx()).parse(text)
        self._add_log(f"→ UCI: {uci!r}", "ok" if uci and uci not in ("quit","undo") else "err")
        if uci and uci not in ("quit", "undo"):
            if uci.startswith("AMBIG:"):
                _, piece, squares = uci.split(":", 2)
                self.feedback_text = f"Précise la case pour le {piece} : {squares}"
                self.feedback_type = "ok"
                return
            try:
                move = chess.Move.from_uci(uci)
                if move in self.board.legal_moves:
                    self.execute_move(move)
                    return
                else:
                    self._add_log(f"Illégal: {uci}", "err")
            except ValueError:
                pass
        self.feedback_text = f"Non reconnu : {text}"
        self.feedback_type = "ok"


    def run(self) -> tuple[chess.Board, list]:
        import signal

        def _sigint(_sig, _frame):
            self.running = False
        signal.signal(signal.SIGINT, _sigint)

        self._show_color_picker()
        if not self.running:
            pygame.quit()
            return self.board, self.move_history

        if self.vs_ai and self._player_color == chess.BLACK:
            self._trigger_engine()

        while self.running and not self.board.is_game_over():
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self._handle_click(event.pos)
                elif event.type == pygame.MOUSEWHEEL:
                    if self._mic_dropdown_open:
                        visible = min(len(self._mic_devices), DD_MAX_VISIBLE)
                        max_scroll = max(0, len(self._mic_devices) - visible)
                        self._mic_dd_scroll = max(0, min(max_scroll, self._mic_dd_scroll - event.y))
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_RETURN:
                        self._handle_enter()
                    elif event.key == pygame.K_SPACE and not self.input_text:
                        self._start_listening()
                    elif event.key == pygame.K_BACKSPACE:
                        self.input_text = self.input_text[:-1]
                    elif event.key == pygame.K_ESCAPE:
                        self._mic_dropdown_open = False
                        self.selected = None
                        self.legal_dests = set()
                    elif event.unicode and event.unicode.isprintable():
                        self.input_text += event.unicode

            self.screen.fill((20, 20, 20))
            self._draw_board()
            self._draw_pieces()
            self._draw_coords()
            self._draw_panel()
            pygame.display.flip()
            self.clock.tick(60)

        if self._vad_active:
            self._voice.stop_vad()
        pygame.quit()
        return self.board, self.move_history
