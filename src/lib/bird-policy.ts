/** Bird is reserved for installed mobile apps, never browser visitors. */
export function isBirdPlatformAllowed(platform: string | undefined): boolean {
  return platform === "ios" || platform === "android";
}