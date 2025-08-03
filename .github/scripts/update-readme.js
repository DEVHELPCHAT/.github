const fs = require('fs');
const fetch = require('node-fetch');

const ORG = 'DEVHELPCHAT';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

async function fetchRepos() {
  const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  return res.json();
}

(async () => {
  const repos = await fetchRepos();
  const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);
  const forks = repos.reduce((a, r) => a + r.forks_count, 0);

  // Language distribution
  const languages = {};
  for (const repo of repos) {
    const langRes = await fetch(repo.languages_url, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
    });
    const langs = await langRes.json();
    for (const [lang, bytes] of Object.entries(langs)) {
      languages[lang] = (languages[lang] || 0) + bytes;
    }
  }

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
    type: 'doughnut',
    data: { labels: Object.keys(languages), datasets: [{ data: Object.values(languages) }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  }))}`;

  const statsBlock = `
<div align="center">

### 📊 Org Statistics

- **Total Public Repos:** ${repos.length}  
- **Total Stars:** ${stars}  
- **Total Forks:** ${forks}  

![Languages](${chartUrl})

</div>
`;

  const readme = fs.readFileSync('README.md', 'utf8');
  const updated = readme.replace(
    /<!-- STATS-START -->[\s\S]*<!-- STATS-END -->/,
    `<!-- STATS-START -->\n${statsBlock}\n<!-- STATS-END -->`
  );

  fs.writeFileSync('README.md', updated);
})();
