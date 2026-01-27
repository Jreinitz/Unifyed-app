import { notFound } from 'next/navigation';
import { ReplayContent } from './ReplayContent';

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

// Server component for SEO and data fetching
export default async function ReplayPage({ params }: ReplayPageProps) {
  const { id } = await params;
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${apiUrl}/public/replays/${id}`, {
      next: { revalidate: 60 }, // Revalidate every 60 seconds
    });

    if (!response.ok) {
      if (response.status === 404) {
        notFound();
      }
      throw new Error(`Failed to fetch replay: ${response.status}`);
    }

    const data = await response.json();
    
    return <ReplayContent replay={data.replay} apiUrl={apiUrl} />;
  } catch (error) {
    console.error('Error fetching replay:', error);
    
    // For development/when API is not running, show placeholder
    if (process.env.NODE_ENV === 'development') {
      return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-center text-slate-400 p-8">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold mb-2">Cannot Load Replay</h1>
            <p className="text-sm">
              Make sure the API server is running at <code className="bg-slate-800 px-1 rounded">{apiUrl}</code>
            </p>
            <p className="text-xs mt-4 text-slate-500">
              Replay ID: {id}
            </p>
          </div>
        </main>
      );
    }
    
    notFound();
  }
}

// Generate metadata for SEO
export async function generateMetadata({ params }: ReplayPageProps) {
  const { id } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${apiUrl}/public/replays/${id}`, {
      next: { revalidate: 3600 },
    });
    
    if (!response.ok) {
      return { title: 'Replay Not Found - Unifyed' };
    }
    
    const data = await response.json();
    const replay = data.replay;
    
    return {
      title: replay.title ? `${replay.title} - ${replay.creator.name}` : `Replay by ${replay.creator.name}`,
      description: replay.description || `Watch this replay by ${replay.creator.name} and shop exclusive offers.`,
      openGraph: {
        title: replay.title || `Replay by ${replay.creator.name}`,
        description: replay.description || `Watch and shop exclusive offers`,
        images: replay.thumbnailUrl ? [{ url: replay.thumbnailUrl }] : [],
        type: 'video.other',
      },
    };
  } catch {
    return { title: 'Replay - Unifyed' };
  }
}
