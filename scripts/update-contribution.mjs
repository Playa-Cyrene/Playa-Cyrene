import { mkdir, writeFile } from "node:fs/promises";

const REPOSITORIES = [
  "Playa-Cyrene/Cyrene-Agent",
  "Playa-Cyrene/Cyrene-Plugins",
  "Playa-Cyrene/Cyrene-Note",
];

const parseLogins = (value, fallback) =>
  (value || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const PLAYA_LOGINS = new Set(
  parseLogins(process.env.PLAYA_LOGINS, "Playa-0v0")
);

const CYRENE_BOT_LOGINS = new Set(
  parseLogins(process.env.CYRENE_BOT_LOGINS, "CyreneBot")
);

const token = process.env.GITHUB_TOKEN || "";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Playa-Cyrene-contribution-card",
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}

async function getContributors(repo) {
  const contributors = [];

  for (let page = 1; page <= 20; page += 1) {
    const url =
      `https://api.github.com/repos/${repo}/contributors?per_page=100&page=${page}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API request failed for ${repo}: ${response.status} ${body}`
      );
    }

    const batch = await response.json();
    contributors.push(...batch);

    if (batch.length < 100) break;
  }

  return contributors;
}

function isGenericBot(login) {
  return (
    login.endsWith("[bot]") ||
    login === "github-actions" ||
    login === "github-actions[bot]"
  );
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pct(value, total) {
  if (!total) return 0;
  return (value / total) * 100;
}

function formatPct(value) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

const aggregated = new Map();

for (const repo of REPOSITORIES) {
  const contributors = await getContributors(repo);

  for (const contributor of contributors) {
    if (!contributor?.login || !Number.isFinite(contributor?.contributions)) {
      continue;
    }

    const login = contributor.login;
    const key = login.toLowerCase();

    aggregated.set(key, {
      login,
      contributions:
        (aggregated.get(key)?.contributions || 0) + contributor.contributions,
    });
  }
}

const totals = {
  playa: 0,
  community: 0,
  cyreneBot: 0,
};

const community = [];

for (const [key, contributor] of aggregated) {
  if (PLAYA_LOGINS.has(key)) {
    totals.playa += contributor.contributions;
    continue;
  }

  if (CYRENE_BOT_LOGINS.has(key)) {
    totals.cyreneBot += contributor.contributions;
    continue;
  }

  // Generic automation accounts such as Dependabot are intentionally excluded.
  if (isGenericBot(key)) continue;

  totals.community += contributor.contributions;
  community.push(contributor);
}

community.sort((a, b) => b.contributions - a.contributions);

const total = totals.playa + totals.community + totals.cyreneBot;
const playaPct = pct(totals.playa, total);
const communityPct = pct(totals.community, total);
const botPct = pct(totals.cyreneBot, total);

const barX = 165;
const barWidth = 510;
const rows = [
  {
    label: "Playa",
    value: totals.playa,
    percentage: playaPct,
    y: 102,
    color: "#f97316",
  },
  {
    label: "Community",
    value: totals.community,
    percentage: communityPct,
    y: 146,
    color: "#3fb950",
  },
  {
    label: "CyreneBot",
    value: totals.cyreneBot,
    percentage: botPct,
    y: 190,
    color: "#8b5cf6",
  },
];

const bars = rows
  .map((row) => {
    const width = Math.max(
      row.value > 0 ? 3 : 0,
      (row.percentage / 100) * barWidth
    );

    return `
      <text x="32" y="${row.y + 4}" class="label">${xml(row.label)}</text>
      <rect x="${barX}" y="${row.y - 12}" width="${barWidth}" height="16" rx="8" fill="#21262d"/>
      <rect x="${barX}" y="${row.y - 12}" width="${width.toFixed(
        2
      )}" height="16" rx="8" fill="${row.color}"/>
      <text x="700" y="${row.y + 4}" text-anchor="end" class="value">${xml(
        `${formatPct(row.percentage)}% · ${row.value}`
      )}</text>`;
  })
  .join("");

const topCommunity =
  community.length > 0
    ? community
        .slice(0, 5)
        .map((item) => `@${item.login}`)
        .join(" · ")
    : "No community commits counted yet";

const updated = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="270" viewBox="0 0 760 270" role="img" aria-labelledby="title desc">
  <title id="title">Cyrene ecosystem contribution overview</title>
  <desc id="desc">Aggregated default-branch commit contributions across Cyrene-Agent, Cyrene-Plugins, and Cyrene-Note.</desc>
  <style>
    .title { font: 700 21px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: #f0f6fc; }
    .subtitle { font: 400 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: #8b949e; }
    .label { font: 600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: #c9d1d9; }
    .value { font: 600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: #c9d1d9; }
    .footer { font: 400 11px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: #8b949e; }
  </style>

  <rect x="1" y="1" width="758" height="268" rx="12" fill="#0d1117" stroke="#30363d"/>

  <text x="32" y="40" class="title">Cyrene Ecosystem Contributions</text>
  <text x="32" y="62" class="subtitle">Cyrene-Agent · Cyrene-Plugins · Cyrene-Note · default-branch commits</text>

  ${bars}

  <line x1="32" y1="220" x2="728" y2="220" stroke="#21262d"/>
  <text x="32" y="242" class="footer">Top community: ${xml(topCommunity)}</text>
  <text x="728" y="242" text-anchor="end" class="footer">Total: ${total} · ${xml(updated)}</text>
</svg>
`;

await mkdir("assets", { recursive: true });
await writeFile("assets/contribution.svg", svg, "utf8");

console.log(
  JSON.stringify(
    {
      repositories: REPOSITORIES,
      totals,
      total,
      topCommunity: community.slice(0, 5),
    },
    null,
    2
  )
);
