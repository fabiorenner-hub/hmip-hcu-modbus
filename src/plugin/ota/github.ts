import { GITHUB_REPO } from '../pluginMeta.js';

export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`;

export type FetchLike = (
  i: string,
  o?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}
export interface LatestRelease {
  readonly tagName: string;
  readonly htmlUrl: string;
  readonly assets: ReleaseAsset[];
  readonly prerelease: boolean;
}
export interface OtaAssetSet {
  manifest: ReleaseAsset | null;
  bundle: ReleaseAsset | null;
  sha256: ReleaseAsset | null;
}

export function parseRelease(j: unknown): LatestRelease | null {
  if (j === null || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const tagName = typeof o['tag_name'] === 'string' ? o['tag_name'] : null;
  if (tagName === null) return null;
  const htmlUrl =
    typeof o['html_url'] === 'string' ? o['html_url'] : `https://github.com/${GITHUB_REPO}/releases`;
  const prerelease = o['prerelease'] === true;
  const assets: ReleaseAsset[] = [];
  for (const a of Array.isArray(o['assets']) ? o['assets'] : []) {
    const ao = a as Record<string, unknown>;
    const name = typeof ao['name'] === 'string' ? ao['name'] : null;
    const url = typeof ao['browser_download_url'] === 'string' ? ao['browser_download_url'] : null;
    if (name && url && url.startsWith('https://')) assets.push({ name, url });
  }
  return { tagName, htmlUrl, assets, prerelease };
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown | null> {
  try {
    const r = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hcu-ota' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function fetchLatestRelease(f: FetchLike): Promise<LatestRelease | null> {
  const j = await getJson(f, LATEST_RELEASE_API);
  return j ? parseRelease(j) : null;
}

export async function fetchLatestPrerelease(f: FetchLike): Promise<LatestRelease | null> {
  const j = await getJson(f, RELEASES_API);
  if (!Array.isArray(j)) return null;
  for (const item of j) {
    const rel = parseRelease(item);
    if (rel?.prerelease) return rel;
  }
  return null;
}

export function findOtaAssets(rel: LatestRelease): OtaAssetSet {
  let manifest: ReleaseAsset | null = null,
    bundle: ReleaseAsset | null = null,
    sha256: ReleaseAsset | null = null;
  for (const a of rel.assets) {
    const n = a.name.toLowerCase();
    if (/^ota-manifest.*\.json$/u.test(n)) manifest = a;
    else if (n.endsWith('.sha256')) sha256 = a;
    else if (/^.*-ota-.*\.json$/u.test(n)) bundle = a;
  }
  return { manifest, bundle, sha256 };
}
