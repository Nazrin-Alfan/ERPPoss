import fs from 'fs';
import path from 'path';

const pagesDir = path.resolve('src/pages');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  // 1. Find functions/handlers
  // e.g. const handleX = async (...) => { ... } or function handleX(...) { ... }
  const fnRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
  const functionDefs = [];
  let match;
  while ((match = fnRegex.exec(content)) !== null) {
    functionDefs.push({ name: match[1], index: match.index });
  }

  // Also catch function declarations: function handleX(...) {
  const fnDeclRegex = /function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/g;
  while ((match = fnDeclRegex.exec(content)) !== null) {
    functionDefs.push({ name: match[1], index: match.index });
  }

  // Sort functionDefs by start index
  functionDefs.sort((a, b) => a.index - b.index);

  // 2. Find all mutation statements:
  // supabase.from('tbl').insert / .update / .delete / .upsert
  // supabase.rpc('rpc_name', ...)
  // supabase.auth.signUp(...)
  // api.*
  const mutationRegex = /(?:supabase\s*\.\s*(?:from\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*(insert|update|delete|upsert)|rpc\(\s*['"]([^'"]+)['"]\)|auth\s*\.\s*(signUp|signInWithPassword|signOut))|api\s*\.\s*([a-zA-Z0-9_]+)\s*\.\s*([a-zA-Z0-9_]+))/g;

  const mutations = [];
  while ((match = mutationRegex.exec(content)) !== null) {
    let type = 'table_mutation';
    let target = '';
    let op = '';

    if (match[1]) {
      target = match[1];
      op = match[2];
    } else if (match[3]) {
      type = 'rpc';
      target = match[3];
      op = 'rpc';
    } else if (match[4]) {
      type = 'auth';
      target = 'auth';
      op = match[4];
    } else if (match[5]) {
      type = 'api_adapter';
      target = match[5];
      op = match[6];
    }

    // Find which line number
    const lineNum = content.substring(0, match.index).split('\n').length;

    // Find enclosing function
    let enclosingFn = 'global/inline';
    for (let i = functionDefs.length - 1; i >= 0; i--) {
      if (functionDefs[i].index < match.index) {
        enclosingFn = functionDefs[i].name;
        break;
      }
    }

    mutations.push({
      line: lineNum,
      fn: enclosingFn,
      type,
      target,
      op,
      raw: match[0]
    });
  }

  // Group mutations by function
  const fnGroups = {};
  for (const m of mutations) {
    if (!fnGroups[m.fn]) fnGroups[m.fn] = [];
    fnGroups[m.fn].push(m);
  }

  // Identify suspicious / multi-table fragmented mutations
  const handlersWithMultipleMutations = [];
  for (const [fnName, list] of Object.entries(fnGroups)) {
    const tableMutations = list.filter(m => m.type === 'table_mutation');
    const uniqueTables = [...new Set(tableMutations.map(m => m.target))];
    const uniqueOps = [...new Set(tableMutations.map(m => m.op))];

    // If function mutates more than 1 table directly from client, or performs client-side deletes
    if (uniqueTables.length > 1 || uniqueOps.includes('delete') || list.some(m => m.type === 'auth' && m.op === 'signUp')) {
      handlersWithMultipleMutations.push({
        fnName,
        uniqueTables,
        uniqueOps,
        mutations: list
      });
    }
  }

  return {
    relPath,
    totalMutations: mutations.length,
    handlersWithMultipleMutations
  };
}

function scanAllPages(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanAllPages(fullPath));
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      if (!entry.name.includes('.test.')) {
        results.push(scanFile(fullPath));
      }
    }
  }
  return results;
}

const allResults = scanAllPages(pagesDir);
const report = {
  scannedAt: new Date().toISOString(),
  pagesScanned: allResults.length,
  findings: allResults.filter(r => r.handlersWithMultipleMutations.length > 0)
};

const outDir = path.resolve('scripts');
fs.writeFileSync(path.join(outDir, 'audit_dual_write_map.json'), JSON.stringify(report, null, 2));
console.log(`Scan completed. Found ${report.findings.length} pages with fragmented mutations/client deletes.`);
for (const f of report.findings) {
  console.log(`\nFile: ${f.relPath}`);
  for (const h of f.handlersWithMultipleMutations) {
    console.log(`  - Function: ${h.fnName} (Tables: ${h.uniqueTables.join(', ') || 'None'} | Ops: ${h.uniqueOps.join(', ') || 'N/A'})`);
  }
}
