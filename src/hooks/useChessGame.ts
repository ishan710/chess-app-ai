/* eslint-disable @typescript-eslint/no-explicit-any */
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
    timestamp: number;
  } | null>(null);
  const [moveHistory, setMoveHistory] = useState<Array<{
    fen: string;
    move: string;
    timestamp: number;
    isPlayerMove: boolean;
  }>>([]);

  const { evaluation, isLoading: isEvaluating, error: evaluationError, evaluatePosition } = useChessAPI({ fen: game.fen() });
  
  useEffect(() => {
    if (!game.isGameOver()) {
      evaluatePosition();
    }
  }, [game.fen(), evaluatePosition]);

  const reconstructGameFromHistory = useCallback((moves: string[]) => {
    const newGame = new Chess();
    moves.forEach(move => {
      try {
        newGame.move(move);
      } catch (error) {
        console.error('Error replaying move:', move, error);
      }
    });
    return newGame;
  }, []);

  const gameWithHistory = useMemo(() => {
    const moves = moveHistory.map(move => move.move);
    return reconstructGameFromHistory(moves);
  }, [moveHistory, reconstructGameFromHistory]);

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
    evaluationError
  }), [gameWithHistory, evaluation, isEvaluating, evaluationError]);

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
  }, []);

  const undoMove = useCallback(() => {
    if (moveHistory.length > 0) {
      const lastMove = moveHistory[moveHistory.length - 1];
      setMoveHistory(prev => prev.slice(0, -1));
      
      if (!lastMove.isPlayerMove) {
        setLastAIMove(null);
      }
      
      setGame(new Chess(lastMove.fen));
      setSelectedSquare(null);
      setIsPlayerTurn(!lastMove.isPlayerMove);
    }
  }, [moveHistory]);

  const handleSquareClick = useCallback((square: string) => {
    if (!isPlayerTurn) return;

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
          setMoveHistory(prev => [...prev, {
            fen: game.fen(),
            move: move.san,
            timestamp: Date.now(),
            isPlayerMove: true
          }]);
          
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
  }, [game, isPlayerTurn, selectedSquare, validMoves]);

  const makeAIMove = useCallback(async () => {
    try {
      const currentFen = gameWithHistory.fen();
      const currentHistory = gameWithHistory.history();
      
      const response = await fetch('/api/ai-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fen: currentFen,
          gameHistory: currentHistory
        }),
      });

      if (!response.ok) throw new Error('Failed to get AI move');

      const data = await response.json();
      
      setMoveHistory(prev => [...prev, {
        fen: data.fen,
        move: data.move,
        timestamp: Date.now(),
        isPlayerMove: false
      }]);
      
      setGame(new Chess(data.fen));
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
  }, [gameWithHistory]);

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
