const { createTransformer } = require('@swc/jest')
const transformer = createTransformer({
  jsc: {
    target: 'es2022',
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'automatic' } },
  },
  module: { type: 'commonjs' },
})
module.exports = {
  process(source, filename, ...args) {
    const safeSource = source.replaceAll('import.meta.env', 'globalThis.__ADMIN_IMPORT_META_ENV__')
    return transformer.process(safeSource, filename, ...args)
  },
  getCacheKey(source, filename, ...args) {
    return transformer.getCacheKey(source.replaceAll('import.meta.env', 'globalThis.__ADMIN_IMPORT_META_ENV__'), filename, ...args)
  },
}
