import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const contents = ['신어헬', '신어헬오방', '신어헬오방아어', '오방', '아페(어렴)'];
const capacities = [4, 6, 8, 16];
const digest = value => createHash('sha256').update(value).digest();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function partyDetails({ content, departure, capacity }) {
  const parsed = new Date(departure + ':00Z');
  if (!contents.includes(content) || !capacities.includes(capacity) ||
      typeof departure !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(departure) ||
      !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 16) !== departure) {
    throw new RequestError(400, '콘텐츠, 모집인원, 출발 일시를 확인해 주세요.');
  }
  return { content, departure, capacity };
}

export function applyChange(parties, request) {
  if (!request || typeof request !== 'object') throw new RequestError(400, '요청 형식을 확인해 주세요.');
  if (request.action === 'add') {
    if (typeof request.requestId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(request.requestId ?? '')) {
      throw new RequestError(400, '모집 요청 번호를 확인해 주세요.');
    }
    if (parties.some(party => party.id === request.requestId)) return false;
    if (parties.length >= 200) throw new RequestError(400, '모집은 최대 200개까지 등록할 수 있습니다.');
    const { content, departure, capacity } = partyDetails(request);
    parties.push({ id: request.requestId, version: 1, content, departure, names: Array(capacity).fill('') });
    return;
  }

  const index = parties.findIndex(party => party.id === request.id);
  const party = parties[index];
  if (!party || party.version !== request.version) {
    throw new RequestError(409, '다른 사용자가 이 그룹을 변경했습니다. 새로고침 후 다시 시도해 주세요.');
  }
  if (request.action === 'delete') {
    parties.splice(index, 1);
    return;
  }
  if (request.action === 'seat') {
    const { seat, name } = request;
    if (!Number.isInteger(seat) || seat < 0 || seat >= party.names.length ||
        typeof name !== 'string' || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) {
      throw new RequestError(400, '자리와 닉네임을 확인해 주세요.');
    }
    party.names[seat] = name.trim();
  } else if (request.action === 'edit') {
    const { content, departure, capacity } = partyDetails(request);
    const occupied = party.names.filter(name => name.trim());
    if (capacity < occupied.length) throw new RequestError(400, '현재 참가자 수 이상으로 선택해 주세요.');
    const names = party.names.slice(capacity).some(name => name.trim())
      ? occupied : party.names.slice(0, capacity);
    while (names.length < capacity) names.push('');
    Object.assign(party, { content, departure, names });
  } else {
    throw new RequestError(400, '지원하지 않는 요청입니다.');
  }
  party.version += 1;
}

export function makeStore(config, fetchGitHub = fetch) {
  const { repo, branch, token } = config;
  const endpoint = 'https://api.github.com/repos/' + repo + '/contents/data/parties.json';
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bbiyak-party-api',
    'Content-Type': 'application/json'
  };
  async function read() {
    const response = await fetchGitHub(endpoint + '?ref=' + encodeURIComponent(branch),
      { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('GitHub read HTTP ' + response.status);
    const { sha, content, encoding } = await response.json();
    const parties = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
    if (!sha || encoding !== 'base64' || !Array.isArray(parties)) throw new Error('Invalid party file');
    return { parties, sha };
  }

  return {
    read,
    async change(request) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { parties, sha } = await read();
        if (applyChange(parties, request) === false) return parties;
        const response = await fetchGitHub(endpoint, {
          method: 'PUT', headers, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            branch, sha, message: 'Update party recruitment',
            content: Buffer.from(JSON.stringify(parties, null, 2) + '\n').toString('base64')
          })
        });
        if (response.ok) return parties;
        if (response.status !== 409 && response.status !== 422) {
          throw new Error('GitHub write HTTP ' + response.status);
        }
        const latest = await read();
        if (latest.sha === sha && response.status === 422) throw new Error('GitHub rejected update');
      }
      throw new RequestError(409, '저장이 겹쳤습니다. 새로고침 후 다시 시도해 주세요.');
    }
  };
}

async function readRequest(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096) throw new RequestError(413, '요청이 너무 큽니다.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, '요청을 읽을 수 없습니다.');
  }
}

export function makeServer(config, store = makeStore(config)) {
  const codeHash = digest(config.code);
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin === config.origin) {
      res.setHeader('Access-Control-Allow-Origin', config.origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Club-Code');
    }
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true });
    if (req.url !== '/parties') return send(404, { error: '주소를 확인해 주세요.' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    try {
      if (req.method === 'GET') return send(200, { parties: (await store.read()).parties });
      if (req.method !== 'POST') return send(405, { error: '지원하지 않는 요청입니다.' });
      if (!timingSafeEqual(digest(req.headers['x-club-code'] ?? ''), codeHash)) {
        return send(401, { error: '클럽 공용 코드를 확인해 주세요.' });
      }
      return send(200, { parties: await store.change(await readRequest(req)) });
    } catch (error) {
      if (error instanceof RequestError) return send(error.status, { error: error.message });
      console.error(error.message);
      return send(502, { error: 'GitHub 저장소에 연결할 수 없습니다. 새로고침으로 저장 상태를 확인해 주세요.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = {
    repo: process.env.PARTY_REPO || 'bbiyakculb/bbiyak',
    branch: process.env.PARTY_BRANCH || 'party-data',
    origin: process.env.PARTY_ORIGIN || 'https://bbiyakculb.github.io',
    token: process.env.GITHUB_TOKEN,
    code: process.env.CLUB_WRITE_CODE
  };
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo) || !config.token || !config.code ||
      !/^[\x21-\x7e]{16,128}$/.test(config.code)) {
    throw new Error('Set PARTY_REPO, GITHUB_TOKEN and a 16–128 character ASCII CLUB_WRITE_CODE.');
  }
  const server = makeServer(config);
  server.requestTimeout = 15000;
  server.listen(Number(process.env.PORT || 8000), '0.0.0.0');
}
