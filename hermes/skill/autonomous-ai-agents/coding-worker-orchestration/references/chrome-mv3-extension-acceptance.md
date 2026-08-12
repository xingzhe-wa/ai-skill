# Chrome MV3 Extension Acceptance

Use this reference when a coding worker builds a Google Chrome extension from an empty or lightly scaffolded repository.

## Required checks

1. Confirm the exact workspace path and inspect `git status` before edits. Preserve existing user files and do not commit or push.
2. Build the extension and inspect `dist/manifest.json` as JSON.
3. Resolve every path referenced by `background.service_worker`, `action.default_popup`, `options_page`, and `content_scripts[*].js` under `dist/`.
4. Content scripts injected by MV3 should be checked as runtime artifacts, not just TypeScript sources. If the manifest injects a classic script, confirm the emitted file does not rely on unresolved top-level module imports or missing chunks.
5. For File System Access API storage, selection must happen from an extension page such as popup/options. Centralize directory-handle use in the service worker or a shared extension runtime, persist the handle in IndexedDB when possible, and preserve an explicit disconnected state when it cannot be restored.
6. Treat imported JSON as untrusted input: validate schema before replacing the local library, validate again before writes, and render user-controlled text with `textContent`.
7. Run the repository's tests, production build, and strict TypeScript check. Report each as full, targeted, or unverified; do not infer browser GUI success from a green unit test.

## Minimal shell verification

```bash
npm test
npm run build
npx tsc --noEmit
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('dist/manifest.json','utf8')); const xs=[m.background?.service_worker,m.action?.default_popup,m.options_page,...(m.content_scripts??[]).flatMap(x=>x.js??[])].filter(Boolean); for (const x of xs) { if (!fs.existsSync('dist/'+x)) process.exitCode=1; console.log(x, fs.existsSync('dist/'+x)); }"
```

The final acceptance report should include changed files, actual command results, browser paths not exercised, and remaining storage/permission risks.
