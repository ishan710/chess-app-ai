/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import { middleGamePrompt } from '@/prompts/middleGame';
import { endgamePrompt } from '@/prompts/endGame';
import { openingsPrompt } from '@/prompts/openings';

// Determine game phase based on position and moves
export function determineGamePhase(game: Chess, moveCount: number): string {
  const materialCount = countMaterial(game);
  
  if (moveCount <= 2) {
    return 'opening';
  } 
  else if (materialCount < 20) {
    return 'endgame';
  } 
  else {
    return 'middlegame';
  }
}

// Count material on the board
export function countMaterial(game: Chess): number {
  const board = game.board();
  let count = 0;
  
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const values: { [key: string]: number } = {
          p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
        };
        count += values[piece.type] || 0;
      }
    }
  }
  
  return count;
}

// Analyze current position characteristics
export function analyzePosition(game: Chess): {
  kingSafety: string;
  centerControl: string;
  pieceActivity: string;
  pawnStructure: string;
  tacticalOpportunities: string[];
} {
  const isCheck = game.isCheck();
  
  return {
    kingSafety: isCheck ? 'King is in check - immediate threat' : 'King appears safe',
    centerControl: 'Analyze center control based on piece placement',
    pieceActivity: 'Evaluate piece mobility and coordination',
    pawnStructure: 'Assess pawn chains and weaknesses',
    tacticalOpportunities: ['Look for pins', 'Check for forks', 'Identify skewers', 'Find discovered attacks']
  };
}

// Analyze historical moves using LLM to understand what's happening
export async function analyzeHistoricalMoves(recentMoves: string[], openai: OpenAI): Promise<string> {
  if (recentMoves.length === 0) {
    return "This is the beginning of the game - no moves have been played yet.";
  }

  const historicalPrompt = `You are a chess grandmaster analyzing recent moves.

Recent moves: ${recentMoves.join(', ')}

Analyze and provide insights about:
1. Attacking Opportunities: Identify strong tactical or positional moves that can pressure the opponent.
2. Key Threats and Weaknesses: Point out vulnerabilities in both sides' positions (exposed king, weak pawns, hanging pieces, etc.).
3. Repetitive Moves: If you notice the same move or sequence being repeated (e.g., shuffling the same piece back and forth), call it out and stop it.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: historicalPrompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const analysis = completion.choices[0]?.message?.content || "Unable to analyze historical moves.";
    return analysis;
  } catch (error) {
    return `Recent moves: ${recentMoves.join(', ')}. Unable to provide detailed analysis due to technical issues.`;
  }
}

// Create dynamic prompt based on game state
export function createDynamicPrompt({
  boardVisual,
  fen,
  formattedMoves,
  gamePhase,
  positionAnalysis,
  historicalAnalysis,
  recentMoves,
  tacticalPatterns,
  availableMoves,
  previousAttempt
}: {
  boardVisual: string;
  fen: string;  
  formattedMoves: any[];
  gamePhase: string;
  positionAnalysis: any;
  historicalAnalysis: string;
  recentMoves: string[];
  tacticalPatterns?: string;
  availableMoves?: string[];
  previousAttempt?: string;
}): string {
  
  let prompt = `You are a chess expert playing as black. Here's the current board position:
  
${boardVisual}

Current FEN: ${fen}
It's black's turn to move.

🎯 CRITICAL INSTRUCTION: You MUST choose EXACTLY one move from the available moves list below. Copy the move notation EXACTLY as shown - do not modify it in any way.

GAME PHASE ANALYSIS:
Current phase: ${gamePhase.toUpperCase()}
Recent moves (last 6): ${recentMoves.length > 0 ? recentMoves.join(', ') : 'Game just started'}

POSITION ANALYSIS:
- King Safety: ${positionAnalysis.kingSafety}
- Center Control: ${positionAnalysis.centerControl}
- Piece Activity: ${positionAnalysis.pieceActivity}
- Pawn Structure: ${positionAnalysis.pawnStructure}
- Tactical Opportunities: ${positionAnalysis.tacticalOpportunities.join(', ')}

HISTORICAL MOVE ANALYSIS:
${historicalAnalysis}

${tacticalPatterns ? `TACTICAL PATTERNS:
${tacticalPatterns}
` : ''}🎯 AVAILABLE MOVES (CHOOSE EXACTLY ONE):
${formattedMoves.map((move, index) => `${index + 1}. ${move.notation} - ${move.description}`).join('\n')}

${availableMoves ? `✅ VALID MOVES ONLY: ${availableMoves.join(', ')}` : ''}`;

  // Add phase-specific guidance
  if (gamePhase === 'opening' && openingsPrompt) {
    prompt += `

Since this is the opening phase, you must choose a random opening from the following list:
${openingsPrompt}

Following established opening principles`;
  } 
  else if (gamePhase === 'middlegame') {
    prompt += `
Since this is the middlegame phase, you must consider the following tactical patterns:
MIDDLEGAME STRATEGY:
${middleGamePrompt}`;
  } else if (gamePhase === 'endgame') {
    prompt += `
Since this is the endgame phase, you must consider the following tactical patterns:
ENDGAME STRATEGY:
${endgamePrompt}`;
  }
  prompt += `

CRITICAL: You MUST respond with EXACTLY one of the available moves listed above.

RESPONSE FORMAT (follow exactly):
MOVE: [exact move notation from the list above]
REASONING: [your analysis considering the game phase, historical context, and position characteristics]

AVAILABLE MOVES (choose ONLY from these):
${formattedMoves.map((move, index) => `${index + 1}. ${move.notation}`).join('\n')}

EXAMPLES OF CORRECT RESPONSES:
MOVE: e5
REASONING: This move controls the center and develops the pawn.

MOVE: Nf6
REASONING: This develops the knight and prepares for castling.

MOVE: Bc5
REASONING: This develops the bishop and puts pressure on the center.

⚠️ IMPORTANT RULES:
- Use EXACTLY the notation from the available moves list
- Do NOT modify, abbreviate, or change the notation
- Do NOT add extra characters or spaces
- Do NOT use algebraic notation variations
- Copy the move notation EXACTLY as shown in the list above
`


  return prompt;
}

// Helper function to create board visual
export function createBoardVisual(game: Chess): string {
  const board = game.board();
  let visual = '   a b c d e f g h\n';
  
  for (let i = 7; i >= 0; i--) {
    visual += `${i + 1} `;
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        visual += ` ${getPieceSymbol(piece)}`;
      } else {
        visual += ' .';
      }
    }
    visual += ` ${i + 1}\n`;
  }
  visual += '   a b c d e f g h';
  
  return visual;
}

// Helper function to get piece symbol
export function getPieceSymbol(piece: { color: string; type: string }): string {
  const symbols: { [key: string]: { [key: string]: string } } = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };
  return symbols[piece.color]?.[piece.type] || '?';
}

// Helper function to calculate piece value
function getPieceValue(piece: string): number {
  const values: { [key: string]: number } = {
    'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
  };
  return values[piece] || 0;
}

// Format and score moves with detailed analysis
export function formatAndScoreMoves(moves: any[], fen: string, opponentColor: 'w' | 'b') {
  const formattedMoves = moves.map(move => {
    let desc = `${move.piece.toUpperCase()} from ${move.from} to ${move.to}`;
    let score = 0;
    
    // Points for capturing
    if (move.captured) {
      const captureValue = getPieceValue(move.captured);
      score += captureValue * 10; // Multiply by 10 for clearer scoring
      desc += ` - CAPTURES ${move.captured.toUpperCase()}`;
    }
    
    // Points for promotion
    if (move.promotion) {
      const promotionValue = getPieceValue(move.promotion) - 1; // Subtract pawn value
      score += promotionValue * 10;
      desc += ` - PROMOTES TO ${move.promotion.toUpperCase()}`;
    }
    
    if (move.san.includes('O-O')) {
      score += 5; // Small bonus for castling (king safety)
      desc += ' - CASTLING';
    }
    
    const testGame = new Chess(fen);
    testGame.move(move.san);
    const isDefended = testGame.isAttacked(move.to, opponentColor);
    
    // Check if this move gives check or checkmate
    if (testGame.isCheckmate()) {
      score += 1000; // Highest priority for checkmate
      desc += ' - CHECKMATE!';
    } else if (testGame.isCheck()) {
      score += 15; // Bonus for check
      desc += ' - CHECK';
    }
    
    if (isDefended) {
      // Penalty for moving to defended square (risk of losing the piece)
      const pieceValue = getPieceValue(move.piece);
      // If capturing, penalty is reduced (trade scenario)
      if (!move.captured) {
        score -= pieceValue * 5; // Half penalty if not capturing
      } else {
        // Trade evaluation: if our piece is worth more, it's a bad trade
        const captureValue = getPieceValue(move.captured);
        if (pieceValue > captureValue) {
          score -= (pieceValue - captureValue) * 5;
        }
      }
      desc += ' - SQUARE IS DEFENDED BY OPPONENT';
    }
    
    return {
      notation: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      isDefended: isDefended,
      score: score,
      description: desc
    };
  }).sort((a, b) => b.score - a.score); // Sort by score descending (best moves first)
  
  return formattedMoves;
}
