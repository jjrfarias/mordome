export function isStorefrontDemoEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" || env.STOREFRONT_DEMO_ENABLED === "true";
}
