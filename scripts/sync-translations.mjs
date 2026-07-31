import { XMLBuilder, XMLParser } from "fast-xml-parser";
import fs from "node:fs";
import path from "node:path";

const FILE_PREFIX = "Fashion";
const ROOT_TAG = "fashion";
const DEFAULT_LANG = "en";
const LANG_DIR = "./langs";
const EOL = "\n";

// Accept regular locales such as Fashion_pt.xml and regional locales such as
// Fashion_zh_CN.xml. The captured locale is preserved exactly as written.
const LANG_FILE_PATTERN = /^Fashion_([a-z]{2}(?:_[A-Z]{2})?)\.xml$/;

// Keep stdout compact. Large key lists can overflow action inputs or make CI
// logs difficult to use.
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

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  indentBy: "\t",
  preserveOrder: true,
});

function getFileName(lang) {
  return `${FILE_PREFIX}_${lang}.xml`;
}

function getFilePath(fileName) {
  return path.join(LANG_DIR, fileName);
}

function readXmlFile(fileName) {
  return fs.readFileSync(getFilePath(fileName), "utf-8");
}

function writeXmlFile(fileName, xml) {
  const normalized = xml.replace(/\s+$/u, "").concat(EOL);
  fs.writeFileSync(getFilePath(fileName), normalized, "utf-8");
}

function collapseEmptyTags(contents) {
  return contents.replace(/<(\b\w+\b)( [^>]+)><\/\1>/gu, "<$1$2 />");
}

function getLang(fileName) {
  return fileName.match(LANG_FILE_PATTERN)?.[1];
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function getNodeKey(node) {
  return Object.keys(node).find((key) => key !== ":@");
}

function getRootNodes(parsed, fileName) {
  const root = parsed.find(
    (node) => node && Array.isArray(node[ROOT_TAG]),
  )?.[ROOT_TAG];

  if (!root) {
    throw new Error(`${fileName} does not contain a <${ROOT_TAG}> root element`);
  }

  return root;
}

function syncNode(src, dest, stats) {
  src.forEach((srcNode, index) => {
    const srcId = srcNode[":@"]?.["@_id"];

    if (srcId) {
      // Translation node: insert the English fallback only when this ID is
      // completely absent from the destination file.
      const destNode = dest.find((node) => node[":@"]?.["@_id"] === srcId);
      if (!destNode) {
        dest.splice(index, 0, cloneNode(srcNode));
        stats.missing.push(srcId);
      }
      return;
    }

    // Structural node: create an entire missing section, otherwise recurse
    // into the matching section.
    const key = getNodeKey(srcNode);
    if (!key || !Array.isArray(srcNode[key])) {
      return;
    }

    const destIndex = dest.findIndex((node) => node[key] !== undefined);
    if (destIndex === -1) {
      dest.splice(index, 0, cloneNode(srcNode));
      stats.missingSections.push(key);
      return;
    }

    if (!Array.isArray(dest[destIndex][key])) {
      throw new Error(`Expected <${key}> to contain child nodes`);
    }

    syncNode(srcNode[key], dest[destIndex][key], stats);
  });
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
    console.log(
      `   … ${hiddenSectionCount} more section(s) omitted from CI log`,
    );
  }
}

function formatReport(results) {
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

  return lines.join(EOL).concat(EOL);
}

function writeReports(results) {
  const report = formatReport(results);
  fs.writeFileSync(REPORT_PATH, report, "utf-8");

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report, "utf-8");
  }
}

function syncFile(fileName, srcRoot) {
  const xml = readXmlFile(fileName);
  const parsed = parser.parse(xml);
  const destRoot = getRootNodes(parsed, fileName);
  const stats = { missing: [], missingSections: [] };

  syncNode(srcRoot, destRoot, stats);
  logStats(fileName, stats);

  if (stats.missing.length > 0 || stats.missingSections.length > 0) {
    const updatedXml = builder.build(parsed);
    writeXmlFile(fileName, collapseEmptyTags(updatedXml));
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
  const sourceParsed = parser.parse(sourceXml);
  const sourceRoot = getRootNodes(sourceParsed, sourceFileName);

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

    const stats = syncFile(fileName, sourceRoot);
    results.push({ fileName, lang, stats });
  });

  writeReports(results);
  console.log(`Summary written to ${REPORT_PATH}`);
})();
