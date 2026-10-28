module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/src/**/*.test.jsx'],
  transform: { '^.+\\.[jt]sx?$': '<rootDir>/jest.transform.cjs' },
  moduleNameMapper: { '\\.css$': '<rootDir>/jest.styleMock.cjs' },
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  clearMocks: true,
}
