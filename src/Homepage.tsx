const pixelPreviewCells = [
  3, 8, 12, 14, 18, 20, 24, 28, 31, 35, 38, 42, 46, 49, 53, 58, 62, 65, 69, 73, 76, 81, 85, 89, 93, 97, 101,
  104, 108, 111, 115, 119, 123, 126, 130, 134, 138, 143, 147, 151, 155, 160, 164, 168, 172, 177, 181, 185,
  190, 194, 198, 203, 207, 211, 216, 220, 224, 229, 233, 237,
]

const logoLabCards = [
  'Veyra Sigil',
  'Orbit Seal',
  'Sharp Crest',
  'Signal Bloom',
  'Compass Core',
  'Prism Node',
]

function PixelMarkPreview() {
  return (
    <div className="home-mark" aria-hidden="true">
      {Array.from({ length: 240 }, (_, index) => (
        <span
          className={pixelPreviewCells.includes(index) ? 'is-lit' : ''}
          key={index}
          style={{ '--home-delay': `${(index % 16) * 42}ms` } as CSSProperties}
        />
      ))}
    </div>
  )
}

function Homepage() {
  return (
    <main className="home-page">
      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="Veyra Pixel Generator App öffnen">
          <img src="/favicon.svg" alt="" />
          <span>Veyra Pixel Generator</span>
        </a>
        <nav className="home-links" aria-label="Homepage Navigation">
          <a href="#workflow">Workflow</a>
          <a href="#exports">Exports</a>
          <a className="home-link-button" href="/">
            App öffnen
          </a>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-scene" aria-hidden="true">
          <div className="home-grid-plane" />
          <PixelMarkPreview />
          <div className="home-floating-panel home-panel-one">
            <span>Logo Lab</span>
            <strong>16 Richtungen</strong>
          </div>
          <div className="home-floating-panel home-panel-two">
            <span>Export</span>
            <strong>SVG · PNG · Motion</strong>
          </div>
        </div>

        <div className="home-hero-copy">
          <h1>Veyra Pixel Generator</h1>
          <p>
            Ein ruhiges Browser-Studio für modulare Pixelmarken, Logo-Alternativen, manuelles Zeichnen und saubere
            Brand-Exports. Jetzt auch für Textmarken mit eigener TTF- oder OTF-Schrift.
          </p>
          <div className="home-actions">
            <a className="home-primary-action" href="/">
              Generator starten
            </a>
            <a className="home-secondary-action" href="#workflow">
              Kurz ansehen
            </a>
          </div>
        </div>
      </section>

      <section className="home-section home-intro" id="workflow">
        <div className="home-section-heading">
          <h2>Vom Motiv zum Mark</h2>
          <p>Die Website erklärt den Einstieg. Die eigentliche Arbeit passiert direkt in der App.</p>
        </div>
        <div className="home-workflow">
          <article>
            <span>01</span>
            <h3>Prompt, Bild oder Skizze</h3>
            <p>Starte mit Motiv, Bild, Text, eigener Schrift oder zeichne direkt im Raster.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Logo Lab</h3>
            <p>Lass dir 16 Richtungen aus Prompt und Pixel-Skizze vorschlagen.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Pixel feinziehen</h3>
            <p>Justiere Raster, Schwelle, Form, Farben und einzelne Pixellinien.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Sauber ausgeben</h3>
            <p>Exportiere SVG, PNG, Brand Kit, HTML oder Smart-Motion-Video.</p>
          </article>
        </div>
      </section>

      <section className="home-section home-product">
        <div className="home-product-copy">
          <h2>Gebaut für echte Markenarbeit, nicht als Filterspielzeug.</h2>
          <p>
            Alles läuft lokal im Browser. Die KI ist optional und liefert nur kreative Logo-Briefs oder SVG-Quellen,
            während du die finale Marke im Editor kontrollierst.
          </p>
        </div>
        <div className="home-product-preview" aria-label="Produktvorschau">
          <div className="home-preview-topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="home-preview-body">
            <div className="home-preview-canvas">
              <PixelMarkPreview />
            </div>
            <div className="home-preview-list">
              {logoLabCards.map((card) => (
                <span key={card}>{card}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-exports" id="exports">
        <div className="home-section-heading">
          <h2>Exports, die man wirklich weitergeben kann</h2>
          <p>Für Figma, Präsentationen, Social Motion und schnelle Markenabgaben.</p>
        </div>
        <div className="home-export-grid">
          <article>
            <h3>Editable SVG</h3>
            <p>Reine SVG-Elemente, sauber in Figma editierbar.</p>
          </article>
          <article>
            <h3>Brand Kit</h3>
            <p>HTML-Handoff mit Logo, Palette, Specs und Usage Checks.</p>
          </article>
          <article>
            <h3>Smart Motion</h3>
            <p>HTML oder WebM, ohne extra Bildschirmaufnahme.</p>
          </article>
          <article>
            <h3>Textmarken</h3>
            <p>Wortmarke schreiben, TTF/OTF laden und als Pixelanimation ausgeben.</p>
          </article>
        </div>
      </section>

      <section className="home-final">
        <h2>Bereit, ein Pixelmark zu bauen?</h2>
        <a className="home-primary-action" href="/">
          App öffnen
        </a>
      </section>
    </main>
  )
}

export default Homepage
import type { CSSProperties } from 'react'
