import { Chess } from 'chess.js'

export const PILOT_SANS = ('e4 Nf6 e5 Nd5 Bc4 e6 Nc3 Qg5 Qf3 Qxe5+ Nge2 Nb6 Bb3 g6 d4 Qf5 Qxf5 gxf5 ' +
  'Bf4 Kd8 Nb5 d6 O-O a6 Na3 Rg8 c4 a5 Rac1 a4 Bd1 Nc6 d5 exd5 Ng3 Bg7 Rc2 dxc4 Nxc4 Nxc4 Rxc4 ' +
  'a3 b3 Kd7 Nxf5 Ke6 Nxg7+ Rxg7 Re1+ Kd7 Bh6 Rg6 Bc1 b5 Rc3 Bb7 h3 Nb4 Bg4+ Kd8 Rce3 Bc6 Bf5 ' +
  'Rxg2+ Kf1 Rh2 Be4 Bxe4 Rxe4 Kd7 Re7+ Kc6 Rxf7 Rxh3 Bd2 Nxa2 Ra1 Rh1+').split(' ')

export const PILOT_LOSSES_STOCKFISH19_D20 = [0.0, 3.3, 1.3, 1.2, 6.8, 3.6, 2.1, 17.4, 34.5, 0.3, 0.1, 3.0, 0.7, 16.3,
  1.3, 3.8, 17.5, -0.2, 5.8, 8.1, 6.4, -0.5, 5.4, 0.8, 1.7, 0.0, -0.8, 0.9, 1.0, 0.9, 3.1, -0.1, -0.2,
  -0.9, 20.7, 3.4, 2.4, 2.5, -0.6, -0.0, 0.1, 4.2, 4.9, 15.0, 1.5, 30.3, -1.1, -0.1, 1.0, 2.4, 0.3,
  -1.3, 5.9, 9.5, 15.6, 1.6, 22.9, 1.7, 11.0, 31.3, 2.2, 0.3, 17.0, -3.0, -0.2, 88.6, 93.6, -0.1,
  -0.4, 73.5, 69.3, -0.1, 1.2, 3.4, 0.8, -0.1, 3.7, -0.2]

/** FEN avant le demi-coup `ply` (1-indexé), par rejeu — jamais écrite à la main. */
export function fenBeforePly(sans, ply) {
  const board = new Chess()
  for (const san of sans.slice(0, ply - 1)) board.move(san)
  return board.fen()
}
