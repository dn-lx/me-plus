export const metadata = {
  title: "Privacy · Me+",
  description: "Privacy information for the Me+ personal intelligence application.",
};

export default function PrivacyPage() {
  return (
    <main className="shell legalPage">
      <header className="hero legalHero">
        <p className="eyebrow">ME+ PRIVACY</p>
        <h1>Privacy</h1>
        <p className="lede">
          Me+ is a private personal intelligence application. This page describes
          the data handled by the current read-only banking integration.
        </p>
      </header>

      <article className="legalContent">
        <section>
          <h2>Purpose</h2>
          <p>
            Me+ uses authorized financial data to help its user understand account
            balances, transactions, recurring costs, cash flow, and other personal
            finance context. The current N26 integration is read-only.
          </p>
        </section>

        <section>
          <h2>Data we process</h2>
          <p>
            When the user explicitly connects a supported bank, Me+ may process
            account metadata, balances, transaction history, transaction dates,
            amounts, currencies, merchant or counterparty descriptions, and
            synchronization metadata.
          </p>
        </section>

        <section>
          <h2>Bank credentials</h2>
          <p>
            Me+ does not ask for or store the user&apos;s N26 password, PIN, TAN,
            card credentials, or other online-banking authentication secrets.
            Authentication and consent take place in the bank/Open Banking
            authorization flow.
          </p>
        </section>

        <section>
          <h2>Open Banking provider</h2>
          <p>
            Me+ currently uses Enable Banking as the technical Open Banking
            provider for the N26 read-only connection. Information required to
            establish and operate that connection is exchanged with the provider
            only for the authorized banking integration.
          </p>
        </section>

        <section>
          <h2>Storage and access</h2>
          <p>
            Normalized Me+ financial records are stored in the Me+ backend. Access
            is restricted to the authenticated owner of the data and authorized
            server-side services. Integration secrets are kept outside ordinary
            application data.
          </p>
        </section>

        <section>
          <h2>Consent and disconnection</h2>
          <p>
            Banking data is accessed only after explicit authorization. The user
            can stop future synchronization by revoking the bank/Open Banking
            consent or disconnecting the source in Me+. Historical records may be
            retained until the user requests deletion or the applicable retention
            process removes them.
          </p>
        </section>

        <section>
          <h2>Payment initiation</h2>
          <p>
            The current N26 integration does not initiate transfers or payments.
            Any future capability to move money would require a separate design,
            explicit authorization, and additional safeguards.
          </p>
        </section>

        <section>
          <h2>Scope</h2>
          <p>
            Me+ is currently a personal, non-commercial application for its owner.
            This privacy notice will be updated if the product scope, providers,
            or data-processing model materially changes.
          </p>
        </section>

        <p className="legalUpdated">Last updated: 27 September 2026</p>
        <p><a href="/">Back to Me+</a></p>
      </article>
    </main>
  );
}
