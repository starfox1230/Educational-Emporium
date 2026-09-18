import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const appHtml = readFileSync(appPath, 'utf8');
const inlineScript = appHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inlineScript, 'the app has an inline script');

const setupStart = inlineScript.indexOf('    const WORDS = ');
const generatorsStart = inlineScript.indexOf('    const generators = [', setupStart);
const generatorsEnd = inlineScript.indexOf('\n    ];', generatorsStart);
assert.ok(setupStart >= 0 && generatorsStart > setupStart && generatorsEnd > generatorsStart,
  'the app exposes its question setup and generator definitions');
const executableQuestionCode = inlineScript.slice(setupStart, generatorsEnd + '\n    ];'.length);

function generatedProblem(label, chosenInteger) {
  const generators = vm.runInNewContext(`${executableQuestionCode}
    int = (_min, max) => Math.min(max, Math.max(_min, ${chosenInteger}));
    random = () => 0.5;
    shuffle = items => items;
    generators;`);
  const generator = generators.find(item => item.label === label);
  assert.ok(generator, `question generator exists: ${label}`);
  return generator.make();
}

test('backward-count question supplies a real descending missing-middle answer', () => {
  const problem = generatedProblem('Count backward', 15);

  assert.equal(problem.answer, 13);
  assert.match(problem.html, /<span>15<\/span><span>14<\/span>/);
  assert.match(problem.html, /class="blank">\?<\/span><span>12<\/span>/);
});

test('object-count question includes teen number words as answer choices', () => {
  const problem = generatedProblem('Number word', 12);

  assert.equal(problem.answer, 'twelve');
  assert.match(problem.html, /aria-label="12 objects"/);
  assert.match(problem.html, /data-value="twelve"/);
  assert.match(problem.html, /data-value="eleven"/);
  assert.match(problem.html, /data-value="thirteen"/);
});

test('number-word recognition accepts the upper teen boundary', () => {
  const problem = generatedProblem('Number match', 19);

  assert.equal(problem.answer, 19);
  assert.match(problem.html, /class="number-word">nineteen<\/div>/);
});

test('missing-middle questions include 15, blank, 17', () => {
  const problem = generatedProblem('Missing number', 15);

  assert.equal(problem.answer, 16);
  assert.match(problem.html, /<span>15<\/span>/);
  assert.match(problem.html, /<span>17<\/span>/);
});

test('dot-count question presents two complete ten-frames with the correct filled count', () => {
  const problem = generatedProblem('Dots', 11);
  const slots = problem.html.match(/class="ten-frame-cell(?: filled)?"/g) ?? [];
  const filledSlots = problem.html.match(/class="ten-frame-cell filled"/g) ?? [];
  const frames = problem.html.match(/class="ten-frame"/g) ?? [];

  assert.equal(problem.answer, 11);
  assert.equal(frames.length, 2);
  assert.equal(slots.length, 20);
  assert.equal(filledSlots.length, 11);
  assert.match(problem.html, /aria-label="11 dots shown in 2 ten-frames"/);
});
