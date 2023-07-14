# hoverboard 🛹

An IPFS Bitswap Peer in Cloudflare Workers

## Getting started

Install `node` >= 18, and `wrangler` >= 3

Run `npm start` to start a local dev server

```sh
$ npm start
⎔ Starting local server...
[mf:inf] Ready on http://127.0.0.1:8787/
```

Run `npm run dial` to make a test connection to your local dev server

```
npm run dial
Connected to hoverboard 🛹 /ip4/127.0.0.1/tcp/8787/ws/p2p/Qmcv3CsJAN8ptXR8vm5a5GRrzkHGjaEUF9cQRGzYptMwzp
``` 

## Secrets

Set the following with `wrangler secret put <key>`

- AWS_ACCESS_KEY_ID - aws creds
- AWS_SECRET_ACCESS_KEY - aws creds
- PEER_ID_JSON - stringified json peerId spec for this node

