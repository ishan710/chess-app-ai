/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useChessAPI } from './useChessAPI';
import { useTacticalStrategy } from './useTacticalStrategy';

export const useChessGame = () => {
  const [game, setGame] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [intervalId, setIntervalId] = useState(null);
  
  const [blackTime, setBlackTime] = useState(20)
  const [whiteTime, setWhiteTime] = useState(20)
  
  const [lastAIMove, setLastAIMove] = useState<{
    move: string;
    reasoning: string;
    timestamp: number;
  } | null>(null);
  const [moveHistory, setMoveHistory] = useState<Array<{
    fen: string;
    move: string;
    timestamp: number;
    isPlayerMove: boolean;
    isPlayerTurn: boolean;
  }>>([]);
  const [moveCount, setMoveCount] = useState(0);

  const { evaluation, isLoading: isEvaluating, error: evaluationError, evaluatePosition } = useChessAPI({ fen: game.fen() });
  
  const fen = game.fen();

  // Console log the board state for debugging
  console.log('Current board state:', game.board());
  console.log('Current FEN:', game.fen());
  console.log('Current turn:', game.turn());
  console.log('Is player turn:', isPlayerTurn);

  const gameWithHistory = useMemo(() => {
    // Use the current game state directly since we're storing complete FEN states
    return game;
  }, [game]);
  
  // Initialize tactical strategy
  const {
    currentStrategy,
    strategyData,
    isLoading: isStrategyLoading,
    error: strategyError,
    lastUpdateMove,
    movesUntilNextUpdate,
    getTacticalPatterns,
    refreshStrategy,
    clearStrategy
  } = useTacticalStrategy({ 
    fen, 
    gameHistory: gameWithHistory.history(), 
    moveCount 
  });
  
  useEffect(() => {
    if (!game.isGameOver()) {
      evaluatePosition(fen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);


  useEffect(() => {
    if (isPlayerTurn && moveCount > 0){
      const interval = setInterval(() => {
        setWhiteTime(prevCount => prevCount - 1);
        setIntervalId(interval)
      }, 1000);
      setBlackTime(prevCount => prevCount - 3);
    }
    if (!isPlayerTurn){
      const interval = setInterval(() => {
        setBlackTime(prevCount => prevCount - 1);
        setIntervalId(interval)
      }, 1000);
    }
    clearInterval(intervalId);
    setIntervalId(null)
  }, [isPlayerTurn, moveCount]);


  const gameState = useMemo(() => ({
    isGameOver: gameWithHistory.isGameOver(),
    isCheckmate: gameWithHistory.isCheckmate(),
    isStalemate: gameWithHistory.isStalemate(),
    isCheck: gameWithHistory.isCheck(),
    turn: gameWithHistory.turn(),
    fen: gameWithHistory.fen(),
    history: gameWithHistory.history(),
    board: gameWithHistory.board(),
    evaluation,
    isEvaluating,
    evaluationError,
    // Tactical strategy state
    currentStrategy,
    strategyData,
    isStrategyLoading,
    strategyError,
    movesUntilNextUpdate
  }), [gameWithHistory, evaluation, isEvaluating, evaluationError, currentStrategy, strategyData, isStrategyLoading, strategyError, movesUntilNextUpdate]);

  const validMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare as any, verbose: true })
      .map((move: any) => move.to);
  }, [game, selectedSquare]);

  const resetGame = useCallback(() => {
    setGame(new Chess());
    setSelectedSquare(null);
    setIsPlayerTurn(true);
    setLastAIMove(null);
    setMoveHistory([]);
    setMoveCount(0);
    setBlackTime(10);
    setWhiteTime(10);
    clearStrategy(); // Clear tactical strategy for new game
  }, [clearStrategy]);

  const undoMove = useCallback(() => {
    if (moveHistory.length > 0) {
      const lastMove = moveHistory[moveHistory.length - 1];
      const newMoveHistory = moveHistory.slice(0, -1);
      
      // If there are moves left, restore to the previous state
      if (newMoveHistory.length > 0) {
        const previousMove = newMoveHistory[newMoveHistory.length - 1];
        setGame(new Chess(previousMove.fen));
        setIsPlayerTurn(previousMove.isPlayerTurn);
      } else {
        // If no moves left, reset to initial state
        setGame(new Chess());
        setIsPlayerTurn(true);
      }
      
      setMoveHistory(newMoveHistory);
      setMoveCount(newMoveHistory.length);
      setSelectedSquare(null);
      
      if (!lastMove.isPlayerMove) {
        setLastAIMove(null);
      }
    }
  }, [moveHistory]);

  const handleSquareClick = useCallback((square: string) => {
    if (!isPlayerTurn || gameWithHistory.isGameOver()) return;

    const piece = game.get(square as any);
    
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
    } else if (selectedSquare && validMoves.includes(square as any)) {
      try {
        const move = game.move({
          from: selectedSquare as any,
          to: square as any,
        });
        
        if (move) {
          // Create a new game instance with the updated state
          const newGame = new Chess(game.fen());
          setMoveHistory(prev => [...prev, {
            fen: newGame.fen(),
            move: move.san,
            timestamp: Date.now(),
            isPlayerMove: true,
            isPlayerTurn: false // After player move, it's AI's turn
          }]);
          
          setGame(newGame);
          setMoveCount(prev => prev + 1);
          setSelectedSquare(null);
          setIsPlayerTurn(false);
          return true;
        }
      } catch (error) {
        console.error('Invalid move:', error);
      }
    } else {
      setSelectedSquare(null);
    }
    
    return false;
  }, [game, isPlayerTurn, selectedSquare, validMoves, gameWithHistory]);

  const makeAIMove = useCallback(async () => {
    try {
      // Check if game is over before making AI move
      if (gameWithHistory.isGameOver()) {
        console.log('🎯 Game is over - not making AI move');
        return null;
      }

      const currentFen = gameWithHistory.fen();
      const currentHistory = gameWithHistory.history();
      
      // Get tactical patterns for AI move
      const tacticalPatterns = getTacticalPatterns();
      
      const response = await fetch('/api/ai-move-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fen: currentFen,
          gameHistory: currentHistory,
          tacticalPatterns: tacticalPatterns,
          moveCount: moveCount
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.gameOver) {
          console.log('🎯 Game is over:', errorData.result);
          setIsPlayerTurn(false); // Prevent further moves
          return null;
        }
        throw new Error('Failed to get AI move');
      }

      const data = await response.json();
      
      setMoveHistory(prev => [...prev, {
        fen: data.fen,
        move: data.move,
        timestamp: Date.now(),
        isPlayerMove: false,
        isPlayerTurn: true // After AI move, it's player's turn
      }]);
      
      setGame(new Chess(data.fen));
      setMoveCount(prev => prev + 1);
      setIsPlayerTurn(true);
      
      if (data.reasoning) {
        setLastAIMove({
          move: data.move,
          reasoning: data.reasoning,
          timestamp: Date.now()
        });
      }
      
      return data;
    } catch (error) {
      console.error('Error getting AI move:', error);
      const moves = game.moves();
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(randomMove);
        setGame(new Chess(game.fen()));
        setIsPlayerTurn(true);
      }
    }
  }, [gameWithHistory, game, getTacticalPatterns]);

  return {
    game,
    gameState,
    selectedSquare,
    validMoves,
    isPlayerTurn,
    lastAIMove,
    moveHistory,
    moveCount,
    resetGame,
    undoMove,
    handleSquareClick,
    makeAIMove,
    setGame,
    setIsPlayerTurn,
    whiteTime,
    blackTime,
    // Tactical strategy controls
    refreshStrategy,
    clearStrategy
  };
};
