// Shared shell for the /legal/* pages (privacy, terms, affiliate disclosure).
//
// Why these exist: affiliate networks require them. Awin's published rejection
// reasons include an unverifiable site and a promotional space that "lacks
// clarity or supporting content," and approval guides consistently flag
// missing privacy/terms/disclosure pages. Rakuten requires FTC disclosure
// compliance outright. App Store review also requires a reachable privacy
// policy URL.
//
// Styling: plain prose on the app's paper background, Playfair headings and
// Roboto body to match the rest of the app. Deliberately unstyled beyond that.
// These are documents, not marketing surfaces.

// Shared strings live in ./constants.ts, not here — Next validates route-file
// exports and unknown named exports from a layout can fail the build.

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-10 max-w-2xl mx-auto">
      <article
        className="
          [&_h1]:font-display [&_h1]:text-3xl [&_h1]:leading-tight [&_h1]:mb-2
          [&_h2]:font-display [&_h2]:text-xl [&_h2]:mt-8 [&_h2]:mb-2
          [&_p]:text-base [&_p]:text-ink [&_p]:leading-relaxed [&_p]:mb-4
          [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc
          [&_li]:text-base [&_li]:text-ink [&_li]:leading-relaxed
          [&_a]:text-emerald [&_a]:underline [&_a]:underline-offset-2
          [&_strong]:font-medium
        "
      >
        {children}
      </article>
    </div>
  );
}
