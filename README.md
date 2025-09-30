# AI Chess Application

A sophisticated chess application featuring multiple AI-powered move generation APIs, built with Next.js, React, and TypeScript.

## Features

- **Interactive Chess Board**: Full-featured chess interface with piece movement, move validation, and game state management
- **Multiple AI APIs**: Three different AI move generation strategies
- **Real-time Position Evaluation**: Live chess position analysis with win percentages
- **Move History**: Complete game history tracking and display
- **Responsive Design**: Clean, minimal UI optimized for all screen sizes
- **Game State Management**: Proper handling of checkmate, stalemate, and game endings

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: CSS Modules
- **Chess Logic**: Chess.js
- **AI Integration**: OpenAI GPT-4o-mini
- **Position Evaluation**: Chess.com API
- **State Management**: React Hooks

## API Endpoints

### 1. `/api/ai-move` (V1 - Basic AI)

The foundational AI move generation endpoint with opening theory integration.

**Features:**
- Basic chess move generation using OpenAI GPT-4o-mini
- Opening theory integration for early game positions
- Game history analysis (last 6 moves)
- Opening prompt loading from `src/prompts/openings.prompt`

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "gameHistory": ["e4"]
}
```

**Response:**
```json
{
  "move": "e5",
  "reasoning": "This responds to White's e4 with the classical e5, controlling the center and preparing for piece development.",
  "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"
}
```

### 2. `/api/ai-move-v2` (V2 - Agentic Workflow)

Advanced agentic chess workflow using LangChain with two collaborating AI agents.

**Features:**
- **Move Selector Agent**: Proposes candidate moves based on position analysis
- **Move Evaluator Agent**: Evaluates proposed moves and provides feedback
- **Iterative Refinement**: Re-evaluates rejected moves until approval
- **LangChain Integration**: Uses `ChatOpenAI`, `PromptTemplate`, `RunnableSequence`, and `DynamicTool`
- **Comprehensive Logging**: Detailed execution tracking and debugging

**Architecture:**
```
Move Selector Agent → Proposes Move → Move Evaluator Agent → 
Approved? → Yes: Return Move | No: Re-evaluate → Loop
```

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "gameHistory": ["e4"]
}
```

**Response:**
```json
{
  "move": "e5",
  "reasoning": "The Move Selector Agent proposed e5, which was approved by the Move Evaluator Agent as it follows opening principles and controls the center.",
  "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
  "attempts": 1,
  "evaluation": {
    "score": 0.2,
    "reasoning": "Good opening move"
  }
}
```

### 3. `/api/ai-move-v3` (V3 - Dynamic Analysis)

The most sophisticated AI endpoint with dynamic prompt generation and historical move analysis.

**Features:**
- **Dynamic Game Phase Detection**: Automatically determines opening/middlegame/endgame
- **Position Analysis**: King safety, center control, piece activity, pawn structure
- **LLM-Powered Historical Analysis**: AI analyzes recent moves to understand game context
- **Phase-Specific Strategy**: Different guidance for each game phase
- **Two-Stage LLM Process**: Historical analysis → Move decision

**Game Phase Detection:**
- **Opening**: ≤8 moves
- **Middlegame**: 9-20 moves with sufficient material
- **Endgame**: <20 material points

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "gameHistory": ["e4"]
}
```

**Response:**
```json
{
  "move": "e5",
  "reasoning": "This develops the knight to a natural square, controls the center, and prepares for castling. Based on the historical analysis showing King's Pawn Opening, this move continues the development theme.",
  "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
  "gamePhase": "opening",
  "positionAnalysis": {
    "kingSafety": "King appears safe",
    "centerControl": "Analyze center control based on piece placement",
    "pieceActivity": "Evaluate piece mobility and coordination",
    "pawnStructure": "Assess pawn chains and weaknesses",
    "tacticalOpportunities": ["Look for pins", "Check for forks", "Identify skewers", "Find discovered attacks"]
  },
  "historicalAnalysis": "This appears to be a King's Pawn Opening with White playing e4. The move shows White is following classical opening principles by controlling the center and preparing for piece development."
}
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ai-move/route.ts          # V1 API
│   │   ├── ai-move-v2/route.ts       # V2 Agentic API
│   │   └── ai-move-v3/route.ts       # V3 Dynamic API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ChessBoard.tsx               # Main chess board component
│   └── ChessBoard.module.css        # Chess board styling
├── hooks/
│   ├── useChessGame.ts              # Core game state management
│   ├── useAIMove.ts                 # AI move triggering
│   ├── useChessAPI.ts               # Position evaluation
│   └── usePieceImage.ts             # Piece image mapping
├── prompts/
│   └── openings.prompt              # Opening theory reference
└── utils/
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-chess-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your OpenAI API key:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Playing Chess

1. **Make a Move**: Click on a piece, then click on a valid destination square
2. **AI Response**: The AI will automatically respond with its move
3. **Game Controls**: Use "New Game" to reset or "Undo" to take back moves
4. **Position Evaluation**: View real-time position analysis on the left sidebar

### API Selection

The application currently uses the V3 API by default. To switch APIs, modify the fetch URL in `src/hooks/useChessGame.ts`:

```typescript
// V1 API
const response = await fetch('/api/ai-move', { ... });

// V2 API  
const response = await fetch('/api/ai-move-v2', { ... });

// V3 API (current)
const response = await fetch('/api/ai-move-v3', { ... });
```

## API Comparison

| Feature | V1 (Basic) | V2 (Agentic) | V3 (Dynamic) |
|---------|------------|--------------|--------------|
| Move Generation | ✅ | ✅ | ✅ |
| Opening Theory | ✅ | ❌ | ✅ |
| Game Phase Detection | ❌ | ❌ | ✅ |
| Position Analysis | ❌ | ❌ | ✅ |
| Historical Analysis | Basic | ❌ | LLM-Powered |
| Agent Collaboration | ❌ | ✅ | ❌ |
| LangChain Integration | ❌ | ✅ | ❌ |
| Iterative Refinement | ❌ | ✅ | ❌ |

## Configuration

### Opening Theory

Modify `src/prompts/openings.prompt` to customize opening guidance for the AI.

### Position Evaluation

The application uses Chess.com's API for position evaluation. Modify `src/hooks/useChessAPI.ts` to change the evaluation source.

### AI Model

All APIs use OpenAI's GPT-4o-mini model. Modify the `model` parameter in each API route to use different models:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini', // Change this to 'gpt-4', 'gpt-3.5-turbo', etc.
  // ...
});
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Chess.js](https://github.com/jhlywa/chess.js) for chess logic
- [OpenAI](https://openai.com/) for AI capabilities
- [LangChain](https://langchain.com/) for agentic workflows
- [Chess.com API](https://www.chess.com/news/view/published-data-api) for position evaluation