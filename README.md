# @webship.co/workspace-leantime

Leantime, the open-source project management software, for the [Webship Workspace](https://github.com/webship/workspace),
a container-based workspace (DDEV by default). The plugin brings:

- **a builder**, `cmd-leantime-project.sh`: a real Leantime site from Leantime's own image on the project's own MariaDB,
  on DDEV, installed by Leantime's own installer, its default accounts in their roles of a sample project, and its
  tasks, sprint, comments and logged time;
- **a tool**, `cmd-tools-leantime-cli.sh`: what a site is and its accounts, Leantime's own console commands in its
  container, the default accounts, the sample content, a clean-up after a stopped test run, and the dashboard's
  connection;
- **the step pack** [`@webship-js/leantime-steps`](https://github.com/webship/leantime-steps) wired into the
  workspace's testing setup, with a first feature for a site;
- **the tasks as work items** of the tracker family
  ([`@webship.co/workspace-tracker`](https://github.com/webship/workspace-tracker)): the LEANTIME menu on a project row
  lists them, reads one, analyzes it, and lets the workspace's AI CLI work it on a branch, with a person in charge;
- **AI items** in their folders: three agents, a skill, a command and two prompts.

## Install

From the workspace's root, the same four steps as Settings → Plugins:

```bash
bash core/scripts/plugins.sh --require @webship.co/workspace-leantime
bash core/scripts/plugins.sh --activate leantime --with-needs
bash core/scripts/plugins.sh --install leantime --with-needs
bash core/scripts/plugins.sh --configure leantime
```

## What it needs

- A sites folder: one of the `dev`, `test`, `sandboxes` or `demos` plugins. The commands are placed there.
- The AI folders `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`, where its AI items land.
- DDEV, the container runtime Leantime is proven on so far. Docker Compose, Podman and Kubernetes are not proven for
  it yet: asked for one, the builder says so and changes nothing.
- A download of about 320 MB for Leantime's image the first time (about 700 MB on disk), and memory: the builder asks
  for 1.5 GB free before it starts (`free -m`).

## Build a site

```bash
cd ~/workspace/sandboxes                      # or dev, test, demos
bash cmd-leantime-project.sh mysite --install --add-users --sample-content
```

| Flag | What it does |
| --- | --- |
| `--install` | Runs Leantime's own installer and makes the workspace account (`account` of `core/config/settings.yml`) the site's owner, of the company Webship. Leantime asks a password of at least eight characters |
| `--add-users` | With `--install`: the default accounts, in their roles of the project Webship site |
| `--sample-content` | With `--install --add-users`: the tasks of Webship site, its sprint "Sprint 1", two comments and logged time |
| `--release <X.Y.Z>` | The release of Leantime's image: 3.17.0 by default |
| `--api-limit <number>` | The calls of its API Leantime allows an account a minute on the site, a dev and test setting: 1000 by default, where Leantime's own default is 120 |
| `--login-limit <number>` | The logins Leantime allows from one address a minute on the site, a dev and test setting: 100 by default, where Leantime's own default is 20 |
| `--runtime ddev` | DDEV, the runtime proven for Leantime so far (the default, or `container.runtime` of `settings.yml`) |
| `--launch` | Open the site when it is ready |

A project of the same name is deleted first, with its database and its files. Leantime's own image
(`leantime/leantime`: its web server and PHP in one container) is a service of a generic project, on the project's
MariaDB 11.4, at `https://mysite.ddev.site`. The project's web container keeps the mail catcher, at
`https://mysite.ddev.site:8026`, where the site's mail goes. What Leantime keeps beside its database (its files, its
plugins, its logs) is in volumes named after the project: removing the project removes them with it.

| Image | What it is | Source and licence |
| --- | --- | --- |
| `docker.io/leantime/leantime:3.17.0` | Leantime: its web server and PHP (`--release` picks another tag) | [Leantime/leantime](https://github.com/Leantime/leantime), AGPL-3.0 |

**The database is MariaDB.** Leantime supports MySQL 8.0+ or MariaDB 10.6+ (its own README); the Workspace uses
MariaDB 11.4, so a site's database is the same on every runtime the Workspace has.

The install is Leantime's own: its console installer makes the database and the workspace account as the site's
owner, with no telemetry. **Leantime's own onboarding project, "My Project", is empty on purpose.** Its installer fills
that project with sample tasks as the person who installs it, and a console run is no person, so that part is refused;
the builder says so when it installs. The sample project is the builder's own, Webship site. The workspace account and
the default accounts are marked as past Leantime's first-login window, so they land on their work; Leantime still shows
a person the window of help of a screen once a session, which the step pack closes by its own button.

The site's own values, its session key, are made for it and kept in `leantime/env` of the project, which only you can
read. The builder never prints them.

**The limits are a dev and test setting.** Leantime allows a set number of API calls a minute for an account (120 by
default) and of logins from one address (20). A test suite reads and logs in far more often than a person, so a site
the workspace builds allows 1000 and 100: `--api-limit` and `--login-limit` (or `site_leantime_api_limit` and
`site_leantime_login_limit` in the folder's settings) set others, and `--api-limit 120 --login-limit 20` builds a site
with Leantime's own defaults. Only the sites the builder makes get them: a Leantime you point the dashboard at, with
`--connect` or by hand, keeps its own limits, and the plugin never changes them.

### The default accounts

| Account | Address | Role |
| --- | --- | --- |
| `owner` | `owner@example.com` | Company Manager, in the team of Webship site |
| `member` | `member@example.com` | Editor, in the team |
| `commenter` | `commenter@example.com` | Commenter, in the team: reads and comments, and changes no task |
| `reader` | `reader@example.com` | Read Only, in the team: reads, and neither changes nor comments |
| `stranger` | `stranger@example.com` | Editor, outside the team: Webship site is refused to it |

Each has the password of the workspace's other default lists, `dD.123123ddd`, logs in with its address, and shows as
its whole name ("Member Test"). They are configuration: a test suite never creates or deletes one.
`bash cmd-tools-add-users.sh mysite leantime` and `bash cmd-tools-cancel-users.sh mysite leantime` (the row's Tests
menu) add them and keep them from logging in.

### The sample content

In Webship site: "The greeting script says Helo instead of Hello" (#1, by the owner, In Progress, high, assigned to the
member, tagged bug, in the sprint "Sprint 1", with the owner's comment and 1.5 hours the member logged) and "The usage
line spells greeting as greting" (#2, by the member, New, with the commenter's comment, which the tracker counts as from
outside the project). The builder makes them as their authors, with Leantime's own code in its container: that is the
builder's content only. The provider below acts only through Leantime's API, as the connected person.

## The tool

```bash
bash cmd-tools-leantime-cli.sh mysite                                 # what the site is: release, address, accounts
bash cmd-tools-leantime-cli.sh mysite --run "about"                   # one of Leantime's own console commands, in its container
bash cmd-tools-leantime-cli.sh mysite --sample-content                # the sample content, where it is missing
bash cmd-tools-leantime-cli.sh mysite --tidy                          # what a stopped test run left
bash cmd-tools-leantime-cli.sh mysite --add-users                     # the default accounts and their roles
bash cmd-tools-leantime-cli.sh mysite --cancel-users                  # keep them from logging in
bash cmd-tools-leantime-cli.sh mysite --connect member                # the dashboard reads this site as member
```

`--connect <login>` makes a new bearer token of the account with Leantime's own console (`auth:create-bearer-token`),
revokes the earlier one the tool made for it, and writes the token, with the site's address, into
`core/config/plugin.leantime.settings.yml`, and the sample project as the default one when none was set. The token is
never shown. The dashboard then acts as that person.

`--tidy` deletes for good, with no way back. It removes the tasks a stopped test run left: titled "Webship test …",
made by one of the default accounts in Webship site, with their comments, logged time and history. **Leantime's own
delete of a task keeps its comments, its logged time and its history** in its database, out of every screen and every
answer of its API: tidy removes those rows too, when a default account wrote them. A task with another title
("Webship testing plan") or another author stays, and so does everything of other people.

## The tasks as work items

The plugin is a provider of the tracker family. With a Leantime address and a bearer token in its settings (`--connect`
writes both for a site the workspace built; for your own Leantime, `php bin/leantime auth:create-bearer-token` makes
one), the project rows of sites and code folders carry the **LEANTIME** menu, once they have a Leantime project to
work against (`default_scope` as the project's name, `Webship site`, or one remembered from the list):

- **The list**: the open tasks (their status is not of the DONE type), mine, assigned to someone, the current
  sprint's (the sprint whose dates hold today), and a search in the title. Milestones are not tasks: the lists leave
  them out.
- **One task** (`#1`, a number the whole site shares): its text, its author and its last editor, each with their
  standing, and its comments.
- **Analyze**: the AI CLI reads it and proposes a plan, with reading tools only.
- **Do the work**: the AI CLI works it on a new branch of the project (or a worktree), made from the default branch of
  the project's remote, in a screen session you watch. The task is saved as data, never as instructions; an HTML
  comment in its text stays as it was written.
- **Result**: the branch, its commits and the notes, the reviewer role, and the comment to post.
- With writes on (`allow_writes: true`): a comment, a status of the project, tags (Leantime's labels: a tag holds no
  comma), an assignee (`me`, or an Editor or above of the project by their whole name, first name or address: the
  provider gives no task to a Commenter or a Read Only person, though Leantime's own list offers them), the time spent
  (Leantime's Time Tracking: hours on today's date, of the kind "General, billable") and a new task, each your click
  after a preview. The text the dashboard writes is Markdown; Leantime keeps HTML, so the plugin turns it into the HTML
  Leantime's editor reads, with every character of the text escaped.

**Who is inside.** Each person's standing is their role in the project: the project's own role when it sets one, else
their role on the site. An Owner, an Administrator and a Company Manager are owners of the project, an Editor a
member: they are inside. A Commenter and a Read Only person, who may change no task, and someone not in the project's
team are outside. A task is from outside when its creator is outside, or, when its history names a last editor, when
that last editor is: such a task is analyze only unless you confirm it by its author's name
(`outsider_items: refuse` refuses it). Each comment's author counts on their own, so a Commenter's word on a task an
Editor made is a comment from outside.

**The last editor** is the person of the newest change of the title or the description in the task's history, else
the creator.

**Leantime's limit of API calls.** Leantime allows 120 API calls a minute for an account, by default. The provider
keeps the token's account, the project, its team, its statuses and its sprints for five minutes, reads a list in one
call (at most 500 tasks), and never makes a call per task of a list.

**Credentials.** The token travels in a file only you can read, never on a command line. Before anything is posted,
the text is checked for credentials: the ones the tracker family knows, the token of the settings, and anything shaped
like a Leantime API key (`lt_`, a name, `_` and its secret).

Leantime opens no pull request: push the branch and open its pull request from the project's forge menu (GITHUB,
GITLAB) when its remote is on a forge.

### Settings

`core/config/plugin.leantime.settings.yml` (Settings → Plugins → Leantime):

| Key | What it is |
| --- | --- |
| `url` | The Leantime address, without a trailing slash |
| `token` | A bearer token of the account the dashboard reads (and, with writes on, writes) as. Never printed |
| `allow_writes` | Comments, statuses, tags, assignees, logged time and new tasks to Leantime; `false` by default |
| `max_agents` | Author sessions at once |
| `default_scope` | The Leantime project a workspace project works against when it remembers none: its name, `Webship site` |
| `scopes` | The Leantime projects (their names) the list may be switched to; empty is any project the account is in the team of |
| `work_in` | `branch` (a new branch in the project) or `worktree` (outside the workspace folders) |
| `sandbox` | `required` (the AI CLI's sandbox, and no session without it) or `off` (a person's choice) |
| `network_domains` | The domains the sandbox allows (the project's package registries) |
| `allow_web` | Web fetch and web search in the author session |
| `comments_from` | The comments a saved task keeps: `members` (the project's Editors and above), `all`, `none` |
| `outsider_items` | A task from outside the project: `analyze` (work it only after a confirmation by name) or `refuse` |

## Testing a site

```bash
bash cmd-tools-testing.sh mysite                       # webship-js, the step pack, the users registry, a first feature
bash cmd-tools-testing.sh mysite --run
```

The testing setup adds `@webship-js/leantime-steps` to the project, its step definitions to `cucumber.js`, the
managing account (`owner`, which makes and removes the test content through the site's own API), the project of the
steps (`Webship site`), the users registry (`owner`, `member`, `commenter`, `reader`, `stranger`, each logging in with
its address), and `tests/features/site.feature`, whose first scenario checks the site opens on its login form. The
suite leaves the site as it found it; what Leantime keeps of the tasks it removed goes with `--tidy`.

## AI items

| Kind | Item | What it is for |
| --- | --- | --- |
| Agent | `leantime-site-builder` | Build, look after and remove Leantime sites |
| Agent | `leantime-tester` | Test a site with the step pack: look at the screens first, write scenarios, run, read |
| Agent | `leantime-issue-worker` | Work a task on a branch, the writes left to a person |
| Skill | `leantime-scenarios` | The pack's phrases by area, the traps found on real sites, whole features |
| Command | `/leantime-test <site>` | Set the testing stack up, run the suite, report |
| Prompt | `leantime-build-and-test` | Build a site and prove it with its first feature |
| Prompt | `leantime-issue-to-branch` | Work a task on a branch |

## License

ISC (see `LICENSE`). Leantime itself is AGPL-3.0: the plugin runs Leantime's own image and carries none of its code.
