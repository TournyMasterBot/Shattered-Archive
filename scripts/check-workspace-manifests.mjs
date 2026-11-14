#!/usr/bin/env node
/**
 * Guard: every deploy/*.Dockerfile stage that runs a frozen `pnpm install` must have the
 * package.json of EVERY workspace project in its build context before that install, either as a
 * `COPY <project>/package.json` line or because an ancestor folder is copied in full.
 *
 * pnpm 11.28+ and 12 refuse a frozen install when the lockfile lists a workspace project whose
 * manifest is missing, so adding a workspace project without touching the Dockerfiles breaks the
 * next image build (edge case LOCAL-03). The check is stricter than the lockfile's importers on
 * purpose: a project without dependencies is not an importer today and becomes one the day it
 * gains a dependency.
 *
 * Usage: node scripts/check-workspace-manifests.mjs [repoRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Workspace globs from pnpm-workspace.yaml (`packages:` list, one `- glob/*` per line). */
export function readWorkspaceGlobs(root) {
  const text = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s+-\s+['"]?([^'"\s#]+)['"]?\s*(#.*)?$/);
      if (m) {
        globs.push(m[1]);
        continue;
      }
      if (/^\S/.test(line) || line.trim() === '') {
        if (/^\S/.test(line)) inPackages = false;
      }
    }
  }
  return globs;
}

/** Workspace project folders (forward slashes, relative to root) that contain a package.json. */
export function listWorkspaceProjects(root) {
  const projects = [];
  for (const glob of readWorkspaceGlobs(root)) {
    const m = glob.match(/^([^*]+)\/\*$/);
    if (!m) continue; // only the `dir/*` form is used in this repo
    const base = path.join(root, m[1]);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      if (fs.existsSync(path.join(base, entry.name, 'package.json'))) {
        projects.push(`${m[1]}/${entry.name}`);
      }
    }
  }
  return projects.sort();
}

function normalise(source) {
  return source.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** True when a COPY source brings `project`'s package.json into the stage. */
export function sourceCovers(source, project) {
  const s = normalise(source);
  if (s === '.' || s === '') return true;
  return s === `${project}/package.json` || s === project || project.startsWith(`${s}/`);
}

/**
 * Split a Dockerfile into stages and return, for each stage that runs `pnpm install`, the COPY sources
 * that appear before that first install. Lines using `--from` copy from another stage and do not count.
 */
export function stagesBeforeInstall(dockerfileText) {
  const stages = [];
  let current = null;
  let line = '';
  for (const raw of dockerfileText.split(/\r?\n/)) {
    const piece = raw.replace(/\s+$/, '');
    if (piece.endsWith('\\')) {
      line += `${piece.slice(0, -1)} `;
      continue;
    }
    line += piece;
    const instruction = line.trim();
    line = '';
    if (/^FROM\s/i.test(instruction)) {
      const alias = instruction.match(/\sAS\s+(\S+)/i);
      current = { from: alias ? `stage ${alias[1]}` : 'unnamed stage', sources: [], installed: false, hasInstall: false };
      stages.push(current);
      continue;
    }
    if (!current || current.installed) continue;
    if (/^RUN\s.*\bpnpm\s+(install|i)\b/i.test(instruction)) {
      current.installed = true;
      current.hasInstall = true;
      continue;
    }
    const copy = instruction.match(/^(?:COPY|ADD)\s+(.*)$/i);
    if (copy) {
      const tokens = copy[1].split(/\s+/).filter(Boolean);
      if (tokens.some((t) => t.startsWith('--from'))) continue;
      const args = tokens.filter((t) => !t.startsWith('--'));
      current.sources.push(...args.slice(0, -1));
    }
  }
  return stages.filter((s) => s.hasInstall);
}

/** @returns {{dockerfile: string, stage: string, project: string}[]} one entry per missing manifest */
export function findMissingManifests(root) {
  const projects = listWorkspaceProjects(root);
  const deployDir = path.join(root, 'deploy');
  const problems = [];
  for (const name of fs.readdirSync(deployDir).filter((f) => f.endsWith('.Dockerfile')).sort()) {
    const text = fs.readFileSync(path.join(deployDir, name), 'utf8');
    for (const stage of stagesBeforeInstall(text)) {
      for (const project of projects) {
        if (!stage.sources.some((s) => sourceCovers(s, project))) {
          problems.push({ dockerfile: `deploy/${name}`, stage: stage.from, project });
        }
      }
    }
  }
  return problems;
}

function main() {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const problems = findMissingManifests(root);
  if (problems.length === 0) {
    console.log(`check-workspace-manifests: OK (${listWorkspaceProjects(root).length} workspace projects covered in every install stage)`);
    return;
  }
  console.error('check-workspace-manifests: FAILED. A frozen pnpm install would refuse these stages:');
  for (const p of problems) {
    console.error(`  ${p.dockerfile}  (${p.stage})  missing: COPY ${p.project}/package.json ./${p.project}/package.json`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
