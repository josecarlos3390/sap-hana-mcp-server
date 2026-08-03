# Run memory monitor for HANA MCP Server
# This script sets the required environment variables and executes the monitor.
# WARNING: This file contains the HANA password in plain text. Keep it secure.

$env:HANA_HOST = "hanaroda25.gruporoda.com"
$env:HANA_PORT = "30015"
$env:HANA_USER = "B1ADMIN"
$env:HANA_PASSWORD = "RodaHana2016!."
$env:HANA_SCHEMA = "RETAIL"
$env:HANA_CONNECTION_TYPE = "auto"
$env:HANA_SSL = "false"
$env:HANA_ENCRYPT = "false"
$env:HANA_VALIDATE_CERT = "false"
$env:LOG_LEVEL = "error"
$env:ENABLE_FILE_LOGGING = "false"
$env:ENABLE_CONSOLE_LOGGING = "false"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
node "$scriptPath\memory-monitor.js"
