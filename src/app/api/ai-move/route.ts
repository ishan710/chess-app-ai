import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { fen, gameHistory } = await request.json();
    console.log('📥 Received FEN:', fen);
    console.log('📥 Received game history:', gameHistory);
    console.log('📥 FEN length:', fen?.length);
    
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

    // Check if black has opened yet (determine if we're in opening phase)
    const hasBlackOpened = hasBlackMadeOpeningMove(game);
    console.log('🎯 Opening phase check - Black has opened:', hasBlackOpened);
    console.log('📊 Game history length:', game.history().length);
    console.log('📋 Black moves count:', game.history({ verbose: true }).filter((_, index) => index % 2 === 1).length);
    console.log('🎮 Current turn:', game.turn());
    console.log('📜 Full history:', game.history());

    // Get all possible moves
    const moves = game.moves({ verbose: true });
    
    if (moves.length === 0) {
      return NextResponse.json({ error: 'No moves available' }, { status: 400 });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a visual representation of the board
    const boardVisual = createBoardVisual(game);
    
    // Get last 6 moves from game history (passed from frontend)
    const recentMoves = gameHistory ? gameHistory.slice(-6) : [];
    console.log('📜 Recent moves (last 6):', recentMoves);
    
    // Format moves for the LLM
    const formattedMoves = moves.map(move => ({
      notation: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      description: `${move.piece.toUpperCase()} from ${move.from} to ${move.to}${move.captured ? ` (captures ${move.captured.toUpperCase()})` : ''}`
    }));

    // Load openings prompt if black hasn't opened yet
    let openingsContent = '';
    if (!hasBlackOpened) {
      try {
        const openingsPath = join(process.cwd(), 'src', 'prompts', 'openings.prompt');
        openingsContent = readFileSync(openingsPath, 'utf-8');
        console.log('📚 Loaded openings prompt, length:', openingsContent.length);
      } catch (error) {
        console.warn('Could not load openings prompt:', error);
      }
    } else {
      console.log('🚫 Skipping openings prompt - Black has opened');
    }

    // Create the prompt for the LLM
    const prompt = `You are a chess expert playing as black. Here's the current board position:

${boardVisual}

Current FEN: ${fen}
It's black's turn to move.

Recent moves (last 6): ${recentMoves.length > 0 ? recentMoves.join(', ') : 'Game just started'}

Available moves:
${formattedMoves.map((move, index) => `${index + 1}. ${move.notation} - ${move.description}`).join('\n')}

${!hasBlackOpened && openingsContent ? `

OPENING THEORY REFERENCE:
${openingsContent}

Since this appears to be in the opening phase, consider the standard opening principles and the above opening theory when choosing your move.` : ''}

Please analyze the position and choose the best move. Consider:
- Material balance
- King safety
- Piece activity
- Pawn structure
- Tactical opportunities
- Positional advantages
${!hasBlackOpened ? '- Opening principles and theory' : ''}

Respond in this exact format:
MOVE: [move notation]
REASONING: [your analysis of why this move is best]

Example:
MOVE: Nf6
REASONING: This develops the knight to a natural square, controls the center, and prepares for castling. It also puts pressure on the e4 square and follows opening principles.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a chess expert. Always respond in the exact format requested: MOVE: [notation] REASONING: [analysis]"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.1,
    });
    console.log('LLM prompt:', prompt)
    const llmResponse = completion.choices[0]?.message?.content?.trim();
   
    
    if (!llmResponse) {
      throw new Error('No response received from LLM');
    }

    // Parse the LLM response
    const moveMatch = llmResponse.match(/MOVE:\s*([^\n\r]+)/i);
    const reasoningMatch = llmResponse.match(/REASONING:\s*([^\n\r]+(?:\n[^\n\r]+)*)/i);
    
    const chosenMoveNotation = moveMatch ? moveMatch[1].trim() : null;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';
    
    if (!chosenMoveNotation) {
      throw new Error('Could not parse move from LLM response');
    }

    // Find the move object that matches the chosen notation
    const chosenMove = moves.find(move => move.san === chosenMoveNotation);
    
    if (!chosenMove) {
      // Fallback: if LLM returns invalid move, use the first available move
      console.warn(`LLM returned invalid move: ${chosenMoveNotation}, using fallback`);
      const fallbackMove = moves[0];
      const result = game.move(fallbackMove);
      
      if (!result) {
        return NextResponse.json({ error: 'Invalid fallback move' }, { status: 400 });
      }

      return NextResponse.json({
        move: result.san,
        from: result.from,
        to: result.to,
        fen: game.fen(),
        isCheck: game.isCheck(),
        isCheckmate: game.isCheckmate(),
        isStalemate: game.isStalemate(),
        isGameOver: game.isGameOver(),
        llmMove: chosenMoveNotation,
        reasoning: 'Fallback move - LLM returned invalid notation',
        fallback: true
      });
    }

    // Make the chosen move
    const result = game.move(chosenMove);
    
    if (!result) {
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 });
    }

    return NextResponse.json({
      move: result.san,
      from: result.from,
      to: result.to,
      fen: game.fen(),
      isCheck: game.isCheck(),
      isCheckmate: game.isCheckmate(),
      isStalemate: game.isStalemate(),
      isGameOver: game.isGameOver(),
      llmMove: chosenMoveNotation,
      reasoning: reasoning
    });

  } catch (error) {
    console.error('AI move error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to create a visual representation of the board
function createBoardVisual(game: Chess): string {
  const board = game.board();
  let visual = '   a b c d e f g h\n';
  
  for (let i = 0; i < 8; i++) {
    visual += `${8 - i} `;
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const symbol = getPieceSymbol(piece);
        visual += `${symbol} `;
      } else {
        visual += '. ';
      }
    }
    visual += `${8 - i}\n`;
  }
  visual += '   a b c d e f g h';
  
  return visual;
}

// Helper function to get piece symbols
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPieceSymbol(piece: any): string {
  const symbols: { [key: string]: { [key: string]: string } } = {
    'w': { 'k': '♔', 'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙' },
    'b': { 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' }
  };
  return symbols[piece.color][piece.type] || '?';
}

// Helper function to determine if black has made an opening move
function hasBlackMadeOpeningMove(game: Chess): boolean {
  // Get the fullmove number from FEN - this tells us how many complete moves have been made
  const fen = game.fen();
  const fullmoveNumber = parseInt(fen.split(' ')[5]);
  console.log('📊 Fullmove number from FEN:', fullmoveNumber);
  
  const blackHasMoved = fullmoveNumber >= 2;
  console.log('📋 Black has moved:', blackHasMoved);
  
  return blackHasMoved;
}
