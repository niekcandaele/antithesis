HARDCORE RULES:

- Dev environment runs in Docker. You NEVER run the app directly on your host machine, always use docker compose to start/stop the app, look at logs etc
- After making any changes, run the build and linter/formatter scripts to ensure everything is working and formatted correctly.
- Running the linter/formatter commands is a rare exception to the docker-env rule.
- After code changes that affect the running app, verify the app still works by checking `docker compose logs`
- When installing a package, or adding a docker image or ... you should always verify that the tag/version you are using is the latest unless otherwise instructed. Never use 'latest' of something
