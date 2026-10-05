import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(readFileSync(join(evidence, 'cohort-summary.json'), 'utf8'));
if (report.partial || report.scenarios.length !== 28 || report.scenarios.some(row =>
  row.baseline.count !== 20 || row.final.count !== 20 || row.pairedCount !== 20)) {
  throw new Error('Refusing to finalize an incomplete cohort.');
}
const number = value => value.toFixed(2).replace('.', ',');
const table = [
  '## Resultado económico final', '',
  '560 parejas completas, veinte por cada uno de los 28 escenarios clásicos.',
  'Siete escenarios exceden los tres puntos declarados. La fase permanece abierta',
  'por esa puerta. Pérdida positiva = peor supervivencia ponderada; una pérdida',
  'negativa no establece una mejora causal.', '',
  '| Escenario | Referencia % | Resultado % | Pérdida (puntos) | ≤ 3 |',
  '|---|---:|---:|---:|:---:|',
  ...report.scenarios.map(row => `| ${row.scenario} | ${number(row.baseline.weightedSurvivalPct)} | ${number(row.final.weightedSurvivalPct)} | ${number(row.baselineMinusFinalWeightedLossPp)} | ${row.weightedLossGateMax3Pp ? 'Sí' : '**No**'} |`),
  '',
  'La tabla no sustituye los datos por semilla ni sus intervalos. `scribes` y',
  '`conquest` tienen intervalos aproximados del cambio emparejado completamente',
  'negativos; los demás escenarios que incumplen tienen intervalos que incluyen',
  'cero. Esto limita la atribución causal, pero no convierte una puerta numérica',
  'incumplida en superada. No se ajustó un coeficiente para escoger el resultado.',
  '',
  '`lean` permanece en colapso en las veinte semillas de ambos brazos: estar',
  'dentro del coste añadido no implica que ese mundo esté sano. Los colapsos',
  'suben de 2 a 4 en `millers`, de 0 a 2 en `feasts`, de 2 a 3 en `stewards`',
  'y de 0 a 1 en `farmers`. Se conserva esa información en el resumen.',
  '',
  'Datos, scripts, hashes de fuente y logs: `artifacts/verification/m15-phase27-20261005/`.',
  'El README explica la reconstrucción de snapshots y las excepciones. El reductor',
  'rechaza duplicados contradictorios; su control negativo está registrado.',
  '',
].join('\n');
const path = join(process.cwd(), 'docs/m15_phase27_verification.md');
let text = readFileSync(path, 'utf8');
const oldTable = text.indexOf('## Resultado económico final');
if (oldTable >= 0) text = text.slice(0, oldTable);
text = text.replace('La implementación de 27a–27e está integrada. Las pruebas de implementación y la matriz\nhan terminado; la comparación económica final sigue en ejecución; este documento no declara\nla fase cerrada ni la puerta de coste superada.',
  'La implementación de 27a–27e y su medición están entregadas. Typecheck,\n1.056 unitarios, 80 e2e y los seis checks de `shallows` pasan. La matriz\nclásica sigue roja (106 → 112 fallos) y siete escenarios exceden el coste\ndeclarado. **La fase permanece abierta por su puerta económica.**');
text = text.replace('Se ejecutan veinte semillas emparejadas', 'Se ejecutaron veinte semillas emparejadas');
writeFileSync(path, text.trimEnd() + '\n\n' + table);
const failed = report.scenarios.filter(row => !row.weightedLossGateMax3Pp);
const bugsPath = join(process.cwd(), 'docs/bugs.md');
let bugs = readFileSync(bugsPath, 'utf8');
const start = bugs.indexOf('## M15 fase 27: puerta de coste');
const end = bugs.indexOf('## M15 fase 26c:', start);
if (start < 0 || end < 0) throw new Error('Missing phase 27 cost issue section.');
const issue = [
  '## M15 fase 27: puerta de coste abierta (2026-10-05)', '',
  'La comparación completa de 560 parejas (veinte semillas × 28 escenarios)',
  'excede el máximo de tres puntos de pérdida ponderada en siete escenarios:', '',
  ...failed.map(row => `- \`${row.scenario}\`: ${number(row.baseline.weightedSurvivalPct)} % → ${number(row.final.weightedSurvivalPct)} %, pérdida ${number(row.baselineMinusFinalWeightedLossPp)} puntos.`),
  '',
  'No se ha aislado el mecanismo responsable ni ajustado un coeficiente para',
  'aprobar. En `scribes/alpha` coinciden los fundadores; la diferencia posterior',
  'incluye hambre y exposición sin ahogamientos. En `century/sigma` el desplome',
  'tampoco incluye nado ni ahogamientos. Las sondas no establecen cuál de los',
  'cambios de acceso, distribución de peces, tiempo de viaje o humedad lo causa.',
  'Los intervalos de `scribes` y `conquest` son negativos; los de los otros cinco',
  'incluyen cero, sin que ello supere la puerta numérica.', '',
  'La matriz continúa roja: 106 fallos previos → 112 finales, 36 fallos nuevos',
  'y 30 ausentes. Nueve escenarios tienen menos checks aplicables; ausente no',
  'equivale a arreglado. La comparación completa de IDs queda en los datos.',
  'El fallo de medición que mezclaba pendiente y vadeo sí está corregido con',
  'control negativo; los demás hallazgos no tienen causa confirmada.',
  '[Protocolo, sondas, tabla y evidencia](m15_phase27_verification.md).', '', '',
].join('\n');
writeFileSync(bugsPath, bugs.slice(0, start) + issue + bugs.slice(end));
console.log('Final report and seven unresolved cost findings written.');
