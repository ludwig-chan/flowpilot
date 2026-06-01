import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ---- 读取当前版本 ----
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const tag = `v${version}`;

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });

console.log(`\nReleasing ${tag}...\n`);

// ---- 检查 gh CLI（自动回退到 Windows 安装路径）----
let gh = 'gh';
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  const fallback = 'C:\\Program Files\\GitHub CLI\\gh.exe';
  if (existsSync(fallback)) {
    gh = `"${fallback}"`;
  } else {
    console.error('❌ GitHub CLI (gh) not found.');
    console.error('   Install: winget install GitHub.cli');
    console.error('   Then run: gh auth login');
    process.exit(1);
  }
}

// ---- 获取 git remote 名称 ----
const remoteName = execSync('git remote', { cwd: root }).toString().trim().split('\n')[0];

// ---- 检查 tag 是否已存在 ----
const existingTags = execSync('git tag', { cwd: root }).toString().trim().split('\n');
if (existingTags.includes(tag)) {
  console.error(`❌ Tag ${tag} already exists. Update version in package.json before releasing.`);
  process.exit(1);
}

// ---- Build + Zip ----
console.log('Building...');
run('npm run build');

console.log('Zipping...');
run('npm run zip');

// ---- 生成 update.json ----
const GITHUB_REPO = 'ludwig-chan/flowpilot';
const updateJson = {
  tag_name: tag,
  name: `FlowPilot Extension ${tag}`,
  assets: [
    {
      name: 'flowpilot.zip',
      browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/flowpilot.zip`,
    },
  ],
};
writeFileSync(join(root, 'update.json'), JSON.stringify(updateJson, null, 2) + '\n');
console.log('update.json:', JSON.stringify(updateJson, null, 2));

// ---- Git commit + tag + push（只提交 update.json）----
run('git add update.json');
const hasChanges = execSync('git diff --cached --name-only', { cwd: root }).toString().trim();
if (hasChanges) {
  run(`git commit -m "release: ${tag}"`);
}
run(`git tag ${tag}`);
run(`git push ${remoteName} --follow-tags`);

// ---- 从 changelog.json 读取发版说明 ----
const changelog = JSON.parse(readFileSync(join(root, 'changelog.json'), 'utf-8'));
const entry = changelog.find(e => e.version === version);
const notes = entry
  ? entry.changes.map(c => `- ${c}`).join('\n')
  : `Release ${tag}`;

const notesFile = join(root, '.release-notes.tmp');
writeFileSync(notesFile, notes, 'utf-8');

// ---- 创建 GitHub Release 并上传 zip ----
console.log('\nCreating GitHub Release...');
run(`${gh} release create ${tag} flowpilot.zip --title "${tag}" --notes-file ".release-notes.tmp"`);
unlinkSync(notesFile);

console.log(`\n✅ Done! https://github.com/${GITHUB_REPO}/releases/tag/${tag}`);
