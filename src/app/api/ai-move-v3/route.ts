import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import {
  determineGamePhase,
  analyzePosition,
  analyzeHistoricalMoves,
  createDynamicPrompt,
  createBoardVisual,
  formatAndScoreMoves
} from '@/utils/chessUtils';

export async function POST(request: NextRequest) {
  try {
    const { fen, gameHistory, tacticalPatterns } = await request.json();

    // console.log('🤖 V3 API - Received tactical patterns:', tacticalPatterns);
    // console.log('🤖 V3 API - Received tactical patterns:', tacticalPatterns);
    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const game = new Chess(fen);
    
    // console.log('🤖 V3 API - Received FEN:', fen);
    // console.log('🤖 V3 API - Current turn:', game.turn());
    // console.log('🤖 V3 API - Move history:', gameHistory);
    
    if (game.isGameOver()) {
      return NextResponse.json({ 
        error: 'Game is already over',
        gameOver: true,
        result: game.isCheckmate() ? 'checkmate' : game.isStalemate() ? 'stalemate' : 'draw'
      }, { status: 400 });
    }
    
    if (game.turn() !== 'b') {
      console.error('🤖 V3 API - ERROR: Not black\'s turn! Turn is:', game.turn());
      return NextResponse.json({ error: 'Not black\'s turn' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const recentMoves = gameHistory ? gameHistory.slice(-6) : [];
    const moves = game.moves({ verbose: true });
    
    if (moves.length === 0) {
      return NextResponse.json({ error: 'No moves available' }, { status: 400 });
    }

    // Format and score moves using the helper function
    const formattedMoves = formatAndScoreMoves(moves, fen, 'w');
    
    formattedMoves.map(m => `${m.notation} (${m.score}pts)`).join(', ');

    const gamePhase = determineGamePhase(game, recentMoves);
    console.log('🤖 V3 API - Game phase:', gamePhase);
    const positionAnalysis = analyzePosition(game);
    const historicalAnalysis = await analyzeHistoricalMoves(recentMoves, openai);

    let prompt = createDynamicPrompt({
      boardVisual: createBoardVisual(game),
      fen,
      formattedMoves,
      gamePhase,
      positionAnalysis,
      historicalAnalysis,
      recentMoves,
      tacticalPatterns
    });

    let move = null;
    let reasoning = 'No reasoning provided';
    let attempts = 0;
    const maxAttempts = 5;

    while (!move && attempts < maxAttempts) {
      attempts++;
    //   console.log(`🤖 V3 API - Attempt ${attempts}/${maxAttempts}`);
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = completion.choices[0]?.message?.content || '';
      const moveMatch = response.match(/MOVE:\s*([^\n]+)/);
      const reasoningMatch = response.match(/REASONING:\s*([\s\S]+)/);

      if (!moveMatch) {
        // console.log('🤖 V3 API - No move found in response');
        continue;
      }

      const moveNotation = moveMatch[1].trim();
      reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';
    //   console.log('🤖 V3 API - Move notation:', moveNotation);
      
      // Try to make the move
      move = game.move(moveNotation);
      
      if (!move && attempts < maxAttempts) {
        // Retry with available moves
        const availableMoves = game.moves();
        // console.log(`🤖 V3 API - Invalid move: ${moveNotation}. Retrying...`);
        
        prompt = createDynamicPrompt({
          boardVisual: createBoardVisual(game),
          fen,
          formattedMoves,
          gamePhase,
          positionAnalysis,
          historicalAnalysis,
          recentMoves,
          tacticalPatterns,
          availableMoves: availableMoves,
          previousAttempt: moveNotation
        });
      }
    }

    if (!move) {
      const availableMoves = game.moves();
      throw new Error(`Invalid move after ${maxAttempts} attempts. Available moves: ${availableMoves.join(', ')}`);
    }

    return NextResponse.json({
      move: move.san, // Use the actual move notation from the validated move
      reasoning,
      fen: game.fen(),
      gamePhase,
      positionAnalysis,
      historicalAnalysis
    });

  } catch (error) {
    console.error('AI move v3 error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}