/**
 * How to reach support: shown in the footer, on /privacy and /terms and next to the consent at
 * registration. Payment providers and the bank check these before approving the site.
 *
 * The documents name the party as «администрация сервиса Loader3D», without requisites. Fill in the
 * bracketed values before going live; the documents use them as they are.
 */
export const SUPPORT = {
  email: '[email поддержки]',
  /** Without the @. */
  telegram: 'coredeee',
  hours: 'ежедневно, 10:00–20:00 по Москве',
} as const;

/** Where the database lives: 152-ФЗ requires data of Russian citizens to be stored in Russia. */
export const DATA_LOCATION = 'Российской Федерации';

/** The date both documents take effect; change it with every edit of their text. */
export const DOCS_DATE = '15 ноября 2026 г.';

export const telegramUrl = `https://t.me/${SUPPORT.telegram}`;
