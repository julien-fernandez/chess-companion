// GÉNÉRÉ — ne pas éditer à la main.
// Tiré depuis ontology-manager (kind: chess) par `npm run pull:ontology`.
// Source de vérité : data/ontology/chess-vocabulary.yaml
// Version tirée : 0.8.0
export const CHESS_VOCABULARY = {
  "version": "0.8.0",
  "slug": "chess-vocabulary",
  "entity_types": [
    {
      "key": "position",
      "label": "Position — un FEN, l'unité d'état de cette ontologie",
      "subtypes": [
        {
          "key": "opening",
          "label": "Ouverture"
        },
        {
          "key": "middlegame",
          "label": "Milieu de partie"
        },
        {
          "key": "endgame",
          "label": "Finale"
        }
      ]
    },
    {
      "key": "square",
      "label": "Case, qualifiée par sa valeur (Lasker)",
      "subtypes": [
        {
          "key": "weak_point",
          "label": "Point faible — indéfendable par un pion"
        },
        {
          "key": "strong_point",
          "label": "Point fort — tenu et non attaquable par un pion"
        },
        {
          "key": "important_point",
          "label": "Point important — décisif pour le plan en cours"
        },
        {
          "key": "less_essential_point",
          "label": "Point secondaire"
        }
      ]
    },
    {
      "key": "piece",
      "label": "Pièce",
      "subtypes": [
        {
          "key": "pawn",
          "label": "Pion"
        },
        {
          "key": "knight",
          "label": "Cavalier"
        },
        {
          "key": "bishop",
          "label": "Fou"
        },
        {
          "key": "rook",
          "label": "Tour"
        },
        {
          "key": "queen",
          "label": "Dame"
        },
        {
          "key": "king",
          "label": "Roi"
        }
      ]
    },
    {
      "key": "pawn_formation",
      "label": "Formation de pions",
      "subtypes": [
        {
          "key": "phalanx",
          "label": "Phalange — deux pions côte à côte (Lasker, le plus fort)"
        },
        {
          "key": "chain",
          "label": "Chaîne de pions, avec sa base (Nimzowitsch)"
        },
        {
          "key": "isolani",
          "label": "Pion dame isolé (Nimzowitsch)"
        },
        {
          "key": "doubled",
          "label": "Pion doublé (Lasker, le plus faible)"
        },
        {
          "key": "backward",
          "label": "Pion arriéré"
        },
        {
          "key": "blocked",
          "label": "Pion bloqué"
        },
        {
          "key": "isolated",
          "label": "Pion isolé"
        },
        {
          "key": "blocked_isolated",
          "label": "Pion isolé et bloqué (Lasker : « particularly weak »)"
        },
        {
          "key": "hanging",
          "label": "Pions pendants (Nimzowitsch)"
        },
        {
          "key": "passed",
          "label": "Pion passé"
        },
        {
          "key": "candidate",
          "label": "Pion candidat au passage (Nimzowitsch : « candidate »)"
        }
      ]
    },
    {
      "key": "line",
      "label": "Ligne — support des « lignes de force » décrites par les joueurs",
      "subtypes": [
        {
          "key": "file",
          "label": "Colonne"
        },
        {
          "key": "rank",
          "label": "Rangée"
        },
        {
          "key": "diagonal",
          "label": "Diagonale"
        }
      ]
    },
    {
      "key": "zone",
      "label": "Zone du plateau",
      "subtypes": [
        {
          "key": "centre",
          "label": "Centre propre — d4, d5, e4, e5 (Lasker)"
        },
        {
          "key": "extended_centre",
          "label": "Centre étendu — c3-c6 à f3-f6 (Lasker)"
        },
        {
          "key": "kingside",
          "label": "Aile roi"
        },
        {
          "key": "queenside",
          "label": "Aile dame"
        },
        {
          "key": "king_zone",
          "label": "Zone du roi — son abri et ses accès"
        },
        {
          "key": "theatre",
          "label": "Théâtre d'opérations (Nimzowitsch : « two theatres of war »)"
        }
      ]
    },
    {
      "key": "constellation",
      "label": "Constellation — groupe de pièces perçu comme une unité (Rowson)",
      "subtypes": [
        {
          "key": "castled_shelter",
          "label": "Abri du roi après le roque"
        },
        {
          "key": "fianchetto",
          "label": "Fianchetto"
        },
        {
          "key": "battery",
          "label": "Batterie — pièces alignées sur une même ligne"
        },
        {
          "key": "wedge",
          "label": "Coin enfoncé dans le camp adverse (Capablanca : « wedge formation »)"
        },
        {
          "key": "cluster",
          "label": "Amas de pièces sans fonction commune"
        }
      ]
    },
    {
      "key": "advance_post",
      "label": "Avant-poste (Lasker « advance post », Nimzowitsch « outpost »)",
      "subtypes": []
    },
    {
      "key": "corridor",
      "label": "Corridor — segment entre cloueur, cloué et pièce écrantée (Nimzowitsch)",
      "subtypes": []
    },
    {
      "key": "target",
      "label": "Cible — faiblesse fixée et attaquable (Lasker : « that Pawn therefore becomes the target »)",
      "subtypes": []
    },
    {
      "key": "move",
      "label": "Coup — un coup légal désigné en SAN, l'unité de l'étage plan (issue #7 point 4)",
      "subtypes": []
    },
    {
      "key": "threat",
      "label": "Menace immédiate",
      "subtypes": [
        {
          "key": "fork",
          "label": "Fourchette"
        },
        {
          "key": "pin",
          "label": "Clouage"
        },
        {
          "key": "skewer",
          "label": "Enfilade"
        },
        {
          "key": "discovered_attack",
          "label": "Attaque à la découverte"
        },
        {
          "key": "double_attack",
          "label": "Attaque double"
        },
        {
          "key": "mate_net",
          "label": "Réseau de mat"
        },
        {
          "key": "hanging_piece",
          "label": "Pièce en l'air, non défendue et attaquée"
        },
        {
          "key": "overload",
          "label": "Surcharge (Lasker : « overburdened with functions »)"
        },
        {
          "key": "zugzwang",
          "label": "Zugzwang (Nimzowitsch, laissé en allemand par son traducteur)"
        }
      ]
    }
  ],
  "relationship_types": [
    {
      "key": "occupies",
      "from": [
        "piece"
      ],
      "to": [
        "square"
      ],
      "label": "occupe"
    },
    {
      "key": "controls",
      "from": [
        "piece"
      ],
      "to": [
        "square"
      ],
      "label": "contrôle (≠ occupe — Nimzowitsch)"
    },
    {
      "key": "attacks",
      "from": [
        "piece"
      ],
      "to": [
        "piece"
      ],
      "label": "attaque"
    },
    {
      "key": "defends",
      "from": [
        "piece"
      ],
      "to": [
        "piece"
      ],
      "label": "défend"
    },
    {
      "key": "bears_on",
      "from": [
        "piece"
      ],
      "to": [
        "line"
      ],
      "label": "porte sur la ligne (Lasker : « bear on »)"
    },
    {
      "key": "guards",
      "from": [
        "piece"
      ],
      "to": [
        "square"
      ],
      "label": "assure une fonction de garde (Lasker : « function »)"
    },
    {
      "key": "blockades",
      "from": [
        "piece"
      ],
      "to": [
        "pawn_formation"
      ],
      "label": "bloque (Nimzowitsch : « blockader »)"
    },
    {
      "key": "overprotects",
      "from": [
        "piece"
      ],
      "to": [
        "square"
      ],
      "label": "surprotège (Nimzowitsch : « over-protection »)"
    },
    {
      "key": "contacts",
      "from": [
        "piece"
      ],
      "to": [
        "piece"
      ],
      "label": "est en contact avec (Nimzowitsch : « contact »)"
    },
    {
      "key": "pins",
      "from": [
        "piece"
      ],
      "to": [
        "piece"
      ],
      "label": "cloue"
    },
    {
      "key": "screens",
      "from": [
        "piece"
      ],
      "to": [
        "piece"
      ],
      "label": "écrante — la pièce derrière le cloué"
    },
    {
      "key": "belongs_to",
      "from": [
        "piece"
      ],
      "to": [
        "constellation"
      ],
      "label": "appartient à la constellation (Rowson)"
    },
    {
      "key": "posts",
      "from": [
        "piece"
      ],
      "to": [
        "advance_post"
      ],
      "label": "occupe l'avant-poste"
    },
    {
      "key": "targets",
      "from": [
        "piece"
      ],
      "to": [
        "target"
      ],
      "label": "vise la cible"
    },
    {
      "key": "partitions",
      "from": [
        "pawn_formation"
      ],
      "to": [
        "zone"
      ],
      "label": "partitionne le plateau en théâtres (Nimzowitsch)"
    },
    {
      "key": "weakens",
      "from": [
        "pawn_formation"
      ],
      "to": [
        "square"
      ],
      "label": "affaiblit — y compris à distance (Nimzowitsch : « reflex weakness »)"
    },
    {
      "key": "creates",
      "from": [
        "pawn_formation"
      ],
      "to": [
        "square"
      ],
      "label": "crée un trou en avançant (Capablanca)"
    },
    {
      "key": "spans",
      "from": [
        "corridor"
      ],
      "to": [
        "square"
      ],
      "label": "traverse la case"
    },
    {
      "key": "located_in",
      "from": [
        "square"
      ],
      "to": [
        "zone"
      ],
      "label": "appartient à la zone"
    },
    {
      "key": "carries",
      "from": [
        "position"
      ],
      "to": [
        "threat"
      ],
      "label": "porte la menace"
    },
    {
      "key": "enables",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "permet — rend disponible un de MES coups"
    },
    {
      "key": "excludes",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "exclut — me prive d'un de MES coups"
    },
    {
      "key": "prevents",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "prévient — retire un coup à l'ADVERSAIRE"
    },
    {
      "key": "allows",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "concède — offre un coup neuf à l'ADVERSAIRE"
    },
    {
      "key": "frees",
      "from": [
        "move"
      ],
      "to": [
        "square"
      ],
      "label": "libère — quitte une case qu'un des miens peut reprendre"
    },
    {
      "key": "forgoes",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "renonce — passe à côté d'un gain à MOI : pièce en l'air, mat en un (Heisman : blunder check)"
    },
    {
      "key": "ignores",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "laisse — ne pare pas une menace ADVERSE déjà présente (de la Maza : balayage)"
    },
    {
      "key": "trades_queens_behind",
      "from": [
        "move"
      ],
      "to": [
        "move"
      ],
      "label": "échange les dames en retard de matériel (Capablanca : « exchange Queens when he is a Pawn behind »)"
    }
  ],
  "value_sources": [
    {
      "key": "fen",
      "label": "Lecture directe du FEN — placement, trait, roques, prise en passant"
    },
    {
      "key": "rules",
      "label": "Géométrie des coups légaux (chess.js) — attaques, contrôle, mobilité"
    },
    {
      "key": "engine",
      "label": "Stockfish — évaluation, meilleur coup, profondeur atteinte"
    }
  ],
  "axes": [
    {
      "key": "material_balance",
      "label": "Écart matériel, en paliers",
      "facet": "material",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "balanced",
          "label": "Équilibré — écart sous le pion"
        },
        {
          "key": "white_slight",
          "label": "Léger avantage blanc — de l'ordre du pion"
        },
        {
          "key": "white_clear",
          "label": "Avantage blanc net — de l'ordre de la pièce"
        },
        {
          "key": "white_decisive",
          "label": "Avantage blanc décisif"
        },
        {
          "key": "black_slight",
          "label": "Léger avantage noir"
        },
        {
          "key": "black_clear",
          "label": "Avantage noir net"
        },
        {
          "key": "black_decisive",
          "label": "Avantage noir décisif"
        }
      ]
    },
    {
      "key": "bishop_pair",
      "label": "Paire de fous (Silman, 1re imbalance : « Superior Minor Piece »)",
      "facet": "material",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "neither",
          "label": "Aucun camp ne l'a"
        },
        {
          "key": "white",
          "label": "Aux blancs"
        },
        {
          "key": "black",
          "label": "Aux noirs"
        }
      ]
    },
    {
      "key": "pieces_out_of_action",
      "label": "Pièces hors jeu, comptées comme du matériel absent (Capablanca)",
      "facet": "material",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucune"
        },
        {
          "key": "white_has",
          "label": "Les blancs en ont une ou plus"
        },
        {
          "key": "black_has",
          "label": "Les noirs en ont une ou plus"
        },
        {
          "key": "both",
          "label": "Les deux camps"
        }
      ]
    },
    {
      "key": "pawn_islands",
      "label": "Écart d'îlots de pions — moins d'îlots vaut mieux",
      "facet": "pawn_structure",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Autant d'îlots des deux côtés"
        },
        {
          "key": "white_fewer",
          "label": "Les blancs en ont moins"
        },
        {
          "key": "black_fewer",
          "label": "Les noirs en ont moins"
        }
      ]
    },
    {
      "key": "pawn_defects",
      "label": "Défauts de structure présents dans la position",
      "facet": "pawn_structure",
      "nature": "factual",
      "source": "fen",
      "cardinality": "multi",
      "status": "active",
      "values": [
        {
          "key": "white_isolated",
          "label": "Pion(s) isolé(s) blanc(s)"
        },
        {
          "key": "white_doubled",
          "label": "Pion(s) doublé(s) blanc(s)"
        },
        {
          "key": "white_backward",
          "label": "Pion(s) arriéré(s) blanc(s)"
        },
        {
          "key": "white_hanging",
          "label": "Pions pendants blancs"
        },
        {
          "key": "black_isolated",
          "label": "Pion(s) isolé(s) noir(s)"
        },
        {
          "key": "black_doubled",
          "label": "Pion(s) doublé(s) noir(s)"
        },
        {
          "key": "black_backward",
          "label": "Pion(s) arriéré(s) noir(s)"
        },
        {
          "key": "black_hanging",
          "label": "Pions pendants noirs"
        }
      ]
    },
    {
      "key": "pawn_immobility",
      "label": "Écart de pions immobiles (Nimzowitsch — le pion qui ne peut plus avancer)",
      "facet": "pawn_structure",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucun pion immobile des deux côtés"
        },
        {
          "key": "white_more",
          "label": "Les blancs ont plus de pions immobiles"
        },
        {
          "key": "black_more",
          "label": "Les noirs ont plus de pions immobiles"
        },
        {
          "key": "mutual",
          "label": "Structure bloquée des deux côtés, sans écart net"
        }
      ]
    },
    {
      "key": "passed_pawn_edge",
      "label": "Avantage en pions passés (valeur contextuelle — Capablanca)",
      "facet": "pawn_structure",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucun pion passé"
        },
        {
          "key": "white_better",
          "label": "Les blancs ont le pion passé le plus dangereux"
        },
        {
          "key": "black_better",
          "label": "Les noirs ont le pion passé le plus dangereux"
        },
        {
          "key": "mutual",
          "label": "Pions passés des deux côtés, sans avantage net"
        }
      ]
    },
    {
      "key": "king_safety_balance",
      "label": "Écart de sécurité des rois",
      "facet": "king_safety",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Rois d'exposition comparable"
        },
        {
          "key": "white_safer",
          "label": "Roi blanc plus sûr"
        },
        {
          "key": "black_safer",
          "label": "Roi noir plus sûr"
        }
      ]
    },
    {
      "key": "king_exposure_max",
      "label": "Exposition du roi le plus exposé (axe non comparatif, cf. C3)",
      "facet": "king_safety",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "both_sheltered",
          "label": "Les deux rois sont abrités"
        },
        {
          "key": "one_airy",
          "label": "Un roi a perdu son bouclier de pions"
        },
        {
          "key": "one_critical",
          "label": "Un roi est directement assailli"
        },
        {
          "key": "both_exposed",
          "label": "Les deux rois sont exposés"
        }
      ]
    },
    {
      "key": "shelter_integrity",
      "label": "Intégrité de l'abri du roi (Nimzowitsch compare la structure à une cage thoracique)",
      "facet": "king_safety",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "not_castled",
          "label": "Aucun roi n'a roqué — il n'y a pas encore d'abri à juger"
        },
        {
          "key": "intact",
          "label": "Bouclier intact des deux côtés"
        },
        {
          "key": "white_broken",
          "label": "Bouclier blanc entamé"
        },
        {
          "key": "black_broken",
          "label": "Bouclier noir entamé"
        },
        {
          "key": "both_broken",
          "label": "Les deux boucliers sont entamés"
        }
      ]
    },
    {
      "key": "pawn_advance_edge",
      "label": "Avance des pions — l'espace OCCUPÉ",
      "facet": "space",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Avance comparable"
        },
        {
          "key": "white_advanced",
          "label": "Pions blancs plus avancés"
        },
        {
          "key": "black_advanced",
          "label": "Pions noirs plus avancés"
        }
      ]
    },
    {
      "key": "terrain_control",
      "label": "Terrain réellement contrôlé — cases tenues, pas occupées (Nimzowitsch)",
      "facet": "space",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Contrôle équilibré"
        },
        {
          "key": "white_holds",
          "label": "Les blancs tiennent plus de terrain"
        },
        {
          "key": "black_holds",
          "label": "Les noirs tiennent plus de terrain"
        }
      ]
    },
    {
      "key": "centre_command",
      "label": "Emprise sur le centre propre et le centre étendu (Lasker)",
      "facet": "space",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "contested",
          "label": "Centre disputé"
        },
        {
          "key": "white_owns",
          "label": "Centre aux blancs"
        },
        {
          "key": "black_owns",
          "label": "Centre aux noirs"
        },
        {
          "key": "neutralised",
          "label": "Centre liquidé ou verrouillé"
        }
      ]
    },
    {
      "key": "worst_piece",
      "label": "Camp qui porte la pièce la plus mal placée (2e question d'Aagaard)",
      "facet": "piece_quality",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucune pièce notablement mal placée"
        },
        {
          "key": "white",
          "label": "Aux blancs"
        },
        {
          "key": "black",
          "label": "Aux noirs"
        }
      ]
    },
    {
      "key": "minor_piece_fit",
      "label": "Adéquation des pièces mineures à la structure (fou contre cavalier)",
      "facet": "piece_quality",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "balanced",
          "label": "Pas d'écart net"
        },
        {
          "key": "white_better",
          "label": "Mineures blanches mieux adaptées"
        },
        {
          "key": "black_better",
          "label": "Mineures noires mieux adaptées"
        }
      ]
    },
    {
      "key": "key_file_control",
      "label": "Contrôle d'une colonne décisive",
      "facet": "line_control",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucune colonne décisive tenue"
        },
        {
          "key": "white",
          "label": "Aux blancs"
        },
        {
          "key": "black",
          "label": "Aux noirs"
        },
        {
          "key": "shared",
          "label": "Disputée ou neutralisée par doublement mutuel"
        }
      ]
    },
    {
      "key": "seventh_rank",
      "label": "Septième rangée — Nimzowitsch distingue la simple de l'« absolue » (roi enfermé derrière)",
      "facet": "line_control",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Personne ne la tient"
        },
        {
          "key": "white_simple",
          "label": "Blancs, rangée simple"
        },
        {
          "key": "white_absolute",
          "label": "Blancs, rangée absolue"
        },
        {
          "key": "black_simple",
          "label": "Noirs, rangée simple"
        },
        {
          "key": "black_absolute",
          "label": "Noirs, rangée absolue"
        },
        {
          "key": "both",
          "label": "Les deux camps tiennent leur septième rangée"
        }
      ]
    },
    {
      "key": "hole_ownership",
      "label": "Trous exploitables dans le camp adverse (Capablanca définit le trou ; Lasker son usage)",
      "facet": "square_control",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucun trou exploitable"
        },
        {
          "key": "white_exploits",
          "label": "Les blancs disposent d'un trou adverse"
        },
        {
          "key": "black_exploits",
          "label": "Les noirs disposent d'un trou adverse"
        },
        {
          "key": "mutual",
          "label": "Trous des deux côtés"
        }
      ]
    },
    {
      "key": "advance_post_held",
      "label": "Avant-poste effectivement occupé et non délogeable par un pion",
      "facet": "square_control",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucun"
        },
        {
          "key": "white",
          "label": "Aux blancs"
        },
        {
          "key": "black",
          "label": "Aux noirs"
        },
        {
          "key": "both",
          "label": "Un de chaque côté"
        }
      ]
    },
    {
      "key": "development_lead",
      "label": "Avance de développement",
      "facet": "development",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Développement comparable"
        },
        {
          "key": "white",
          "label": "Avance blanche"
        },
        {
          "key": "black",
          "label": "Avance noire"
        }
      ]
    },
    {
      "key": "castling_state",
      "label": "État des roques",
      "facet": "development",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "both_castled",
          "label": "Les deux camps ont roqué"
        },
        {
          "key": "white_only",
          "label": "Seuls les blancs ont roqué"
        },
        {
          "key": "black_only",
          "label": "Seuls les noirs ont roqué"
        },
        {
          "key": "neither",
          "label": "Aucun roque effectué"
        },
        {
          "key": "opposite_wings",
          "label": "Roques opposés — deux attaques de flanc en vue"
        }
      ]
    },
    {
      "key": "initiative_holder",
      "label": "Camp qui impose son agenda",
      "facet": "initiative",
      "nature": "measured",
      "source": "engine",
      "cardinality": "single",
      "status": "probation",
      "values": [
        {
          "key": "white",
          "label": "Aux blancs"
        },
        {
          "key": "black",
          "label": "Aux noirs"
        },
        {
          "key": "contested",
          "label": "Disputée"
        }
      ]
    },
    {
      "key": "tension_state",
      "label": "Tension accumulée, prête ou non à se décharger (Lasker)",
      "facet": "initiative",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "released",
          "label": "Relâchée — structures fixées, pas de contact"
        },
        {
          "key": "building",
          "label": "Montante — contacts non résolus"
        },
        {
          "key": "critical",
          "label": "Critique — une prise change la nature de la position"
        }
      ]
    },
    {
      "key": "advantage_durability",
      "label": "Durabilité de l'avantage dominant (Lasker)",
      "facet": "statics_dynamics",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Pas d'avantage net à qualifier"
        },
        {
          "key": "lasting",
          "label": "Durable — porté par la structure de pions"
        },
        {
          "key": "volatile",
          "label": "Volatil — porté par le placement des pièces"
        },
        {
          "key": "mixed",
          "label": "Mixte — faiblesse statique compensée par une force dynamique"
        }
      ]
    },
    {
      "key": "position_character",
      "label": "Régime de jeu (Nimzowitsch : « a war of movement » vs « siege-warfare »)",
      "facet": "statics_dynamics",
      "nature": "factual",
      "source": "fen",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "open",
          "label": "Ouverte — guerre de mouvement"
        },
        {
          "key": "closed",
          "label": "Fermée — guerre de siège"
        },
        {
          "key": "semi_open",
          "label": "Semi-ouverte"
        },
        {
          "key": "blocked",
          "label": "Verrouillée — Nimzowitsch conseille de rester « in the air » plutôt que d'y entrer"
        }
      ]
    },
    {
      "key": "plan_openness",
      "label": "Nombre de plans encore ouverts (Lasker)",
      "facet": "elasticity",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Comparable"
        },
        {
          "key": "white_freer",
          "label": "Les blancs gardent plus d'options"
        },
        {
          "key": "black_freer",
          "label": "Les noirs gardent plus d'options"
        },
        {
          "key": "both_forced",
          "label": "Les deux camps sont contraints à un plan unique"
        }
      ]
    },
    {
      "key": "piece_elasticity",
      "label": "Pièces qui peuvent quitter leur poste sans que leur fonction s'effondre (Nimzowitsch)",
      "facet": "elasticity",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Comparable"
        },
        {
          "key": "white_better",
          "label": "Pièces blanches plus élastiques"
        },
        {
          "key": "black_better",
          "label": "Pièces noires plus élastiques"
        }
      ]
    },
    {
      "key": "piece_cooperation",
      "label": "Qualité de la coopération entre pièces (Lasker)",
      "facet": "cooperation",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "equal",
          "label": "Comparable"
        },
        {
          "key": "white_better",
          "label": "Pièces blanches mieux coordonnées"
        },
        {
          "key": "black_better",
          "label": "Pièces noires mieux coordonnées"
        }
      ]
    },
    {
      "key": "function_overload",
      "label": "Pièce surchargée de fonctions (Lasker : « overburdened with functions »)",
      "facet": "cooperation",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucune surcharge"
        },
        {
          "key": "white",
          "label": "Une pièce blanche est surchargée"
        },
        {
          "key": "black",
          "label": "Une pièce noire est surchargée"
        },
        {
          "key": "both",
          "label": "Les deux camps"
        }
      ]
    },
    {
      "key": "immediate_threats",
      "label": "Motifs tactiques immédiats présents dans la position",
      "facet": "threats",
      "nature": "measured",
      "source": "rules",
      "cardinality": "multi",
      "status": "active",
      "values": [
        {
          "key": "fork",
          "label": "Fourchette disponible"
        },
        {
          "key": "pin",
          "label": "Clouage en place"
        },
        {
          "key": "skewer",
          "label": "Enfilade disponible"
        },
        {
          "key": "discovered_attack",
          "label": "Attaque à la découverte disponible"
        },
        {
          "key": "hanging_piece",
          "label": "Pièce en l'air"
        },
        {
          "key": "mate_net",
          "label": "Réseau de mat en formation"
        },
        {
          "key": "overload",
          "label": "Défenseur surchargé exploitable"
        },
        {
          "key": "deflection",
          "label": "Déviation : un défenseur unique peut être délogé de sa tâche"
        },
        {
          "key": "zugzwang",
          "label": "Zugzwang"
        }
      ]
    },
    {
      "key": "weakest_link",
      "label": "Cible désignée par la ligne de moindre résistance (Lasker : « linea minoris resistentiae »)",
      "facet": "threats",
      "nature": "measured",
      "source": "rules",
      "cardinality": "single",
      "status": "active",
      "values": [
        {
          "key": "none",
          "label": "Aucune cible fixée"
        },
        {
          "key": "white_target",
          "label": "La cible est dans le camp blanc"
        },
        {
          "key": "black_target",
          "label": "La cible est dans le camp noir"
        },
        {
          "key": "mutual",
          "label": "Une cible de chaque côté"
        }
      ]
    },
    {
      "key": "position_regime",
      "label": "Régime de la position (Lasker, d'après Steinitz)",
      "facet": "regime",
      "nature": "measured",
      "source": "engine",
      "cardinality": "single",
      "status": "probation",
      "values": [
        {
          "key": "white_attacks",
          "label": "Les blancs ont un avantage non compensé : ils doivent attaquer"
        },
        {
          "key": "black_attacks",
          "label": "Les noirs ont un avantage non compensé : ils doivent attaquer"
        },
        {
          "key": "balanced",
          "label": "Équilibrée — maintenir la coopération des pièces"
        }
      ]
    },
    {
      "key": "compensation",
      "label": "Nature de la compensation, quand les avantages ne sont pas de même espèce (Lasker)",
      "facet": "regime",
      "nature": "measured",
      "source": "engine",
      "cardinality": "single",
      "status": "probation",
      "values": [
        {
          "key": "none",
          "label": "Avantages de même espèce, directement comparables"
        },
        {
          "key": "material_vs_activity",
          "label": "Matériel contre activité"
        },
        {
          "key": "material_vs_structure",
          "label": "Matériel contre structure"
        },
        {
          "key": "structure_vs_activity",
          "label": "Structure contre activité"
        },
        {
          "key": "space_vs_solidity",
          "label": "Espace contre solidité"
        }
      ]
    }
  ]
}
