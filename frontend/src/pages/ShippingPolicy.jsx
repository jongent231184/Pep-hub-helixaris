import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { PolicyPage, PolicySection, usePolicyBrand } from '../components/PolicyPage';

const ShippingPolicy = () => {
  const { brandName, supportEmail } = usePolicyBrand();
  const { settings = {} } = useStore();
  const s = settings || {};
  const flat = Number(s.flat_shipping ?? 0);
  const freeOver = Number(s.free_shipping_threshold ?? 0);
  return (
    <PolicyPage
      title="Shipping & Delivery Policy"
      description={`Delivery areas, costs, dispatch times and tracking for ${brandName} orders.`}
      lastUpdated="June 2026"
      testId="shipping-policy-page"
    >
      <PolicySection number="1" title="Where we deliver">
        <p>We ship to <strong>United Kingdom addresses only</strong>. Orders to addresses outside the UK, PO boxes or freight forwarders are not accepted and will be refunded in full.</p>
      </PolicySection>

      <PolicySection number="2" title="Delivery costs">
        <p>Shipping is shown clearly in the basket and at checkout before you pay.</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Royal Mail Tracked 24/48</strong>: {flat > 0 ? `£${flat.toFixed(2)} per order` : 'flat rate shown at checkout'}.</li>
          {freeOver > 0 && <li><strong>Free delivery</strong> on orders over £{freeOver.toFixed(2)}.</li>}
          <li>No additional handling, packaging or customs charges apply to UK orders.</li>
        </ul>
      </PolicySection>

      <PolicySection number="3" title="Dispatch & delivery times">
        <ul className="list-disc pl-6 space-y-1">
          <li>Orders paid before 2pm Monday–Friday are dispatched the <strong>same or next working day</strong>.</li>
          <li>Bank-transfer orders are dispatched once the transfer has cleared (usually within 1 working day of receipt).</li>
          <li>Royal Mail Tracked 24 typically arrives in 1–2 working days; Tracked 48 in 2–3 working days. These are estimates, not guarantees.</li>
          <li>We do not dispatch on weekends or UK bank holidays.</li>
        </ul>
      </PolicySection>

      <PolicySection number="4" title="Tracking">
        <p>Every order is sent tracked. You receive a dispatch email containing your Royal Mail tracking number as soon as the parcel is on its way, and tracking is also visible in your account order history.</p>
      </PolicySection>

      <PolicySection number="5" title="Packaging & handling">
        <p>Lyophilised vials are shipped in protective packaging, in plain, discreet outer packaging with no product description visible. Products should be refrigerated at 2–8 °C on receipt in line with the storage guidance on each product page.</p>
      </PolicySection>

      <PolicySection number="6" title="Problems with delivery">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Late:</strong> if tracking shows no movement for 5 working days, contact us and we will open a Royal Mail enquiry and replace or refund as appropriate.</li>
          <li><strong>Lost:</strong> parcels are treated as lost once Royal Mail confirms non-delivery or 10 working days have passed with no delivery scan. We will replace or refund in full.</li>
          <li><strong>Delivered but not received:</strong> please check with neighbours and your local delivery office first. Royal Mail GPS delivery confirmation and photo-on-delivery are our proof of delivery; where delivery is confirmed to the address provided, we will assist you with a Royal Mail claim.</li>
          <li><strong>Damaged on arrival:</strong> photograph the packaging and contents and email us within 48 hours; we will replace or refund.</li>
          <li><strong>Wrong address:</strong> it is the customer's responsibility to enter a correct, complete address. Parcels returned to us due to an incorrect address can be re-sent at the customer's shipping cost.</li>
        </ul>
      </PolicySection>

      <PolicySection number="7" title="Contact">
        <p>Delivery questions: <a href={`mailto:${supportEmail}`} className="underline text-sky-600">{supportEmail}</a>. Please quote your order number. See also our <Link to="/refund-policy" className="underline text-sky-600">Returns, Refunds &amp; Cancellations Policy</Link>.</p>
      </PolicySection>
    </PolicyPage>
  );
};

export default ShippingPolicy;
