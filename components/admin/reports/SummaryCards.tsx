'use client'

type SummaryCard = {
  title: string
  value: string
}

type SummaryCardsProps = {
  cards: SummaryCard[]
}

export default function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 w-full sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm"
        >
          <p className="text-xs font-medium text-slate-500">{card.title}</p>
          <p className="mt-4 text-4xl font-bold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  )
}
