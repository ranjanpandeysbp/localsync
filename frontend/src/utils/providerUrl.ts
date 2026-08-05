/** Prefer friendly public path; fall back to user id. */
export function providerPublicPath(provider: {
  public_url_path?: string | null;
  public_slug?: string | null;
  user_id: string;
}): string {
  if (provider.public_url_path) return provider.public_url_path;
  if (provider.public_slug) return `/p/${provider.public_slug}`;
  return `/p/${provider.user_id}`;
}
