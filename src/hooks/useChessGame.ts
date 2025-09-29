import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useChessAPI } from './useChessAPI';

export const useChessGame = () => {
  const [game, setGame] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [lastAIMove, setLastAIMove] = useState<{
    move: string;
    reasoning: string;
    timestamp: number;} | null>(null);
  const [moveHistory, setMoveHistory] = useState<Array<{
    fen: string;
    move: string;
    timestamp: number;
    isPlayerMove: boolean;
  }>>([]);

  // Chess API evaluation
  const { evaluation, isLoading: isEvaluating, error: evaluationError, evaluatePosition } = useChessAPI({ fen: game.fen() });

  // Auto-evaluate position when it changes
  useEffect(() => {
    if (!game.isGameOver()) {
      evaluatePosition();
    }
  }, [game.fen(), evaluatePosition]);

  // Memoized game state
  const gameState = useMemo(() => ({
    isGameOver: game.isGameOver(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isCheck: game.isCheck(),
    turn: game.turn(),
    fen: game.fen(),
    history: game.history(),
    board: game.board(),
    evaluation: evaluation,
    isEvaluating: isEvaluating,
    evaluationError: evaluationError
  }), [game, evaluation, isEvaluating, evaluationError]);

  // Memoized valid moves for selected square
  const validMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare as any, verbose: true })
      .map(move => move.to);
  }, [game, selectedSquare]);

  // Reset game
  const resetGame = useCallback(() => {
    setGame(new Chess());
    setSelectedSquare(null);
    setIsPlayerTurn(true);
    setLastAIMove(null);
    setMoveHistory([]);
  }, []);

  // Undo last move
  const undoMove = useCallback(() => {
    if (moveHistory.length > 0) {
      const lastMove = moveHistory[moveHistory.length - 1];
      setMoveHistory(prev => prev.slice(0, -1));
      
      // If undoing AI move, also clear AI reasoning
      if (!lastMove.isPlayerMove) {
        setLastAIMove(null);
      }
      
      // Restore game state
      setGame(new Chess(lastMove.fen));
      setSelectedSquare(null);
      setIsPlayerTurn(!lastMove.isPlayerMove); // Set turn to the player who made the move we're undoing
    }
  }, [moveHistory]);

  // Handle square click
  const handleSquareClick = useCallback((square: string) => {
    if (!isPlayerTurn) return;

    const piece = game.get(square as any);
    
    // If clicking on a piece of the current player
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
    }
    // If clicking on a valid move square
    else if (selectedSquare && validMoves.includes(square as any)) {
      try {
        const move = game.move({
          from: selectedSquare as any,
          to: square as any,
        });
        
        if (move) {
          // Add move to history
          setMoveHistory(prev => [...prev, {
            fen: game.fen(),
            move: move.san,
            timestamp: Date.now(),
            isPlayerMove: true
          }]);
          
          setSelectedSquare(null);
          setIsPlayerTurn(false);
          return true; // Indicates move was made
        }
      } catch (error) {
        console.error('Invalid move:', error);
      }
    }
    // Clear selection if clicking elsewhere
    else {
      setSelectedSquare(null);
    }
    
    return false; // No move was made
  }, [game, isPlayerTurn, selectedSquare, validMoves]);

  // Make AI move
  const makeAIMove = useCallback(async () => {
    try {
      const response = await fetch('/api/ai-move-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: game.fen() }),
      });

      if (!response.ok) throw new Error('Failed to get AI move');

      const data = await response.json();
      setGame(new Chess(data.fen));
      setIsPlayerTurn(true);
      
      // Store AI move reasoning if available
      if (data.reasoning) {
        setLastAIMove({
          move: data.move,
          reasoning: data.reasoning,
          timestamp: Date.now()
        });
      }
      
      // Add AI move to history
      setMoveHistory(prev => [...prev, {
        fen: data.fen,
        move: data.move,
        timestamp: Date.now(),
        isPlayerMove: false
      }]);
      
      return data;
    } catch (error) {
      console.error('Error getting AI move:', error);
      // Fallback to random move
      const moves = game.moves();
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(randomMove);
        setGame(new Chess(game.fen()));
        setIsPlayerTurn(true);
      }
    }
  }, [game]);

  return {
    game,
    gameState,
    selectedSquare,
    validMoves,
    isPlayerTurn,
    lastAIMove,
    moveHistory,
    resetGame,
    undoMove,
    handleSquareClick,
    makeAIMove,
    setGame,
    setIsPlayerTurn
  };
};
