'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

function load(file, overrides = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const localRequire = Module.createRequire(filename);
  const testModule = { exports: {} };
  const wrapped = vm.runInThisContext(Module.wrap(fs.readFileSync(filename, 'utf8')), { filename });
  wrapped(testModule.exports, (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id)),
    testModule, filename, path.dirname(filename));
  return testModule.exports;
}

module.exports = { load };
