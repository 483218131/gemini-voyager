import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const INDEX_PATH = '.github/docs/REGRESSION_NOTES.md';
const TOPIC_DIRECTORY = '.github/docs/regressions';
const REQUIRED_FIELDS = ['Trap', 'Rule', 'Guard'];

export function validateRegressionNotes(repositoryRoot = process.cwd()) {
  const errors = [];
  const indexPath = path.join(repositoryRoot, INDEX_PATH);
  const topicDirectory = path.join(repositoryRoot, TOPIC_DIRECTORY);

  if (!existsSync(indexPath)) errors.push(`Missing regression index: ${INDEX_PATH}`);
  if (!existsSync(topicDirectory)) {
    errors.push(`Missing regression topic directory: ${TOPIC_DIRECTORY}`);
    return { entryCount: 0, errors, topicCount: 0 };
  }

  const topicFiles = readdirSync(topicDirectory)
    .filter((file) => file.endsWith('.md'))
    .sort();
  const index = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  const linkedFiles = [...index.matchAll(/\]\(regressions\/([^)]+\.md)\)/g)].map(
    (match) => match[1],
  );

  for (const file of topicFiles) {
    if (!linkedFiles.includes(file)) errors.push(`Topic is not linked from the index: ${file}`);
  }
  for (const file of linkedFiles) {
    if (!topicFiles.includes(file)) errors.push(`Index links to a missing topic: ${file}`);
  }
  if (new Set(linkedFiles).size !== linkedFiles.length) {
    errors.push('The regression index links to a topic more than once');
  }

  const titles = new Map();
  let entryCount = 0;

  for (const file of topicFiles) {
    const relativePath = `${TOPIC_DIRECTORY}/${file}`;
    const markdown = readFileSync(path.join(topicDirectory, file), 'utf8');
    const topLevelHeadings = markdown.match(/^# [^#]/gm) ?? [];
    if (topLevelHeadings.length !== 1) {
      errors.push(`${relativePath} must contain exactly one top-level heading`);
    }

    const sections = markdown.split(/\n(?=## )/).slice(1);
    if (sections.length === 0) errors.push(`${relativePath} contains no regression entries`);

    for (const section of sections) {
      entryCount += 1;
      const title = section.match(/^## (.+)$/m)?.[1]?.trim();
      if (!title) {
        errors.push(`${relativePath} contains an entry without a title`);
        continue;
      }

      const previousFile = titles.get(title);
      if (previousFile) {
        errors.push(`Duplicate regression title "${title}" in ${previousFile} and ${relativePath}`);
      } else {
        titles.set(title, relativePath);
      }

      const legacyLabels =
        section.match(
          /^(?:Symptom(?:\s+\([^)]*\))?|Root cause|Fix|Regression tests?|Verification|Commit):/gm,
        ) ?? [];
      if (legacyLabels.length > 0) {
        errors.push(`${relativePath}#${title} still uses legacy field labels`);
      }

      const lines = section.split('\n');
      const fieldStarts = lines
        .map((line, index) => ({
          field: REQUIRED_FIELDS.find((name) => line.startsWith(`- **${name}:**`)),
          index,
        }))
        .filter(({ field }) => field);

      for (const field of REQUIRED_FIELDS) {
        const matches = fieldStarts.filter((item) => item.field === field);
        if (matches.length !== 1) {
          errors.push(`${relativePath}#${title} must contain exactly one ${field} field`);
          continue;
        }

        const start = matches[0].index;
        const next = fieldStarts.find((item) => item.index > start)?.index ?? lines.length;
        const value = lines.slice(start, next).join('\n').replace(`- **${field}:**`, '').trim();
        if (!value) errors.push(`${relativePath}#${title} has an empty ${field} field`);

        if (field === 'Guard') {
          validateGuardPaths(value, repositoryRoot, relativePath, title, errors);
        }
      }
    }
  }

  return { entryCount, errors, topicCount: topicFiles.length };
}

function validateGuardPaths(guard, repositoryRoot, relativePath, title, errors) {
  for (const match of guard.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1].replace(/[.,;:]$/, '');
    if (/^[^/]+\.(?:test|spec)\.(?:js|jsx|ts|tsx)$/.test(candidate)) {
      errors.push(
        `${relativePath}#${title} must use a repository-relative path for guard test: ${candidate}`,
      );
      continue;
    }
    if (!/^(?:\.github|Voyager|docs|public|scripts|src)\//.test(candidate)) continue;
    if (/[\s*<>{}]/.test(candidate)) continue;
    if (!existsSync(path.join(repositoryRoot, candidate))) {
      errors.push(`${relativePath}#${title} references a missing guard path: ${candidate}`);
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const result = validateRegressionNotes();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Regression notes valid: ${result.entryCount} entries across ${result.topicCount} topics.`,
    );
  }
}
