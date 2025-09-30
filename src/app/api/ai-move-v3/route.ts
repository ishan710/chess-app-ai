import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { fen, gameHistory } = await request.json();
    console.log('📥 V3 API - Received FEN:', fen);
    console.log('📥 V3 API - Received game history:', gameHistory);
    
    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const game = new Chess(fen);
    
    // Check if game is over
    if (game.isGameOver()) {
      return NextResponse.json({ 
        error: 'Game is already over',
        gameOver: true,
        result: game.isCheckmate() ? 'checkmate' : game.isStalemate() ? 'stalemate' : 'draw'
      }, { status: 400 });
    }
    
    // Check if it's black's turn
    if (game.turn() !== 'b') {
      return NextResponse.json({ error: 'Not black\'s turn' }, { status: 400 });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a visual representation of the board
    const boardVisual = createBoardVisual(game);
    
    // Get last 6 moves from game history (passed from frontend)
    const recentMoves = gameHistory ? gameHistory.slice(-6) : [];
    console.log('📜 V3 API - Recent moves (last 6):', recentMoves);
    
    // Format moves for the LLM
    const moves = game.moves({ verbose: true });
    const formattedMoves = moves.map(move => ({
      notation: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      description: `${move.piece.toUpperCase()} from ${move.from} to ${move.to}${move.captured ? ` (captures ${move.captured.toUpperCase()})` : ''}`
    }));

    // Dynamic prompt generation based on game state
    const gamePhase = determineGamePhase(game, recentMoves);
    const positionAnalysis = analyzePosition(game);
    const historicalAnalysis = await analyzeHistoricalMoves(recentMoves, openai);
    
    console.log('🎯 V3 API - Game phase:', gamePhase);
    console.log('🎯 V3 API - Position analysis:', positionAnalysis);
    console.log('🎯 V3 API - Historical analysis:', historicalAnalysis);

    // Load openings prompt if in opening phase
    let openingsContent = '';
    if (gamePhase === 'opening') {
      try {
        const openingsPath = join(process.cwd(), 'src', 'prompts', 'openings.prompt');
        openingsContent = readFileSync(openingsPath, 'utf-8');
        console.log('📚 V3 API - Loaded openings prompt, length:', openingsContent.length);
      } catch (error) {
        console.warn('Could not load openings prompt:', error);
      }
    }

    // Create dynamic prompt based on game state
    const prompt = createDynamicPrompt({
      boardVisual,
      fen,
      formattedMoves,
      gamePhase,
      positionAnalysis,
      historicalAnalysis,
      recentMoves,
      openingsContent
    });

    console.log('🤖 V3 API - Generated dynamic prompt length:', prompt.length);

    // Get AI move with dynamic prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log('🤖 V3 API - AI response:', response);

    // Parse the response
    const moveMatch = response.match(/MOVE:\s*([^\n]+)/);
    const reasoningMatch = response.match(/REASONING:\s*([\s\S]+)/);

    if (!moveMatch) {
      throw new Error('Could not parse move from AI response');
    }

    const moveNotation = moveMatch[1].trim();
    const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';

    // Validate and make the move
    const move = game.move(moveNotation);
    if (!move) {
      throw new Error(`Invalid move: ${moveNotation}`);
    }

    console.log('✅ V3 API - Valid move made:', moveNotation);

    return NextResponse.json({
      move: moveNotation,
      reasoning,
      fen: game.fen(),
      gamePhase,
      positionAnalysis,
      historicalAnalysis
    });

  } catch (error) {
    console.error('❌ V3 API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper function to create board visual
function createBoardVisual(game: Chess): string {
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
function getPieceSymbol(piece: { color: string; type: string }): string {
  const symbols: { [key: string]: { [key: string]: string } } = {
    w: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    b: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
  };
  return symbols[piece.color]?.[piece.type] || '?';
}

// Determine game phase based on position and moves
function determineGamePhase(game: Chess, recentMoves: string[]): string {
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
function countMaterial(game: Chess): number {
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
function analyzePosition(game: Chess): {
  kingSafety: string;
  centerControl: string;
  pieceActivity: string;
  pawnStructure: string;
  tacticalOpportunities: string[];
} {
  const board = game.board();
  const isCheck = game.isCheck();
  
  // Simple analysis - in a real implementation, this would be more sophisticated
  return {
    kingSafety: isCheck ? 'King is in check - immediate threat' : 'King appears safe',
    centerControl: 'Analyze center control based on piece placement',
    pieceActivity: 'Evaluate piece mobility and coordination',
    pawnStructure: 'Assess pawn chains and weaknesses',
    tacticalOpportunities: ['Look for pins', 'Check for forks', 'Identify skewers', 'Find discovered attacks']
  };
}

// Analyze historical moves using LLM to understand what's happening
async function analyzeHistoricalMoves(recentMoves: string[], openai: OpenAI): Promise<string> {
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
    console.log('📚 Historical analysis generated:', analysis);
    return analysis;

  } catch (error) {
    console.error('Error analyzing historical moves:', error);
    return `Recent moves: ${recentMoves.join(', ')}. Unable to provide detailed analysis due to technical issues.`;
  }
}

// Create dynamic prompt based on game state
function createDynamicPrompt({
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
  formattedMoves: any[];
  gamePhase: string;
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

Since this is the opening phase, prioritize:
- Development of pieces
- Control of the center
- King safety through castling
- Following established opening principles`;
  } else if (gamePhase === 'middlegame') {
    prompt += `

MIDDLEGAME STRATEGY:
Focus on:
- Tactical combinations and calculations
- Piece coordination and activity
- Weakness exploitation
- Initiative and tempo`;
  } else if (gamePhase === 'endgame') {
    prompt += `

ENDGAME PRINCIPLES:
Prioritize:
- King activity and centralization
- Pawn promotion threats
- Opposition in king and pawn endgames
- Material conversion`;
  }

  prompt += `

Please analyze the position considering:
1. The current game phase (${gamePhase})
2. The historical move analysis and what's happening in the game
3. The specific position characteristics
4. Tactical opportunities available
5. Strategic long-term goals

Respond in this exact format:
MOVE: [move notation]
REASONING: [your analysis considering the game phase, historical context, and position characteristics]

Example:
MOVE: Nf6
REASONING: This develops the knight to a natural square, controls the center, and prepares for castling. Based on the historical analysis showing [opening pattern], this move continues the development theme while addressing the position's need for piece coordination.`;

  return prompt;
}
