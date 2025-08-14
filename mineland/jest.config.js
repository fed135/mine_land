export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.d.ts',
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
      },
    }],
  },
  moduleFileExtensions: ['ts', 'js'],
  globals: {
    HTMLCanvasElement: class HTMLCanvasElement {
      getContext() {
        return {
          fillRect: jest.fn(),
          clearRect: jest.fn(),
          getImageData: jest.fn(() => ({ data: [] })),
          putImageData: jest.fn(),
          createImageData: jest.fn(() => ({ data: [] })),
          setTransform: jest.fn(),
          drawImage: jest.fn(),
          save: jest.fn(),
          restore: jest.fn(),
          beginPath: jest.fn(),
          moveTo: jest.fn(),
          lineTo: jest.fn(),
          closePath: jest.fn(),
          stroke: jest.fn(),
          fill: jest.fn(),
        };
      }
      toDataURL() {
        return '';
      }
    }
  }
};