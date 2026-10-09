# Intelligent UI external-loading trial

Version: 2.36.100. This is an isolated test build, not a Greasy Fork production release.

Install `ChatGPT-to-Notion-external-test.user.js` from this branch to replace the existing ChatGPT to Notion Exporter userscript, then refresh ChatGPT. Existing Notion configuration remains under the same userscript name and namespace.

The userscript is about 133 KB. Only replies carrying an Intelligent UI marker trigger a runtime download. The first UI export downloads a runtime template pinned to commit `9afd3d2f1aa9677f0796c31bb92165102d882cc4`; subsequent exports reuse the Tampermonkey cache, including after refresh. Plain replies continue through the existing path.

The exported HTML still includes its runtime dependencies so existing Notion exports do not depend on this test branch. Map tiles require a network connection. Buttons that ask ChatGPT to generate another response provide a link to the original conversation.

The production `ChatGPT exporter.js` and the root README are unchanged on this branch; `main` is not updated for this trial.
