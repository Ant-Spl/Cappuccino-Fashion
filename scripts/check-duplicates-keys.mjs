import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FILE_PREFIX = "Fashion";
const ROOT_TAG = "fashion";
const LANG_DIR = "./langs";
const LANG_FILE_PATTERN = /^Fashion_([a-z]{2}(?:_[A-Z]{2})?)\.xml$/;

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
  return root;
}

function collectIds(nodes, occurrences, sectionPath = []) {
  nodes.forEach((node) => {
    const id = node.attributes.get("id");

    if (id) {
      const locations = occurrences.get(id) ?? [];
      locations.push(sectionPath.length > 0 ? sectionPath.join("/") : ROOT_TAG);
      occurrences.set(id, locations);
      return;
    }

    collectIds(node.children, occurrences, [...sectionPath, node.name]);
  });
}

function checkFile(fileName) {
  const xml = readXmlFile(fileName);
  const roots = parseXmlTree(xml, fileName);
  const root = findRoot(roots, fileName);
  const occurrences = new Map();

  collectIds(root.children, occurrences);

  const duplicates = [...occurrences.entries()]
    .filter(([, locations]) => locations.length > 1)
    .sort(([left], [right]) => left.localeCompare(right));

  const duplicateOccurrences = duplicates.reduce(
    (total, [, locations]) => total + locations.length - 1,
    0,
  );

  if (duplicates.length > 0) {
    console.log(
      `✖  ${fileName} — ${duplicates.length} duplicated key(s), ${duplicateOccurrences} extra occurrence(s):`,
    );

    duplicates.forEach(([id, locations]) => {
      const uniqueLocations = [...new Set(locations)];
      const locationText = uniqueLocations.length > 0
        ? ` [${uniqueLocations.join(", ")}]`
        : "";
      console.log(`     ~ ${id} (${locations.length} occurrences)${locationText}`);
    });
  } else {
    console.log(`✓  ${fileName} — no duplicates`);
  }

  return {
    duplicateKeys: duplicates.length,
    duplicateOccurrences,
  };
}

(function checkAll() {
  if (!fs.existsSync(LANG_DIR)) {
    throw new Error(`Language directory not found: ${LANG_DIR}`);
  }

  const files = fs.readdirSync(LANG_DIR).sort((left, right) => left.localeCompare(right));
  const changedFiles = process.env.CHANGED_FILES
    ? new Set(
        process.env.CHANGED_FILES
          .split(/\s+/u)
          .map((file) => path.basename(file))
          .filter(Boolean),
      )
    : null;

  const filesToCheck = files.filter((fileName) => {
    if (!getLang(fileName)) {
      return false;
    }

    if (changedFiles && !changedFiles.has(fileName)) {
      return false;
    }

    return true;
  });

  if (filesToCheck.length === 0) {
    console.log("No matching Fashion language files to check.");
    return;
  }

  console.log(`Checking ${filesToCheck.length} file(s): ${filesToCheck.join(", ")}\n`);

  let totalDuplicateKeys = 0;
  let totalDuplicateOccurrences = 0;

  filesToCheck.forEach((fileName) => {
    const result = checkFile(fileName);
    totalDuplicateKeys += result.duplicateKeys;
    totalDuplicateOccurrences += result.duplicateOccurrences;
  });

  if (totalDuplicateKeys > 0) {
    console.log(
      `\n✖  ${totalDuplicateKeys} duplicated key(s) with ${totalDuplicateOccurrences} extra occurrence(s) across ${filesToCheck.length} file(s)`,
    );
    process.exit(1);
  }

  console.log(
    `\n✓  All ${filesToCheck.length} checked file(s) are duplicate-free`,
  );
})();
