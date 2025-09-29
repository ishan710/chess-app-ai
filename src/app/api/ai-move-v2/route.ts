import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { readFileSync } from 'fs';
import { join } from 'path';

// Types for our agentic workflow
interface MoveCandidate {
  notation: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  description: string;
}

interface MoveEvaluation {
  approved: boolean;
  score: number; // 1-10 scale
  reasoning: string;
  suggestions?: string[];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('🚀 AI Move V2 API - Starting request');
  
  try {
    const { fen } = await request.json();
    console.log('📥 Received FEN:', fen);
    
    if (!fen) {
      console.log('❌ Error: No FEN string provided');
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const game = new Chess(fen);
    console.log('♟️ Chess game initialized, turn:', game.turn());
    
    // Check if it's black's turn
    if (game.turn() !== 'b') {
      console.log('❌ Error: Not black\'s turn, current turn:', game.turn());
      return NextResponse.json({ error: 'Not black\'s turn' }, { status: 400 });
    }

    // Check if black has opened yet
    const hasBlackOpened = hasBlackMadeOpeningMove(game);
    console.log('🎯 Opening phase check - Black has opened:', hasBlackOpened);

    // Get all possible moves
    const moves = game.moves({ verbose: true });
    console.log('📋 Available moves count:', moves.length);
    
    if (moves.length === 0) {
      console.log('❌ Error: No moves available');
      return NextResponse.json({ error: 'No moves available' }, { status: 400 });
    }

    // Format moves for the agents
    const formattedMoves: MoveCandidate[] = moves.map(move => ({
      notation: move.san,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      description: `${move.piece.toUpperCase()} from ${move.from} to ${move.to}${move.captured ? ` (captures ${move.captured.toUpperCase()})` : ''}`
    }));
    console.log('📝 Formatted moves:', formattedMoves.map(m => m.notation).join(', '));

    // Initialize LangChain ChatOpenAI
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 400,
    });
    console.log('🤖 LangChain ChatOpenAI initialized');

    // Load openings prompt if needed
    let openingsContent = '';
    if (!hasBlackOpened) {
      try {
        const openingsPath = join(process.cwd(), 'src', 'prompts', 'openings.prompt');
        openingsContent = readFileSync(openingsPath, 'utf-8');
        console.log('📚 Loaded openings prompt, length:', openingsContent.length);
      } catch (error) {
        console.warn('⚠️ Could not load openings prompt:', error);
      }
    }

    // Run the agentic workflow using LangChain
    console.log('🔄 Starting agentic workflow...');
    const workflowStartTime = Date.now();
    
    const result = await runAgenticWorkflowChain(
      llm,
      game,
      formattedMoves,
      hasBlackOpened,
      openingsContent
    );

    const workflowDuration = Date.now() - workflowStartTime;
    const totalDuration = Date.now() - startTime;
    
    console.log('✅ Workflow completed successfully');
    console.log('⏱️ Workflow duration:', workflowDuration + 'ms');
    console.log('⏱️ Total duration:', totalDuration + 'ms');
    console.log('🎯 Final move:', result.move);
    console.log('📊 Evaluation score:', result.evaluation?.score);
    console.log('🔄 Iterations used:', result.iterations);

    return NextResponse.json(result);

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('💥 AI move v2 error after', totalDuration + 'ms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Main agentic workflow using LangChain chains
async function runAgenticWorkflowChain(
  llm: ChatOpenAI,
  game: Chess,
  moves: MoveCandidate[],
  hasBlackOpened: boolean,
  openingsContent: string
): Promise<any> {
  console.log('🔧 Initializing agentic workflow chain');
  const maxIterations = 5;
  let iteration = 0;
  let selectedMove: MoveCandidate | null = null;
  let evaluation: MoveEvaluation | null = null;
  const attemptHistory: { move: MoveCandidate; evaluation: MoveEvaluation }[] = [];

  // Create the chains and tools
  const moveSelectorChain = createMoveSelectorChain(llm);
  const moveEvaluatorTool = createMoveEvaluatorTool(llm);
  console.log('🛠️ Chains and tools created');

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${maxIterations}`);
    
    // Step 1: Move Selector Chain chooses a candidate move
    console.log('🎯 Move Selector Chain - selecting candidate move...');
    const selectorStartTime = Date.now();
    
    const selectorResponse = await moveSelectorChain.invoke({
      game,
      moves,
      hasBlackOpened,
      openingsContent,
      attemptHistory
    });

    const selectorDuration = Date.now() - selectorStartTime;
    console.log(`⏱️ Selector completed in ${selectorDuration}ms`);
    console.log('🎯 Selected move:', selectorResponse.move);
    console.log('💭 Selector reasoning:', selectorResponse.reasoning?.substring(0, 100) + '...');

    if (!selectorResponse.move) {
      console.error('❌ Move Selector Chain failed to propose a move');
      throw new Error('Move Selector Chain failed to propose a move');
    }

    // Find the selected move object
    selectedMove = moves.find(m => m.notation === selectorResponse.move) || null;
    if (!selectedMove) {
      console.error('❌ Selected move not found in available moves');
      throw new Error('Selected move not found in available moves');
    }

    // Step 2: Move Evaluator Tool evaluates the candidate move
    console.log('⚖️ Move Evaluator Tool - evaluating candidate move...');
    const evaluatorStartTime = Date.now();
    
    const toolInput = JSON.stringify({
      fen: game.fen(),
      candidateMove: selectedMove,
      hasBlackOpened,
      openingsContent
    });
    
    const toolResponse = await moveEvaluatorTool.invoke(toolInput);
    evaluation = JSON.parse(toolResponse);

    const evaluatorDuration = Date.now() - evaluatorStartTime;
    console.log(`⏱️ Evaluator completed in ${evaluatorDuration}ms`);
    console.log('📊 Evaluation score:', evaluation?.score);
    console.log('✅ Move approved:', evaluation?.approved);
    console.log('💭 Evaluator reasoning:', evaluation?.reasoning?.substring(0, 100) + '...');

    // Ensure evaluation is not null
    if (!evaluation) {
      console.error('❌ Move evaluator tool returned null evaluation');
      throw new Error('Move evaluator tool returned null evaluation');
    }

    // Record this attempt
    attemptHistory.push({ move: selectedMove, evaluation });
    console.log('📝 Attempt recorded, total attempts:', attemptHistory.length);

    // Step 3: Check if move is approved
    if (evaluation && evaluation.approved) {
      console.log('🎉 Move approved! Exiting iteration loop');
      break; // Move approved, exit loop
    }

    console.log('❌ Move rejected, removing from consideration');
    // Move rejected, remove it from consideration for next iteration
    moves = moves.filter(m => m.notation !== selectedMove!.notation);
    console.log('📋 Remaining moves:', moves.length);
    
    if (moves.length === 0) {
      console.log('⚠️ No more moves to try, using best rejected move');
      // No more moves to try, use the best rejected move
      const bestAttempt = attemptHistory.reduce((best, current) => 
        current.evaluation.score > best.evaluation.score ? current : best
      );
      selectedMove = bestAttempt.move;
      evaluation = bestAttempt.evaluation;
      console.log('🏆 Best rejected move:', selectedMove.notation, 'Score:', evaluation.score);
      break;
    }
  }

  // Make the final move
  console.log('🎯 Executing final move:', selectedMove!.notation);
  const finalMove = game.move(selectedMove!.notation);
  
  if (!finalMove) {
    console.error('❌ Final move execution failed');
    throw new Error('Final move execution failed');
  }

  console.log('✅ Final move executed successfully');
  console.log('📊 Final game state - Check:', game.isCheck(), 'Checkmate:', game.isCheckmate(), 'Stalemate:', game.isStalemate());

  const result = {
    move: finalMove.san,
    from: finalMove.from,
    to: finalMove.to,
    fen: game.fen(),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isGameOver: game.isGameOver(),
    evaluation: evaluation,
    iterations: iteration,
    attemptHistory: attemptHistory.map(attempt => ({
      move: attempt.move.notation,
      score: attempt.evaluation.score,
      approved: attempt.evaluation.approved,
      reasoning: attempt.evaluation.reasoning
    }))
  };

  console.log('📋 Workflow summary:');
  console.log('  - Total iterations:', iteration);
  console.log('  - Total attempts:', attemptHistory.length);
  console.log('  - Final move:', result.move);
  console.log('  - Final score:', result.evaluation?.score);

  return result;
}

// Create Move Selector Chain using LangChain
function createMoveSelectorChain(llm: ChatOpenAI) {
  const promptTemplate = PromptTemplate.fromTemplate(`
You are the Move Selector Agent, a chess expert playing as black. Your job is to choose the BEST move from the available options.

Current board position:
{boardVisual}

Current FEN: {fen}
It's black's turn to move.

Available moves:
{availableMoves}

{rejectedMoves}

{openingTheory}

Analysis criteria:
- Material balance and piece activity
- King safety and pawn structure  
- Tactical opportunities and positional advantages
- Control of key squares and development
{openingCriteria}

Choose the move that best balances all these factors. Consider the rejected moves and avoid similar patterns.

Respond in this exact format:
MOVE: [move notation]
REASONING: [your analysis of why this move is best]
`);

  return RunnableSequence.from([
    {
      boardVisual: (input: any) => createBoardVisual(input.game),
      fen: (input: any) => input.game.fen(),
      availableMoves: (input: any) => input.moves.map((move: MoveCandidate, index: number) => 
        `${index + 1}. ${move.notation} - ${move.description}`
      ).join('\n'),
      rejectedMoves: (input: any) => {
        const rejected = input.attemptHistory
          .filter((attempt: any) => !attempt.evaluation.approved)
          .map((attempt: any) => `${attempt.move.notation} (Score: ${attempt.evaluation.score}/10 - ${attempt.evaluation.reasoning})`)
          .join(', ');
        return rejected ? `Previously rejected moves: ${rejected}` : '';
      },
      openingTheory: (input: any) => {
        if (!input.hasBlackOpened && input.openingsContent) {
          return `\nOPENING THEORY REFERENCE:\n${input.openingsContent}\n\nSince this is the opening phase, prioritize moves that follow opening principles and established theory.`;
        }
        return '';
      },
      openingCriteria: (input: any) => input.hasBlackOpened ? '' : '- Opening principles and theory adherence'
    },
    promptTemplate,
    llm,
    new StringOutputParser(),
    (response: string) => {
      const moveMatch = response.match(/MOVE:\s*([^\n\r]+)/i);
      const reasoningMatch = response.match(/REASONING:\s*([^\n\r]+(?:\n[^\n\r]+)*)/i);
      
      return {
        move: moveMatch ? moveMatch[1].trim() : null,
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided'
      };
    }
  ]);
}

// Create Move Evaluator Tool using DynamicTool
function createMoveEvaluatorTool(llm: ChatOpenAI) {
  return new DynamicTool({
    name: "move_evaluator",
    description: "Evaluates a chess move on a scale of 1-10 considering material balance, king safety, piece activity, pawn structure, tactical soundness, and positional value. Returns approval status, score, reasoning, and suggestions.",
    func: async (input: string) => {
      console.log('🔧 Move Evaluator Tool - Starting evaluation');
      try {
        const params = JSON.parse(input);
        const { fen, candidateMove, hasBlackOpened, openingsContent } = params;
        
        console.log('📋 Evaluating move:', candidateMove.notation);
        console.log('🎯 Opening phase:', !hasBlackOpened);
        
        // Reconstruct game from FEN
        const game = new Chess(fen);
        const boardVisual = createBoardVisual(game);
        
        // Create a temporary game to analyze the move
        const tempGame = new Chess(fen);
        const moveResult = tempGame.move(candidateMove.notation);
        
        if (!moveResult) {
          console.log('❌ Invalid move detected:', candidateMove.notation);
          return JSON.stringify({
            approved: false,
            score: 1,
            reasoning: 'Move is invalid or illegal',
            suggestions: ['Choose a different move']
          });
        }

        const newBoardVisual = createBoardVisual(tempGame);
        console.log('✅ Move simulation successful');

        const promptTemplate = PromptTemplate.fromTemplate(`
You are the Move Evaluator Agent, a chess expert evaluating a candidate move for black.

Current board position:
{boardVisual}

Candidate move: {moveNotation} ({moveDescription})

Board position after the move:
{newBoardVisual}

{openingTheory}

Evaluate this move on a scale of 1-10 considering:
- Material balance (does it lose/gain material?)
- King safety (does it expose the king?)
- Piece activity (does it improve piece placement?)
- Pawn structure (does it weaken/strengthen pawns?)
- Tactical soundness (is it tactically sound?)
- Positional value (does it improve the position?)
{evaluationCriteria}

A move scoring 7+ should be approved, 4-6 needs improvement, 1-3 should be rejected.

Respond in this exact format:
SCORE: [number 1-10]
APPROVED: [true/false]
REASONING: [detailed analysis of the move's strengths and weaknesses]
SUGGESTIONS: [optional suggestions for improvement if not approved]
`);

        const chain = RunnableSequence.from([
          {
            boardVisual: () => boardVisual,
            moveNotation: () => candidateMove.notation,
            moveDescription: () => candidateMove.description,
            newBoardVisual: () => newBoardVisual,
            openingTheory: () => {
              if (!hasBlackOpened && openingsContent) {
                return `\nOPENING THEORY REFERENCE:\n${openingsContent}\n\nEvaluate this move considering opening principles and theory.`;
              }
              return '';
            },
            evaluationCriteria: () => hasBlackOpened ? '' : '- Opening principles adherence'
          },
          promptTemplate,
          llm,
          new StringOutputParser()
        ]);

        console.log('🤖 Calling LLM for evaluation...');
        const llmStartTime = Date.now();
        const response = await chain.invoke({});
        const llmDuration = Date.now() - llmStartTime;
        console.log(`⏱️ LLM evaluation completed in ${llmDuration}ms`);
        
        console.log('📝 Raw LLM response:', response.substring(0, 200) + '...');
        
        const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
        const approvedMatch = response.match(/APPROVED:\s*(true|false)/i);
        const reasoningMatch = response.match(/REASONING:\s*([^\n\r]+(?:\n[^\n\r]+)*)/i);
        const suggestionsMatch = response.match(/SUGGESTIONS:\s*([^\n\r]+(?:\n[^\n\r]+)*)/i);

        const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
        const approved = approvedMatch ? approvedMatch[1].toLowerCase() === 'true' : score >= 7;
        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';
        const suggestions = suggestionsMatch ? suggestionsMatch[1].trim() : undefined;

        console.log('📊 Parsed evaluation - Score:', score, 'Approved:', approved);

        const result = {
          approved,
          score,
          reasoning,
          suggestions: suggestions ? [suggestions] : undefined
        };

        console.log('✅ Move Evaluator Tool - Evaluation complete');
        return JSON.stringify(result);

      } catch (error) {
        console.error('💥 Move evaluator tool error:', error);
        return JSON.stringify({
          approved: false,
          score: 1,
          reasoning: 'Error evaluating move',
          suggestions: ['Try a different move']
        });
      }
    }
  });
}

// Helper functions (reused from original)
function hasBlackMadeOpeningMove(game: Chess): boolean {
  const history = game.history({ verbose: true });
  const blackMoves = history.filter((_, index) => index % 2 === 1);
  return blackMoves.length >= 3;
}

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

function getPieceSymbol(piece: any): string {
  const symbols: { [key: string]: { [key: string]: string } } = {
    'w': { 'k': '♔', 'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙' },
    'b': { 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' }
  };
  return symbols[piece.color][piece.type] || '?';
}
