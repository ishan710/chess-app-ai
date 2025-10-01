import { useState, useCallback, useEffect, useRef } from 'react';

interface TacticalStrategy {
  primaryGoal: string;
  tacticalPatterns: string[];
  pieceCoordination: string;
  keySquares: string[];
  pawnStructure: string;
  opponentThreats: string;
  movePriorities: string[];
}

interface StrategyData {
  strategy: TacticalStrategy;
  reasoning: string;
  gamePhase: string;
  timestamp: number;
  fen: string;
}

interface UseTacticalStrategyProps {
  fen: string;
  gameHistory: string[];
  moveCount: number;
}

const STRATEGY_STORAGE_KEY = 'chess-tactical-strategy';
const STRATEGY_UPDATE_INTERVAL = 3; // Update every 3 moves

export const useTacticalStrategy = ({ fen, gameHistory, moveCount }: UseTacticalStrategyProps) => {
  const [currentStrategy, setCurrentStrategy] = useState<TacticalStrategy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateMove, setLastUpdateMove] = useState<number>(0);
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);
  
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load strategy from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STRATEGY_STORAGE_KEY);
      if (stored) {
        const parsed: StrategyData = JSON.parse(stored);
        setStrategyData(parsed);
        setCurrentStrategy(parsed.strategy);
        setLastUpdateMove(Math.floor(moveCount / STRATEGY_UPDATE_INTERVAL) * STRATEGY_UPDATE_INTERVAL);
        console.log('🎯 Loaded strategy from localStorage:', parsed.strategy.primaryGoal);
      }
    } catch (error) {
      console.error('Failed to load strategy from localStorage:', error);
    }
  }, []);

  // Save strategy to localStorage
  const saveStrategyToStorage = useCallback((data: StrategyData) => {
    try {
      localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(data));

    } catch (error) {
      console.error('Failed to save strategy to localStorage:', error);
    }
  }, []);

  // Check if strategy needs updating
  const shouldUpdateStrategy = useCallback(() => {
    const movesSinceLastUpdate = moveCount - lastUpdateMove;
    return movesSinceLastUpdate >= STRATEGY_UPDATE_INTERVAL;
  }, [moveCount, lastUpdateMove]);

  // Generate new tactical strategy
  const generateStrategy = useCallback(async (currentFen?: string, currentHistory?: string[]) => {
    const fenToUse = currentFen || fen;
    const historyToUse = currentHistory || gameHistory;
    
    if (!fenToUse) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('🎯 Generating new tactical strategy...');
      
      const response = await fetch('/api/tactical-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fen: fenToUse,
          gameHistory: historyToUse,
          currentStrategy: currentStrategy,
          moveCount: moveCount
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.gameOver) {
          console.log('🎯 Game is over - not updating strategy');
          return;
        }
        throw new Error('Failed to generate tactical strategy');
      }

      const data: StrategyData = await response.json();
      
      setStrategyData(data);
      setCurrentStrategy(data.strategy);
      setLastUpdateMove(moveCount);
      saveStrategyToStorage(data);
      
      console.log('🎯 New strategy generated:', data.strategy.primaryGoal);
      
    } catch (err) {
      console.error('Tactical strategy generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate strategy');
    } finally {
      setIsLoading(false);
    }
  }, [fen, gameHistory, currentStrategy, moveCount, saveStrategyToStorage]);

  // Auto-update strategy when conditions are met
  useEffect(() => {
    if (shouldUpdateStrategy() && !isLoading) {
      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // Delay the update slightly to avoid blocking the UI
      updateTimeoutRef.current = setTimeout(() => {
        generateStrategy();
      }, 100);
    }

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [shouldUpdateStrategy, generateStrategy, isLoading]);

  // Manual strategy refresh
  const refreshStrategy = useCallback(() => {
    generateStrategy();
  }, [generateStrategy]);

  // Clear strategy (useful for new games)
  const clearStrategy = useCallback(() => {
    setCurrentStrategy(null);
    setStrategyData(null);
    setLastUpdateMove(0);
    setError(null);
    localStorage.removeItem(STRATEGY_STORAGE_KEY);
    console.log('🎯 Strategy cleared');
  }, []);

  // Get tactical patterns for AI move API
  const getTacticalPatterns = useCallback(() => {
    if (!currentStrategy) return [];
    
    return [
      currentStrategy.primaryGoal,
      ...currentStrategy.tacticalPatterns,
      currentStrategy.pieceCoordination,
      ...currentStrategy.movePriorities
    ];
  }, [currentStrategy]);

  return {
    currentStrategy,
    strategyData,
    isLoading,
    error,
    lastUpdateMove,
    movesUntilNextUpdate: STRATEGY_UPDATE_INTERVAL - (moveCount - lastUpdateMove),
    generateStrategy,
    refreshStrategy,
    clearStrategy,
    getTacticalPatterns,
    shouldUpdateStrategy: shouldUpdateStrategy()
  };
};
