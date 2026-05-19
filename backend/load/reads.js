import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5050';

const tHealth = new Trend('lat_health', true);
const tList = new Trend('lat_list', true);
const tDetail = new Trend('lat_detail', true);
const tDownload = new Trend('lat_download', true);

export const options = {
  scenarios: {
    reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10 },  
        { duration: '40s', target: 50 },  
        { duration: '1m',  target: 50 },  
        { duration: '20s', target: 0 },   
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],          
    lat_detail: ['p(95)<400'],
    lat_list: ['p(95)<300'],
    lat_health: ['p(95)<50'],
  },
};

export function setup() {
  const r = http.get(`${BASE_URL}/candidates`);
  if (r.status !== 200) throw new Error(`setup: list failed ${r.status}`);
  const candidates = r.json();
  if (!candidates.length) throw new Error('setup: no candidates in DB');

  let target = candidates[0];
  let docId = null;
  for (const c of candidates) {
    const dr = http.get(`${BASE_URL}/candidates/${c.id}`);
    if (dr.status !== 200) continue;
    const docs = dr.json().documents || [];
    if (docs.length) {
      target = c;
      docId = docs[0].id;
      break;
    }
  }
  return { cid: target.id, docId };
}

export default function (data) {
  let r = http.get(`${BASE_URL}/`, { tags: { name: 'health' } });
  check(r, { 'health ok': (x) => x.status === 200 });
  tHealth.add(r.timings.duration);

  r = http.get(`${BASE_URL}/candidates`, { tags: { name: 'list' } });
  check(r, { 'list ok': (x) => x.status === 200 });
  tList.add(r.timings.duration);

  r = http.get(`${BASE_URL}/candidates/${data.cid}`, { tags: { name: 'detail' } });
  check(r, { 'detail ok': (x) => x.status === 200 });
  tDetail.add(r.timings.duration);

  if (data.docId) {
    r = http.get(`${BASE_URL}/candidates/${data.cid}/documents/${data.docId}`, {
      tags: { name: 'download' },
    });
    check(r, { 'download ok': (x) => x.status === 200 });
    tDownload.add(r.timings.duration);
  }
}

export function handleSummary(data) {
  return {
    'load/results/reads.txt': textSummary(data, { indent: ' ', enableColors: false }),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
