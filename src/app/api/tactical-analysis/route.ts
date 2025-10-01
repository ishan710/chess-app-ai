import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import OpenAI from 'openai';
import { openingsPrompt } from '@/prompts/openings';
import { middleGamePrompt } from '@/prompts/middleGame';
import { endgamePrompt } from '@/prompts/endGame';
import {
  determineGamePhase,
  analyzePosition,
  analyzeHistoricalMoves,
  createBoardVisual
} from '@/utils/chessUtils';

export async function POST(request: NextRequest) {
  try {
    const { fen, gameHistory, currentStrategy, moveCount } = await request.json();

    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const game = new Chess(fen);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    if (game.isGameOver()) {
      return NextResponse.json({ 
        error: 'Game is already over',
        gameOver: true,
        result: game.isCheckmate() ? 'checkmate' : game.isStalemate() ? 'stalemate' : 'draw'
      }, { status: 400 });
    }

    const recentMoves = game.history().slice(-10); // Use actual game history instead of passed gameHistory
    const gamePhase = determineGamePhase(game, moveCount);
    const positionAnalysis = analyzePosition(game);
    const historicalAnalysis = await analyzeHistoricalMoves(recentMoves, openai);

    // Create tactical strategy prompt based on game phase
    let phasePrompt = '';
    switch (gamePhase) {
      case 'opening':
        phasePrompt = openingsPrompt;
        break;
      case 'middlegame':
        phasePrompt = middleGamePrompt;
        break;
      case 'endgame':
        phasePrompt = endgamePrompt;
        break;
      default:
        phasePrompt = middleGamePrompt;
    }

    const tacticalStrategyPrompt = `
# TACTICAL STRATEGY ANALYSIS

You are analyzing the current chess position to develop a comprehensive tactical strategy for the next several moves.

## CURRENT POSITION ANALYSIS
**FEN:** ${fen}
**Game Phase:** ${gamePhase}
**Move History:** ${recentMoves.join(' ')}

## BOARD VISUALIZATION
${createBoardVisual(game)}

## POSITION ANALYSIS
${positionAnalysis}

## HISTORICAL ANALYSIS
${historicalAnalysis}

## CURRENT STRATEGY (if any)
${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : 'No previous strategy established'}

## STRATEGIC PHASE GUIDANCE
${phasePrompt}

---

## YOUR TASK
Develop a comprehensive tactical strategy that will guide the next 3-5 moves. This strategy should be:

1. **CONSISTENT**: Build upon the current position's strengths
2. **ADAPTIVE**: Consider the opponent's likely responses and recent moves
3. **FLEXIBLE**: Allow for tactical opportunities while maintaining strategic goals
4. **SPECIFIC**: Include concrete tactical patterns and piece coordination ideas

If there's a previous strategy, use it as context to maintain strategic continuity while adapting to the current position.

## OUTPUT FORMAT
Respond with a JSON object containing:

\`\`\`json
{
  "strategy": {
    "primaryGoal": "Main strategic objective for the next few moves",
    "tacticalPatterns": [
      "Specific tactical pattern 1",
      "Specific tactical pattern 2",
      "Specific tactical pattern 3"
    ],
    "pieceCoordination": "How pieces should work together",
    "keySquares": ["e4", "d5", "f7"],
    "pawnStructure": "Pawn structure goals and weaknesses to target",
    "opponentThreats": "What to watch out for from opponent",
    "movePriorities": [
      "Priority 1: Specific move or idea",
      "Priority 2: Specific move or idea",
      "Priority 3: Specific move or idea"
    ]
  },
  "reasoning": "Detailed explanation of why this strategy fits the current position",
  "gamePhase": "${gamePhase}",
  "timestamp": ${Date.now()}
}
\`\`\`

Focus on creating a strategy that can be consistently applied across multiple moves while remaining adaptable to the opponent's responses.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: tacticalStrategyPrompt }],
      temperature: 0.6,
      max_tokens: 800,
    });

    const response = completion.choices[0]?.message?.content || '';
    
    // Try to parse JSON response
    let strategyData;
    try {
      // Extract JSON from response if it's wrapped in markdown
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      strategyData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse strategy JSON:', parseError);
      // Fallback: create a basic strategy structure
      strategyData = {
        strategy: {
          primaryGoal: "Develop pieces and control the center",
          tacticalPatterns: ["Control key central squares", "Develop pieces harmoniously", "Maintain king safety"],
          pieceCoordination: "Coordinate pieces for central control",
          keySquares: ["e4", "e5", "d4", "d5"],
          pawnStructure: "Maintain solid pawn structure",
          opponentThreats: "Watch for tactical shots and counterplay",
          movePriorities: ["Develop pieces", "Control center", "Castle"]
        },
        reasoning: response || "Generated basic strategy due to parsing error",
        gamePhase: gamePhase,
        timestamp: Date.now()
      };
    }

    console.log('🎯 Tactical Analysis - Generated strategy:', strategyData);

    return NextResponse.json({
      strategy: strategyData.strategy,
      reasoning: strategyData.reasoning,
      gamePhase: strategyData.gamePhase,
      timestamp: strategyData.timestamp || Date.now(),
      fen: fen
    });

  } catch (error) {
    console.error('Tactical analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
