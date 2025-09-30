import { Chess } from 'chess.js';
import OpenAI from 'openai';
import { middleGamePrompt } from '@/prompts/middleGame';
import { endgamePrompt } from '@/prompts/endGame';

// Determine game phase based on position and moves
export function determineGamePhase(game: Chess, recentMoves: string[]): string {
  const moveCount = recentMoves.length;
  const materialCount = countMaterial(game);
  
  if (moveCount <= 8) {
    return 'opening';
  } else if (moveCount <= 20 && materialCount >= 20) {
    return 'middlegame';
  } else if (materialCount < 20) {
    return 'endgame';
  } else {
    return 'middlegame';
  }
}

// Count material on the board
export function countMaterial(game: Chess): number {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const board = game.board();
  let count = 0;
  
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const values: { [key: string]: number } = {
          pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0
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

  try {
    const historicalPrompt = `You are a chess expert analyzing recent moves in a game. Here are the last ${recentMoves.length} moves played:

Recent moves: ${recentMoves.join(', ')}

Please analyze these moves and provide insights about:
1. What opening or pattern is being played
2. The strategic themes and ideas behind these moves
3. Any tactical motifs or patterns you notice
4. The current state of development and piece activity
5. What each side is trying to achieve

Provide a concise but insightful analysis of what's happening in the game based on these moves.`;

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
  openingsContent
}: {
  boardVisual: string;
  fen: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formattedMoves: any[];
  gamePhase: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positionAnalysis: any;
  historicalAnalysis: string;
  recentMoves: string[];
  openingsContent: string;
}): string {
  
  let prompt = `You are a chess expert playing as black. Here's the current board position:

${boardVisual}

Current FEN: ${fen}
It's black's turn to move.

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

Available moves:
${formattedMoves.map((move, index) => `${index + 1}. ${move.notation} - ${move.description}`).join('\n')}`;

  // Add phase-specific guidance
  if (gamePhase === 'opening' && openingsContent) {
    prompt += `

OPENING THEORY REFERENCE:
${openingsContent}

Since this is the opening phase, you must choose a random opening from the following list:
${openingsContent}

Following established opening principles`;
  } 
  else if (gamePhase === 'middlegame') {
    prompt += `

MIDDLEGAME STRATEGY:
${middleGamePrompt}`;
  } else if (gamePhase === 'endgame') {
    prompt += `

ENDGAME STRATEGY:
${endgamePrompt}`;
  }

  prompt += `


Respond in this exact format:
MOVE: [move notation]
REASONING: [your analysis considering the game phase, historical context, and position characteristics]

Example:
MOVE: Nf6
REASONING: This develops the knight to a natural square, controls the center, and prepares for castling. Based on the historical analysis showing [opening pattern], this move continues the development theme while addressing the position's need for piece coordination.`;

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
    w: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    b: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
  };
  return symbols[piece.color]?.[piece.type] || '?';
}
