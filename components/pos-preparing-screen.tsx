type PosPreparingScreenProps = {
  label?: string
}

export function PosPreparingScreen({ label = 'نجهز نقطة البيع' }: PosPreparingScreenProps) {
  return (
    <main className="afex-pos-preparing" dir="rtl" aria-live="polite" aria-busy="true">
      <span className="afex-pos-preparing-mark" aria-hidden="true">A</span>
      <section className="afex-pos-preparing-content" aria-label={label}>
        <p className="afex-pos-preparing-wordmark" aria-hidden="true">AFEX</p>
        <h1>نجهز نقطة البيع</h1>
        <p className="afex-pos-preparing-subtitle">يرجى الانتظار قليلًا</p>
        <div className="afex-pos-preparing-indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="afex-pos-preparing-accent" aria-hidden="true" />
      </section>
    </main>
  )
}
