import type { ReactNode } from 'react'

interface CardProps {
  title: string
  children: ReactNode
  action?: ReactNode
}

export default function Card({ title, children, action }: CardProps) {
  return (
    <div className="border border-rule rounded-lg bg-white">
      <div className="flex items-center justify-between px-5 py-3 border-b border-rule">
        <h2 className="font-display text-lg tracking-wide">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
