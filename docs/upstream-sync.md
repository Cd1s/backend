# Upstream synchronization behavior

`.github/workflows/upstream-sync.yml` fetches the official
`https://github.com/remnawave/backend.git` `main` branch into a temporary runner checkout.

The workflow uses Git commit ancestry and `git merge-tree` for update detection. It does not use
the package version as the update signal: an upstream behavior change can keep the same semantic
version, while a release version can change without being a safe compatibility decision.

The workflow behaves as follows:

1. If the fetched upstream commit is already an ancestor of `singbox`, the run succeeds without
   installing dependencies, pushing a branch, or rebuilding an image.
2. If upstream has new commits and the merge preflight is clean, the workflow creates a normal
   non-fast-forward merge commit in the temporary checkout.
3. The preflight reports files changed on both sides of the common base. That is an audit signal,
   not permission to skip adaptation checks. The explicit fork preflight, build, seed validators,
   subscription validator, formatter, and linter must all pass.
4. If Git reports a conflict, the workflow stops before changing the working tree, writes a
   conflict report to the job summary and artifact, and leaves `origin/singbox` untouched. A
   maintainer must repair the merge on a temporary branch and rerun the full validation gates.
5. Only a validated merge is pushed and used for the multi-architecture image build. The image
   metadata version is read from the merged `package.json` and suffixed with `-singbox`; it is not
   hardcoded to an old upstream release.

This is intentionally a safe-failure policy. It automatically carries non-conflicting upstream
work, while requiring an auditable human repair whenever upstream and Sing-box behavior compete in
the same merge hunk.
