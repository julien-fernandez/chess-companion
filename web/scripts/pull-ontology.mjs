import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const SOURCE = process.env.CHESS_VOCABULARY_ARTIFACT ?? resolve(
  HERE,
  '../../../2026.07 Ontology Manager/ontology_manager/generated/chess_vocabulary.json',
)
const DEST = resolve(HERE, '../src/chess/chess-vocabulary.js')

const raw = readFileSync(SOURCE, 'utf-8')
const vocab = JSON.parse(raw)

if (vocab.slug !== 'chess-vocabulary') {
  throw new Error(`artefact inattendu : slug=${vocab.slug} (attendu chess-vocabulary)`)
}
if (!Array.isArray(vocab.axes) || vocab.axes.length === 0) {
  throw new Error('artefact sans axe — refus de tirer un vocabulaire vide')
}

const header = [
  '// GÉNÉRÉ — ne pas éditer à la main.',
  '// Tiré depuis ontology-manager (kind: chess) par `npm run pull:ontology`.',
  '// Source de vérité : data/ontology/chess-vocabulary.yaml',
  `// Version tirée : ${vocab.version}`,
  '',
].join('\n')

writeFileSync(
  DEST,
  `${header}export const CHESS_VOCABULARY = ${JSON.stringify(vocab, null, 2)}\n`,
  'utf-8',
)

const actifs = vocab.axes.filter((a) => a.status === 'active').length
console.log(
  `[pull-ontology] v${vocab.version} → src/chess/chess-vocabulary.js ` +
  `(${vocab.axes.length} axes, ${actifs} actifs)`,
)
