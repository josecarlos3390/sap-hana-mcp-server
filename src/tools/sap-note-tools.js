/**
 * SAP Note knowledge capture and assisted diagnostic case creation tools.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { saveCase } = require('../knowledge-base/case-writer');
const licenseManager = require('../licensing/license-manager');

const FETCH_SCRIPT = path.join(process.cwd(), 'scripts', 'fetch-sap-note-playwright.py');

function checkKbWriteLicense() {
  if (licenseManager.status !== 'VALID' || !licenseManager.details.features.includes('knowledge-base')) {
    throw new Error('Saving knowledge cases requires an active license with the knowledge-base feature.');
  }
}

function runExternalSapNoteFetcher(noteNumber) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FETCH_SCRIPT)) {
      return resolve({
        success: false,
        fetched: false,
        message: `SAP Note fetcher script not found at ${FETCH_SCRIPT}. Provide the note content in the 'content' parameter to save it as a KB case.`
      });
    }

    const env = {
      ...process.env,
      SAP_NOTE: noteNumber,
      SAP_USER: process.env.SAP_USER || '',
      SAP_PASS: process.env.SAP_PASS || ''
    };

    if (!env.SAP_USER || !env.SAP_PASS) {
      return resolve({
        success: false,
        fetched: false,
        message: 'SAP_USER and SAP_PASS environment variables are not set. Provide them in the environment or pass the note content in the "content" parameter.'
      });
    }

    let stdout = '';
    let stderr = '';
    const pythonExecutable = process.platform === 'win32'
      ? path.join(process.cwd(), 'venv-sap', 'Scripts', 'python.exe')
      : path.join(process.cwd(), 'venv-sap', 'bin', 'python');

    const child = spawn(pythonExecutable, [FETCH_SCRIPT], {
      env,
      cwd: process.cwd(),
      shell: false
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        return resolve({
          success: true,
          fetched: true,
          message: `SAP Note ${noteNumber} fetched successfully.`,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      }

      resolve({
        success: false,
        fetched: false,
        message: `SAP Note fetcher exited with code ${code}. Provide the note content in the 'content' parameter or check that Playwright is installed in venv-sap and SAP_USER/SAP_PASS/SAP_NOTE are set.`,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        fetched: false,
        message: `Failed to start SAP Note fetcher: ${error.message}. Provide the note content in the 'content' parameter or ensure Python/Playwright are installed.`,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function hanaFetchSapNote(args) {
  checkKbWriteLicense();

  const { note_number, content } = args || {};
  if (!note_number) {
    throw new Error('Missing required field: note_number');
  }

  const title = `SAP Note ${note_number}`;

  if (content) {
    const result = saveCase({
      title,
      symptom: content,
      category: 'sap-note',
      status: 'open',
      sap_note: note_number,
      tags: ['sap-note', note_number]
    });

    return {
      success: true,
      saved: true,
      message: `SAP Note ${note_number} saved as knowledge case at ${result.filepath}`,
      filename: result.filename,
      filepath: result.filepath
    };
  }

  const fetchResult = await runExternalSapNoteFetcher(note_number);
  return fetchResult;
}

async function hanaCreateDiagnosticCase(args) {
  checkKbWriteLicense();

  const { title, symptom, cause, solution, evidence, scripts, lessons, sap_note } = args || {};
  if (!title) {
    throw new Error('Missing required field: title');
  }

  const result = saveCase({
    title,
    symptom,
    cause,
    solution,
    evidence,
    scripts: Array.isArray(scripts) ? scripts : [],
    lessons,
    sap_note
  });

  return {
    success: true,
    message: `Diagnostic case saved to ${result.filepath}`,
    filename: result.filename,
    filepath: result.filepath
  };
}

module.exports = {
  hanaFetchSapNote,
  hanaCreateDiagnosticCase
};
