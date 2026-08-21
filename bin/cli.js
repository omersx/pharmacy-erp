#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const LOGO = `
${CYAN}╔══════════════════════════════════════════════╗
║                                              ║
║   💊  ${BOLD}Pharmacy ERP & POS System${RESET}${CYAN}              ║
║       ${DIM}Enterprise-grade pharmacy management${RESET}${CYAN}   ║
║                                              ║
╚══════════════════════════════════════════════╝${RESET}
`;

function log(msg) {
  console.log(`  ${msg}`);
}

function logStep(step, total, msg) {
  console.log(`  ${GREEN}[${step}/${total}]${RESET} ${msg}`);
}

function logError(msg) {
  console.error(`  ${RED}✗ ${msg}${RESET}`);
}

function logSuccess(msg) {
  console.log(`  ${GREEN}✓ ${msg}${RESET}`);
}

function checkCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function showHelp() {
  console.log(LOGO);
  console.log(`${BOLD}Usage:${RESET}`);
  log(`npx pharmacy-erp ${CYAN}<command>${RESET}`);
  console.log();
  console.log(`${BOLD}Commands:${RESET}`);
  log(`${CYAN}init${RESET}        Scaffold a new Pharmacy ERP project in the current directory`);
  log(`${CYAN}start${RESET}       Start the development servers (frontend + backend)`);
  log(`${CYAN}setup${RESET}       Install all dependencies (frontend + backend)`);
  log(`${CYAN}seed${RESET}        Seed the database with demo data`);
  log(`${CYAN}docker${RESET}      Start with Docker Compose (production mode)`);
  log(`${CYAN}help${RESET}        Show this help message`);
  console.log();
  console.log(`${BOLD}Quick Start:${RESET}`);
  log(`${DIM}$ npx pharmacy-erp init${RESET}`);
  log(`${DIM}$ cd pharmacy-erp${RESET}`);
  log(`${DIM}$ npx pharmacy-erp start${RESET}`);
  console.log();
  console.log(`${DIM}Docs: https://github.com/omersx/pharmacy-erp${RESET}`);
  console.log();
}

function checkPrerequisites() {
  let ok = true;

  if (!checkCommand("node")) {
    logError("Node.js is not installed. Download from https://nodejs.org");
    ok = false;
  } else {
    logSuccess("Node.js found");
  }

  if (!checkCommand("pnpm")) {
    logError("pnpm is not installed. Run: npm install -g pnpm");
    ok = false;
  } else {
    logSuccess("pnpm found");
  }

  if (!checkCommand("python") && !checkCommand("python3")) {
    logError("Python is not installed. Download from https://python.org");
    ok = false;
  } else {
    logSuccess("Python found");
  }

  return ok;
}

function cmdInit() {
  console.log(LOGO);
  log(`${BOLD}Scaffolding Pharmacy ERP project...${RESET}\n`);

  const targetDir = path.join(process.cwd(), "pharmacy-erp");

  if (fs.existsSync(targetDir)) {
    logError(`Directory "pharmacy-erp" already exists. Remove it or use a different location.`);
    process.exit(1);
  }

  // Check prerequisites
  log(`${BOLD}Checking prerequisites...${RESET}`);
  if (!checkPrerequisites()) {
    console.log();
    logError("Please install missing prerequisites and try again.");
    process.exit(1);
  }
  console.log();

  // Check for git
  if (!checkCommand("git")) {
    logError("Git is not installed. Download from https://git-scm.com");
    process.exit(1);
  }

  logStep(1, 4, "Cloning repository...");
  try {
    execSync("git clone https://github.com/omersx/pharmacy-erp.git", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch {
    logError("Failed to clone repository.");
    process.exit(1);
  }

  logStep(2, 4, "Creating environment file...");
  const envExample = path.join(targetDir, ".env.example");
  const envFile = path.join(targetDir, ".env");
  if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    logSuccess(".env created from .env.example");
  }

  logStep(3, 4, "Installing dependencies...");
  try {
    execSync("pnpm install", { cwd: targetDir, stdio: "inherit" });
    execSync("pnpm run setup:frontend", { cwd: targetDir, stdio: "inherit" });
    execSync("pnpm run setup:backend", { cwd: targetDir, stdio: "inherit" });
  } catch {
    logError("Dependency installation failed. Try running manually:");
    log(`  cd pharmacy-erp && pnpm run setup`);
    process.exit(1);
  }

  logStep(4, 4, "Seeding demo data...");
  try {
    execSync("pnpm run seed", { cwd: targetDir, stdio: "inherit" });
  } catch {
    logError("Seeding failed. Try running manually:");
    log(`  cd pharmacy-erp && pnpm run seed`);
  }

  console.log();
  console.log(`${GREEN}${BOLD}  ✅ Pharmacy ERP is ready!${RESET}`);
  console.log();
  log(`${BOLD}Next steps:${RESET}`);
  log(`  ${CYAN}cd pharmacy-erp${RESET}`);
  log(`  ${CYAN}pnpm dev${RESET}          ${DIM}# or: npx pharmacy-erp start${RESET}`);
  console.log();
  log(`${BOLD}Login:${RESET}  admin@pharmacy.com / admin123`);
  log(`${BOLD}Web:${RESET}    http://localhost:3000`);
  log(`${BOLD}API:${RESET}    http://localhost:8000/docs`);
  console.log();
}

function cmdStart() {
  console.log(LOGO);

  if (!fs.existsSync("package.json")) {
    logError("No package.json found. Run this from the pharmacy-erp project directory.");
    log(`Or run ${CYAN}npx pharmacy-erp init${RESET} to create a new project.`);
    process.exit(1);
  }

  log(`${BOLD}Starting Pharmacy ERP...${RESET}\n`);
  log(`${CYAN}Frontend:${RESET}  http://localhost:3000`);
  log(`${CYAN}Backend:${RESET}   http://localhost:8000`);
  log(`${CYAN}API Docs:${RESET}  http://localhost:8000/docs`);
  log(`${DIM}Press Ctrl+C to stop${RESET}\n`);

  const child = spawn("pnpm", ["dev"], { cwd: process.cwd(), stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code));
}

function cmdSetup() {
  console.log(LOGO);
  log(`${BOLD}Installing dependencies...${RESET}\n`);

  if (!checkPrerequisites()) {
    process.exit(1);
  }

  try {
    execSync("pnpm install", { stdio: "inherit" });
    execSync("pnpm run setup:frontend", { stdio: "inherit" });
    execSync("pnpm run setup:backend", { stdio: "inherit" });
    logSuccess("All dependencies installed!");
  } catch {
    logError("Setup failed.");
    process.exit(1);
  }
}

function cmdSeed() {
  console.log(LOGO);
  log(`${BOLD}Seeding demo data...${RESET}\n`);

  try {
    execSync("pnpm run seed", { stdio: "inherit" });
    console.log();
    logSuccess("Database seeded!");
    log(`Login: ${CYAN}admin@pharmacy.com${RESET} / ${CYAN}admin123${RESET}`);
  } catch {
    logError("Seeding failed.");
    process.exit(1);
  }
}

function cmdDocker() {
  console.log(LOGO);
  log(`${BOLD}Starting with Docker Compose...${RESET}\n`);

  if (!checkCommand("docker")) {
    logError("Docker is not installed. Download from https://docker.com");
    process.exit(1);
  }

  try {
    const child = spawn("docker", ["compose", "up", "-d"], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log();
        logSuccess("Pharmacy ERP is running!");
        log(`${CYAN}Web:${RESET}  http://localhost`);
        log(`${CYAN}API:${RESET}  http://localhost:8000/docs`);
      }
      process.exit(code);
    });
  } catch {
    logError("Docker Compose failed.");
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────
const command = process.argv[2] || "help";

switch (command) {
  case "init":
    cmdInit();
    break;
  case "start":
  case "dev":
    cmdStart();
    break;
  case "setup":
  case "install":
    cmdSetup();
    break;
  case "seed":
    cmdSeed();
    break;
  case "docker":
    cmdDocker();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    logError(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
