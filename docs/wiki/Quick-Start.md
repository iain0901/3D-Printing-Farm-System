# Quick Start

## Local demo

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

```text
http://127.0.0.1:5173
```

Use the demo login shown on the sign-in screen to enter the production cockpit.

## Optional local API

Run the API in another terminal:

```bash
npm run api
```

Default API URL:

```text
http://127.0.0.1:8797
```

Local API data is stored in:

```text
api/data/layerpilot.db.json
```

## Docker demo

```bash
cp .env.example .env
# edit .env and set real owner credentials before production use
docker compose up --build
```

Open:

```text
http://127.0.0.1:8797
```

Docker Compose starts the web/API service plus the background worker. Data is stored in the `layerpilot-data` Docker volume.

## Useful checks

```bash
npm run build
npm run test
npm run qc
```

Some test suites require a Node version with the built-in `node:sqlite` module. If the system Node does not provide it, run the test command with a newer Node runtime such as Node 24.
