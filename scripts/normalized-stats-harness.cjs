const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const Papa = require('papaparse');

const repoRoot = path.resolve(__dirname, '..');
const r10Path = path.join(repoRoot, 'lib', 'r10.ts');
const csvPath =
  process.argv[2] ||
  '/mnt/data/DrivingRange-2026-02-26 04_50_04 +0000.csv';

if (!fs.existsSync(r10Path)) {
  throw new Error(`Missing file: ${r10Path}`);
}
if (!fs.existsSync(csvPath)) {
  throw new Error(`CSV not found: ${csvPath}`);
}

const source = fs.readFileSync(r10Path, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true
  }
}).outputText;

const moduleExports = {};
const moduleContext = {
  module: { exports: moduleExports },
  exports: moduleExports,
  require,
  __dirname: path.dirname(r10Path),
  __filename: r10Path,
  console
};
vm.createContext(moduleContext);
vm.runInContext(transpiled, moduleContext);

const { parseRowsToNormalizedShots, computeStats, computeMissPatterns } = moduleContext.module.exports;
const diagnosisPath = path.join(repoRoot, 'lib', 'coach-diagnosis.ts');
const diagnosisSource = fs.readFileSync(diagnosisPath, 'utf8');
const diagnosisTranspiled = ts.transpileModule(diagnosisSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true
  }
}).outputText;
const diagnosisExports = {};
const diagnosisContext = {
  module: { exports: diagnosisExports },
  exports: diagnosisExports,
  require,
  __dirname: path.dirname(diagnosisPath),
  __filename: diagnosisPath,
  console
};
vm.createContext(diagnosisContext);
vm.runInContext(diagnosisTranspiled, diagnosisContext);
const { computeCoachDiagnosis } = diagnosisContext.module.exports;
if (
  typeof parseRowsToNormalizedShots !== 'function' ||
  typeof computeStats !== 'function' ||
  typeof computeMissPatterns !== 'function' ||
  typeof computeCoachDiagnosis !== 'function'
) {
  throw new Error('Expected parseRowsToNormalizedShots, computeStats, computeMissPatterns, and computeCoachDiagnosis exports');
}

const csv = fs.readFileSync(csvPath, 'utf8');
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
if (parsed.errors.length > 0) {
  throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 3))}`);
}

const { shots, importReport } = parseRowsToNormalizedShots(parsed.data);
const stats = computeStats(shots);
const missPatterns = computeMissPatterns(shots);
const diagnosis = computeCoachDiagnosis(shots);

console.log('=== Import Report ===');
console.log(JSON.stringify(importReport, null, 2));
console.log('=== Overall Stats ===');
console.log(JSON.stringify(stats.overallStats, null, 2));
console.log('=== First 5 Clubs ===');
for (const club of Object.keys(stats.perClubStats).slice(0, 5)) {
  console.log(club, stats.perClubStats[club]);
}
console.log('=== Miss Patterns (Overall) ===');
console.log(missPatterns.overall);
console.log('=== Coach Diagnosis ===');
console.log(diagnosis);
