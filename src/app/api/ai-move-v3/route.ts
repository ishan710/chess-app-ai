import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import openingsPrompt from '@/prompts/openings';
import {
  determineGamePhase,
  analyzePosition,
  analyzeHistoricalMoves,
  createDynamicPrompt,
  createBoardVisual
} from '@/utils/chessUtils';

export async function POST(request: NextRequest) {
  try {
    const { fen, gameHistory } = await request.json();
    
    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const game = new Chess(fen);
    
    if (game.isGameOver()) {
      return NextResponse.json({ 
        error: 'Game is already over',
        gameOver: true,
        result: game.isCheckmate() ? 'checkmate' : game.isStalemate() ? 'stalemate' : 'draw'
      }, { status: 400 });
    }
    
    if (game.turn() !== 'b') {
      return NextResponse.json({ error: 'Not black\'s turn' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const recentMoves = gameHistory ? gameHistory.slice(-6) : [];
    const moves = game.moves({ verbose: true });
    
    if (moves.length === 0) {
      return NextResponse.json({ error: 'No moves available' }, { status: 400 });
    }

    const formattedMoves = moves.map(move => ({
      notation: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      description: `${move.piece.toUpperCase()} from ${move.from} to ${move.to}${move.captured ? ` (captures ${move.captured.toUpperCase()})` : ''}`
    }));

    const gamePhase = determineGamePhase(game, recentMoves);
    const positionAnalysis = analyzePosition(game);
    const historicalAnalysis = await analyzeHistoricalMoves(recentMoves, openai);
    const openingsContent = gamePhase === 'opening' ? openingsPrompt : '';

    const prompt = createDynamicPrompt({
      boardVisual: createBoardVisual(game),
      fen,
      formattedMoves,
      gamePhase,
      positionAnalysis,
      historicalAnalysis,
      recentMoves,
      openingsContent
    });
    console.log('🤖 V3 API - Generated dynamic prompt:', prompt);

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
      throw new Error('Could not parse move from AI response');
    }

    const moveNotation = moveMatch[1].trim();
    const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';

    const move = game.move(moveNotation);
    if (!move) {
      throw new Error(`Invalid move: ${moveNotation}`);
    }

    return NextResponse.json({
      move: moveNotation,
      reasoning,
      fen: game.fen(),
      gamePhase,
      positionAnalysis,
      historicalAnalysis
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}