import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "CallMeMaybe — Phone work for Shopify, safely resolved" },
  {
    name: "description",
    content:
      "A CALL-E powered Shopify app that calls carriers and customers, then turns each conversation into an audited, policy-gated order action.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return null;
};

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="#top" className={styles.brand} aria-label="CallMeMaybe home">
          <img src="/logo-mark.svg" alt="" />
          <span>
            CallMe<span>Maybe</span>
          </span>
        </a>
        <div className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="https://github.com/jongan69/callmemaybe">GitHub</a>
        </div>
      </nav>

      <header id="top" className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span /> Built with CALL-E for Shopify
          </div>
          <h1>
            Phone work for stores, <em>safely resolved.</em>
          </h1>
          <p>
            Call the carrier that has no API. Reach the customer who stopped
            answering email. Turn what gets said into an audited order action—
            with the model kept out of authorization.
          </p>
          <div className={styles.heroActions}>
            <a
              href="https://apps.shopify.com/callmemaybe"
              className={styles.primaryButton}
            >
              Install from Shopify <span>→</span>
            </a>
            <a
              href="https://github.com/jongan69/callmemaybe"
              className={styles.secondaryButton}
            >
              Explore the code
            </a>
          </div>
          <div className={styles.proofRow}>
            <span>Consent gated</span>
            <span>Merchant controlled</span>
            <span>Auditable decisions</span>
          </div>
        </div>

        <div
          className={styles.heroVisual}
          aria-label="CallMeMaybe case flow preview"
        >
          <div className={styles.glow} />
          <div className={styles.callCard}>
            <div className={styles.cardHeader}>
              <div className={styles.avatar}>R</div>
              <div>
                <strong>Riley is calling</strong>
                <small>Northline Freight · 02:18</small>
              </div>
              <span className={styles.liveBadge}>LIVE</span>
            </div>
            <div className={styles.waveform} aria-hidden="true">
              {[14, 28, 19, 42, 31, 58, 35, 48, 22, 39, 17, 31, 14, 24].map(
                (height, index) => (
                  <i key={index} style={{ height }} />
                ),
              )}
            </div>
            <p>“I can wait while you open the package trace.”</p>
          </div>
          <div className={styles.resultCard}>
            <div>
              <span className={styles.check}>✓</span>
              <strong>Structured result</strong>
            </div>
            <dl>
              <div>
                <dt>Trace</dt>
                <dd>NL-884219</dd>
              </div>
              <div>
                <dt>Disposition</dt>
                <dd>Investigation opened</dd>
              </div>
              <div>
                <dt>Policy</dt>
                <dd className={styles.approval}>Merchant approval</dd>
              </div>
            </dl>
          </div>
          <div className={styles.shopifyChip}>
            S <span>Order #1043 protected</span>
          </div>
        </div>
      </header>

      <section id="how" className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>ONE PRODUCT, TWO CALL LEGS</span>
          <h2>The escalation channel and the API of last resort.</h2>
        </div>
        <div className={styles.legs}>
          <article>
            <div className={styles.iconTile}>↗</div>
            <span className={styles.kicker}>Carrier leg</span>
            <h3>It waits on hold so your team does not.</h3>
            <p>
              Navigate the IVR, reach an agent, open a package trace, and return
              the reference, disposition, promise date, and hold time as
              structured data.
            </p>
          </article>
          <article>
            <div className={`${styles.iconTile} ${styles.mintTile}`}>◎</div>
            <span className={styles.kicker}>Customer leg</span>
            <h3>When email stalls, the order still moves.</h3>
            <p>
              Explain why you are calling, verify identity before disclosure,
              capture one clear decision, read it back, and record spoken
              confirmation.
            </p>
          </article>
        </div>
      </section>

      <section
        id="safety"
        className={`${styles.section} ${styles.safetySection}`}
      >
        <div className={styles.sectionHeading}>
          <span>THE TRUST BOUNDARY</span>
          <h2>The AI gathers evidence. It never grants permission.</h2>
          <p>
            Every consequential step is handled by deterministic code that can
            be tested, audited, and stopped.
          </p>
        </div>
        <div className={styles.safetyGrid}>
          <article>
            <b>01</b>
            <h3>Identity first</h3>
            <p>
              A six-digit challenge gates every customer disclosure, with a
              strict two-attempt limit.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Policy, not vibes</h3>
            <p>
              The same inputs produce the same decision. No model call exists in
              the authorization path.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Human for consequences</h3>
            <p>
              Cancellations, returns, replacements, and carrier traces default
              to merchant approval.
            </p>
          </article>
          <article>
            <b>04</b>
            <h3>Re-read before write</h3>
            <p>
              If the live Shopify order drifted after the call, execution aborts
              and records why.
            </p>
          </article>
        </div>
      </section>

      <section id="install" className={styles.ctaSection}>
        <div>
          <span>READY WHEN THE PHONE IS</span>
          <h2>Put your Shopify store on the line.</h2>
          <p>
            Install through Shopify, complete the guided setup, and keep calling
            disabled until your approved regions and carrier numbers are
            configured.
          </p>
        </div>
        <a
          href="https://apps.shopify.com/callmemaybe"
          className={styles.primaryButton}
        >
          View the Shopify listing <span>→</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a href="#top" className={styles.brand}>
          <img src="/logo-mark.svg" alt="" />
          <span>
            CallMe<span>Maybe</span>
          </span>
        </a>
        <p>AI-assisted phone support for Shopify merchants</p>
        <span>
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
          <a href="/support">Support</a> · <a href="/status">Status</a>
        </span>
      </footer>
    </main>
  );
}
