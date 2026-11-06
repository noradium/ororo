import { loadEnv } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseAllowedEmails(value = '') {
  const emails = [
    ...new Set(
      value
        .split(/[,;\n]/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (emails.some((email) => !/^[^\s@,/;]+@[^\s@,/;]+\.[^\s@,/;]+$/.test(email)))
    throw new Error(
      'ALLOWED_GOOGLE_EMAILSには有効なメールアドレスをカンマ区切りで指定してください。',
    );
  return emails;
}
export function loadAccess(mode = 'production') {
  const env = loadEnv(mode, process.cwd(), 'ALLOWED_');
  const emails = parseAllowedEmails(
    process.env.ALLOWED_GOOGLE_EMAILS ?? env.ALLOWED_GOOGLE_EMAILS ?? '',
  );
  return {
    emails,
    hashes: emails.map((email) => createHash('sha256').update(email).digest('hex')),
  };
}
export function renderAccessRules(source, emails) {
  const marker = '[] /* ALLOWED_GOOGLE_EMAILS */';
  if (!source.includes(marker)) throw new Error('Access rule template marker is missing');
  return source.replace(marker, () => JSON.stringify(parseAllowedEmails(emails.join(','))));
}
export function writeAccessRules(mode = 'production') {
  const { emails } = loadAccess(mode);
  writeFileSync(
    'firestore.generated.rules',
    renderAccessRules(readFileSync('firestore.rules', 'utf8'), emails),
  );
  console.log(`Private access rules prepared (${emails.length} allowed accounts).`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  writeAccessRules(process.argv.includes('--development') ? 'development' : 'production');
