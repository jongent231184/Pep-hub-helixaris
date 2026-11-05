import React from 'react';
import { Link } from 'react-router-dom';
import { PolicyPage, PolicySection, usePolicyBrand } from '../components/PolicyPage';

const PrivacyPolicy = () => {
  const { brandName, supportEmail, domain } = usePolicyBrand();
  return (
    <PolicyPage
      title="Privacy Policy"
      description={`How ${brandName} collects, uses and protects your personal data under UK GDPR.`}
      lastUpdated="June 2026"
      testId="privacy-policy-page"
    >
      <PolicySection number="1" title="Who we are">
        <p>{brandName} ("we", "us") operates {domain}. We are the data controller for personal data collected through this website. Contact: <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a>.</p>
      </PolicySection>

      <PolicySection number="2" title="What we collect">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Order data</strong> — name, email, phone, billing and shipping address, items ordered, order value.</li>
          <li><strong>Account data</strong> (optional) — login email, saved addresses and order history.</li>
          <li><strong>Payment data</strong> — we never see or store full card numbers. Card payments are entered on our payment partner's secure, PCI DSS compliant hosted page; we receive only a payment reference, status and the last four digits. Pay-by-bank payments are processed by an FCA-authorised open-banking provider.</li>
          <li><strong>Age &amp; research-use confirmation</strong> — a record that you confirmed you are 18+ and purchasing for research use, with the date and time.</li>
          <li><strong>Technical data</strong> — anonymised page views, device type and referrer collected by our own first-party, cookie-free analytics. We do not use third-party advertising trackers.</li>
          <li><strong>Correspondence</strong> — anything you send us by email or the contact form.</li>
        </ul>
      </PolicySection>

      <PolicySection number="3" title="Why we use it (lawful basis)">
        <ul className="list-disc pl-6 space-y-1">
          <li>To process and deliver your order and send order, payment and dispatch emails — <em>performance of a contract</em>.</li>
          <li>To verify age and research-use eligibility, prevent fraud and misuse, and maintain our refusal list — <em>legitimate interests and legal obligation</em>.</li>
          <li>To keep accounting and tax records — <em>legal obligation</em> (retained 6 years).</li>
          <li>To respond to enquiries, refund and dispute requests — <em>legitimate interests</em>.</li>
          <li>To send marketing emails only where you have opted in — <em>consent</em>, withdrawable at any time via the unsubscribe link.</li>
        </ul>
      </PolicySection>

      <PolicySection number="4" title="Who we share it with">
        <p>Only with providers needed to run the service, each bound by data-processing terms: our payment processors (card acquirer and open-banking provider), Royal Mail for delivery, our email delivery provider, and our hosting provider. We do not sell personal data. We may disclose data where required by law or to defend a legal claim or chargeback.</p>
      </PolicySection>

      <PolicySection number="5" title="Retention">
        <p>Order and invoice records are kept for 6 years for HMRC purposes. Account data is kept until you ask us to delete it. Analytics data is anonymised and aggregated after 13 months.</p>
      </PolicySection>

      <PolicySection number="6" title="Cookies">
        <p>We use only strictly necessary cookies/local storage (basket, login session, age-gate acknowledgement). No advertising or cross-site tracking cookies are set.</p>
      </PolicySection>

      <PolicySection number="7" title="Your rights">
        <p>Under UK GDPR you may request access to, correction or deletion of your data, restrict or object to processing, or request portability. Email <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a>; we respond within one month. You may also complain to the Information Commissioner's Office (ico.org.uk).</p>
      </PolicySection>

      <PolicySection number="8" title="Security">
        <p>All pages are served over HTTPS. Access to order data is restricted to authorised staff. Card data never touches our servers.</p>
      </PolicySection>

      <PolicySection number="9" title="Related policies">
        <p><Link to="/terms" className="underline text-sky-600">Terms &amp; Conditions</Link> · <Link to="/shipping-policy" className="underline text-sky-600">Shipping &amp; Delivery</Link> · <Link to="/refund-policy" className="underline text-sky-600">Returns, Refunds &amp; Cancellations</Link> · <Link to="/research-use-policy" className="underline text-sky-600">Research-Use Policy</Link></p>
      </PolicySection>
    </PolicyPage>
  );
};

export default PrivacyPolicy;
