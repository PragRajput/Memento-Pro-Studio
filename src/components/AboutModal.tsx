import { useEffect } from 'react'
import type { ReactNode } from 'react'

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const LINKS: readonly { label: string; hint: string; href: string; icon: ReactNode }[] = [
  {
    label: 'Portfolio',
    hint: 'my-portfolio-7598c.web.app',
    href: 'https://my-portfolio-7598c.web.app/',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    hint: 'PragRajput',
    href: 'https://github.com/PragRajput',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    hint: 'prag-dev-singh',
    href: 'https://www.linkedin.com/in/prag-dev-singh',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    label: 'Email',
    hint: 'paragdev168@gmail.com',
    href: 'mailto:paragdev168@gmail.com',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 6L2 7" />
      </svg>
    ),
  },
]

export function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="about-accent" aria-hidden="true" />

        <button type="button" className="about-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="about-hero">
          <span className="about-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="about-grad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38bdf8" />
                  <stop offset="0.5" stopColor="#6366f1" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <path d="M7 8.5H12L10 12.5H5L7 8.5Z" fill="#38bdf8" />
              <path d="M14.5 8.5H19.5L17.5 12.5H12.5L14.5 8.5Z" fill="#818cf8" />
              <path d="M22 8.5H27L25 12.5H20L22 8.5Z" fill="#c084fc" />
              <path
                d="M11 15.5C11 14.65 11.95 14.15 12.65 14.6L22.2 19.1C22.9 19.45 22.9 20.55 22.2 20.9L12.65 25.4C11.95 25.85 11 25.35 11 24.5V15.5Z"
                fill="url(#about-grad)"
              />
            </svg>
          </span>

          <h2 id="about-title">Memento</h2>
          <p className="about-tagline">
            Every frame is decoded, composited and encoded on your own machine. No media ever
            leaves it.
          </p>
        </header>

        <div className="about-rule" />

        <section className="about-person">
          <p className="about-name">Prag Dev Singh</p>
          <p className="about-role">Full-Stack&nbsp;+&nbsp;AI Developer</p>
          <p className="about-bio">
            I build production-grade systems: AI agents, voice AI applications, SaaS platforms and
            enterprise data pipelines, working mainly in Python, TypeScript and React. I like owning
            things end to end, from API and pipeline design through to shipping a clean, performant
            frontend.
          </p>
        </section>

        <nav className="about-links" aria-label="Elsewhere">
          {LINKS.map((link) => (
            <a
              key={link.label}
              className="about-link"
              href={link.href}
              target={link.href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noreferrer noopener"
            >
              <span className="about-link-icon">{link.icon}</span>
              <span className="about-link-text">
                <span className="about-link-label">{link.label}</span>
                <span className="about-link-hint">{link.hint}</span>
              </span>
              <span className="about-link-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
