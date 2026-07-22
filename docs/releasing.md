# Release FrameSeq

FrameSeq can publish both npm packages from a version tag through GitHub Actions and npm Trusted Publishing. The workflow uses short-lived OpenID Connect credentials, so the repository does not need a long-lived npm write token.

## One-time npm configuration

Configure a Trusted Publisher separately for both packages:

- `@pride7/frameseq`
- `create-frameseq`

On each package's npm **Settings → Trusted Publisher** page, use:

```text
Provider: GitHub Actions
Organization or user: pride7
Repository: frameseq
Workflow filename: publish.yml
Environment: leave empty
Allowed action: npm publish
```

The workflow is stored at `.github/workflows/publish.yml`. Both packages may trust the same workflow file.

## Prepare a release

Update all four version references:

1. the root `package.json` version;
2. the root `package-lock.json` package versions;
3. `packages/create-frameseq/package.json`;
4. `FRAMESEQ_VERSION` in `packages/create-frameseq/index.mjs`.

The standalone StackBlitz project's `@pride7/frameseq` dependency in `examples/playground/package.json` must also match the new framework version. Move the relevant Changelog entries from **Unreleased** into a dated version section.

Run the local gate:

```bash
npm run release:tag-check -- v0.16.0
npm run release:check
```

Commit and push the release changes before creating the tag.

## Publish from a tag

Create a tag that exactly matches the root package version:

```bash
git tag -a v0.16.0 -m "FrameSeq 0.16.0"
git push origin v0.16.0
```

The workflow then:

1. verifies that the tag, framework version, creator template, and playground dependency agree;
2. runs the complete `release:check` suite;
3. publishes `@pride7/frameseq` and `create-frameseq` in separate jobs.

The two publish jobs are independent. If one transiently fails, rerun only its failed job from GitHub Actions rather than creating another tag.

## Verify the registry

```bash
npm view @pride7/frameseq version
npm view create-frameseq version
```

Do not move or recreate a published version tag. npm package name-and-version pairs cannot be reused.
