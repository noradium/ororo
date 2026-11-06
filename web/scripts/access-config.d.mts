export function parseAllowedEmails(value?: string): string[];
export function loadAccess(mode?: string): { emails: string[]; hashes: string[] };
export function renderAccessRules(source: string, emails: string[]): string;
export function writeAccessRules(mode?: string): void;
