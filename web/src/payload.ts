import { decodeBase64 } from "./utils/base64";
import { SHAPE_CONFIG } from "./constants.js";

const LEGACY_TYPST_PREFIX = "TYPST:";

export type TypstSource = {
  preamble: string;
  body: string;
};

/**
 * Checks if an alt text description contains a legacy Typst payload.
 */
export function isLegacyTypstPayload(altTextDescription: string | undefined): boolean {
  return !!(altTextDescription && altTextDescription.startsWith(LEGACY_TYPST_PREFIX));
}

/**
 * Extracts Typst code from a legacy payload.
 */
export function extractLegacyTypstCode(payload: string): string {
  const base64Payload = payload.split(LEGACY_TYPST_PREFIX)[1];
  return decodeBase64(base64Payload);
}

/**
 * Converts legacy payload data to the current Typst source structure.
 */
export function getLegacyTypstSource(payload: string): TypstSource {
  return {
    preamble: "",
    body: extractLegacyTypstCode(payload),
  };
}

/**
 * Serializes Typst source for storage in a shape-scoped custom XML part.
 */
export function serializeTypstSource(source: TypstSource): string {
  const documentNode = document.implementation.createDocument(
    SHAPE_CONFIG.CUSTOM_XML.NAMESPACE,
    SHAPE_CONFIG.CUSTOM_XML.ROOT,
    null,
  );
  const root = documentNode.documentElement;

  const preambleNode = documentNode.createElementNS(
    SHAPE_CONFIG.CUSTOM_XML.NAMESPACE,
    SHAPE_CONFIG.CUSTOM_XML.PREAMBLE_NODE,
  );
  preambleNode.textContent = source.preamble;

  const bodyNode = documentNode.createElementNS(
    SHAPE_CONFIG.CUSTOM_XML.NAMESPACE,
    SHAPE_CONFIG.CUSTOM_XML.BODY_NODE,
  );
  bodyNode.textContent = source.body;

  root.appendChild(preambleNode);
  root.appendChild(bodyNode);

  return new XMLSerializer().serializeToString(documentNode);
}

/**
 * Parses Typst source from a shape-scoped custom XML part.
 */
export function parseTypstSource(xml: string): TypstSource | null {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    return null;
  }

  const preambleNode = documentNode
    .getElementsByTagNameNS(SHAPE_CONFIG.CUSTOM_XML.NAMESPACE, "preamble")
    .item(0);

  const bodyNode = documentNode
    .getElementsByTagNameNS(SHAPE_CONFIG.CUSTOM_XML.NAMESPACE, "body")
    .item(0);

  if (preambleNode === null || bodyNode === null) {
    return null;
  }

  return {
    preamble: preambleNode.textContent,
    body: bodyNode.textContent,
  };
}
