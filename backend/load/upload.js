import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5050';
const RESUME_PATH = __ENV.RESUME_PATH;

if (!RESUME_PATH) {
  throw new Error('RESUME_PATH env var is required (absolute path to a pdf/docx)');
}

const fileBin = open(RESUME_PATH, 'b');
const fileName = RESUME_PATH.split('/').pop();

export const options = {
  scenarios: {
    upload: {
      executor: 'constant-vus',
      vus: 2,             
      duration: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],            
    http_req_duration: ['p(95)<45000'],        
  },
};

export default function () {
  const payload = { file: http.file(fileBin, fileName, 'application/octet-stream') };
  const r = http.post(`${BASE_URL}/candidates/upload`, payload, {
    timeout: '120s',
    tags: { name: 'upload' },
  });
  check(r, {
    'upload 201': (x) => x.status === 201,
    'extraction done': (x) => {
      try { return x.json().extraction_status === 'done'; } catch { return false; }
    },
  });
}

export function handleSummary(data) {
  return {
    'load/results/upload.txt': textSummary(data, { indent: ' ', enableColors: false }),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
