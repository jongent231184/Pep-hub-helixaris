import React from 'react';
import { Helmet } from 'react-helmet-async';
import { BRAND } from '../config/brand';

/**
 * Reusable SEO component. Sets <title>, meta description, canonical URL,
 * OpenGraph tags, Twitter card, and optional JSON-LD structured data.
 *
 * Usage:
 *   <SEO title="ARA-290 Research Vial" description="..." image="..." />
 *   <SEO product={product} category={categorySlug} /> // full product page
 */
const clean = (txt) => String(txt || '').replace(/\s+/g, ' ').trim();

const currentOrigin = () => {
  if (typeof window === 'undefined') return `https://${BRAND.domain}`;
  return window.location.origin || `https://${BRAND.domain}`;
};

const buildProductJsonLd = (product, canonical, priceGBP) => ({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  name: product.name,
  image: product.image
    ? (product.image.startsWith('http') ? product.image : `${currentOrigin()}${product.image}`)
    : undefined,
  description: clean(product.short_description || product.description).slice(0, 500),
  sku: product.sku || product.slug,
  mpn: product.slug,
  brand: {
    '@type': 'Brand',
    name: BRAND.fullName || BRAND.name,
  },
  category: product.category || 'Research Peptides',
  url: canonical,
  offers: {
    '@type': 'Offer',
    url: canonical,
    priceCurrency: 'GBP',
    price: String(priceGBP.toFixed(2)),
    availability:
      (product.variants || []).some((v) => (v.stock ?? 0) > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: BRAND.fullName || BRAND.name },
  },
  ...(Array.isArray(product.reviews) && product.reviews.length > 0
    ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: (
            product.reviews.reduce((s, r) => s + Number(r.rating || 0), 0) /
            product.reviews.length
          ).toFixed(2),
          reviewCount: product.reviews.length,
        },
      }
    : {}),
});

const SEO = ({
  title,
  description,
  image,
  canonical,
  product,
  noindex = false,
}) => {
  const origin = currentOrigin();
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const url = canonical || `${origin}${path}`;
  const brand = BRAND.fullName || BRAND.name;

  const t = title
    ? `${title} | ${brand}`
    : product
      ? `${product.name} — Research Peptide | ${brand}`
      : `${brand} — Research-Grade Peptides for Laboratory Study`;

  const d = clean(
    description ||
      (product
        ? `${product.name} — research-grade peptide supplied in a sealed research vial for in-vitro laboratory and educational use only. Independent third-party COA available. Fast UK dispatch.`
        : `${brand}: research-grade peptides, vials and laboratory reagents supplied for in-vitro research and educational use only. Independent COAs, UK-based dispatch.`),
  ).slice(0, 300);

  const img = image ||
    (product?.image
      ? (product.image.startsWith('http') ? product.image : `${origin}${product.image}`)
      : BRAND.logo);

  const jsonLd = product
    ? buildProductJsonLd(product, url, Number(product.price || 0))
    : null;

  return (
    <Helmet>
      <title>{t}</title>
      <meta name="description" content={d} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={product ? 'product' : 'website'} />
      <meta property="og:site_name" content={brand} />
      <meta property="og:title" content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:url" content={url} />
      {img && <meta property="og:image" content={img} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={t} />
      <meta name="twitter:description" content={d} />
      {img && <meta name="twitter:image" content={img} />}

      {/* Structured data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
