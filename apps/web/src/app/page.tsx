export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold text-white mb-4">
          Unifyed
        </h1>
        <p className="text-xl text-slate-300 mb-8">
          Commerce OS for Creators
        </p>
        <p className="text-slate-400 mb-12">
          Turn any moment into a sale. Live commerce orchestration and replay monetization.
        </p>
        
        <div className="flex gap-4 justify-center">
          <a
            href="/dashboard"
            className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg transition-colors"
          >
            Go to Dashboard
          </a>
          <a
            href="/api/health"
            className="px-6 py-3 border border-slate-600 hover:border-slate-500 text-slate-300 font-medium rounded-lg transition-colors"
          >
            API Health
          </a>
        </div>
      </div>
      
      <footer className="absolute bottom-8 text-slate-500 text-sm">
        <p>API-first • Event-driven • Surface-agnostic</p>
      </footer>
    </main>
  );
}
