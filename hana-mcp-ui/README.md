# HANA MCP UI

[![npm version](https://img.shields.io/npm/v/hana-mcp-ui.svg)](https://www.npmjs.com/package/hana-mcp-ui)
[![npm downloads](https://img.shields.io/npm/dy/hana-mcp-ui.svg)](https://www.npmjs.com/package/hana-mcp-ui)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Visual interface for managing HANA MCP server configurations with Claude Desktop integration**

## 🚀 Quick Start

### 1. Run the UI
```bash
npx hana-mcp-ui
```

That's it! The UI will:
- 📦 Install automatically (if not cached)
- 🔧 Start the backend server on port 3001
- ⚡ Start the React frontend on port 5173
- 🌐 Open your browser automatically

### 2. First-Time Setup

On first run, you'll be prompted to set your Claude Desktop config path:

- **🍎 macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **🪟 Windows**: `%APPDATA%\Claude/claude_desktop_config.json`
- **🐧 Linux**: `~/.config/claude/claude_desktop_config.json`

The system suggests the correct path for your OS.

## 🎯 What You Get

### Visual Database Management
- **🌐 Web Interface**: Modern, responsive React UI
- **🔄 Multi-Environment**: Configure Production, Development, Staging per server
- **🤖 Claude Integration**: Deploy configurations directly to Claude Desktop
- **📊 Real-time Status**: Monitor active and configured servers
- **✅ Smart Validation**: Comprehensive form validation for database connections

### Key Features
- **One-Click Deployment**: Add databases to Claude Desktop with a single click
- **Environment Management**: Switch between different database environments
- **Configuration Backup**: Automatic backups before making changes
- **Connection Testing**: Test database connectivity before deployment
- **Clean Interface**: Intuitive design with smooth animations

![HANA MCP UI](hana_mcp_ui.gif)

## 🛠️ How to Use

### 1. Add Database Configuration
- Click **"+ Add Database"** 
- Enter database details (host, user, password, etc.)
- Configure environments (Production, Development, Staging)

### 2. Add to Claude Desktop
- Select a database from your list
- Choose which environment to deploy
- Click **"Add to Claude"**
- Restart Claude Desktop to activate

### 3. Manage Active Connections
- View all databases currently active in Claude
- Remove connections when no longer needed
- Monitor connection status

## ⚙️ Configuration Schema

### Required Fields
| Parameter | Description | Example |
|-----------|-------------|---------|
| `HANA_HOST` | Database hostname or IP address | `hana.company.com` |
| `HANA_USER` | Database username | `DBADMIN` |
| `HANA_PASSWORD` | Database password | `your-secure-password` |

### Optional Fields
| Parameter | Description | Default | Options |
|-----------|-------------|---------|---------|
| `HANA_PORT` | Database port | `443` | Any valid port number |
| `HANA_SCHEMA` | Default schema name | - | Schema name |
| `HANA_CONNECTION_TYPE` | Connection type | `auto` | `auto`, `single_container`, `mdc_system`, `mdc_tenant` |
| `HANA_INSTANCE_NUMBER` | Instance number (MDC) | - | Instance number (e.g., `10`) |
| `HANA_DATABASE_NAME` | Database name (MDC tenant) | - | Database name (e.g., `HQQ`) |
| `HANA_SSL` | Enable SSL connection | `true` | `true`, `false` |
| `HANA_ENCRYPT` | Enable encryption | `true` | `true`, `false` |
| `HANA_VALIDATE_CERT` | Validate SSL certificates | `true` | `true`, `false` |
| `LOG_LEVEL` | Logging level | `info` | `error`, `warn`, `info`, `debug` |
| `ENABLE_FILE_LOGGING` | Enable file logging | `true` | `true`, `false` |
| `ENABLE_CONSOLE_LOGGING` | Enable console logging | `false` | `true`, `false` |

### Database Connection Types

#### 1. Single-Container Database
Standard HANA database with single tenant.

**Required**: `HANA_HOST`, `HANA_USER`, `HANA_PASSWORD`  
**Optional**: `HANA_PORT`, `HANA_SCHEMA`

#### 2. MDC System Database
Multi-tenant system database (manages tenants).

**Required**: `HANA_HOST`, `HANA_PORT`, `HANA_INSTANCE_NUMBER`, `HANA_USER`, `HANA_PASSWORD`  
**Optional**: `HANA_SCHEMA`

#### 3. MDC Tenant Database
Multi-tenant tenant database (specific tenant).

**Required**: `HANA_HOST`, `HANA_PORT`, `HANA_INSTANCE_NUMBER`, `HANA_DATABASE_NAME`, `HANA_USER`, `HANA_PASSWORD`  
**Optional**: `HANA_SCHEMA`

#### Auto-Detection
When `HANA_CONNECTION_TYPE` is set to `auto` (default), the server automatically detects the type:

- If `HANA_INSTANCE_NUMBER` + `HANA_DATABASE_NAME` → **MDC Tenant**
- If only `HANA_INSTANCE_NUMBER` → **MDC System**
- If neither → **Single-Container**

## 🔌 Prerequisites

Before using the UI, install the core server:

```bash
npm install -g hana-mcp-server
```

The UI works as a management interface for the installed server.

## 🏗️ Architecture

### System Architecture

### Technology Stack
- **Frontend**: React 19 with Vite build system
- **Backend**: Express.js REST API
- **Storage**: Local file system for configurations
- **Integration**: Claude Desktop configuration management
- **Styling**: Tailwind CSS with custom components
- **Animations**: Framer Motion for smooth interactions
- **Icons**: Heroicons for consistent iconography

### Component Architecture

```
hana-mcp-ui/
├── 📁 bin/
│   └── cli.js              # NPX entry point launcher
├── 📁 server/
│   └── index.js            # Express backend server
├── 📁 src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Main app component
│   └── components/
│       ├── 🏠 MainApp.jsx          # Main application container
│       ├── 🎛️ ConfigurationModal.jsx # Server configuration modal
│       ├── 📋 DatabaseListView.jsx  # Database list management
│       ├── 🤖 ClaudeDesktopView.jsx # Claude integration view
│       ├── 📊 DashboardView.jsx     # Dashboard overview
│       ├── 🎯 EnvironmentSelector.jsx # Environment selection
│       ├── 📱 VerticalSidebar.jsx   # Navigation sidebar
│       └── 🎨 ui/                  # Reusable UI components
│           ├── GlassWindow.jsx      # Glass morphism container
│           ├── StatusBadge.jsx      # Status indicators
│           ├── DatabaseTypeBadge.jsx # Database type badges
│           └── LoadingSpinner.jsx   # Loading states
├── 📁 dist/                # Built React app (production)
├── 📁 data/                # Local configuration storage
├── 📄 package.json         # Dependencies and scripts
├── ⚙️ vite.config.js       # Vite build configuration
└── 🌐 index.html           # HTML template
```

## 📋 Requirements

- **Node.js**: 18.0.0 or higher
- **Claude Desktop**: For deployment features
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## 🔧 Development

### Local Development
```bash
git clone https://github.com/hatrigt/hana-mcp-server.git
cd hana-mcp-server/hana-mcp-ui
npm install
npm run dev
```

### Build for Production
```bash
npm run build
npm run preview
```

## 🚀 Performance

- **Startup**: < 5 seconds
- **API Response**: < 500ms
- **UI Interactions**: < 100ms
- **Bundle Size**: ~264KB (gzipped: ~83KB)

## 🔒 Security

- **Local-only API** (no external connections)
- **Secure file access** patterns
- **Automatic backups** before configuration changes
- **Password masking** in UI forms

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/hatrigt/hana-mcp-server/issues)
- **Main Package**: [HANA MCP Server](https://www.npmjs.com/package/hana-mcp-server)
- **Documentation**: [Full Documentation](https://github.com/hatrigt/hana-mcp-server#readme)

## 📄 License

MIT License - see LICENSE file for details.