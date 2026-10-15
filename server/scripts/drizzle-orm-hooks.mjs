// Node module hook used by drizzle-kit.mjs: if "drizzle-orm" can't be found from where the
// importer lives (the hoisted drizzle-kit), resolve it from this workspace instead.
const workspace = new URL('../package.json', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(specifier, { ...context, parentURL: workspace });
    }
  }
  return nextResolve(specifier, context);
}
