# @presmium/classroom-server

Presmium's classroom sync server: the y-websocket rooms classroom sessions sync through.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

```sh
npx presmium-classroom-server --port 1234
```

Documents point to it in their headmatter: `presmium: { presmium.session: { server: ws://<host>:1234 } }`. `presmium dev` and `presmium serve` also run one on their own port. Options: `--port`, `--host`, `--deck` (where archived classrooms are written). Run it on the classroom's own network: anyone with a join link can join.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md)
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
