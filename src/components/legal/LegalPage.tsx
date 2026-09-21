import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLegalDoc, LAST_UPDATED } from '../../content/legalContent';

const NAV_ITEMS: Array<{ slug: string; label: string }> = [
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'cookies', label: 'Cookie Policy' },
  { slug: 'acceptable-use', label: 'Acceptable Use' },
  { slug: 'copyright', label: 'Copyright & DMCA' },
];

export const LegalPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const doc = getLegalDoc(slug);

  return (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased">
      <header className="border-b border-[#1a1e26] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center space-x-2.5">
            <img src="/assets/logo-white.png" alt="Ospreyn" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold uppercase tracking-wide text-white">Ospreyn</span>
          </Link>
          <Link to="/login" className="text-xs font-semibold text-white hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {/* Policy nav */}
        <nav className="mb-10 flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.slug}
              to={`/legal/${item.slug}`}
              className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                doc?.slug === item.slug
                  ? 'border-white bg-white text-[#0c0e12]'
                  : 'border-[#262c36] text-[#8c94a0] hover:border-[#3d495c] hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {!doc ? (
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-8 text-center">
            <p className="text-sm text-white">That policy page doesn't exist.</p>
            <Link to="/legal/terms" className="mt-3 inline-block text-xs text-white underline">
              View our Terms of Service
            </Link>
          </div>
        ) : (
          <article>
            <h1 className="text-2xl font-semibold text-white">{doc.title}</h1>
            <p className="mt-1.5 text-xs text-[#5c6574]">Last updated: {LAST_UPDATED}</p>

            <div className="mt-3 rounded border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[11px] leading-relaxed text-amber-200/80">
              This is a general-purpose draft policy and is provided for informational purposes.
              It is not legal advice, and Ospreyn makes no representation that it is complete,
              accurate, or suitable for your specific circumstances or jurisdiction. Consult a
              qualified attorney before relying on it.
            </div>

            {doc.intro && (
              <p className="mt-6 text-sm leading-relaxed text-[#c5cbd4]">{doc.intro}</p>
            )}

            <div className="mt-8 space-y-8">
              {doc.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-sm font-semibold text-white">{section.heading}</h2>
                  <div className="mt-2 space-y-2">
                    {(() => {
                      const elements: React.ReactNode[] = [];
                      let bulletBuffer: string[] = [];
                      const flushBullets = (key: string) => {
                        if (bulletBuffer.length === 0) return;
                        elements.push(
                          <ul key={key} className="list-disc space-y-1 pl-5">
                            {bulletBuffer.map((line, j) => (
                              <li key={j} className="text-sm leading-relaxed text-[#8c94a0]">
                                {line}
                              </li>
                            ))}
                          </ul>,
                        );
                        bulletBuffer = [];
                      };

                      section.body.forEach((para, i) => {
                        if (para.startsWith('- ')) {
                          bulletBuffer.push(para.replace(/^- /, ''));
                        } else {
                          flushBullets(`ul-${i}`);
                          elements.push(
                            <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-[#8c94a0]">
                              {para}
                            </p>,
                          );
                        }
                      });
                      flushBullets('ul-end');
                      return elements;
                    })()}
                  </div>
                </section>
              ))}
            </div>
          </article>
        )}
      </main>

      <footer className="border-t border-[#1a1e26] px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl text-center text-[11px] text-[#5c6574]">
          © {new Date().getFullYear()} Ospreyn. Music Rights Infrastructure.
        </div>
      </footer>
    </div>
  );
};
