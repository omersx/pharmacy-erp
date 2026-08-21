<div align="center">

<img src="https://raw.githubusercontent.com/omersx/pharmacy-erp/main/img/logo.png" alt="Pharmacy ERP Logo" width="120" />

# Pharmacy ERP & POS System (CLI)

**The interactive CLI to scaffold and launch the Pharmacy ERP system.**

[![npm](https://img.shields.io/npm/v/pharmacy-erp?color=CB3837&logo=npm)](https://www.npmjs.com/package/pharmacy-erp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/omersx/pharmacy-erp/blob/main/LICENSE)

</div>

## 🚀 Quick Start

The easiest way to install and start the Pharmacy ERP system is using our interactive CLI:

```bash
# 1. Scaffold the project (clones, installs, and seeds data automatically)
npx pharmacy-erp init

# 2. Enter the directory
cd pharmacy-erp

# 3. Start the application
npx pharmacy-erp start
```

That's it! The application will start at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

---

## 🛠️ CLI Commands

You can run these commands via `npx pharmacy-erp <command>` or inside your project directory if you have it installed globally.

| Command | Description |
|---------|-------------|
| `init` | Scaffolds a new Pharmacy ERP project in the current directory (clones, installs deps, seeds DB). |
| `start` | Starts the frontend and backend development servers simultaneously. |
| `setup` | Installs all required Node.js and Python dependencies. |
| `seed` | Seeds the database with demo products, users, and transactions. |
| `docker` | Starts the application in production mode using the official all-in-one Docker image. |
| `help` | Shows the help menu with all available commands. |

## 📦 Prerequisites

Before running the CLI, ensure you have the following installed on your system:

- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- **pnpm 9+** (`npm install -g pnpm`)
- **Python 3.12+** ([python.org](https://python.org))
- **Git** ([git-scm.com](https://git-scm.com))

## 🌐 Features of Pharmacy ERP

- **Point of Sale (POS)**: Fullscreen, keyboard-first, touch-friendly POS.
- **Inventory & Purchasing**: Expiry tracking, batch management, FEFO.
- **Bilingual**: Full Arabic (RTL) & English support out of the box.
- **Modern Tech Stack**: Next.js 15, FastAPI, Python 3.12, Tailwind CSS.

## 🔗 Links

- **GitHub Repository**: [omersx/pharmacy-erp](https://github.com/omersx/pharmacy-erp)
- **Report an Issue**: [GitHub Issues](https://github.com/omersx/pharmacy-erp/issues)
