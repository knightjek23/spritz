// Shared prose wrapper for document-style routes (/legal/*, /support/*).
//
// Extracted from app/legal/layout.tsx so the support and account-deletion
// pages render identically to the legal documents. These pages are read by
// App Review and by Play's data-safety reviewers, and a support page that
// looks like a different site than the privacy policy reads as unfinished.
//
// Styling: plain prose on the app's paper background, Playfair headings and
// Roboto body. Deliberately unstyled beyond that. These are documents, not
// marketing surfaces.

export function ProseShell({ children }: { children: React.ReactNode }) {
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
