/**
 * How to reach support: shown in the footer, on /privacy and /terms and next to the consent at
 * registration. Payment providers and the bank check these before approving the site.
 *
 * The documents name the party as «администрация сервиса Loader3D», without requisites; they use these
 * values as they are. The mailbox lives on the own mail server (README, «Своя почта»).
 */
export const SUPPORT = {
  email: 'support@loader3d.pro',
  /** Without the @. */
  telegram: 'coredeee',
  hours: 'ежедневно, 10:00–20:00 по Москве',
} as const;

/** Where the database lives: 152-ФЗ requires data of Russian citizens to be stored in Russia. */
export const DATA_LOCATION = 'Российской Федерации';

/** The date both documents take effect; change it with every edit of their text. */
export const DOCS_DATE = '19 ноября 2026 г.';

export const telegramUrl = `https://t.me/${SUPPORT.telegram}`;
