import {
	buildDomains,
	checkAvailability,
	loadInput,
	Progress,
	writeOutput,
} from "#core";

const DATA_DIR = "data";
const INPUT_FILE = "input";
const OUTPUT_DIR = "outputs";

const progress = new Progress();

const input = await progress.execAction(
	loadInput,
	DATA_DIR,
	INPUT_FILE,
	progress,
);
if (!input) throw new Error(`Cannot load input from ${DATA_DIR}/${INPUT_FILE}`);

progress.configure({
	retry: input.configs.reqRetries,
	backoff: input.configs.reqRetryBackoff,
});

const groups = await progress.execAction(buildDomains, input);
if (groups) {
	const result = await progress.execAction(
		checkAvailability,
		groups,
		input.configs,
		progress,
	);
	if (result)
		await progress.execAction(
			writeOutput,
			result.available,
			OUTPUT_DIR,
			input.configs.stdoutLimit,
		);
}

progress.stop();
