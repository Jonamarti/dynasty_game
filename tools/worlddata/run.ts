import { buildWorldData } from './build.ts';

buildWorldData({
  elevationPath: process.env.WORLD_DATA_ELEVATION,
  beckZipPath: process.env.WORLD_DATA_BECK_ZIP,
  riversZipPath: process.env.WORLD_DATA_RIVERS_ZIP,
  lakesZipPath: process.env.WORLD_DATA_LAKES_ZIP,
  outputDir: process.env.WORLD_DATA_OUTPUT,
}).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
