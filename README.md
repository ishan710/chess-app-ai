# AI Chess Application - V3 API

A sophisticated chess application featuring advanced AI-powered move generation with persistent tactical strategy and dynamic prompt engineering.

## Core Features

- **V3 AI Move Generation**: Advanced chess AI with retry logic and move validation
- **Tactical Strategy System**: Persistent AI strategy that evolves every 3 moves
- **Dynamic Prompt Engineering**: Phase-specific prompts for opening, middlegame, and endgame
- **Interactive Chess Board**: Full-featured chess interface with real-time evaluation
- **Local Storage Persistence**: Tactical strategies persist between sessions

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Chess Logic**: Chess.js
- **AI Integration**: OpenAI GPT-4o-mini
- **Styling**: CSS Modules
- **State Management**: React Hooks

## V3 API Endpoint: `/api/ai-move-v3`

The most advanced AI chess endpoint with intelligent retry logic and tactical strategy integration.

### Key Features

- **Retry Logic**: Up to 5 attempts with improved prompts for invalid moves
- **Tactical Strategy Integration**: Uses persistent AI strategy for consistent play
- **Dynamic Game Phase Detection**: Automatically adapts to opening/middlegame/endgame
- **Position Analysis**: Real-time evaluation of king safety, center control, and piece activity
- **LLM-Powered Historical Analysis**: AI analyzes recent moves for context
- **Move Validation**: Ensures all moves are legal and from available moves list


## Tactical Analysis System

### `/api/tactical-analysis`

Generates comprehensive tactical strategies that persist across multiple moves.

#### Features

- **Persistent Strategy**: AI maintains consistent strategic approach
- **Every 3 Moves Update**: Strategy refreshes automatically every 3 moves
- **Local Storage**: Strategies persist between browser sessions
- **Context Awareness**: Uses previous strategy as context for new strategies
- **Non-blocking**: Runs in parallel with move generation


## Dynamic Prompt System

### Game Phase Detection

The system automatically detects game phases and applies appropriate strategies:

- **Opening**: ≤2 moves - Uses opening theory and development principles
- **Middlegame**: 3-20 moves with sufficient material - Focuses on tactics and strategy
- **Endgame**: <20 material points - Emphasizes king activity and pawn promotion

### Prompt Structure

#### Opening Prompts (`src/prompts/openings.ts`)

Contains 18+ classical chess openings with move sequences and strategic descriptions:

```typescript
export const openingsPrompt = `
# Standard Chess Openings

## 1. Ruy Lopez (Spanish Opening)  
**Moves:** "1. e4 e5 2. Nf3 Nc6 3. Bb5"  
**Description:** White develops quickly and pressures Black's knight on c6, indirectly targeting the center.

## 2. Italian Game  
**Moves:** "1. e4 e5 2. Nf3 Nc6 3. Bc4"  
**Description:** Aiming for quick development and central control, with chances for aggressive play against f7.
...
`;
```

#### Middlegame Prompts (`src/prompts/middleGame.ts`)

Strategic guidance for complex tactical positions:

```typescript
export const middleGamePrompt = `
You are in the middle game. The opening is mostly complete, and both sides have developed their pieces. 
Your goal is to build a superior position through strategic planning, not just immediate material gain.

STRATEGIC PHILOSOPHY:
- DON'T always chase immediate tactical gains or captures
- THINK 3-5 moves ahead. What position do you want to achieve?
- TRY TO CONFUSE YOUR OPPONENT by making unexpected moves
- Create multiple threats so your opponent doesn't know which one to defend against
...
`;
```

#### Endgame Prompts (`src/prompts/endGame.ts`)

Specialized guidance for endgame positions:

```typescript
export const endgamePrompt = `
You are in the endgame. Many pieces have been traded, and every move becomes crucial.
Pawns, king activity, and precise calculation are paramount.

ENDGAME PHILOSOPHY:
- PATIENCE IS KEY: Don't rush. The win may take 15-20 moves
- TECHNIQUE OVER TACTICS: Perfect technique beats flashy moves
- THINK LIKE A COMPUTER: Calculate forced sequences to the end
- CONFUSE WITH PRECISION: Make moves that maintain all options
...
`;
```

### Enhanced Move Validation

The V3 API includes sophisticated move validation with retry logic:

1. **First Attempt**: Generate move with standard prompt
2. **Validation**: Check if move is in available moves list
3. **Retry Logic**: If invalid, update prompt with:
   - Available moves list
   - Previous invalid attempt
   - Clear instructions for exact notation
4. **Up to 5 Attempts**: Ensures reliable move generation

### Prompt Engineering Features

- **Visual Board Representation**: ASCII chess board in prompts
- **Move Scoring**: Prioritizes capturing and tactical moves
- **Tactical Pattern Integration**: Uses current strategy patterns
- **Historical Context**: AI analyzes recent moves for context
- **Phase-Specific Guidance**: Different strategies for each game phase
- **Explicit Move Lists**: Clear available moves with exact notation

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ai-move-v3/route.ts          # V3 AI Move API
│   │   └── tactical-analysis/route.ts   # Tactical Strategy API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ChessBoard.tsx                   # Main chess board component
│   └── ChessBoard.module.css            # Chess board styling
├── hooks/
│   ├── useChessGame.ts                  # Core game state management
│   ├── useTacticalStrategy.ts           # Tactical strategy management
│   ├── useChessAPI.ts                   # Position evaluation
│   └── usePieceImage.ts                 # Piece image mapping
├── prompts/
│   ├── openings.ts                      # Opening theory (18+ openings)
│   ├── middleGame.ts                    # Middlegame strategy
│   └── endGame.ts                       # Endgame technique
└── utils/
    └── chessUtils.ts                    # Chess utilities and prompt generation
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
2. **AI Response**: The AI will automatically respond using the V3 API
3. **Tactical Strategy**: View the AI's current strategy in the collapsible panel
4. **Strategy Updates**: Strategy automatically updates every 3 moves
5. **Game Controls**: Use "New Game" to reset or "Undo" to take back moves

### Tactical Strategy Management

- **View Strategy**: Click on the "AI Strategy" panel to expand/collapse
- **Manual Refresh**: Use the "Refresh" button to force strategy update
- **Clear Strategy**: Use the "Clear" button to reset strategy for new game
- **Persistent Storage**: Strategies automatically save to localStorage

## Configuration

### Customizing Prompts

Modify the prompt files to customize AI behavior:

- `src/prompts/openings.ts`: Add or modify opening theory
- `src/prompts/middleGame.ts`: Adjust middlegame strategy
- `src/prompts/endGame.ts`: Customize endgame technique

### AI Model Configuration

Modify the model in `src/app/api/ai-move-v3/route.ts`:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini', // Change to 'gpt-4', 'gpt-3.5-turbo', etc.
  // ...
});
```

### Retry Logic Configuration

Adjust retry attempts in `src/app/api/ai-move-v3/route.ts`:

```typescript
const maxAttempts = 5; // Change number of retry attempts
```

## Technical Details

### Move Validation Process

1. **Generate Move**: LLM creates move based on current position
2. **Validate Move**: Check if move exists in `game.moves()` list
3. **Retry if Invalid**: Update prompt with available moves and retry
4. **Return Valid Move**: Ensure move is legal and properly formatted

### Tactical Strategy Lifecycle

1. **Initial Strategy**: Generated on first move
2. **Strategy Persistence**: Saved to localStorage
3. **Periodic Updates**: Refreshed every 3 moves
4. **Context Integration**: Previous strategy used as context for new strategy
5. **Game Reset**: Strategy cleared when starting new game

### Prompt Engineering Techniques

- **Explicit Instructions**: Clear, unambiguous move selection requirements
- **Visual Cues**: Emojis and formatting to highlight important sections
- **Concrete Examples**: Shows exactly what correct responses look like
- **Error Prevention**: Multiple layers of validation and retry logic
- **Context Awareness**: Uses game history and current strategy for better decisions

## License

This project is licensed under the MIT License.

## Acknowledgments

- [Chess.js](https://github.com/jhlywa/chess.js) for chess logic
- [OpenAI](https://openai.com/) for AI capabilities
- [Chess.com API](https://www.chess.com/news/view/published-data-api) for position evaluation