You can test with the local account `test-user` / `Password1`

HARDCORE RULES:

- Dev environment runs in Docker. You NEVER run the app directly on your host machine, always use docker compose to start/stop the app, look at logs etc
- After making any changes, run the build and linter/formatter scripts to ensure everything is working and formatted correctly.
- Running the linter/formatter commands is a rare exception to the docker-env rule.
- After code changes that affect the running app, verify the app still works by checking `docker compose logs`
- When installing a package, or adding a docker image or ... you should always verify that the tag/version you are using is the latest unless otherwise instructed. Never use 'latest' of something
- Whenever adding functionality, you should consider whether it makes sense to add/modify the config and allow controlling config via env vars
- There is a rich ecosystem of library/helper type stuff available in this repo. Look to see if there's any existing helpers available before re-implementing things
- You should work TDD-style whenever possible and appropriate
- This app is horizontally scalable, stateless and follows all the 12 factors
- You have access to several MCP servers. Use them a lot to verify your theories
