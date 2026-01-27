export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-600 to-pink-500 p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg backdrop-blur-sm" />
            <span className="text-2xl font-bold text-white">Unifyed</span>
          </div>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white">
            Turn any moment into a sale
          </h1>
          <p className="text-xl text-white/80">
            Live commerce orchestration and replay monetization for creators.
            Stream to multiple platforms and sell products seamlessly.
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-bold text-white">5+</p>
              <p className="text-sm text-white/70">Platforms Supported</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-3xl font-bold text-white">$1M+</p>
              <p className="text-sm text-white/70">Creator Revenue</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-white/60">
          Trusted by 1000+ creators worldwide
        </p>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
