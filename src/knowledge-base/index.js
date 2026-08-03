/**
 * Knowledge base module.
 */

const { saveCase } = require('./case-writer');
const { listCases, generateIndex } = require('./index-manager');
const { search } = require('./search');

module.exports = {
  saveCase,
  listCases,
  generateIndex,
  search
};
