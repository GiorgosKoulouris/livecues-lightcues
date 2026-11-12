#!/bin/sh
# Prints one version's section of a Keep a Changelog file: the release notes.
#   sh scripts/changelog-section.sh <version> [file]
# The section runs from its `## [<version>]` heading to the next `## [`
# heading or the end. Prints the body without its heading, trimmed of blank
# lines. Exits 1 when the section is missing, or holds nothing but blank
# lines and subheadings. Installed by the branch-flow skill.

if [ -z "$1" ]; then
  echo "Usage: sh scripts/changelog-section.sh <version> [file]" >&2
  exit 2
fi
version=$1
file=${2:-CHANGELOG.md}

if [ ! -f "$file" ]; then
  echo "$file: not found." >&2
  exit 1
fi

awk -v version="$version" -v file="$file" '
  { sub(/\r$/, "") }
  !found {
    prefix = "## [" version "]"
    if (substr($0, 1, length(prefix)) == prefix) {
      rest = substr($0, length(prefix) + 1)
      if (rest == "" || rest ~ /^[ \t]/) found = 1
    }
    next
  }
  /^## \[/ { exit }
  {
    lines[++n] = $0
    if ($0 ~ /[^ \t]/) {
      if (!first) first = n
      last = n
      if ($0 !~ /^#/) content = 1
    }
  }
  END {
    if (!found) { print file ": No section for " version "." > "/dev/stderr"; exit 1 }
    if (!content) { print file ": The section for " version " is empty." > "/dev/stderr"; exit 1 }
    for (i = first; i <= last; i++) print lines[i]
  }
' "$file"
