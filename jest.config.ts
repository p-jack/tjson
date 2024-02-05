import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testPathIgnorePatterns:["<rootDir>/node_modules/", "<rootDir>/dist/"]
}

export default config
