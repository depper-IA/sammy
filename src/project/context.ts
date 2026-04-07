import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type ProjectDoc = {
  path: string;
  label: string;
  limit: number;
};

const PROJECT_DOCS: ProjectDoc[] = [
  { path: 'AGENTS.md', label: 'Reglas del repo', limit: 2500 },
  { path: 'REGLAS_IMPORTANTES.md', label: 'Reglas importantes', limit: 3500 },
  { path: 'TECH_STACK.md', label: 'Stack técnico', limit: 3500 },
  { path: 'PRD.md', label: 'Producto', limit: 3500 },
  { path: 'DESIGN.md', label: 'Diseño', limit: 3000 },
  { path: 'CHANGELOG_GEMINI.md', label: 'Changelog reciente', limit: 3000 },
];

function cleanText(value: string): string {
  return value.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...[truncado]`;
}

export function getProjectDocs(): string[] {
  return PROJECT_DOCS.map((doc) => doc.path);
}

export function buildProjectContext(projectRoot: string): string {
  const sections: string[] = [];

  sections.push(`Proyecto raíz: ${projectRoot}`);
  sections.push(
    `Documentos base disponibles: ${PROJECT_DOCS.map((doc) => doc.path).join(', ')}`
  );

  for (const doc of PROJECT_DOCS) {
    const fullPath = join(projectRoot, doc.path);
    if (!existsSync(fullPath)) {
      continue;
    }

    const raw = readFileSync(fullPath, 'utf8');
    const content = truncate(cleanText(raw), doc.limit);
    sections.push(`## ${doc.label} (${relative(projectRoot, fullPath)})\n${content}`);
  }

  return sections.join('\n\n');
}
