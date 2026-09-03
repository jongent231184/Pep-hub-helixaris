// Brand config — read once from REACT_APP_BRAND env var at build time.
// Each brand is a self-contained bundle of copy, logo, and colour tokens.
// Add new brands by extending the BRANDS map + setting REACT_APP_BRAND on deploy.

const BRANDS = {
  'ghp-health': {
    key: 'ghp-health',
    name: 'GHP-Health',
    fullName: 'GHP Health',
    legalName: 'GHP Health LTD',
    domain: 'ghp-health.com',
    tagline: 'Premium-grade Research Peptides',
    support_email: 'support@ghp-health.com',
    logo: 'https://customer-assets.emergentagent.com/job_ghp-ecommerce-pay/artifacts/0f0tlig3_ghp%20logo.jpg',
    accent: '#c8a24a',        // gold
    accentSoft: '#c8a24a',
    // dark theme is default across the app — brand colour drives buttons/CTAs
  },
  helixaris: {
    key: 'helixaris',
    name: 'Helixaris',
    fullName: 'Helixaris Bioscience',
    legalName: 'Helixaris Bioscience LTD',
    domain: 'helixaris.com',
    tagline: 'Advancing Peptide Research',
    support_email: 'support@helixaris.com',
    logo: '/brands/helixaris/logo.png',
    accent: '#7ec8ff',        // light blue
    accentSoft: '#7ec8ff',
  },
};

const key = (process.env.REACT_APP_BRAND || 'ghp-health').toLowerCase();
export const BRAND = BRANDS[key] || BRANDS['ghp-health'];
export default BRAND;
