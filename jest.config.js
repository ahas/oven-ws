module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    verbose: true,
    moduleFileExtensions: ["ts", "js"],
    moduleDirectories: ["node_modules"],
    testMatch: ["<rootDir>/**/__test__/*.ts"],
    globals: {
        "ts-jest": {
            tsconfig: "packages/tsconfig.lib.json",
        },
    },
};
