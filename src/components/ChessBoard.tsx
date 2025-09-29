'use client';

import { useMemo } from 'react';
import styles from './ChessBoard.module.css';
import { useChessGame } from '@/hooks/useChessGame';
import { usePieceImage } from '@/hooks/usePieceImage';
import { useAIMove } from '@/hooks/useAIMove';

interface ChessBoardProps {}

const ChessBoard: React.FC<ChessBoardProps> = () => {
  const {
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
    setIsPlayerTurn
  } = useChessGame();

  const { getPieceImage } = usePieceImage();

  // Auto-trigger AI moves
  useAIMove({ isPlayerTurn, makeAIMove, setIsPlayerTurn });

  // Memoized board rendering
  const boardSquares = useMemo(() => {
    return gameState.board.map((row, i) =>
      row.map((piece, j) => {
        const square = (String.fromCharCode(97 + j) + (8 - i)) as any;
        const isLight = (i + j) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isValidMove = validMoves.includes(square);
        
        const squareClasses = [
          styles.chessSquare,
          isLight ? styles.lightSquare : styles.darkSquare,
          isSelected ? styles.selectedSquare : '',
          isValidMove ? styles.validMoveSquare : ''
        ].filter(Boolean).join(' ');
        
        return (
          <div
            key={square}
            className={squareClasses}
            onClick={() => handleSquareClick(square)}
          >
            {piece && getPieceImage(piece) && (
              <img 
                src={getPieceImage(piece)!} 
                alt={`${piece.color} ${piece.type}`}
                className={styles.chessPiece}
                onError={(e) => {
                  console.error('Failed to load image:', getPieceImage(piece));
                  console.error('Error:', e);
                }}
              />
            )}
            {isValidMove && !piece && (
              <div className={styles.validMoveIndicator}></div>
            )}
          </div>
        );
      })
    ).flat();
  }, [gameState.board, selectedSquare, validMoves, getPieceImage, handleSquareClick]);

  // Memoized game status
  const gameStatus = useMemo(() => {
    if (gameState.isGameOver) {
      return (
        <span className={styles.gameStatusOver}>
          Game Over - {gameState.isCheckmate ? 'Checkmate!' : 'Stalemate!'}
        </span>
      );
    }
    
    return (
      <span className={isPlayerTurn ? styles.gameStatusPlayer : styles.gameStatusAI}>
        {isPlayerTurn ? 'Your Turn (White)' : 'AI Thinking... (Black)'}
      </span>
    );
  }, [gameState.isGameOver, gameState.isCheckmate, isPlayerTurn]);

  // Professional position evaluation progress bar
  const positionEvaluation = useMemo(() => {
    if (!gameState.evaluation) {
      return {
        percentage: 50,
        winChance: 50,
        eval: 0,
        advantage: 'Equal',
        text: 'Evaluating...',
        depth: 0,
        mate: null
      };
    }

    const evaluation = gameState.evaluation.eval;
    const winChance = gameState.evaluation.winChance;
    const mate = gameState.evaluation.mate;
    
    // Handle mate positions
    if (mate) {
      const isWhiteMate = mate > 0;
      return {
        percentage: isWhiteMate ? 100 : 0,
        winChance: isWhiteMate ? 100 : 0,
        evaluation: mate,
        advantage: isWhiteMate ? 'White' : 'Black',
        text: `Mate in ${Math.abs(mate)}`,
        depth: gameState.evaluation.depth,
        mate: mate
      };
    }
    
    return {
      percentage: Math.round(winChance),
      winChance: Math.round(winChance * 10) / 10,
      evaluation: Math.round(evaluation * 100) / 100,
      advantage: winChance > 50 ? 'White' : winChance < 50 ? 'Black' : 'Equal',
      text: gameState.evaluation.text || '',
      depth: gameState.evaluation.depth,
      mate: null
    };
  }, [gameState.evaluation]);

  return (
    <div className={styles.chessContainer}>
      <div className={styles.gameStatus}>
        {gameStatus}
      </div>
      
      {/* Professional Position Evaluation */}
      <div className={styles.positionEvaluation}>
        <div className={styles.evaluationLabels}>
          <span className={styles.whiteLabel}>White</span>
          <span className={styles.evaluationValue}>
            {positionEvaluation.mate ? 
              `M${positionEvaluation.mate}` : 
              `${(positionEvaluation.evaluation || 0) > 0 ? '+' : ''}${positionEvaluation.evaluation || 0}`
            }
          </span>
          <span className={styles.blackLabel}>Black</span>
        </div>
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{ width: `${positionEvaluation.percentage}%` }}
          />
        </div>
        <div className={styles.evaluationDetails}>
          <div className={styles.advantageText}>
            {positionEvaluation.mate ? 
              `${positionEvaluation.advantage} ${positionEvaluation.text}` :
              positionEvaluation.advantage === 'Equal' ? 
                'Equal Position' : 
                `${positionEvaluation.advantage} Advantage (${positionEvaluation.winChance}%)`
            }
          </div>
          {gameState.isEvaluating && (
            <div className={styles.evaluatingText}>
              🔍 Analyzing position... (Depth: {positionEvaluation.depth})
            </div>
          )}
          {gameState.evaluationError && (
            <div className={styles.errorText}>
              ⚠️ Evaluation error: {gameState.evaluationError}
            </div>
          )}
          {positionEvaluation.text && !positionEvaluation.mate && (
            <div className={styles.analysisText}>
              📊 {positionEvaluation.text}
            </div>
          )}
        </div>
      </div>
      
      <div className={styles.chessBoard}>
        {boardSquares}
      </div>
      
      <div className={styles.controlButtons}>
        <button
          onClick={resetGame}
          className={`${styles.controlButton} ${styles.newGameButton}`}
        >
          New Game
        </button>
        
        <button
          onClick={undoMove}
          disabled={moveHistory.length === 0}
          className={`${styles.controlButton} ${styles.undoButton} ${moveHistory.length === 0 ? styles.disabledButton : ''}`}
        >
          Undo Move {moveHistory.length > 0 && `(${moveHistory.length})`}
        </button>
      </div>
      
      <div className={styles.gameInfo}>
        <p>FEN: {gameState.fen}</p>
        <p>Moves: {gameState.history.length}</p>
      </div>
      
      {lastAIMove && (
        <div className={styles.aiReasoning}>
          <h3>AI's Last Move: {lastAIMove.move}</h3>
          <div className={styles.reasoningText}>
            <strong>Reasoning:</strong> {lastAIMove.reasoning}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChessBoard;
