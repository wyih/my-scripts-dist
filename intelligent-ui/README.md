# Intelligent UI export runtime

`exporter.js` is inserted into the single distributable `ChatGPT exporter.js` by `build.mjs`. Keep ordinary exports in the existing pipeline; only `[data-dil-message-id]` roots create UI placeholders. Bind every program to its exact assistant message ID. Never execute answer code in the ChatGPT userscript context.

The renderer carries the form-submit callback fix verified in the Notion HTML sandbox. The original DIL program is embedded as a function declaration at export time, avoiding `eval` / `new Function` during rendering. Runtime data and third-party JS are compressed; fonts and downloaded answer images are embedded. Notion credentials never enter the HTML or runtime download request.

## Build and check

```sh
npm ci --prefix intelligent-ui
npm run build --prefix intelligent-ui
npm ci
npm test
```

A local trial build is generated with `node intelligent-ui/build-test.mjs`. It embeds compressed runtime templates and only unpacks them when a UI reply is exported, so testing needs no GitHub push. Its version is `2.36.99`, below the planned `2.37` release. Keep that generated trial under ignored `artifacts/` and publish only after the user verifies it.

For the external-loading trial, publish only the two runtime templates and notices to an isolated test branch, then run `node intelligent-ui/build-external-test.mjs <runtime-commit-sha>`. This creates version `2.36.100`, pins runtime downloads to that commit and uses a separate cache key. The generated `.user.js` can be served from the same test branch without updating the production userscript or README on `main`.

Commit both generated templates and the generated userscript. `runtime-v1.html` includes Mermaid flowcharts; `runtime-v1-full.html` includes other Mermaid types and is selected when needed. Templates contain no sample conversation, account information, or answer program. Downloaded templates are cached in memory and in Tampermonkey storage under their versioned filenames. Bump the filenames in both the builder and loader when changing published runtime assets. Cache access happens only after detecting a UI reply.

The production userscript fetches runtime templates as text with `GM_xmlhttpRequest`. `@require` executes a library in the userscript context, whereas these libraries must run in the exported Notion HTML. `@resource` can supply source text but preloads resources even for users who never export a UI reply. Keeping the existing lazy text loader avoids both costs and preserves self-contained exports.

`engine-v14.js` is the state/render-operation engine extracted from OpenAI's publicly served DIL v14 runner, with an entry point for a predeclared program:
https://cdn.platform.openai.com/assets/dil/runner-BFRd8kCb.js
The transport and dynamic source evaluator are replaced; answer-specific business logic is unchanged. OpenAI retains rights to its runtime. Third-party library notices are in `THIRD_PARTY_NOTICES.txt` and at the end of bundled JS.

The adapter covers common DIL controls, maps, charts, formulas, diagrams, and the Cite/Link/AsyncImage host components. It does not reproduce the entire ChatGPT host: generation of further model responses opens the source conversation. Unknown required host components fail with a visible fallback notice. External map tiles remain online. Changing ChatGPT's private payload format may require updating the extractor.

Tests use jsdom for DOM and request contracts, without opening a browser or a user profile. Native Notion rendering was verified separately during development; DOM tests do not assert pixel layout.
