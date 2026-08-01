#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repositoryRoot = process.cwd();

function runGit(args) {
    return execFileSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
}

function tryGit(args) {
    const result = spawnSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
        status: result.status ?? 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
}

function getOption(name, fallback) {
    const argumentsList = process.argv.slice(2);
    const inlinePrefix = `${name}=`;
    const inlineArgument = argumentsList.find((value) => value.startsWith(inlinePrefix));
    if (inlineArgument) {
        return inlineArgument.slice(inlinePrefix.length);
    }

    const argumentIndex = argumentsList.indexOf(name);
    return argumentIndex >= 0 ? (argumentsList[argumentIndex + 1] ?? fallback) : fallback;
}

const upstreamRef = getOption('--upstream-ref', 'upstream/main');
const reportPath = getOption('--report-path', process.env.UPSTREAM_SYNC_REPORT_PATH);
const dryRun = process.argv.includes('--dry-run');

function setOutput(name, value) {
    if (!process.env.GITHUB_OUTPUT) {
        return;
    }

    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function appendSummary(markdown) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }

    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trimEnd()}\n`);
}

function getFiles(args) {
    const output = runGit([...args, '-z']);
    return output.split('\0').filter(Boolean).sort();
}

function getVersion(ref) {
    try {
        return JSON.parse(runGit(['show', `${ref}:package.json`])).version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function isAncestor(ancestor, descendant) {
    return tryGit(['merge-base', '--is-ancestor', ancestor, descendant]).status === 0;
}

function writeConflictReport(report) {
    if (!reportPath) {
        return;
    }

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${report.trimEnd()}\n`);
}

function formatList(items) {
    return items.length > 0 ? items.map((item) => `- \`${item}\``).join('\n') : '- none';
}

function reportForConflict({
    currentRef,
    upstreamSha,
    baseSha,
    currentVersion,
    upstreamVersion,
    upstreamAhead,
    overlapFiles,
    conflictFiles,
    mergeOutput,
}) {
    const touchedCommits = conflictFiles.length
        ? tryGit([
              'log',
              '--oneline',
              '--decorate',
              `${currentRef}..${upstreamRef}`,
              '--',
              ...conflictFiles,
          ]).stdout.trim()
        : '';

    return `# Upstream synchronization stopped: merge conflict

The maintained branch was not changed. The preflight merge used Git's default merge strategy and
was rejected before the workflow attempted a working-tree merge.

- maintained commit: \`${currentRef}\`
- upstream ref: \`${upstreamRef}\`
- upstream commit: \`${upstreamSha}\`
- common base: \`${baseSha}\`
- maintained package version: \`${currentVersion}\`
- upstream package version: \`${upstreamVersion}\`
- upstream commits not yet included: ${upstreamAhead}

## Conflicting files

${formatList(conflictFiles)}

## Files changed on both sides since the common base

${formatList(overlapFiles)}

## Upstream commits touching the conflicting files

${touchedCommits || '- none'}

## Git merge-tree output

\`\`\`text
${mergeOutput.trimEnd()}
\`\`\`

Resolve the conflict on a temporary repair branch, preserve the upstream behavior, reapply the
fork invariants, and run the backend plus cross-repository validation before updating \`singbox\`.
    `;
}

function getConflictFiles(preflight) {
    const output = `${preflight.stdout}${preflight.stderr}`;
    const lines = preflight.stdout.split('\n').map((line) => line.trim());
    const treeLineIndex = lines.findIndex((line) => /^[0-9a-f]{40,64}$/.test(line));
    const blankLineIndex = lines.findIndex((line, index) => index > treeLineIndex && line === '');
    const listedFiles =
        treeLineIndex >= 0
            ? lines
                  .slice(treeLineIndex + 1, blankLineIndex >= 0 ? blankLineIndex : lines.length)
                  .filter(Boolean)
            : [];
    const messageFiles = [...output.matchAll(/^CONFLICT \([^)]*\): (.+)$/gm)].map((match) =>
        match[1].replace(/^Merge conflict in /, '').trim(),
    );

    return [...new Set([...listedFiles, ...messageFiles])].sort();
}

function finish({
    status,
    updated,
    currentRef,
    upstreamSha,
    upstreamVersion,
    upstreamAhead,
    overlapFiles,
}) {
    setOutput('status', status);
    setOutput('updated', String(updated));
    setOutput('current_sha', currentRef);
    setOutput('upstream_sha', upstreamSha);
    setOutput('upstream_version', upstreamVersion);
    setOutput('upstream_ahead', String(upstreamAhead));
    setOutput('overlap_count', String(overlapFiles.length));
}

function main() {
    const status = runGit(['status', '--porcelain']);
    if (status && !dryRun) {
        throw new Error('The working tree must be clean before an upstream synchronization.');
    }

    const currentRef = runGit(['rev-parse', 'HEAD']);
    const upstreamSha = runGit(['rev-parse', '--verify', upstreamRef]);
    const currentVersion = getVersion('HEAD');
    const upstreamVersion = getVersion(upstreamRef);
    const upstreamAhead = Number(runGit(['rev-list', '--count', `HEAD..${upstreamRef}`]));

    if (isAncestor(upstreamRef, 'HEAD')) {
        console.log(
            `upstream_sync=up_to_date current=${currentRef} upstream=${upstreamSha} version=${currentVersion}`,
        );
        finish({
            status: 'up_to_date',
            updated: false,
            currentRef,
            upstreamSha,
            upstreamVersion,
            upstreamAhead: 0,
            overlapFiles: [],
        });
        appendSummary(`## Upstream synchronization\n\nAlready up to date at \`${currentRef}\`.`);
        return;
    }

    const baseSha = runGit(['merge-base', 'HEAD', upstreamRef]);
    const customFiles = getFiles(['diff', '--name-only', baseSha, 'HEAD']);
    const upstreamFiles = getFiles(['diff', '--name-only', baseSha, upstreamRef]);
    const upstreamFileSet = new Set(upstreamFiles);
    const overlapFiles = customFiles.filter((file) => upstreamFileSet.has(file));
    const preflight = tryGit([
        'merge-tree',
        '--write-tree',
        '--name-only',
        '--messages',
        'HEAD',
        upstreamRef,
    ]);
    const mergeOutput = `${preflight.stdout}${preflight.stderr}`;
    const conflictFiles = getConflictFiles(preflight);

    console.log(
        `upstream_sync=detected current=${currentRef} upstream=${upstreamSha} ` +
            `ahead=${upstreamAhead} upstream_version=${upstreamVersion} ` +
            `overlap_files=${overlapFiles.length}`,
    );

    if (preflight.status !== 0) {
        const report = reportForConflict({
            currentRef,
            upstreamSha,
            baseSha,
            currentVersion,
            upstreamVersion,
            upstreamAhead,
            overlapFiles,
            conflictFiles,
            mergeOutput,
        });
        writeConflictReport(report);
        appendSummary(report);
        finish({
            status: 'conflict',
            updated: false,
            currentRef,
            upstreamSha,
            upstreamVersion,
            upstreamAhead,
            overlapFiles,
        });
        console.error(report);
        process.exitCode = 1;
        return;
    }

    if (dryRun) {
        console.log('upstream_sync=clean_preflight dry_run=true merge_not_applied=true');
        finish({
            status: 'clean_preflight',
            updated: false,
            currentRef,
            upstreamSha,
            upstreamVersion,
            upstreamAhead,
            overlapFiles,
        });
        appendSummary(
            `## Upstream synchronization\n\nClean merge preflight for \`${upstreamSha}\`; dry run did not modify the branch.`,
        );
        return;
    }

    const merge = tryGit(['merge', '--no-ff', '--no-edit', '--no-stat', upstreamRef]);
    if (merge.status !== 0) {
        tryGit(['merge', '--abort']);
        const report = reportForConflict({
            currentRef,
            upstreamSha,
            baseSha,
            currentVersion,
            upstreamVersion,
            upstreamAhead,
            overlapFiles,
            conflictFiles,
            mergeOutput: `${merge.stdout}${merge.stderr}`,
        });
        writeConflictReport(report);
        appendSummary(report);
        finish({
            status: 'merge_failed',
            updated: false,
            currentRef,
            upstreamSha,
            upstreamVersion,
            upstreamAhead,
            overlapFiles,
        });
        console.error(report);
        process.exitCode = 1;
        return;
    }

    const unresolvedFiles = tryGit(['diff', '--name-only', '--diff-filter=U'])
        .stdout.split('\n')
        .filter(Boolean);
    if (unresolvedFiles.length > 0) {
        tryGit(['merge', '--abort']);
        throw new Error(
            `Merge reported success but left unresolved files: ${unresolvedFiles.join(', ')}`,
        );
    }

    const mergedRef = runGit(['rev-parse', 'HEAD']);
    console.log(`upstream_sync=merged commit=${mergedRef} upstream=${upstreamSha}`);
    finish({
        status: 'merged',
        updated: true,
        currentRef: mergedRef,
        upstreamSha,
        upstreamVersion,
        upstreamAhead,
        overlapFiles,
    });
    appendSummary(
        `## Upstream synchronization\n\nMerged official commit \`${upstreamSha}\` as \`${mergedRef}\`. ` +
            `${overlapFiles.length} file(s) changed on both sides and will be covered by adaptation validation.`,
    );
}

try {
    main();
} catch (error) {
    console.error(`upstream_sync=error ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
