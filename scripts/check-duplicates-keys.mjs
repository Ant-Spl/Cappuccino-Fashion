import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FILE_PREFIX = "Fashion";
const ROOT_TAG = "fashion";
const LANG_DIR = "./langs";
const LANG_FILE_PATTERN = /^Fashion_([a-z]{2}(?:_[A-Z]{2})?)\.xml$/;

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
});

function getFilePath(fileName) {
  return path.join(LANG_DIR, fileName);
}

function readXmlFile(fileName) {
  return fs.readFileSync(getFilePath(fileName), "utf-8");
}

function getLang(fileName) {
  return fileName.match(LANG_FILE_PATTERN)?.[1];
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

function collectIds(nodes, occurrences, sectionPath = []) {
  nodes.forEach((node) => {
    const id = node[":@"]?.["@_id"];
    const key = getNodeKey(node);

    if (id) {
      const locations = occurrences.get(id) ?? [];
      locations.push(sectionPath.length > 0 ? sectionPath.join("/") : ROOT_TAG);
      occurrences.set(id, locations);
      return;
    }

    if (key && Array.isArray(node[key])) {
      collectIds(node[key], occurrences, [...sectionPath, key]);
    }
  });
}

function checkFile(fileName) {
  const xml = readXmlFile(fileName);
  const parsed = parser.parse(xml);
  const root = getRootNodes(parsed, fileName);
  const occurrences = new Map();

  collectIds(root, occurrences);

  const duplicates = [...occurrences.entries()]
    .filter(([, locations]) => locations.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (duplicates.length > 0) {
    const duplicateOccurrences = duplicates.reduce(
      (total, [, locations]) => total + locations.length - 1,
      0,
    );

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
    duplicateOccurrences: duplicates.reduce(
      (total, [, locations]) => total + locations.length - 1,
      0,
    ),
  };
}

(function checkAll() {
  if (!fs.existsSync(LANG_DIR)) {
    throw new Error(`Language directory not found: ${LANG_DIR}`);
  }

  const files = fs.readdirSync(LANG_DIR).sort((a, b) => a.localeCompare(b));
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
