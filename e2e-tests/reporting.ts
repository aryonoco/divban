// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, Effect, pipe } from "effect";
import { exec } from "../src/system/exec.ts";
import type { E2EError, E2ETestReport } from "./types.ts";

// Write JSON report
export const writeJSONReport = (
  report: E2ETestReport,
  path: string
): Effect.Effect<void, E2EError> =>
  Effect.gen(function* () {
    const json = JSON.stringify(report, null, 2);
    yield* exec(["sh", "-c", `cat > ${path} <<'EOF'\n${json}\nEOF`]);
    yield* Effect.logInfo(`JSON report written to: ${path}`);
  });

// Write Markdown report
export const writeMarkdownReport = (
  report: E2ETestReport,
  path: string
): Effect.Effect<void, E2EError> =>
  Effect.gen(function* () {
    const markdown = generateMarkdownReport(report);
    yield* exec(["sh", "-c", `cat > ${path} <<'EOF'\n${markdown}\nEOF`]);
    yield* Effect.logInfo(`Markdown report written to: ${path}`);
  });

// Generate Markdown content
const generateMarkdownReport = (report: E2ETestReport): string => {
  const passRate = ((report.passed / report.totalTests) * 100).toFixed(2);

  const failedTestsSection = pipe(
    report.failed,
    (failedCount) => failedCount > 0,
    (hasFailures) =>
      hasFailures
        ? pipe(
            report.results,
            Arr.filter((r) => !r.success),
            Arr.map(
              (r) =>
                `### ${r.testCase.id}\n\n` +
                `- **Service:** ${r.testCase.service}\n` +
                `- **Distro:** ${r.testCase.distro}\n` +
                `- **Command:** ${r.testCase.command} ${r.testCase.args.join(" ")}\n` +
                `- **Exit Code:** ${r.exitCode}\n` +
                `- **Error:**\n\`\`\`\n${r.error}\n\`\`\`\n\n`
            ),
            Arr.join(""),
            (content) => `## Failed Tests\n\n${content}`
          )
        : ""
  );

  const resultsTable = pipe(
    report.results,
    Arr.map((r) => {
      const status = r.success ? "✅ PASS" : "❌ FAIL";
      return `| ${r.testCase.id} | ${r.testCase.service} | ${r.testCase.distro} | ${r.testCase.command} | ${status} | ${r.duration}ms |`;
    }),
    Arr.join("\n")
  );

  return `# divban E2E Test Report

**Start Time:** ${report.startTime}
**End Time:** ${report.endTime}

## Summary

- **Total Tests:** ${report.totalTests}
- **Passed:** ${report.passed}
- **Failed:** ${report.failed}
- **Pass Rate:** ${passRate}%

${failedTestsSection}

## All Results

| Test ID | Service | Distro | Command | Status | Duration |
|---------|---------|--------|---------|--------|----------|
${resultsTable}
`;
};
