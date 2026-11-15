'use strict';

const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
let failed = 0;
// Includes engine.test.js, mock.test.js and server.test.js; sample-transcript.js stays opt-in.
for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.test.js')).sort()) {
  for (const [name, test] of require(path.join(__dirname, file))) {
    try {
      test();
      passed++;
      console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}\n${error.stack}`);
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
