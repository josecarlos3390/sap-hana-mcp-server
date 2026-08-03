#!/usr/bin/env node
/**
 * Identify the type and definition of ACB_TES_CtasXPagarDetallev2 across all schemas.
 */

const QueryExecutor = require('../src/database/query-executor');

const NAME = 'ACB_TES_CtasXPagarDetallev2';

(async () => {
  // Search all schemas
  const views = await QueryExecutor.executeQuery(
    `SELECT SCHEMA_NAME, VIEW_NAME, HAS_PARAMETERS, IS_READ_ONLY AS READ_ONLY, LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW
     FROM SYS.VIEWS WHERE VIEW_NAME = ?`,
    [NAME]
  );
  if (views.length > 0) {
    console.log('TIPO: VISTA');
    console.log(views[0]);
  }

  const funcs = await QueryExecutor.executeQuery(
    `SELECT SCHEMA_NAME, FUNCTION_NAME, FUNCTION_TYPE, INPUT_PARAMETER_COUNT FROM SYS.FUNCTIONS WHERE FUNCTION_NAME = ?`,
    [NAME]
  );
  if (funcs.length > 0) {
    console.log('TIPO: FUNCION');
    console.log(funcs[0]);
    const defs = await QueryExecutor.executeQuery(
      `SELECT LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW FROM SYS.OBJECT_DEFINITION WHERE OBJECT_NAME = ?`,
      [NAME]
    );
    if (defs.length > 0) console.log(defs[0]);
  }

  const procs = await QueryExecutor.executeQuery(
    `SELECT SCHEMA_NAME, PROCEDURE_NAME, INPUT_PARAMETER_COUNT FROM SYS.PROCEDURES WHERE PROCEDURE_NAME = ?`,
    [NAME]
  );
  if (procs.length > 0) {
    console.log('TIPO: PROCEDIMIENTO');
    console.log(procs[0]);
    const defs = await QueryExecutor.executeQuery(
      `SELECT LEFT(DEFINITION, 2000) AS DEFINITION_PREVIEW FROM SYS.OBJECT_DEFINITION WHERE OBJECT_NAME = ?`,
      [NAME]
    );
    if (defs.length > 0) console.log(defs[0]);
  }

  const syns = await QueryExecutor.executeQuery(
    `SELECT SCHEMA_NAME, SYNONYM_NAME, OBJECT_SCHEMA, OBJECT_NAME, OBJECT_TYPE FROM SYS.SYNONYMS WHERE SYNONYM_NAME = ?`,
    [NAME]
  );
  if (syns.length > 0) {
    console.log('TIPO: SINONIMO');
    console.log(syns[0]);
  }

  if (views.length === 0 && funcs.length === 0 && procs.length === 0 && syns.length === 0) {
    console.log('No se encontró el objeto', NAME, 'en VIEWS, FUNCTIONS, PROCEDURES ni SYNONYMS');
  }
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
