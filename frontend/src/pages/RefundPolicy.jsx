import React from 'react';
import { Link } from 'react-router-dom';
import { PolicyPage, PolicySection, usePolicyBrand } from '../components/PolicyPage';

const RefundPolicy = () => {
  const { brandName, supportEmail } = usePolicyBrand();
  return (
    <PolicyPage
      title="Returns, Refunds & Cancellations"
      description={`How to cancel, return or request a refund for a ${brandName} order, and how disputes are handled.`}
      lastUpdated="June 2026"
      testId="refund-policy-page"
    >
      <PolicySection number="1" title="Cancelling before dispatch">
        <p>You may cancel an order free of charge at any time before it is dispatched. Email <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a> with your order number. A full refund, including shipping, is issued to the original payment method within 1 working day.</p>
      </PolicySection>

      <PolicySection number="2" title="Your 14-day right to cancel">
        <p>Under the Consumer Contracts Regulations 2013 you may cancel within <strong>14 days of delivery</strong> without giving a reason, provided the items are <strong>unopened, unused and in their original sealed condition</strong>. Notify us within 14 days of delivery, then return the goods within a further 14 days.</p>
        <p>Because research reagents are temperature-sensitive and sealed for integrity, we cannot accept returns of vials whose seal has been broken, that have been reconstituted, or that have not been stored as instructed. This exception is permitted under regulation 28(3) for sealed goods not suitable for return for hygiene or protection reasons once unsealed.</p>
      </PolicySection>

      <PolicySection number="3" title="Faulty, damaged or incorrect items">
        <p>If an item arrives damaged, is not as described, or is not what you ordered, contact us within <strong>48 hours of delivery</strong> with photographs. We will send a replacement or issue a full refund including original shipping, and we cover return postage. Every batch is supplied with a Certificate of Analysis; if you believe a product does not meet its specification, contact us and we will investigate with the testing laboratory.</p>
      </PolicySection>

      <PolicySection number="4" title="How to return">
        <ol className="list-decimal pl-6 space-y-1">
          <li>Email <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a> with your order number and reason. We reply within 1 working day with a returns reference and address.</li>
          <li>Pack items securely in the original packaging and post using a tracked service. Keep your proof of postage.</li>
          <li>For change-of-mind returns the customer pays return postage; for faulty/incorrect items we reimburse it.</li>
        </ol>
      </PolicySection>

      <PolicySection number="5" title="Refunds — how and when">
        <ul className="list-disc pl-6 space-y-1">
          <li>Refunds are processed within <strong>3 working days</strong> of receiving the return (or of approving a cancellation).</li>
          <li>Refunds go to the <strong>original payment method only</strong>: card refunds appear on your statement within 5–10 working days depending on your bank; pay-by-bank and bank-transfer refunds are returned to the originating account within 1–3 working days.</li>
          <li>You receive an email confirmation for every refund showing the amount and, for card payments, the last four digits of the card.</li>
          <li>Partial refunds may be issued where only some items are returned or where returned items are not in their original condition.</li>
        </ul>
      </PolicySection>

      <PolicySection number="6" title="Non-returnable items">
        <ul className="list-disc pl-6 space-y-1">
          <li>Opened, unsealed or reconstituted vials.</li>
          <li>Bacteriostatic water, syringes or consumables with broken seals.</li>
          <li>Items not stored at 2–8 °C after receipt.</li>
          <li>Coaching sessions already delivered.</li>
        </ul>
      </PolicySection>

      <PolicySection number="7" title="Disputes & chargebacks">
        <p>If you are unhappy with any aspect of your order, please contact us first at <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a> — we aim to resolve every complaint within 5 working days and in most cases can refund or replace faster than a card dispute. Please allow us this opportunity before contacting your bank. Where a chargeback is raised, we respond with the order record, your checkout confirmations, and Royal Mail tracking and proof of delivery.</p>
      </PolicySection>

      <PolicySection number="8" title="Account termination">
        <p>We may refuse future orders or close an account where we reasonably believe products are being purchased for non-research use, where fraudulent payment or false non-receipt claims are made, or where these policies are breached. Any paid, undispatched order affected is refunded in full.</p>
      </PolicySection>

      <PolicySection number="9" title="Your statutory rights">
        <p>Nothing in this policy affects your statutory rights under the Consumer Rights Act 2015. Related: <Link to="/shipping-policy" className="underline text-sky-600">Shipping &amp; Delivery</Link> · <Link to="/privacy-policy" className="underline text-sky-600">Privacy Policy</Link> · <Link to="/terms" className="underline text-sky-600">Terms &amp; Conditions</Link>.</p>
      </PolicySection>
    </PolicyPage>
  );
};

export default RefundPolicy;
