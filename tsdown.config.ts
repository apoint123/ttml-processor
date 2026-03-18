import { defineConfig, type UserConfig } from "tsdown";

const buildConfig: UserConfig = defineConfig({
	entry: ["./src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
});

export default buildConfig;
