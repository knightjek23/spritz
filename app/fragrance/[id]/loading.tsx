// Skeleton for the fragrance detail page. Mirrors the real layout's
// silhouette (hero card → metadata line → title → action row → sections)
// so first-request ISR renders don't flash a blank screen.

export default function FragranceLoading() {
  return (
    <article className="mx-auto max-w-md px-6 py-10 animate-pulse" aria-busy>
      {/* Bottle hero */}
      <div className="mb-8 rounded-3xl bg-cream border border-ink/5 py-8 px-6 flex items-center justify-center">
        <div className="w-[200px] h-[267px] rounded-xl bg-ink/5" />
      </div>
      {/* House · year line */}
      <div className="h-3 w-40 rounded bg-ink/10 mb-3" />
      {/* Name */}
      <div className="h-10 w-64 rounded bg-ink/10 mb-8" />
      {/* Save + Buy row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="h-12 rounded-xl bg-ink/5" />
        <div className="h-12 rounded-xl bg-ink/5" />
        <div className="h-12 rounded-xl bg-ink/5" />
      </div>
      <div className="h-12 rounded-xl bg-ink/10 mb-10" />
      {/* Section stubs */}
      <div className="h-6 w-24 rounded bg-ink/10 mb-4" />
      <div className="h-24 rounded-xl bg-ink/5 mb-8" />
      <div className="h-6 w-32 rounded bg-ink/10 mb-4" />
      <div className="h-24 rounded-xl bg-ink/5" />
    </article>
  );
}
