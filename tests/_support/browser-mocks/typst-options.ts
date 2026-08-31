function option(name: string) {
  return (...args: unknown[]) => ({ name, args });
}

export const disableDefaultFontAssets = option("disableDefaultFontAssets");
export const loadFonts = option("loadFonts");
export const preloadFontAssets = option("preloadFontAssets");
export const withAccessModel = option("withAccessModel");
export const withPackageRegistry = option("withPackageRegistry");

// Return no default asset URLs in tests so no fonts are fetched from the CDN.
export function _resolveAssets(): string[] {
  return [];
}
