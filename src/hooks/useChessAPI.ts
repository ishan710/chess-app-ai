import { useState, useCallback } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Chess } from 'chess.js';

interface ChessAPIEvaluation {
  eval: number;
  winChance: number;
  text: string;
  depth: number;
  mate?: number;
  move?: string;
  san?: string;
}

interface UseChessAPIProps {
  fen: string;
}

export const useChessAPI = ({ fen }: UseChessAPIProps) => {
  const [evaluation, setEvaluation] = useState<ChessAPIEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluatePosition = useCallback(async () => {
    if (!fen) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('https://chess-api.com/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fen: fen,
          depth: 12, // Good balance of speed and accuracy
          maxThinkingTime: 50, // 50ms max thinking time
        }),
      });

      if (!response.ok) {
        throw new Error(`Chess API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle different response types
      if (data.type === 'bestmove' || data.type === 'move') {
        setEvaluation({
          eval: data.eval || 0,
          winChance: data.winChance || 50,
          text: data.text || '',
          depth: data.depth || 0,
          mate: data.mate,
          move: data.move,
          san: data.san,
        });
      } else if (data.type === 'info') {
        // Handle info messages (errors, status updates)
        setError(data.text || 'Unknown API response');
      }
    } catch (err) {
      console.error('Chess API evaluation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to evaluate position');
    } finally {
      setIsLoading(false);
    }
  }, [fen]);

  return {
    evaluation,
    isLoading,
    error,
    evaluatePosition,
  };
};
