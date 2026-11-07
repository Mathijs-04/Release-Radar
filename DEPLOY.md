# Deploying Release Radar to GitHub Pages

The app is a static Vite build, so it runs on GitHub Pages with no server.
`vite.config.ts` uses `base: './'`, so it works under any repository name
(`https://<user>.github.io/<repo>/`) without extra configuration.

All data lives in the visitor's own browser (IndexedDB), so every device and
browser has its own calendar. Use **Backup → Export** in the app to move data
between devices.

## Option A: automatic deploy with GitHub Actions (recommended)

1. Create the repository on GitHub and push this project to the `main` branch.
2. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Add the file `.github/workflows/deploy.yml` with this content, then commit
   and push it:

   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: pages
     cancel-in-progress: true

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
             cache: npm
         - run: npm ci
         - run: npm test
         - run: npm run build
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist

     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to finish.
   The site URL is shown on the run and under **Settings → Pages**.

Every push to `main` now runs the tests, builds and redeploys.

## Option B: manual deploy (no Actions)

1. Build locally:

   ```bash
   npm ci
   npm run build
   ```

2. Push the contents of `dist/` to a `gh-pages` branch, for example with:

   ```bash
   npx gh-pages -d dist
   ```

3. In **Settings → Pages**, set **Source** to **Deploy from a branch** and pick
   `gh-pages` / `(root)`.

## Offline support and updates

The production build registers a service worker (`public/sw.js`), so the app
can be installed and opens without a connection. GitHub Pages serves over
HTTPS, which service workers require. After you deploy a new version, the
page itself is always fetched fresh when you're online, so changes show up on
the next load. Old build files are removed from the offline cache
automatically. The service worker never touches your data in IndexedDB.

## Notes

- **Custom domain:** add it under **Settings → Pages**. No code changes are
  needed because of the relative `base`.
- **Data is per origin.** If the URL changes (a new repo name or custom domain),
  the browser treats it as a different site and the calendar starts empty.
  Export a backup first and import it on the new URL.
