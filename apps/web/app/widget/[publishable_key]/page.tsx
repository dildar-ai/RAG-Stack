import type { Metadata } from 'next'
import WidgetChat from '@/components/WidgetChat'

interface WidgetPageProps {
  params: Promise<{ publishable_key: string }>
}

// The widget is keyed per workspace and served from a signed-out public route
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Document Assistant',
  // Never leak the host page's referrer into this embedded context
  referrer: 'no-referrer',
}

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { publishable_key } = await params

  return (
    <main className="h-screen">
      <WidgetChat publishableKey={publishable_key} />
    </main>
  )
}
