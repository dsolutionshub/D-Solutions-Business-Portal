/**
 * Dropdown values a new installation starts with (from the prototype). Editable in Settings →
 * Dropdown lists. Used by the first-run script (production) and the demo seed.
 */
import type { ListKey } from './constants';

export const DEFAULT_LISTS: Record<ListKey, string[]> = {
  environments: ['DEV', 'QA', 'STG', 'PROD'],
  hosting: [
    'AWS',
    'Vercel',
    'DigitalOcean',
    'Google Cloud',
    'Azure',
    'Railway',
    'Render',
    'Netlify',
    'Hostinger',
    'Shopify',
    'Supabase',
    'Other'
  ],
  registrar: [
    'GoDaddy',
    'Namecheap',
    'Cloudflare',
    'Hostinger',
    'BigRock',
    'Google Domains / Squarespace',
    'Other'
  ],
  database: [
    'PostgreSQL',
    'MySQL',
    'MariaDB',
    'MongoDB',
    'Supabase (Postgres)',
    'Firebase Firestore',
    'SQL Server',
    'Redis',
    'Other'
  ],
  payGateway: [
    'Razorpay',
    'Stripe',
    'PayU',
    'Cashfree',
    'PhonePe',
    'CCAvenue',
    'Paytm',
    'Shopify Payments',
    'Other'
  ],
  projectType: ['E-commerce storefront', 'Mobile app', 'Admin / back-office', 'API / integration'],
  businessType: [
    'D2C brand',
    'Online retail',
    'Marketplace seller',
    'Subscription commerce',
    'Cloud kitchen',
    'B2B wholesale'
  ],
  industry: [
    'Food & wellness',
    'Fashion & apparel',
    'Food & beverage',
    'Consumer electronics',
    'Home & décor',
    'Beauty & personal care'
  ],
  state: ['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Telangana', 'Delhi', 'Kerala', 'Gujarat', 'West Bengal']
};
