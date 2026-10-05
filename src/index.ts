import {
	buildDomains,
	checkAvailability,
	DEFAULT_INPUT_CONFIG,
	loadInput,
	writeOutput,
} from "#actions";
import { Progress } from "#core";
import type { InputConfig } from "#types/input";

const INPUT_FILE = "data/input.yaml";
const OUTPUT_DIR = "outputs";

const progress = new Progress<InputConfig>(DEFAULT_INPUT_CONFIG);

const input = await progress.execAction(loadInput, INPUT_FILE);
progress.setContext(input.configs);

const groups = await progress.execAction(buildDomains, input);
const result = await progress.execAction(checkAvailability, groups);
await progress.execAction(writeOutput, result, OUTPUT_DIR);

progress.stop();
