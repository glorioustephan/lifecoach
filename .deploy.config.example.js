// Copy this file to .deploy.config.js and update with your Mac Mini details
// This file is gitignored and should never be committed to version control

module.exports = {
  // Mac Mini connection details
  host: "your-mac-mini.tailnet.ts.net",  // Tailscale hostname or IP
  port: 22,                               // SSH port
  user: "lifecoach",                      // SSH user (must have sudo or write access to remoteDir)
  sshKeyPath: "/path/to/private/key",     // Path to SSH private key (e.g., ~/.ssh/lifecoach)
  remoteDir: "/opt/lifecoach",            // Where lifecoach is deployed on the Mac Mini

  // Deployment strategy
  strategy: "snapshot",  // "snapshot" (export/import) or "git-pull" (if you have a private repo)

  // Post-deploy actions
  postDeploy: {
    restartProcesses: true,   // Restart PM2 processes after deployment
    runMigrations: false,     // Run database migrations (if implemented)
  },
};
