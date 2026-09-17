/**
 * Bookshops ("resellers") that sell tolino readers and run accounts in the
 * shared Tolino Cloud. The OAuth details are the ones the official tolino
 * web reader uses; they are refreshed from the reseller configuration
 * service when a connection is created and only serve as a fallback here.
 *
 * Pure constants, safe to import from client components.
 */

export type TolinoReseller = {
  /** Tolino partner id, sent as `reseller_id` with every request. */
  id: number;
  name: string;
  country: string;
  /** OAuth 2 token endpoint of the shop. */
  tokenUrl: string;
  clientId: string;
  scope: string;
};

export const TOLINO_RESELLERS: readonly TolinoReseller[] = [
  {
    id: 3,
    name: "Thalia.de",
    country: "DE",
    tokenUrl: "https://www.thalia.de/auth/oauth2/token",
    clientId: "webreader",
    scope: "SCOPE_BOSH",
  },
  {
    id: 4,
    name: "Thalia.at",
    country: "AT",
    tokenUrl: "https://www.thalia.at/auth/oauth2/token",
    clientId: "webreader",
    scope: "SCOPE_BOSH",
  },
  {
    id: 8,
    name: "Orell Füssli / books.ch",
    country: "CH",
    tokenUrl: "https://www.orellfuessli.ch/auth/oauth2/token",
    clientId: "webreader",
    scope: "SCOPE_BOSH",
  },
  {
    id: 23,
    name: "Osiander",
    country: "DE",
    tokenUrl: "https://www.osiander.de/auth/oauth2/token",
    clientId: "webreader",
    scope: "SCOPE_BOSH",
  },
  {
    id: 30,
    name: "bücher.de",
    country: "DE",
    tokenUrl: "https://www.buecher.de/auth/oauth2/token",
    clientId: "webreader",
    scope: "SCOPE_BOSH",
  },
  {
    id: 13,
    name: "Hugendubel",
    country: "DE",
    tokenUrl: "https://www.hugendubel.de/oauth/token",
    clientId: "4c20de744aa8b83b79b692524c7ec6ae",
    scope: "ebook_library",
  },
  {
    id: 81,
    name: "eBook.de",
    country: "DE",
    tokenUrl: "https://www.ebook.de/oauth/token",
    clientId: "ebookde0501html5readerV0001",
    scope: "e-publishing",
  },
  {
    id: 80,
    name: "meineBUCHhandlung",
    country: "DE",
    tokenUrl: "https://lore.shop-asp.de/oauth/token",
    clientId: "meinebuchhandlung0501html5readerV0001",
    scope: "e-publishing",
  },
  {
    id: 90,
    name: "IBS.it",
    country: "IT",
    tokenUrl: "https://ebooks.ibs.it/oauth2/token",
    clientId: "ibsreader",
    scope: "",
  },
  {
    id: 91,
    name: "Libraccio",
    country: "IT",
    tokenUrl: "https://ebooks.libraccio.it/oauth2/token",
    clientId: "libraccioreader",
    scope: "",
  },
];

export function findReseller(id: number): TolinoReseller | undefined {
  return TOLINO_RESELLERS.find((reseller) => reseller.id === id);
}

/** Address of the tolino web reader, where the tokens come from. */
export const TOLINO_WEB_READER_URL = "https://webreader.mytolino.com/library/";
