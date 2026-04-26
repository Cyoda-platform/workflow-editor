# `@cyoda/workflow-react`

React editor shell for Cyoda workflows, built on top of the core, graph,
layout, and viewer packages.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-layout @cyoda/workflow-viewer @cyoda/workflow-react react react-dom reactflow
```

## Runtime notes

- Intended for browser-based React applications with CSS bundling enabled.
- Imports `reactflow/dist/style.css` as part of the public entrypoint.
- Not server-renderable in a plain Node.js runtime without a bundler setup that handles CSS imports.

## Highlights

- Render the full workflow editing experience
- Provide inspector, save flow, and modal building blocks
- Integrate with React Flow-based canvas interactions

## Documentation

See the
[repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme)
for package relationships, usage examples, and release notes.

## License

Apache-2.0
