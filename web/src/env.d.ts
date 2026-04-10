/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly STRAPI_URL: string;
  readonly STRAPI_KEY: string;
  readonly REACT_STRAPI_URL: string;
  readonly PUBLIC_COOKIE_CONSENT: string;
  readonly PUBLIC_MATOMO_URL: string;
  readonly PUBLIC_MATOMO_SITE_ID: string;
}
