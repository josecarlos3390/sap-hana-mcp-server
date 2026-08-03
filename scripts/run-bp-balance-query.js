const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const hana = require('@sap/hana-client');

const bpCode = process.argv[2] || 'T1IVCL156626';
const schema = process.argv[3] || 'GLADYMAR_PROD';

const params = {
  serverNode: `${process.env.HANA_HOST}:${process.env.HANA_PORT}`,
  uid: process.env.HANA_USER,
  pwd: process.env.HANA_PASSWORD,
  encrypt: process.env.HANA_ENCRYPT !== 'false',
  sslValidateCertificate: process.env.HANA_VALIDATE_CERT !== 'false'
};
if (process.env.HANA_DATABASE_NAME) {
  params.databaseName = process.env.HANA_DATABASE_NAME;
}

const sql = `SELECT TOP 50
  T0."RefDate" AS "Fecha Contabilización",
  T0."DueDate" AS "Fecha de Vencimiento",
  T0."TransType" AS "TipoTrans",
  CASE T0."TransType"
    WHEN 13 THEN 'Factura Deudores'
    WHEN 14 THEN 'Nota Crédito Deudores'
    WHEN 15 THEN 'Entrega'
    WHEN 16 THEN 'Devolución'
    WHEN 18 THEN 'Factura Acreedores'
    WHEN 19 THEN 'Nota Crédito Acreedores'
    WHEN 20 THEN 'Entrada Mercancía'
    WHEN 21 THEN 'Salida Mercancía'
    WHEN 24 THEN 'Pago Recibido'
    WHEN 25 THEN 'Depósito'
    WHEN 30 THEN 'Asiento Contable'
    WHEN 46 THEN 'Pago Efectuado'
    WHEN 58 THEN 'Factura Corrección Deudores'
    WHEN 59 THEN 'Factura Corrección Deudores+'
    WHEN 67 THEN 'Transferencia Stock'
    WHEN 132 THEN 'Reconciliación'
    ELSE CAST(T0."TransType" AS VARCHAR)
  END AS "Origen",
  T0."BaseRef" AS "Nro Documento",
  COALESCE(
    T0."SourceID",
    CASE T0."TransType"
      WHEN 13 THEN T_INV."DocEntry"
      WHEN 14 THEN T_RIN."DocEntry"
      WHEN 15 THEN T_DLN."DocEntry"
      WHEN 16 THEN T_RDN."DocEntry"
      WHEN 18 THEN T_PCH."DocEntry"
      WHEN 19 THEN T_RPC."DocEntry"
      WHEN 20 THEN T_IGN."DocEntry"
      WHEN 21 THEN T_IGE."DocEntry"
      WHEN 24 THEN T_RCT."DocEntry"
      WHEN 46 THEN T_VPM."DocEntry"
      WHEN 58 THEN T_INV."DocEntry"
      WHEN 59 THEN T_INV."DocEntry"
    END
  ) AS "DocEntry",
  T0."Debit" AS "Débito",
  T0."Credit" AS "Crédito",
  CASE COALESCE(NULLIF(T0."FCCurrency", ''), OADM."MainCurncy")
    WHEN 'BS' THEN 'BOB'
    WHEN '$' THEN 'USD'
    WHEN 'USD' THEN 'USD'
    ELSE COALESCE(NULLIF(T0."FCCurrency", ''), OADM."MainCurncy")
  END AS "Moneda",
  CASE WHEN NULLIF(T0."FCCurrency", '') IS NULL THEN 1 ELSE T0."SystemRate" END AS "Tipo de Cambio",
  T0."FCDebit" AS "Débito FC",
  T0."FCCredit" AS "Crédito FC",
  SUM(T0."Debit" - T0."Credit") OVER (
    ORDER BY T0."RefDate", T0."TransId", T0."Line_ID"
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS "Saldo Acumulado",
  (T0."BalDueDeb" - T0."BalDueCred") AS "Saldo Pendiente Línea",
  T1."ReconNum" AS "Nro Reconciliación",
  T0."LineMemo" AS "Memo"
FROM "${schema}"."JDT1" T0
LEFT JOIN "${schema}"."OADM" OADM ON 1 = 1
LEFT JOIN "${schema}"."OINV" T_INV ON T_INV."DocNum" = T0."BaseRef" AND T0."TransType" = 13
LEFT JOIN "${schema}"."ORIN" T_RIN ON T_RIN."DocNum" = T0."BaseRef" AND T0."TransType" = 14
LEFT JOIN "${schema}"."ODLN" T_DLN ON T_DLN."DocNum" = T0."BaseRef" AND T0."TransType" = 15
LEFT JOIN "${schema}"."ORDN" T_RDN ON T_RDN."DocNum" = T0."BaseRef" AND T0."TransType" = 16
LEFT JOIN "${schema}"."OPCH" T_PCH ON T_PCH."DocNum" = T0."BaseRef" AND T0."TransType" = 18
LEFT JOIN "${schema}"."ORPC" T_RPC ON T_RPC."DocNum" = T0."BaseRef" AND T0."TransType" = 19
LEFT JOIN "${schema}"."OIGN" T_IGN ON T_IGN."DocNum" = T0."BaseRef" AND T0."TransType" = 20
LEFT JOIN "${schema}"."OIGE" T_IGE ON T_IGE."DocNum" = T0."BaseRef" AND T0."TransType" = 21
LEFT JOIN "${schema}"."ORCT" T_RCT ON T_RCT."DocNum" = T0."BaseRef" AND T0."TransType" = 24
LEFT JOIN "${schema}"."OVPM" T_VPM ON T_VPM."DocNum" = T0."BaseRef" AND T0."TransType" = 46
LEFT JOIN (
  SELECT "TransId", "TransRowId", "ShortName", MAX("ReconNum") AS "ReconNum"
  FROM "${schema}"."ITR1"
  GROUP BY "TransId", "TransRowId", "ShortName"
) T1 ON T1."TransId" = T0."TransId"
    AND T1."TransRowId" = T0."Line_ID"
    AND T1."ShortName" = T0."ShortName"
WHERE T0."ShortName" = ?
ORDER BY T0."RefDate", T0."TransId", T0."Line_ID"`;

const conn = hana.createConnection();
conn.connect(params, (err) => {
  if (err) {
    console.error('Connect error:', err.message);
    process.exit(1);
  }
  const stmt = conn.prepare(sql);
  stmt.execQuery([bpCode], (err, rs) => {
    if (err) {
      console.error('Query error:', err.message);
      conn.disconnect();
      process.exit(1);
    }
    const rows = [];
    while (rs.next()) {
      rows.push(rs.getValues());
    }
    console.log(JSON.stringify(rows, null, 2));
    stmt.drop();
    conn.disconnect();
  });
});
