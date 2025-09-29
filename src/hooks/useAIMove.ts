import { useCallback, useEffect } from 'react';

interface UseAIMoveProps {
  isPlayerTurn: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeAIMove: () => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setIsPlayerTurn: (turn: boolean) => void;
}

export const useAIMove = ({ isPlayerTurn, makeAIMove, setIsPlayerTurn: _setIsPlayerTurn }: UseAIMoveProps) => {
  const triggerAIMove = useCallback(async () => {
    if (!isPlayerTurn) {
      const result = await makeAIMove();
      if (result?.isGameOver) {
        console.log('Game over:', result.isCheckmate ? 'Checkmate!' : 'Stalemate!');
      }
    }
  }, [isPlayerTurn, makeAIMove]);

  // Auto-trigger AI move when it's not player's turn
  useEffect(() => {
    if (!isPlayerTurn) {
      const timer = setTimeout(triggerAIMove); // Small delay for better UX
      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, triggerAIMove]);

  return { triggerAIMove };
};
