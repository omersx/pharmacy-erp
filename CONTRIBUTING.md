# Contributing to Pharmacy ERP

First off, thank you for considering contributing to Pharmacy ERP! 🎉 It's people like you that make this project a great tool for pharmacies worldwide.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Style Guides](#style-guides)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### 🐛 Reporting Bugs

- Use the [Bug Report](https://github.com/omersx/pharmacy-erp/issues/new?template=bug_report.md) issue template
- Include steps to reproduce, expected vs actual behavior
- Add screenshots if applicable
- Mention your OS, browser, and Node.js/Python versions

### 💡 Suggesting Features

- Use the [Feature Request](https://github.com/omersx/pharmacy-erp/issues/new?template=feature_request.md) issue template
- Explain the use case and why it would benefit pharmacies
- If possible, include mockups or examples

### 🔧 Pull Requests

1. **Fork** the repository
2. **Create** a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make** your changes with clear, descriptive commits
4. **Test** your changes thoroughly
5. **Push** to your fork and submit a **Pull Request**

## Getting Started

```bash
# Fork and clone the repo
git clone https://github.com/omersx/pharmacy-erp.git
cd pharmacy-erp

# Install dependencies
pnpm install
pnpm run setup:frontend
pnpm run setup:backend

# Copy environment config
cp .env.example .env

# Seed demo data
pnpm run seed

# Start development servers
pnpm dev
```

## Development Workflow

### Branch Naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feature/description` | `feature/barcode-scanner` |
| Bug Fix | `fix/description` | `fix/login-redirect` |
| Docs | `docs/description` | `docs/api-endpoints` |
| Refactor | `refactor/description` | `refactor/auth-module` |

### Testing

- **Backend**: Run `pytest` from the `backend/` directory
- **Frontend**: Run `pnpm run type-check` from the `frontend/` directory
- Test both English and Arabic layouts when making UI changes

## Style Guides

### Python (Backend)

- Follow [PEP 8](https://pep8.org/) conventions
- Use type hints for function signatures
- Use async/await patterns consistently
- Keep modules organized under `app/modules/<module_name>/`

### TypeScript (Frontend)

- Use TypeScript strict mode
- Follow the existing component patterns (Radix UI + Tailwind)
- Use Zustand for state management
- Use `next-intl` for all user-facing strings (support both `en` and `ar`)

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add barcode scanner support
fix: resolve POS total calculation error
docs: update API endpoint documentation
refactor: simplify inventory movement logic
style: format medicine list component
```

## 🌍 Internationalization (i18n)

When adding user-facing text:

1. Add English strings to `frontend/src/messages/en.json`
2. Add Arabic strings to `frontend/src/messages/ar.json`
3. Use `useTranslations()` hook in components
4. Test both LTR and RTL layouts

## 📝 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for helping improve Pharmacy ERP! 💊
