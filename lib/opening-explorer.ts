/**
 * Lichess Opening Explorer client.
 *
 * Fetches top variations with win/draw rates from the Lichess
 * Masters database (2200+ rated games) for a given FEN position.
 */

export interface OpeningVariation {
  san: string;
  uci: string;
  white: number;   // win count for white
  black: number;   // win count for black
  draws: number;
  total: number;
  /** White win rate percentage */
  whiteRate: number;
  /** Black win rate percentage */
  blackRate: number;
  /** Draw rate percentage */
  drawRate: number;
}

export interface OpeningExplorerResult {
  white: number;
  black: number;
  draws: number;
  total: number;
  whiteRate: number;
  blackRate: number;
  drawRate: number;
  topMoves: OpeningVariation[];
}

const MASTERS_API = 'https://explorer.lichess.ovh/masters';

/**
 * Fetch opening stats for a FEN position.
 * Returns top 3 variations with win/draw rates.
 */
export async function fetchOpeningExplorer(fen: string): Promise<OpeningExplorerResult | null> {
  try {
    const url = `${MASTERS_API}?fen=${encodeURIComponent(fen)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('[OpeningExplorer] API error:', response.status);
      return null;
    }

    const data = await response.json();

    const total = (data.white || 0) + (data.black || 0) + (data.draws || 0);
    if (total === 0) return null; // No games in database

    const whiteRate = ((data.white || 0) / total * 100);
    const blackRate = ((data.black || 0) / total * 100);
    const drawRate = ((data.draws || 0) / total * 100);

    const moves: OpeningVariation[] = (data.moves || [])
      .slice(0, 3)
      .map((m: any) => {
        const t = (m.white || 0) + (m.black || 0) + (m.draws || 0);
        return {
          san: m.san,
          uci: m.uci,
          white: m.white || 0,
          black: m.black || 0,
          draws: m.draws || 0,
          total: t,
          whiteRate: t > 0 ? ((m.white || 0) / t * 100) : 0,
          blackRate: t > 0 ? ((m.black || 0) / t * 100) : 0,
          drawRate: t > 0 ? ((m.draws || 0) / t * 100) : 0,
        };
      });

    return {
      white: data.white || 0,
      black: data.black || 0,
      draws: data.draws || 0,
      total,
      whiteRate,
      blackRate,
      drawRate,
      topMoves: moves,
    };
  } catch (e) {
    console.warn('[OpeningExplorer] Fetch failed:', e);
    return null;
  }
}
