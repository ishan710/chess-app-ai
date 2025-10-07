'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import styles from './ChessBoard.module.css';
import { useChessGame } from '@/hooks/useChessGame';
import { usePieceImage } from '@/hooks/usePieceImage';
import { useAIMove } from '@/hooks/useAIMove';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
    setIsPlayerTurn,
    refreshStrategy,
    clearStrategy,
    whiteTime,
    blackTime,
  } = useChessGame();

  const { getPieceImage } = usePieceImage();
  const historyContentRef = useRef<HTMLDivElement>(null);
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);

  // Auto-trigger AI moves
  useAIMove({ isPlayerTurn, makeAIMove, setIsPlayerTurn });

  // Auto-scroll to bottom when new moves are added
  useEffect(() => {
    if (historyContentRef.current) {
      historyContentRef.current.scrollTop = historyContentRef.current.scrollHeight;
    }
  }, [moveHistory]);

  useEffect(() => {
  if (whiteTime <= 0 || blackTime <= 0){
    resetGame()
  }},[whiteTime, blackTime])

  // Memoized board rendering
  const boardSquares = useMemo(() => {
    return gameState.board.map((row, i) =>
      row.map((piece, j) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              // eslint-disable-next-line @next/next/no-img-element
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    <div className={styles.chessGame}>
      <div className={styles.performanceBar}>
        {/* Tactical Strategy Display */}
        {gameState.currentStrategy && (
          <div className={styles.tacticalStrategy}>
            <div 
              className={styles.strategyHeader}
              onClick={() => setIsStrategyExpanded(!isStrategyExpanded)}
            >
              <div className={styles.strategyTitle}>
                <span className={styles.strategyIcon}>
                  {isStrategyExpanded ? '▼' : '▶'}
                </span>
                <span>AI Strategy</span>
                {gameState.movesUntilNextUpdate > 0 && (
                  <span className={styles.updateCountdown}>
                    ({gameState.movesUntilNextUpdate} moves)
                  </span>
                )}
              </div>
              <div className={styles.strategyControls}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    refreshStrategy();
                  }}
                  className={styles.refreshButton}
                  disabled={gameState.isStrategyLoading}
                >
                  {gameState.isStrategyLoading ? 'Updating...' : 'Refresh'}
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    clearStrategy();
                  }}
                  className={styles.clearButton}
                >
                  Clear
                </button>
              </div>
            </div>
            {isStrategyExpanded && (
              <div className={styles.strategyContent}>
                <div className={styles.primaryGoal}>
                  <strong>Goal:</strong> {gameState.currentStrategy.primaryGoal}
                </div>
                <div className={styles.tacticalPatterns}>
                  <strong>Patterns:</strong>
                  <ul>
                    {gameState.currentStrategy.tacticalPatterns.map((pattern, index) => (
                      <li key={index}>{pattern}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.movePriorities}>
                  <strong>Priorities:</strong>
                  <ul>
                    {gameState.currentStrategy.movePriorities.map((priority, index) => (
                      <li key={index}>{priority}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.barContainer}>
          <div 
            className={styles.barFill}
            style={{ 
              height: `${positionEvaluation.percentage}%`,
              backgroundColor: positionEvaluation.advantage === 'White' ? '#22c55e' : 
                               positionEvaluation.advantage === 'Black' ? '#ef4444' : '#f59e0b'
            }}
          />
        </div>
        <div className={styles.winPercentages}>
          <div className={styles.blackWin}>
            BLACK: {(100 - positionEvaluation.winChance).toFixed(1)}%
          </div>
          <div className={styles.whiteWin}>
            WHITE: {positionEvaluation.winChance.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className={styles.blackWin}>
            BLACK: Time {blackTime}
          </div>
          <div className={styles.whiteWin}>
            WHITE: Time {whiteTime}
          </div>
        </div>
        <div className={styles.turnText}>
          {isPlayerTurn ? 'Your Turn' : 'AI Thinking...'}
        </div>
        {gameState.isEvaluating && (
          <div className={styles.evaluatingIndicator}>
            🔍
          </div>
        )}
      </div>
      <div className={styles.gameArea}>

        <div className={styles.chessBoard}>
          {boardSquares}
        </div>
        
        <div className={styles.gameControls}>
          <button
            onClick={resetGame}
            className={styles.controlButton}
          >
            New Game
          </button>
          
          <button
            onClick={undoMove}
            disabled={moveHistory.length === 0}
            className={`${styles.controlButton} ${moveHistory.length === 0 ? styles.disabledButton : ''}`}
          >
            Undo
          </button>
        </div>
      </div>

      {/* AI Move Info */}
      {lastAIMove && (
        <div className={styles.aiMoveInfo}>
          <div className={styles.moveNotation}>{lastAIMove.move}</div>
          <div className={styles.moveReasoning}>{lastAIMove.reasoning}</div>
        </div>
      )}

      {/* Move History */}
      <div className={styles.moveHistory}>
        <div className={styles.historyHeader}>Move History</div>
        <div className={styles.historyContent} ref={historyContentRef}>
          {moveHistory.length === 0 ? (
            <div className={styles.emptyHistory}>No moves yet</div>
          ) : (
            moveHistory.map((entry, index) => (
              <div key={index} className={styles.historyEntry}>
                <div className={styles.moveNumber}>{Math.floor(index / 2) + 1}.</div>
                <div className={entry.isPlayerMove ? styles.playerMove : styles.aiMove}>
                  {entry.move}
                </div>
                <div className={styles.movePlayer}>
                  {entry.isPlayerMove ? '(White)' : '(Black)'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
