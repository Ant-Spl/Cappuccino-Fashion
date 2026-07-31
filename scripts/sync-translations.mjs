import fs from "node:fs";
import path from "node:path";

const FILE_PREFIX = "Fashion";
const ROOT_TAG = "fashion";
const DEFAULT_LANG = "en";
const LANG_DIR = "./langs";
const LANG_FILE_PATTERN = /^Fashion_([a-z]{2}(?:_[A-Z]{2})?)\.xml$/;

const DEFAULT_LOG_LIMIT = 25;
const parsedLogLimit = Number.parseInt(
  process.env.SYNC_TRANSLATIONS_LOG_LIMIT ?? `${DEFAULT_LOG_LIMIT}`,
  10,
);
const LOG_LIMIT = Number.isFinite(parsedLogLimit) && parsedLogLimit >= 0
  ? parsedLogLimit
  : DEFAULT_LOG_LIMIT;

const REPORT_PATH = process.env.SYNC_TRANSLATIONS_REPORT_PATH
  ?? "translation-sync-summary.md";
const WRITE_FULL_REPORT = process.env.SYNC_TRANSLATIONS_FULL_REPORT === "1";

function getFileName(lang) {
  return `${FILE_PREFIX}_${lang}.xml`;
}

function getFilePath(fileName) {
  return path.join(LANG_DIR, fileName);
}

function readXmlFile(fileName) {
  return fs.readFileSync(getFilePath(fileName), "utf-8");
}

function getLang(fileName) {
  return fileName.match(LANG_FILE_PATTERN)?.[1];
}

function findMarkupEnd(xml, start, terminator) {
  const end = xml.indexOf(terminator, start);
  if (end === -1) {
    throw new Error(`Unterminated XML markup beginning at character ${start}`);
  }
  return end + terminator.length;
}

function findTagEnd(xml, start) {
  let quote = null;

  for (let index = start + 1; index < xml.length; index += 1) {
    const char = xml[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index + 1;
    }
  }

  throw new Error(`Unterminated XML tag beginning at character ${start}`);
}

function parseAttributes(openingTag) {
  const attributes = new Map();
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  let match;

  while ((match = attributePattern.exec(openingTag)) !== null) {
    attributes.set(match[1], match[2] ?? match[3] ?? "");
  }

  return attributes;
}

function parseXmlTree(xml, fileName) {
  const roots = [];
  const stack = [];
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start === -1) {
      break;
    }

    if (xml.startsWith("<!--", start)) {
      cursor = findMarkupEnd(xml, start + 4, "-->");
      continue;
    }

    if (xml.startsWith("<![CDATA[", start)) {
      cursor = findMarkupEnd(xml, start + 9, "]]>");
      continue;
    }

    if (xml.startsWith("<?", start)) {
      cursor = findMarkupEnd(xml, start + 2, "?>");
      continue;
    }

    if (xml.startsWith("<!", start)) {
      cursor = findTagEnd(xml, start);
      continue;
    }

    const end = findTagEnd(xml, start);
    const rawTag = xml.slice(start, end);

    if (/^<\s*\//u.test(rawTag)) {
      const name = rawTag.match(/^<\s*\/\s*([^\s>]+)/u)?.[1];
      const node = stack.pop();

      if (!node || !name || node.name !== name) {
        throw new Error(
          `${fileName} has mismatched closing tag ${rawTag.trim()}`,
        );
      }

      node.closeStart = start;
      node.end = end;
      cursor = end;
      continue;
    }

    const name = rawTag.match(/^<\s*([^\s/>]+)/u)?.[1];
    if (!name) {
      throw new Error(`${fileName} contains an unreadable tag near character ${start}`);
    }

    const selfClosing = /\/\s*>$/u.test(rawTag);
    const parent = stack.at(-1) ?? null;
    const node = {
      name,
      attributes: parseAttributes(rawTag),
      start,
      openEnd: end,
      closeStart: selfClosing ? end : null,
      end: selfClosing ? end : null,
      selfClosing,
      parent,
      children: [],
    };

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    if (!selfClosing) {
      stack.push(node);
    }

    cursor = end;
  }

  if (stack.length > 0) {
    throw new Error(`${fileName} contains unclosed <${stack.at(-1).name}> markup`);
  }

  return roots;
}

function findRoot(roots, fileName) {
  const root = roots.find((node) => node.name === ROOT_TAG);
  if (!root) {
    throw new Error(`${fileName} does not contain a <${ROOT_TAG}> root element`);
  }
  if (root.selfClosing) {
    throw new Error(`${fileName} contains an empty <${ROOT_TAG} /> root element`);
  }
  return root;
}

function getLineStart(xml, position) {
  const previousNewline = xml.lastIndexOf("\n", Math.max(0, position - 1));
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function getIndent(xml, position) {
  const lineStart = getLineStart(xml, position);
  return xml.slice(lineStart, position).match(/^[\t ]*/u)?.[0] ?? "";
}

function detectEol(xml) {
  return xml.includes("\r\n") ? "\r\n" : "\n";
}

function detectIndentUnit(xml, root) {
  const rootIndent = getIndent(xml, root.start);
  const child = root.children.find((node) => node.start > root.openEnd);

  if (child) {
    const childIndent = getIndent(xml, child.start);
    if (childIndent.startsWith(rootIndent) && childIndent.length > rootIndent.length) {
      return childIndent.slice(rootIndent.length);
    }
  }

  return "\t";
}

function inferChildIndent(xml, parent, indentUnit) {
  const child = parent.children[0];
  if (child) {
    return getIndent(xml, child.start);
  }

  const parentIndent = getIndent(xml, parent.start);
  return `${parentIndent}${indentUnit}`;
}

function reindentSnippet(snippet, sourceIndent, targetIndent, targetEol) {
  const normalized = snippet.replace(/\r\n|\r|\n/gu, "\n");
  const lines = normalized.split("\n");

  return lines.map((line, index) => {
    if (index === 0) {
      const withoutSourceIndent = sourceIndent && line.startsWith(sourceIndent)
        ? line.slice(sourceIndent.length)
        : line.trimStart();
      return `${targetIndent}${withoutSourceIndent}`;
    }

    if (sourceIndent && line.startsWith(sourceIndent)) {
      return `${targetIndent}${line.slice(sourceIndent.length)}`;
    }

    // Lines inside a quoted XML attribute may intentionally begin at column 0.
    // Leave those untouched rather than changing the translated text itself.
    return line;
  }).join(targetEol);
}

function getIdentity(node) {
  const id = node.attributes.get("id");
  if (id) {
    return { type: "id", value: id };
  }
  return { type: "tag", value: node.name };
}

function matchChildren(sourceParent, destinationParent) {
  const usedDestinationNodes = new Set();
  const matches = new Map();

  sourceParent.children.forEach((sourceChild) => {
    const identity = getIdentity(sourceChild);
    const destinationChild = destinationParent.children.find((candidate) => {
      if (usedDestinationNodes.has(candidate)) {
        return false;
      }

      if (identity.type === "id") {
        return candidate.attributes.get("id") === identity.value;
      }

      return !candidate.attributes.get("id") && candidate.name === identity.value;
    });

    if (destinationChild) {
      usedDestinationNodes.add(destinationChild);
      matches.set(sourceChild, destinationChild);
    }
  });

  return matches;
}

function addInsertion(insertions, position, snippet) {
  const snippets = insertions.get(position) ?? [];
  snippets.push(snippet);
  insertions.set(position, snippets);
}

function syncChildren({
  sourceXml,
  destinationXml,
  sourceParent,
  destinationParent,
  insertions,
  stats,
  destinationEol,
  indentUnit,
}) {
  const matches = matchChildren(sourceParent, destinationParent);
  const targetIndent = inferChildIndent(destinationXml, destinationParent, indentUnit);

  sourceParent.children.forEach((sourceChild, sourceIndex) => {
    const destinationChild = matches.get(sourceChild);
    const identity = getIdentity(sourceChild);

    if (destinationChild) {
      if (
        identity.type === "tag"
        && sourceChild.children.length > 0
      ) {
        if (destinationChild.selfClosing) {
          throw new Error(
            `Cannot add children to existing self-closing <${destinationChild.name} />`,
          );
        }

        syncChildren({
          sourceXml,
          destinationXml,
          sourceParent: sourceChild,
          destinationParent: destinationChild,
          insertions,
          stats,
          destinationEol,
          indentUnit,
        });
      }
      return;
    }

    let anchor = destinationParent.closeStart;
    for (let nextIndex = sourceIndex + 1; nextIndex < sourceParent.children.length; nextIndex += 1) {
      const nextDestinationChild = matches.get(sourceParent.children[nextIndex]);
      if (nextDestinationChild) {
        anchor = nextDestinationChild.start;
        break;
      }
    }

    if (anchor === null) {
      throw new Error(`Cannot locate closing tag for <${destinationParent.name}>`);
    }

    const insertionPosition = getLineStart(destinationXml, anchor);
    const sourceIndent = getIndent(sourceXml, sourceChild.start);
    const sourceSnippet = sourceXml.slice(sourceChild.start, sourceChild.end);
    const snippet = reindentSnippet(
      sourceSnippet,
      sourceIndent,
      targetIndent,
      destinationEol,
    );

    addInsertion(insertions, insertionPosition, snippet);

    if (identity.type === "id") {
      stats.missing.push(identity.value);
    } else {
      stats.missingSections.push(identity.value);
    }
  });
}

function applyInsertions(xml, insertions, eol) {
  const edits = [...insertions.entries()]
    .sort(([left], [right]) => right - left);

  let updatedXml = xml;
  edits.forEach(([position, snippets]) => {
    const insertedText = `${snippets.join(eol)}${eol}`;
    updatedXml = `${updatedXml.slice(0, position)}${insertedText}${updatedXml.slice(position)}`;
  });

  return updatedXml;
}

function logStats(fileName, stats) {
  if (stats.missing.length === 0 && stats.missingSections.length === 0) {
    console.log(`✓  ${fileName} — up to date`);
    return;
  }

  const sectionText = stats.missingSections.length > 0
    ? `, ${stats.missingSections.length} missing section(s)`
    : "";

  console.log(
    `✎  ${fileName} — added ${stats.missing.length} missing key(s)${sectionText}`,
  );

  const shownKeys = stats.missing.slice(0, LOG_LIMIT);
  shownKeys.forEach((key) => console.log(`   + ${key}`));

  const hiddenKeyCount = stats.missing.length - shownKeys.length;
  if (hiddenKeyCount > 0) {
    console.log(`   … ${hiddenKeyCount} more key(s) omitted from CI log`);
  }

  const shownSections = stats.missingSections.slice(0, LOG_LIMIT);
  shownSections.forEach((section) => console.log(`   + section <${section}>`));

  const hiddenSectionCount = stats.missingSections.length - shownSections.length;
  if (hiddenSectionCount > 0) {
    console.log(`   … ${hiddenSectionCount} more section(s) omitted from CI log`);
  }
}

function formatReport(results) {
  const eol = "\n";
  const lines = [
    "# Translation sync summary",
    "",
    `Default language: ${DEFAULT_LANG}`,
    "",
  ];

  results.forEach(({ fileName, stats }) => {
    lines.push(`## ${fileName}`);
    lines.push("");
    lines.push(`- Missing keys added: ${stats.missing.length}`);
    lines.push(`- Missing sections added: ${stats.missingSections.length}`);

    if (WRITE_FULL_REPORT && stats.missing.length > 0) {
      lines.push("");
      lines.push("### Keys added");
      stats.missing.forEach((key) => lines.push(`- \`${key}\``));
    }

    if (WRITE_FULL_REPORT && stats.missingSections.length > 0) {
      lines.push("");
      lines.push("### Sections added");
      stats.missingSections.forEach((section) => lines.push(`- \`${section}\``));
    }

    lines.push("");
  });

  return lines.join(eol).concat(eol);
}

function writeReports(results) {
  const report = formatReport(results);
  fs.writeFileSync(REPORT_PATH, report, "utf-8");

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report, "utf-8");
  }
}

function syncFile(fileName, sourceXml, sourceRoot) {
  const destinationXml = readXmlFile(fileName);
  const destinationRoots = parseXmlTree(destinationXml, fileName);
  const destinationRoot = findRoot(destinationRoots, fileName);
  const destinationEol = detectEol(destinationXml);
  const indentUnit = detectIndentUnit(destinationXml, destinationRoot);
  const insertions = new Map();
  const stats = { missing: [], missingSections: [] };

  syncChildren({
    sourceXml,
    destinationXml,
    sourceParent: sourceRoot,
    destinationParent: destinationRoot,
    insertions,
    stats,
    destinationEol,
    indentUnit,
  });

  logStats(fileName, stats);

  if (insertions.size > 0) {
    const updatedXml = applyInsertions(destinationXml, insertions, destinationEol);
    parseXmlTree(updatedXml, fileName);
    fs.writeFileSync(getFilePath(fileName), updatedXml, "utf-8");
  }

  return stats;
}

(function syncAll() {
  if (!fs.existsSync(LANG_DIR)) {
    throw new Error(`Language directory not found: ${LANG_DIR}`);
  }

  const sourceFileName = getFileName(DEFAULT_LANG);
  if (!fs.existsSync(getFilePath(sourceFileName))) {
    throw new Error(`Default language file not found: ${getFilePath(sourceFileName)}`);
  }

  const sourceXml = readXmlFile(sourceFileName);
  const sourceRoots = parseXmlTree(sourceXml, sourceFileName);
  const sourceRoot = findRoot(sourceRoots, sourceFileName);

  const files = fs.readdirSync(LANG_DIR).sort((a, b) => a.localeCompare(b));
  const results = [];

  console.log(`Default language: ${sourceFileName}`);

  files.forEach((fileName) => {
    const lang = getLang(fileName);

    if (!lang) {
      if (fileName.startsWith(`${FILE_PREFIX}_`) && fileName.endsWith(".xml")) {
        console.log(`⚠  ${fileName} — skipping (unsupported locale filename)`);
      }
      return;
    }

    if (lang === DEFAULT_LANG) {
      return;
    }

    const stats = syncFile(fileName, sourceXml, sourceRoot);
    results.push({ fileName, lang, stats });
  });

  writeReports(results);
  console.log(`Summary written to ${REPORT_PATH}`);
})();
