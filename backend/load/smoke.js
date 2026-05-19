import http from 'k6/http';
import { check, fail } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5050';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'], 
  },
};

export default function () {
  let r = http.get(`${BASE_URL}/`);
  check(r, { 'health 200': (x) => x.status === 200 });

  r = http.get(`${BASE_URL}/candidates`);
  check(r, { 'list 200': (x) => x.status === 200 });
  const candidates = r.json();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    fail('no candidates in DB — upload one before running smoke');
  }
  const cid = candidates[0].id;

  r = http.get(`${BASE_URL}/candidates/${cid}`);
  check(r, {
    'detail 200': (x) => x.status === 200,
    'detail has documents key': (x) => 'documents' in x.json(),
  });

  const docs = r.json().documents || [];
  if (docs.length > 0) {
    const dr = http.get(`${BASE_URL}/candidates/${cid}/documents/${docs[0].id}`);
    check(dr, { 'download 200': (x) => x.status === 200 });
  }

  r = http.get(`${BASE_URL}/candidates/9999999`);
  check(r, { '404 on missing candidate': (x) => x.status === 404 });
}

export function handleSummary(data) {
  return {
    'load/results/smoke.txt': textSummary(data, { indent: ' ', enableColors: false }),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
