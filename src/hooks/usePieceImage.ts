import { useMemo } from 'react';

// Map chess.js piece types to actual file names
const PIECE_TYPE_MAP: { [key: string]: string } = {
  'p': 'pawn',
  'r': 'rook', 
  'n': 'knight',
  'b': 'bishop',
  'q': 'queen',
  'k': 'king'
};

export const usePieceImage = () => {
  const getPieceImage = useMemo(() => {
    return (piece: any): string | null => {
      if (!piece) return null;
      
      const color = piece.color === 'w' ? 'w' : 'b';
      const type = PIECE_TYPE_MAP[piece.type];
      
      if (!type) return null;
      
      return `/pieces/${type}-${color}.svg`;
    };
  }, []);

  return { getPieceImage };
};
