/**
 * Closes the page. Deliberately carries no figures — those belong on the
 * statistics screen; this is here so content does not just stop mid-air.
 */
export function Footer() {
  return (
    <footer className="footer" aria-hidden="true">
      <i className="footer__rule footer__rule--l" />
      <span className="footer__fleuron">
        <svg viewBox="0 0 48 16">
          <path d="M24 2c1.2 2.6 3 4 5.6 4.3C26.8 7.3 25 8.9 24 11.4 23 8.9 21.2 7.3 18.4 6.3 21 6 22.8 4.6 24 2z" />
          <circle cx="12" cy="8" r="1.5" /><circle cx="36" cy="8" r="1.5" />
          <path d="M0 8h8M40 8h8" />
        </svg>
      </span>
      <i className="footer__rule footer__rule--r" />
    </footer>
  )
}
