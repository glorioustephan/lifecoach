# Production deployment

Lifecoach deploys to a single Mac Mini over Tailscale. The public repository is
the source of code, while secrets and personal data stay outside git:

- GitHub Actions stores deploy credentials as environment secrets.
- The Mac Mini stores production API keys in `.env.production` or `.env`.
- Production data stays in `data-production/` on the Mac Mini.
- GitHub-hosted runners join the tailnet temporarily and are removed after the
  workflow finishes.

## Flow

1. A push lands on `main`.
2. GitHub Actions installs dependencies, runs tests, and builds the workspace.
3. The deploy job joins the tailnet with the Tailscale GitHub Action.
4. The job SSHes to the Mac Mini.
5. The Mac Mini runs `scripts/deploy-production.sh`.

The server-side script refuses to deploy if the Mac Mini checkout has local
tracked edits. It then fast-forwards `main`, installs dependencies, builds,
runs `pnpm lifecoach init --no-profile` so migrations apply, reloads PM2, and
checks `/health`.

## GitHub production environment

Create a GitHub environment named `production`. Store deploy credentials there
rather than in source code.

Environment secrets:

| Name | Value |
|---|---|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID with permission to create ephemeral tagged nodes |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |
| `LIFECOACH_DEPLOY_SSH_PRIVATE_KEY` | Private SSH key whose public key is in the Mac Mini deploy user's `authorized_keys` |

Environment variables:

| Name | Example |
|---|---|
| `LIFECOACH_DEPLOY_HOST` | `lees-mac-mini.tailaac9f7.ts.net` |
| `LIFECOACH_DEPLOY_USER` | `leebaker` |
| `LIFECOACH_DEPLOY_REMOTE_DIR` | `/Users/leebaker/dev/lifecoach` |
| `LIFECOACH_DEPLOY_SSH_PORT` | `22` |
| `LIFECOACH_TAILSCALE_TAGS` | `tag:github-actions-deploy` |

`LIFECOACH_TAILSCALE_TAGS` is optional; the workflow defaults to
`tag:github-actions-deploy`.

## Tailscale setup

Create a Tailscale OAuth client that can create ephemeral nodes with the tag
used by the workflow, for example `tag:github-actions-deploy`.

Keep the ACL narrow: allow that tag to reach only the Mac Mini's SSH port. A
minimal policy shape looks like this:

```json
{
  "tagOwners": {
    "tag:github-actions-deploy": ["autogroup:admin"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["tag:github-actions-deploy"],
      "dst": ["lees-mac-mini:22"]
    }
  ]
}
```

Adjust the destination name to match the Mac Mini's tailnet node name.

## Mac Mini setup

The Mac Mini needs a checkout on `main`, production environment variables, PM2,
and an SSH key for GitHub Actions.

```bash
cd /Users/leebaker/dev/lifecoach
git status
git pull --ff-only origin main
pnpm install --frozen-lockfile
LIFECOACH_ENV=production pnpm lifecoach init --no-profile
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Then add the deploy public key to:

```bash
~/.ssh/authorized_keys
```

The normal deploy path should not import snapshots from a laptop. Snapshots are
for backup, restore, and migration; production deploys update code in place.
