// Positional analysis engine — detects structural features from FEN positions.
// Helps the AI coach explain QUIET moves ("why move my Knight there?")
// by providing positional context alongside tactical data.

export interface PositionalFeatures {
  /** Knight outpost: square controlled by knight, cannot be attacked by enemy pawns */
  knightOutposts: string[];
  /** Files with no pawns of either color */
  openFiles: string[];
  /** Files with only one side's pawn */
  semiOpenFiles: { file: string; side: 'w' | 'b' }[];
  /** Squares in opponent territory controlled by this side */
  spaceAdvantage: { side: 'w' | 'b'; squares: string[]; count: number };
  /** Pawns that have no friendly pawns on adjacent files to support them */
  isolatedPawns: { side: 'w' | 'b'; squares: string[] }[];
  /** Two pawns of same color on same file */
  doubledPawns: { side: 'w' | 'b'; files: string[] };
  /** Pawns with no enemy pawns ahead that can stop their advance */
  passedPawns: { side: 'w' | 'b'; squares: string[] }[];
  /** Pawns that are behind their neighbors and cannot be defended by pawns */
  backwardPawns: { side: 'w' | 'b'; squares: string[] }[];
  /** Number of pawns shielding the king (files f, g, h for short castle) */
  kingPawnShield: { side: 'w' | 'b'; count: number; intact: boolean };
  /** Whether the king has castled and which side */
  kingCastled: { side: 'w' | 'b'; castled: boolean; side_: 'kingside' | 'queenside' | null };
  /** Rooks on open or semi-open files */
  rookOnOpenFile: { side: 'w' | 'b'; files: string[] };
  /** Rooks on the 7th rank (opponent's 2nd rank from their perspective) */
  rookOnSeventh: boolean;
  /** Pieces still on their starting squares (undeveloped) */
  undevelopedPieces: { side: 'w' | 'b'; pieces: string[] };
  /** Centralized pieces (e4/d4/e5/d5 for knights, c3-f3-c6-f6 for bishops) */
  centralizedPieces: { side: 'w' | 'b'; pieces: string[] };
  /** Summary — natural language labels for the most significant features */
  summary: string[];
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function squareColor(square: string): 'light' | 'dark' {
  const fileIdx = FILES.indexOf(square[0]);
  const rankIdx = RANKS.indexOf(square[1]);
  return (fileIdx + rankIdx) % 2 === 0 ? 'dark' : 'light';
}

/** Parse a FEN string's piece placement section into a 2D board array */
function parseBoard(fen: string): string[][] {
  const board: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const rows = fen.split(' ')[0].split('/');
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank]) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch, 10);
      } else {
        board[rank][file] = ch;
        file++;
      }
    }
  }
  return board;
}

function fileIdx(file: string): number { return FILES.indexOf(file); }
function rankIdx(rank: string): number { return RANKS.indexOf(rank); }
function squareIdx(sq: string): [number, number] {
  return [rankIdx(sq[1]), fileIdx(sq[0])];
}

function isWhitePiece(p: string): boolean { return p === p.toUpperCase() && p !== ''; }
function isBlackPiece(p: string): boolean { return p === p.toLowerCase() && p !== ''; }

/** Detect all positional features from a FEN */
export function analyzePositional(fen: string): PositionalFeatures {
  const board = parseBoard(fen);
  const activeColor = fen.split(' ')[1] as 'w' | 'b';

  // Find all pieces
  const pieces: { type: string; color: 'w' | 'b'; sq: string; r: number; f: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p) {
        pieces.push({
          type: p.toLowerCase(),
          color: isWhitePiece(p) ? 'w' : 'b',
          sq: FILES[f] + RANKS[7 - r], // rank 0 = 8th row
          r: 7 - r,
          f,
        });
      }
    }
  }

  // Helper: get piece at square
  const pieceAt = (sq: string) => pieces.find(p => p.sq === sq);

  // --- Pawn structure ---
  const pawns = pieces.filter(p => p.type === 'p');

  // Isolated pawns: no friendly pawn on adjacent files
  const isolatedPawns: PositionalFeatures['isolatedPawns'] = [];
  for (const color of ['w', 'b'] as const) {
    const colorPawns = pawns.filter(p => p.color === color);
    const isolated: string[] = [];
    for (const p of colorPawns) {
      const hasNeighbor = colorPawns.some(
        n => Math.abs(fileIdx(n.sq[0]) - fileIdx(p.sq[0])) === 1
      );
      if (!hasNeighbor) isolated.push(p.sq);
    }
    isolatedPawns.push({ side: color, squares: isolated });
  }

  // Doubled pawns
  const doubledPawns: PositionalFeatures['doubledPawns'] = { side: 'w', files: [] };
  for (const color of ['w', 'b'] as const) {
    const colorPawns = pawns.filter(p => p.color === color);
    const fileCounts: Record<string, number> = {};
    for (const p of colorPawns) {
      fileCounts[p.sq[0]] = (fileCounts[p.sq[0]] || 0) + 1;
    }
    for (const [file, count] of Object.entries(fileCounts)) {
      if (count >= 2) {
        // Set current side in a simple way
        if (color === 'w') doubledPawns.side = 'w';
      }
    }
    doubledPawns.files = Object.entries(fileCounts).filter(([, c]) => c >= 2).map(([f]) => f);
    if (color === 'b') {
      // Combine — keep the doubled files from both sides
      const bFiles = Object.entries(fileCounts).filter(([, c]) => c >= 2).map(([f]) => f);
      doubledPawns.files = Array.from(new Set([...doubledPawns.files, ...bFiles]));
    }
  }

  // Passed pawns: no enemy pawns on same or adjacent files ahead
  const passedPawns: PositionalFeatures['passedPawns'] = [];
  for (const color of ['w', 'b'] as const) {
    const colorPawns = pawns.filter(p => p.color === color);
    const enemyPawns = pawns.filter(p => p.color !== color);
    const passed: string[] = [];
    for (const p of colorPawns) {
      const pf = fileIdx(p.sq[0]);
      const pr = rankIdx(p.sq[1]);
      const direction = color === 'w' ? 1 : -1;
      let blocked = false;
      for (const ep of enemyPawns) {
        const ef = fileIdx(ep.sq[0]);
        const er = rankIdx(ep.sq[1]);
        if (Math.abs(ef - pf) <= 1 && (color === 'w' ? er > pr : er < pr)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) passed.push(p.sq);
    }
    passedPawns.push({ side: color, squares: passed });
  }

  // Backward pawns
  const backwardPawns: PositionalFeatures['backwardPawns'] = [];
  for (const color of ['w', 'b'] as const) {
    const colorPawns = pawns.filter(p => p.color === color);
    const enemyPawns = pawns.filter(p => p.color !== color);
    const backward: string[] = [];
    for (const p of colorPawns) {
      const pf = fileIdx(p.sq[0]);
      const pr = rankIdx(p.sq[1]);
      // Check if there's a friendly pawn behind on adjacent file that could defend
      const hasDefenderBehind = colorPawns.some(
        n => Math.abs(fileIdx(n.sq[0]) - pf) === 1 &&
          (color === 'w' ? rankIdx(n.sq[1]) < pr : rankIdx(n.sq[1]) > pr)
      );
      const hasEnemyAhead = enemyPawns.some(
        n => Math.abs(fileIdx(n.sq[0]) - pf) <= 1 &&
          (color === 'w' ? rankIdx(n.sq[1]) > pr : rankIdx(n.sq[1]) < pr)
      );
      if (!hasDefenderBehind && hasEnemyAhead) backward.push(p.sq);
    }
    backwardPawns.push({ side: color, squares: backward });
  }

  // --- Open files ---
  const openFiles: string[] = [];
  const semiOpenFiles: PositionalFeatures['semiOpenFiles'] = [];
  for (const file of FILES) {
    const fi = fileIdx(file);
    const pawnsOnFile = pawns.filter(p => p.sq[0] === file);
    if (pawnsOnFile.length === 0) {
      openFiles.push(file);
    } else if (pawnsOnFile.every(p => p.color === 'w')) {
      semiOpenFiles.push({ file, side: 'b' }); // open for Black
    } else if (pawnsOnFile.every(p => p.color === 'b')) {
      semiOpenFiles.push({ file, side: 'w' }); // open for White
    }
  }

  // --- Knight outposts ---
  const knightOutposts: string[] = [];
  const knights = pieces.filter(p => p.type === 'n');
  for (const n of knights) {
    // An outpost: knight on a square that cannot be attacked by enemy pawns
    const nf = fileIdx(n.sq[0]);
    const nr = rankIdx(n.sq[1]);
    const enemyPawns = pawns.filter(p => p.color !== n.color);
    // Enemy pawns attack from two possible squares
    const attackSquares = n.color === 'w'
      ? [FILES[nf - 1] + RANKS[7 - (nr + 1)], FILES[nf + 1] + RANKS[7 - (nr + 1)]]
      : [FILES[nf - 1] + RANKS[7 - (nr - 1)], FILES[nf + 1] + RANKS[7 - (nr - 1)]];
    const canBeAttacked = attackSquares.some(sq => {
      if (sq.includes('undefined')) return false;
      return enemyPawns.some(p => p.sq === sq);
    });
    // Knight is in enemy territory (rank 5-8 for white, rank 1-4 for black)
    const inEnemyTerritory = n.color === 'w' ? nr <= 3 : nr >= 4;
    if (!canBeAttacked && inEnemyTerritory) {
      knightOutposts.push(n.sq);
    }
  }

  // --- King safety ---
  const kingPawnShield: PositionalFeatures['kingPawnShield'] = { side: 'w', count: 0, intact: false };
  const kingCastled: PositionalFeatures['kingCastled'] = { side: 'w', castled: false, side_: null };
  for (const color of ['w', 'b'] as const) {
    const king = pieces.find(p => p.type === 'k' && p.color === color);
    if (!king) continue;
    const kf = fileIdx(king.sq[0]);
    const kr = rankIdx(king.sq[1]);
    const homeRank = color === 'w' ? 7 : 0;

    // Castled detection
    if (kr === homeRank) {
      if (kf === 6) {
        kingCastled.side = color;
        kingCastled.castled = true;
        kingCastled.side_ = 'kingside';
      } else if (kf === 2) {
        kingCastled.side = color;
        kingCastled.castled = true;
        kingCastled.side_ = 'queenside';
      }
    }

    // Pawn shield: count pawns on files f,g,h (kingside) or a,b,c (queenside) adjacent to king
    const shieldFiles = kf >= 4
      ? [kf - 1, kf, kf + 1].filter(f => f >= 0 && f <= 7)
      : [kf, kf + 1, kf + 2].filter(f => f >= 0 && f <= 7);
    const colorPawns = pawns.filter(p => p.color === color);
    const shieldCount = colorPawns.filter(p => {
      const pf = fileIdx(p.sq[0]);
      const pr = rankIdx(p.sq[1]);
      const expectedRank = color === 'w' ? 6 : 1; // rank 2 for white, rank 7 for black
      return shieldFiles.includes(pf) && pr === expectedRank;
    }).length;
    kingPawnShield.side = color;
    kingPawnShield.count = shieldCount;
    kingPawnShield.intact = shieldCount >= 3;
  }

  // --- Rook activity ---
  const rooks = pieces.filter(p => p.type === 'r');
  const rookOnOpenFile: PositionalFeatures['rookOnOpenFile'] = { side: 'w', files: [] };
  const rookOnSeventh = rooks.some(r => {
    const rr = rankIdx(r.sq[1]);
    return (r.color === 'w' && rr === 1) || (r.color === 'b' && rr === 6);
  });

  for (const color of ['w', 'b'] as const) {
    const colorRooks = rooks.filter(r => r.color === color);
    const onOpen: string[] = [];
    for (const r of colorRooks) {
      const file = r.sq[0];
      if (openFiles.includes(file) || semiOpenFiles.some(s => s.file === file && s.side === color)) {
        onOpen.push(file);
      }
    }
    rookOnOpenFile.side = color;
    rookOnOpenFile.files = onOpen;
  }

  // --- Undeveloped pieces ---
  const undevelopedPieces: PositionalFeatures['undevelopedPieces'] = { side: 'w', pieces: [] };
  const startingSquares: Record<string, string[]> = {
    'w': ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'],
    'b': ['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8'],
  };
  for (const color of ['w', 'b'] as const) {
    const undeveloped = pieces.filter(
      p => p.color === color && p.type !== 'p' && p.type !== 'k' && startingSquares[color].includes(p.sq)
    );
    undevelopedPieces.side = color;
    undevelopedPieces.pieces = undeveloped.map(p => p.sq);
  }

  // --- Centralized pieces ---
  const centralizedPieces: PositionalFeatures['centralizedPieces'] = { side: 'w', pieces: [] };
  const centralSquares = ['d4', 'e4', 'd5', 'e5'];
  const extendedCenter = ['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6'];
  for (const color of ['w', 'b'] as const) {
    const centralized = pieces.filter(
      p => p.color === color && p.type !== 'p' && p.type !== 'k' &&
        (centralSquares.includes(p.sq) || (p.type === 'n' && extendedCenter.includes(p.sq)))
    );
    centralizedPieces.side = color;
    centralizedPieces.pieces = centralized.map(p => `${p.type.toUpperCase()}${p.sq}`);
  }

  // --- Space advantage ---
  const spaceAdvantage: PositionalFeatures['spaceAdvantage'] = { side: 'w', squares: [], count: 0 };
  let wSpace = 0;
  let bSpace = 0;
  const wTerritory: string[] = [];
  const bTerritory: string[] = [];
  for (const p of pieces) {
    if (p.type === 'p' || p.type === 'k') continue;
    const pr = rankIdx(p.sq[1]);
    // Piece in opponent's half
    if (p.color === 'w' && pr <= 3) { wSpace++; wTerritory.push(p.sq); }
    if (p.color === 'b' && pr >= 4) { bSpace++; bTerritory.push(p.sq); }
  }
  if (wSpace > bSpace) {
    spaceAdvantage.side = 'w';
    spaceAdvantage.squares = wTerritory;
    spaceAdvantage.count = wSpace - bSpace;
  } else {
    spaceAdvantage.side = 'b';
    spaceAdvantage.squares = bTerritory;
    spaceAdvantage.count = bSpace - wSpace;
  }

  // --- Summary ---
  const summary: string[] = [];

  // Knight outposts
  if (knightOutposts.length > 0) {
    const colors = Array.from(new Set(knightOutposts.map(sq => pieceAt(sq)?.color).filter(Boolean)));
    for (const c of colors) {
      const sqs = knightOutposts.filter(sq => pieceAt(sq)?.color === c);
      summary.push(`${c === 'w' ? 'White' : 'Black'} knight outpost${sqs.length > 1 ? 's' : ''} at ${sqs.join(',')}`);
    }
  }

  // Open files
  if (openFiles.length > 0) {
    summary.push(`Open file${openFiles.length > 1 ? 's' : ''}: ${openFiles.join(',')}`);
  }
  for (const sf of semiOpenFiles) {
    const who = sf.side === 'w' ? 'White' : 'Black';
    summary.push(`${who} has semi-open ${sf.file}-file`);
  }

  // Rook activity
  for (const color of ['w', 'b'] as const) {
    const rooksOnFiles = rooks.filter(r => r.color === color && (
      openFiles.includes(r.sq[0]) || semiOpenFiles.some(s => s.file === r.sq[0] && s.side === color)
    ));
    if (rooksOnFiles.length > 0) {
      summary.push(`${color === 'w' ? 'White' : 'Black'} rook${rooksOnFiles.length > 1 ? 's' : ''} on open/semi-open file${rooksOnFiles.length > 1 ? 's' : ''}`);
    }
  }

  // Passed pawns
  for (const pp of passedPawns) {
    if (pp.squares.length > 0) {
      summary.push(`${pp.side === 'w' ? 'White' : 'Black'} passed pawn${pp.squares.length > 1 ? 's' : ''} at ${pp.squares.join(',')}`);
    }
  }

  // Isolated pawns
  for (const ip of isolatedPawns) {
    if (ip.squares.length > 0) {
      summary.push(`${ip.side === 'w' ? 'White' : 'Black'} isolated pawn${ip.squares.length > 1 ? 's' : ''} at ${ip.squares.join(',')}`);
    }
  }

  // King safety
  if (!kingPawnShield.intact && kingCastled.castled) {
    summary.push(`${kingPawnShield.side === 'w' ? 'White' : 'Black'} king pawn shield weakened (${kingPawnShield.count}/3 pawns)`);
  }

  // Space
  if (spaceAdvantage.count >= 2) {
    summary.push(`${spaceAdvantage.side === 'w' ? 'White' : 'Black'} has space advantage (+${spaceAdvantage.count} pieces in opponent territory)`);
  }

  // Center control
  const wCenter = pieces.filter(p => p.color === 'w' && centralSquares.includes(p.sq)).length;
  const bCenter = pieces.filter(p => p.color === 'b' && centralSquares.includes(p.sq)).length;
  if (wCenter > bCenter) summary.push('White controls the center');
  else if (bCenter > wCenter) summary.push('Black controls the center');

  return {
    knightOutposts,
    openFiles,
    semiOpenFiles,
    spaceAdvantage,
    isolatedPawns,
    doubledPawns,
    passedPawns,
    backwardPawns,
    kingPawnShield,
    kingCastled,
    rookOnOpenFile,
    rookOnSeventh,
    undevelopedPieces,
    centralizedPieces,
    summary,
  };
}

/** Generate a compact positional summary string for the AI prompt */
export function positionalSummary(fen: string, forColor: 'w' | 'b'): string {
  const pf = analyzePositional(fen);
  const lines: string[] = [];

  // Only include the most relevant 2-3 points for the player's color
  if (pf.summary.length > 0) {
    lines.push(...pf.summary.slice(0, 4));
  }

  return lines.length > 0 ? `Positional context: ${lines.join('; ')}.` : '';
}
