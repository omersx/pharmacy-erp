# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | ✅ Yes              |
| < 1.0   | ❌ No               |

## Reporting a Vulnerability

We take the security of Pharmacy ERP seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**⚠️ Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to **[INSERT SECURITY EMAIL]** with:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge your report within **48 hours**
- **Assessment**: We will assess the vulnerability and determine its severity within **5 business days**
- **Fix**: We will work on a fix and coordinate a release timeline
- **Disclosure**: We will publicly disclose the vulnerability after a fix is available

### Scope

The following are in scope:

- Authentication and authorization bypasses
- SQL injection, XSS, CSRF vulnerabilities
- Data exposure or leakage
- Privilege escalation
- API security issues

### Out of Scope

- Denial of Service (DoS) attacks
- Social engineering
- Issues in dependencies (report those to the respective projects)
- Issues requiring physical access to a user's device

## Best Practices for Deployment

When deploying Pharmacy ERP in production:

1. **Change the default `SECRET_KEY`** — Use a strong, random key (minimum 32 characters)
2. **Change default credentials** — Update the admin password immediately after setup
3. **Use HTTPS** — Always deploy behind an HTTPS-enabled reverse proxy
4. **Restrict CORS origins** — Only allow your specific frontend domain
5. **Use PostgreSQL** — Don't use SQLite in production
6. **Keep dependencies updated** — Regularly update Python and Node.js packages
7. **Enable firewall rules** — Restrict database access to application servers only

## Thank You

We appreciate the security research community's efforts in helping keep Pharmacy ERP and its users safe. Responsible reporters will be acknowledged in our release notes (unless they prefer to remain anonymous).
