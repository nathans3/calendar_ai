import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Calendar AI — The lesson-planning calendar that writes your plan for you',
  description: 'Upload your syllabus and school calendar. Calendar AI generates a week-by-week lesson plan you can edit, drag, and reflow.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="grain-overlay">
        {children}
      </body>
    </html>
  )
}
