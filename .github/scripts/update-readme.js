const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const ORG = 'DEVHELPCHAT';
const GITHUB_TOKEN = process.env.GITHUBTOKEN || '';

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUBTOKEN env variable not set!');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'DEVHELPCHAT-Org-Dashboard-Script',
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Failed fetching ${url}: ${res.status} ${res.statusText} - ${JSON.stringify(errBody)}`);
  }
  return res.json();
}

async function fetchOrgData() {
  return fetchJson(`https://api.github.com/orgs/${ORG}`);
}

async function fetchRepos() {
  let page = 1;
  const perPage = 100;
  let repos = [];
  while (true) {
    const data = await fetchJson(`https://api.github.com/orgs/${ORG}/repos?per_page=${perPage}&page=${page}`);
    repos = repos.concat(data);
    if (data.length < perPage) break;
    page++;
  }
  return repos;
}

async function fetchLanguages(repoName) {
  return fetchJson(`https://api.github.com/repos/${ORG}/${repoName}/languages`).catch(() => ({}));
}

function renderProgressBar(percent) {
  const length = 20;
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function padRight(str, length) {
  return str + ' '.repeat(Math.max(0, length - str.length));
}

async function generateStats() {
  const orgData = await fetchOrgData();
  const repos = await fetchRepos();

  const stars = repos.reduce((acc, r) => acc + r.stargazers_count, 0);
  const forks = repos.reduce((acc, r) => acc + r.forks_count, 0);
  const watchers = repos.reduce((acc, r) => acc + r.watchers_count, 0);
  const openIssues = repos.reduce((acc, r) => acc + r.open_issues_count, 0);
  const totalRepos = repos.length;

  // Aggregate languages
  const langTotals = {};
  for (const repo of repos) {
    const langs = await fetchLanguages(repo.name);
    for (const [lang, bytes] of Object.entries(langs)) {
      langTotals[lang] = (langTotals[lang] || 0) + bytes;
    }
  }
  const totalBytes = Object.values(langTotals).reduce((a, b) => a + b, 0);

  // Sort top 6 langs
  const topLangs = Object.entries(langTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  // Build language markdown lines with progress bars
  const langLines = topLangs.map(([lang, bytes]) => {
    const percent = totalBytes ? ((bytes / totalBytes) * 100) : 0;
    return `- **${padRight(lang, 12)}** | ${renderProgressBar(percent)} | ${percent.toFixed(1)}%`;
  });

  // Compose full markdown block
  return `
### 🚀 DEVHELPCHAT Organization Dashboard

| 📊 Metric           | 📈 Value             |
| ------------------- | -------------------- |
| 🗂️ Total Repositories | **${totalRepos.toLocaleString()}** |
| ⭐ Total Stars       | **${stars.toLocaleString()}**     |
| 🍴 Total Forks       | **${forks.toLocaleString()}**     |
| 👀 Total Watchers    | **${watchers.toLocaleString()}**  |
| 🐞 Open Issues       | **${openIssues.toLocaleString()}** |

### 🛠️ Top Languages by Bytes

${langLines.length ? langLines.join('\n') : '_No language data available_'}

---

_Last updated: ${new Date().toUTCString()}_
  `.trim();
}

async function updateProfileReadme() {
  const readmePath = path.join(__dirname, '..', '..', 'profile', 'README.md');
  const startMarker = '<!-- STATS-START -->';
  const endMarker = '<!-- STATS-END -->';

  let content = await fs.readFile(readmePath, 'utf-8');
  const statsMd = await generateStats();

  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');

  if (!regex.test(content)) {
    console.warn('Warning: Markers not found in profile/README.md. Adding stats at the end.');
    content += `\n\n${startMarker}\n${statsMd}\n${endMarker}\n`;
  } else {
    content = content.replace(regex, `${startMarker}\n${statsMd}\n${endMarker}`);
  }

  await fs.writeFile(readmePath, content, 'utf-8');
  console.log('profile/README.md updated successfully!');
}

(async () => {
  try {
    await updateProfileReadme();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
