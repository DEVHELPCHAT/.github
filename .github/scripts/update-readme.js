const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const ORG = 'DEVHELPCHAT';
// Use env variable without underscore as you said
const GITHUB_TOKEN = process.env.GITHUBTOKEN || '';

async function fetchRepos() {
  const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'DEVHELPCHAT-Org-Dashboard-Script',
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch repos: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected response data: ${JSON.stringify(data)}`);
  }

  return data;
}

async function fetchLanguages(repoName) {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repoName}/languages`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'DEVHELPCHAT-Org-Dashboard-Script',
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    return {};
  }

  return await res.json();
}

async function aggregateLanguages(repos) {
  const langTotals = {};
  for (const repo of repos) {
    try {
      const langs = await fetchLanguages(repo.name);
      for (const [lang, bytes] of Object.entries(langs)) {
        langTotals[lang] = (langTotals[lang] || 0) + bytes;
      }
    } catch {
      // Ignore fetch errors for individual repos
    }
  }
  return langTotals;
}

function renderLanguages(langTotals) {
  const totalBytes = Object.values(langTotals).reduce((a, b) => a + b, 0);
  if (totalBytes === 0) return '_No language data available_';

  // Sort and take top 6 languages
  const sorted = Object.entries(langTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return sorted
    .map(([lang, bytes]) => {
      const percent = ((bytes / totalBytes) * 100).toFixed(1);
      const barLength = Math.round((percent / 100) * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      return `**${lang.padEnd(12)}** | ${bar} | ${percent}%`;
    })
    .join('\n');
}

async function updateReadme(stars, forks, langsText) {
  const readmePath = path.join(__dirname, '..', '..', 'README.md');
  let content = await fs.readFile(readmePath, 'utf-8');

  const startMarker = '<!-- STATS-START -->';
  const endMarker = '<!-- STATS-END -->';

  const newStats = `
## 🚀 DEVHELPCHAT Organization Stats

| Metric        | Value          |
| ------------- | -------------- |
| ⭐ Stars      | **${stars.toLocaleString()}** |
| 🍴 Forks      | **${forks.toLocaleString()}** |

### 📊 Language Distribution (Top 6)

${langsText}
  `.trim();

  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');
  if (!regex.test(content)) {
    console.warn('Warning: Markers not found in README.md. Adding them at the end.');
    content += `\n\n${startMarker}\n${newStats}\n${endMarker}\n`;
  } else {
    content = content.replace(regex, `${startMarker}\n${newStats}\n${endMarker}`);
  }

  await fs.writeFile(readmePath, content, 'utf-8');
  console.log('README.md updated successfully!');
}

(async () => {
  try {
    console.log('Fetching repos...');
    const repos = await fetchRepos();

    console.log(`Found ${repos.length} repositories.`);

    const stars = repos.reduce((acc, repo) => acc + repo.stargazers_count, 0);
    const forks = repos.reduce((acc, repo) => acc + repo.forks_count, 0);

    console.log('Aggregating language data...');
    const langTotals = await aggregateLanguages(repos);

    const langsText = renderLanguages(langTotals);

    await updateReadme(stars, forks, langsText);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
