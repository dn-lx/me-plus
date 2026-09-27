export const metadata = {
  title: "Terms · Me+",
  description: "Terms for the Me+ personal intelligence application.",
};

export default function TermsPage() {
  return (
    <main className="shell legalPage">
      <header className="hero legalHero">
        <p className="eyebrow">ME+ TERMS</p>
        <h1>Terms of use</h1>
        <p className="lede">
          These terms describe the current personal-use scope of Me+ and its
          read-only banking integration.
        </p>
      </header>

      <article className="legalContent">
        <section>
          <h2>Personal-use application</h2>
          <p>
            Me+ is currently a private, non-commercial personal intelligence
            application used by its owner. It is not offered as a public banking,
            payment, investment, or financial-advisory service.
          </p>
        </section>

        <section>
          <h2>Read-only banking connection</h2>
          <p>
            The current N26 integration is intended to read authorized account
            information such as balances and transactions. It does not initiate
            transfers or payments.
          </p>
        </section>

        <section>
          <h2>Authorization</h2>
          <p>
            The user must explicitly authorize access through the bank/Open
            Banking flow. The user is responsible for keeping bank credentials
            private and should never provide banking passwords, PINs, TANs, or
            private security keys directly to Me+.
          </p>
        </section>

        <section>
          <h2>Financial information</h2>
          <p>
            Me+ may organize and analyze financial information for personal
            decision support. Imported data can be delayed, incomplete, changed by
            the source, or otherwise require reconciliation. The user remains
            responsible for verifying important balances, transactions, due dates,
            and financial decisions with the relevant financial institution.
          </p>
        </section>

        <section>
          <h2>Consequential actions</h2>
          <p>
            Me+ must not automatically execute consequential financial actions
            without explicit authorization. The current banking integration is
            deliberately limited to read-only account information.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            Access to bank data depends on third-party banking and Open Banking
            services. Connections can expire, require renewed consent, or become
            temporarily unavailable.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            These terms may be updated when Me+ adds new providers, capabilities,
            or user-facing functionality.
          </p>
        </section>

        <p className="legalUpdated">Last updated: 27 September 2026</p>
        <p><a href="/">Back to Me+</a></p>
      </article>
    </main>
  );
}
