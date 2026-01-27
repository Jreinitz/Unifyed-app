import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Unifyed - Commerce OS for Creators',
  description: 'Turn any moment into a sale. Live commerce orchestration and replay monetization for creators.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
