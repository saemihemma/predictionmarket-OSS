const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOST_LABEL_PATTERN = /^[a-z0-9-]+$/i;

function splitAuthorityAndSuffix(value: string): { authority: string; suffix: string } {
  const separatorIndex = value.search(/[/?#]/);
  if (separatorIndex === -1) {
    return { authority: value, suffix: "" };
  }

  return {
    authority: value.slice(0, separatorIndex),
    suffix: value.slice(separatorIndex),
  };
}

function splitHostAndPort(authority: string): { host: string; port: string | null } | null {
  if (authority.startsWith("[") || authority.endsWith("]")) {
    return null;
  }

  const colonCount = authority.split(":").length - 1;
  if (colonCount > 1) {
    return null;
  }

  if (colonCount === 0) {
    return { host: authority, port: null };
  }

  const separatorIndex = authority.lastIndexOf(":");
  const host = authority.slice(0, separatorIndex);
  const port = authority.slice(separatorIndex + 1);

  if (!host || !port || !/^\d+$/.test(port)) {
    return null;
  }

  return { host, port };
}

function isValidPublicHostname(hostname: string): boolean {
  if (!hostname || hostname.includes("..") || !hostname.includes(".")) {
    return false;
  }

  if (IPV4_PATTERN.test(hostname)) {
    return false;
  }

  const labels = hostname.split(".");
  if (labels.some((label) => label.length === 0)) {
    return false;
  }

  if (
    labels.some(
      (label) =>
        !HOST_LABEL_PATTERN.test(label) || label.startsWith("-") || label.endsWith("-"),
    )
  ) {
    return false;
  }

  const topLevelDomain = labels[labels.length - 1];
  return /[a-z]/i.test(topLevelDomain);
}

export function isValidPublicSourceInput(value: string): boolean {
  const trimmedValue = value.trim();
  if (!trimmedValue || /\s/.test(trimmedValue)) {
    return false;
  }

  const schemeMatch = trimmedValue.match(SCHEME_PATTERN);
  let remainder = trimmedValue;

  if (schemeMatch) {
    const [, scheme, rest] = schemeMatch;
    if (!/^https?$/i.test(scheme)) {
      return false;
    }
    remainder = rest;
  } else if (trimmedValue.includes("://")) {
    return false;
  }

  const { authority, suffix } = splitAuthorityAndSuffix(remainder);
  if (!authority || authority.includes("@")) {
    return false;
  }

  const hostAndPort = splitHostAndPort(authority);
  if (!hostAndPort || !isValidPublicHostname(hostAndPort.host)) {
    return false;
  }

  if (suffix.includes(" ")) {
    return false;
  }

  return true;
}
