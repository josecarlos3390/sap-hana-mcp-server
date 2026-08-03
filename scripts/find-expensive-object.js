#!/usr/bin/env node
/**
 * Locate the object referenced by the most expensive statement.
 */

const QueryExecutor = require('../src/database/query-executor');

const NAME = 'ACB_TES_CtasXPagarDetallev2';

(async () => {
  console.log(`Buscando objeto: ${NAME}\n`);

  const search = async (label, sql, param) => {
    const rows = await QueryExecutor.executeQuery(sql, param ? [param] : []);
    if (rows.length > 0) {
      console.log(`=== ${label} (${rows.length}) ===`);
      for (const r of rows) {
        console.log(r);
      }
      return true;
    }
    return false;
  };

  await search('VISTAS',
    `SELECT SCHEMA_NAME, VIEW_NAME, HAS_PARAMETERS, IS_READ_ONLY AS READ_ONLY, LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW
     FROM SYS.VIEWS WHERE UPPER(VIEW_NAME) = UPPER(?)`, NAME);

  await search('FUNCIONES',
    `SELECT SCHEMA_NAME, FUNCTION_NAME, FUNCTION_TYPE, INPUT_PARAMETER_COUNT, LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW
     FROM SYS.FUNCTIONS WHERE UPPER(FUNCTION_NAME) = UPPER(?)`, NAME);

  await search('PROCEDIMIENTOS',
    `SELECT SCHEMA_NAME, PROCEDURE_NAME, INPUT_PARAMETER_COUNT, LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW
     FROM SYS.PROCEDURES WHERE UPPER(PROCEDURE_NAME) = UPPER(?)`, NAME);

  await search('SINONIMOS',
    `SELECT SCHEMA_NAME, SYNONYM_NAME, OBJECT_SCHEMA, OBJECT_NAME, OBJECT_TYPE
     FROM SYS.SYNONYMS WHERE UPPER(SYNONYM_NAME) = UPPER(?)`, NAME);

  await search('CALCULATION VIEWS (_SYS_BIC)',
    `SELECT SCHEMA_NAME, VIEW_NAME, VIEW_TYPE, IS_VALID
     FROM SYS.VIEWS WHERE SCHEMA_NAME = '_SYS_BIC' AND UPPER(VIEW_NAME) LIKE UPPER(?)`, `%${NAME}%`);

  await search('OBJECT_DEFINITIONS',
    `SELECT OBJECT_NAME, OBJECT_TYPE, LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW
     FROM SYS.OBJECT_DEFINITIONS WHERE UPPER(OBJECT_NAME) = UPPER(?)`, NAME);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
