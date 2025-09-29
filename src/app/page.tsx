import ChessBoard from '@/components/ChessBoard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          AI Chess App
        </h1>
        <div className="flex justify-center">
          <ChessBoard />
        </div>
      </div>
    </div>
  );
}