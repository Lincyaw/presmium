# @lincyaw/classroom-server

Presmium's classroom sync server: the y-websocket rooms classroom sessions sync through.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Usage

```sh
pnpm exec presmium-classroom-server --port 1234
```

Documents point to it through `metadata.presmium["presmium.session"].server` in `lecture.json`. `presmium dev` and `presmium serve` also run one on their own port. Options: `--port`, `--host`, `--deck` (where archived classrooms are written). Run it on the classroom's own network: anyone with a join link can join.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json)

## License

Apache-2.0
