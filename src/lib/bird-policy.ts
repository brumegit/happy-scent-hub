/**
 * Bird audience: installed mobile apps always; browser visitors only once they
 * have declared an email. Anonymous website visitors never reach Bird.
 */
export function isBirdPlatformAllowed(platform: string | undefined, hasEmail = false): boolean {
  if (platform === "ios" || platform === "android") return true;
  return platform === "web" && hasEmail;
}
