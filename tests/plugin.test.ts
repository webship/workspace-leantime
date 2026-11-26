import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { assistantContext, PLATFORM, COMMANDS, AGENTS, SKILLS, AI_COMMANDS, PROMPTS } from '../src/index';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = pkg.workspacePlugin;
const FUN = read('scripts/functions/fun-leantime.sh');
const SITE = read('scripts/leantime-site.php');
/** The part of the site script that answers one verb. */
const verb = (name: string) => {
  const start = SITE.indexOf(`$verb === '${name}'`);
  assert.ok(start > 0, `the site script answers ${name}`);
  const next = SITE.indexOf('$verb === ', start + 10);
  return SITE.slice(start, next > 0 ? next : SITE.length);
};

test('the manifest names the platform, and every file it names ships', () => {
  assert.strictEqual(manifest.name, PLATFORM);
  const named = [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args, ...manifest.scripts.machine,
    ...manifest.ai.agents, ...manifest.ai.skills, ...manifest.ai.commands, ...manifest.ai.prompts, ...manifest.features, manifest.settingsTemplate, manifest.labels];
  for (const f of named) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  for (const f of named) assert.ok(pkg.files.includes(f.split('/')[0]), `${f} is published with the package`);
  assert.deepStrictEqual(manifest.commands.files.map((f: string) => path.basename(f)), COMMANDS);
  assert.deepStrictEqual(manifest.ai.agents.map((f: string) => path.basename(f, '.md')), AGENTS);
  assert.deepStrictEqual(manifest.ai.skills.map((f: string) => path.basename(f)), SKILLS);
  assert.deepStrictEqual(manifest.ai.commands.map((f: string) => path.basename(f, '.md')), AI_COMMANDS);
  assert.deepStrictEqual(manifest.ai.prompts.map((f: string) => path.basename(f, '.md')), PROMPTS);
  assert.deepStrictEqual(manifest.commands.types, ['sites'], 'the commands go to sites folders only');
  assert.deepStrictEqual(manifest.typeActions, { leantime: ['sites', 'code'] }, 'the LEANTIME menu on the rows of sites and code folders');
  // The machine files land side by side in core/scripts/plugins/leantime/: no two may share a name.
  const names = manifest.scripts.machine.map((f: string) => path.basename(f));
  assert.strictEqual(new Set(names).size, names.length, 'the machine files have names of their own');
  assert.deepStrictEqual(names, ['docker-compose.leantime.yaml', 'leantime-site.php', 'site.feature']);
  assert.deepStrictEqual(manifest.features, ['features/leantime.feature']);
  assert.strictEqual(manifest.featuresSite, undefined, 'a site for the features needs a runtime CI has: Leantime is proven on DDEV only so far');
  assert.deepStrictEqual(pkg.dependencies, { '@webship.co/workspace-tracker': '^1.0.2' });
  assert.ok(manifest.summary.length <= 110, 'the catalogue line shows at most 110 characters');
});

test('every command finds the workspace by itself, names its folder, and sources its args from where the installer puts them', () => {
  for (const f of manifest.commands.files) {
    const src = read(f);
    assert.match(src, /^#!\/usr\/bin\/env bash/, `${f} is a bash script`);
    assert.match(src, /WORKSPACE_SCRIPTS="\$\{WORKSPACE_SCRIPTS:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\.\/core\/scripts" && pwd\)\}"/, `${f} locates the tooling from its own path`);
    assert.match(src, /workspace\.__WORKSPACE__\.settings\.yml/, `${f} loads the settings of the folder it is installed into`);
    assert.match(src, /source \$\{WORKSPACE_SCRIPTS\}\/plugins\/leantime\/args\/arg-[a-z-]+\.sh \|\| exit 1 ;/, `${f} reads its arguments from the plugin's args`);
    const last = src.trim().split('\n').pop() as string;
    assert.match(FUN, new RegExp(`^function ${last.replace(/ ;$/, '')}\\(\\)`, 'm'), `${f} ends by calling a function the plugin defines`);
  }
  assert.match(read('commands/cmd-leantime-project.sh'), /^# workspace-name: Leantime \(project management\)$/m, 'the builder carries the name the Build list shows');
  assert.doesNotMatch(read('commands/cmd-tools-leantime-cli.sh'), /^# workspace-name:/m, 'a tool is not a builder');
});

test('every shell script parses', () => {
  for (const f of [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args]) {
    const r = spawnSync('bash', ['-n', path.join(PKG, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
});

const PHP = spawnSync('php', ['--version'], { encoding: 'utf8' }).status === 0;

test('the site script is PHP that parses', { skip: PHP ? false : 'no php on this machine (the workspace runs PHP in containers only); the CI runner has one' }, () => {
  const r = spawnSync('php', ['-l', path.join(PKG, 'scripts/leantime-site.php')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('the site script runs with Leantime\'s own code, and each verb does what it says', () => {
  assert.match(SITE, /^\$app = require_once '\/var\/www\/html\/bootstrap\/app\.php';$/m, 'Leantime\'s own application');
  assert.match(SITE, /^\$kernel->bootstrap\(\);$/m);
  for (const name of ['version', 'install', 'defaults', 'accounts', 'content', 'tidy', 'list', 'token', 'counts']) verb(name);
  // The installer is Leantime's own; what it cannot do from a console is said, and the first login is done.
  const install = verb('install');
  assert.match(install, /console\('db:migrate', \[/, 'Leantime\'s console installer');
  assert.match(install, /\(int\) \$user\['role'\] !== ROLES\['owner'\]/, 'the account is the site\'s owner, or the install failed');
  assert.match(install, /setting\("user\.\{\$user\['id'\]\}\.firstLoginCompleted", '1'\)/);
  assert.match(install, /My Project, is empty on purpose/, 'the empty onboarding project is said');
  assert.match(verb('defaults'), /setting\('companysettings\.telemetry\.optOut', 'true'\)/, 'no telemetry');
  // The sample content is made as its authors (the builder's own content); the provider never does this.
  assert.match(SITE, /app\(Leantime\\Domain\\Auth\\Services\\Auth::class\)->setUserSession\(\$full\)/);
  assert.match(verb('content'), /act_as\('member@example\.com'\)/);
  assert.match(verb('content'), /act_as\('commenter@example\.com'\)/, 'a comment from outside the project\'s editors');
  assert.doesNotMatch(read('src/lib/tracker.ts'), /setUserSession|act_as|leantime-site\.php/, 'the provider acts only through the API, with the connected person\'s token');
  // A new token revokes the earlier one of the same name, and is said once, for the settings writer.
  const token = verb('token');
  assert.match(token, /DB::table\('zp_access_tokens'\)->where\(\['tokenable_id' => \$user\['id'\], 'name' => TOKEN_NAME\]\)->delete\(\);/);
  assert.match(token, /console\('auth:create-bearer-token', \['--email' => \$mail, '--name' => TOKEN_NAME, '--quiet-output' => true\]\)/);
  assert.match(SITE, /^const TOKEN_NAME = 'webship-workspace';$/m);
});

test('tidy removes only what the default accounts left: their "Webship test …" tasks, and their rows on tasks that are gone', () => {
  assert.match(SITE, /^const TEST_PREFIX = 'Webship test ';$/m);
  assert.match(SITE, /^const TEST_ACCOUNTS = \['owner', 'member', 'commenter', 'reader', 'stranger'\];$/m);
  const tidy = verb('tidy');
  assert.match(tidy, /\$authors = test_account_ids\(\);/);
  assert.match(tidy, /DB::table\('zp_tickets'\)->where\('projectId', \$project\['id'\]\)->where\('headline', 'like', TEST_PREFIX \. '%'\)\s+->whereIn\('userId', \$authors\)/, 'a task of that title, in the sample project, made by a default account');
  // What Leantime's own delete of a task keeps: the comments, logged time and history of a task that is gone.
  assert.match(tidy, /\$gone = fn \(string \$table, string \$column\) => DB::table\(\$table\)->whereIn\('userId', \$authors\)\s+->whereNotIn\(\$column, DB::table\('zp_tickets'\)->select\('id'\)\);/);
  for (const [table, column] of [['zp_comment', 'moduleId'], ['zp_timesheets', 'ticketId'], ['zp_tickethistory', 'ticketId']]) {
    assert.ok(tidy.includes(`$gone('${table}', '${column}')`), `${table} of tasks that are gone`);
  }
  assert.match(tidy, /\$gone\('zp_comment', 'moduleId'\)->where\('module', 'ticket'\)/, 'only the comments of tasks');
  assert.strictEqual((tidy.match(/->delete\(\)/g) || []).length, 7, 'four deletes for a task of a stopped run, three for what removed tasks left');
  // The counts leave out what Leantime keeps of a removed task: only the rows of the sample project's tasks count.
  const counts = verb('counts');
  assert.match(counts, /whereIn\('moduleId', \$ids\)/);
  assert.match(counts, /DB::table\('zp_timesheets'\)->whereIn\('ticketId', \$ids\)/);
  assert.match(counts, /DB::table\('zp_tickethistory'\)->whereIn\('ticketId', \$ids\)/);
});

test('the runtimes: DDEV only for now; another is refused before anything is changed, and so is a machine with too little memory', () => {
  assert.match(read('scripts/args/arg-leantime.sh'), /choices=\['ddev'\]/);
  const build = FUN.slice(FUN.indexOf('function leantime_build()'));
  const guard = build.indexOf('if [ "${runtime}" != \'ddev\' ] ; then');
  const memory = build.indexOf('leantime_free_memory');
  assert.ok(guard > 0 && guard < build.indexOf('drop_database') && guard < build.indexOf('ddev config'), 'the runtime is asked first');
  assert.ok(build.includes('Leantime builds on DDEV for now (--runtime ddev), not on ${runtime}: that runtime is not proven for it yet. Nothing was changed.'));
  assert.ok(memory > 0 && memory < build.indexOf('drop_database'), 'the free memory is asked before anything is removed');
  assert.match(FUN, /^readonly LEANTIME_MEMORY_MB=1536;$/m, 'the builder asks for 1.5 GB free');
  assert.match(build, /ddev config --project-type=generic --project-name=\$\{PROJECT_NAME\} --database=mariadb:11\.4 \\\n\s+--nodejs-version=\$\(ddev_nodejs_version\)/, 'a generic project on MariaDB 11.4, with the workspace\'s Node.js');
  assert.doesNotMatch(FUN, /--database=mysql/, 'MariaDB, the database of every runtime the workspace has');
  assert.match(read('README.md'), /Leantime supports MySQL 8\.0\+ or MariaDB 10\.6\+ \(its own README\); the Workspace uses\nMariaDB 11\.4/, 'the README says which database, and why');
  assert.ok(build.indexOf('leantime_site install defaults') > build.indexOf('leantime_wait'), 'Leantime is installed once it answers');
  assert.ok(build.indexOf('"$(leantime_probe)" != \'200\'') > build.indexOf('leantime_site install defaults'), 'then the builder checks a visitor gets the login form');
});

test('Leantime\'s service on DDEV: its own image at the project\'s address, on the project\'s database, its files in volumes named after the project', () => {
  const compose = read('scripts/docker-compose.leantime.yaml');
  assert.match(compose, /image: "\$\{LEANTIME_IMAGE:-docker\.io\/leantime\/leantime:3\.17\.0\}"/, 'pinned, by its whole name');
  assert.match(FUN, /^readonly LEANTIME_DEFAULT_RELEASE='3\.17\.0';$/m, 'the same release as the builder\'s default');
  assert.match(compose, /VIRTUAL_HOST: \$\{DDEV_HOSTNAME\}/, 'Leantime takes the project\'s address');
  assert.match(compose, /HTTP_EXPOSE: "80:8080"/);
  assert.match(compose, /HTTPS_EXPOSE=8457:80,8026:8025/, 'the web container moves, its mail catcher stays at :8026');
  assert.match(compose, /depends_on:\n\s+db:\n\s+condition: service_healthy/, 'Leantime starts once its database is healthy');
  assert.match(compose, /env_file:\n\s+- \$\{DDEV_APPROOT\}\/leantime\/env/, 'the site\'s own values from its file');
  assert.match(compose, /- \$\{DDEV_APPROOT\}\/leantime:\/opt\/webship:ro/, 'the plugin\'s scripts, read only');
  for (const [volume, folder, name] of [['userfiles', '/var/www/html/userfiles', 'leantime-userfiles'], ['public_userfiles', '/var/www/html/public/userfiles', 'leantime-public-userfiles'],
    ['plugins', '/var/www/html/app/Plugins', 'leantime-plugins'], ['logs', '/var/www/html/storage/logs', 'leantime-logs']]) {
    assert.ok(compose.includes(`      - ${volume}:${folder}\n`), `${folder} is mounted from ${volume}`);
    assert.ok(compose.includes(`\n  ${volume}:\n    name: ddev-\${DDEV_SITENAME}-${name}\n`), `${volume} is named after the project`);
  }
  assert.doesNotMatch(compose, /PASSWORD|SESSION|TOKEN/, 'no secret in the compose file');
  // The site's values: the address, the project's database, the mail catcher, its own session key, no telemetry.
  const env = FUN.slice(FUN.indexOf('function leantime_write_env()'), FUN.indexOf('function leantime_exec()'));
  for (const line of ['LEAN_APP_URL=${base_url}', 'LEAN_DB_HOST=db', 'LEAN_DB_DATABASE=db', 'LEAN_SESSION_PASSWORD=$(leantime_secret 64)', 'LEAN_SESSION_SECURE=${secure}',
    'LEAN_ALLOW_TELEMETRY=false', 'LEAN_EMAIL_SMTP_HOSTS=web', 'LEAN_EMAIL_SMTP_PORT=1025', 'LEAN_RATELIMIT_API=${api_limit}', 'LEAN_RATELIMIT_AUTH=${login_limit}']) {
    assert.ok(env.split('\n').includes(line), line);
  }
  assert.match(env, /\( umask 077 && cat > "\$\{project_path\}\/\$\{LEANTIME_FILES\}\/env"/, 'leantime/env is its owner\'s only');
});

test('a test site allows the calls and logins a suite makes, by a setting of its own; a connected Leantime keeps its own', () => {
  assert.match(FUN, /^readonly LEANTIME_API_LIMIT=1000;$/m);
  assert.match(FUN, /^readonly LEANTIME_LOGIN_LIMIT=100;$/m);
  assert.match(FUN, /local api_limit="\$\{API_LIMIT:-\$\{site_leantime_api_limit:-\$\{LEANTIME_API_LIMIT\}\}\}"/, 'the flag, else the folder\'s setting, else the default');
  assert.match(FUN, /local login_limit="\$\{LOGIN_LIMIT:-\$\{site_leantime_login_limit:-\$\{LEANTIME_LOGIN_LIMIT\}\}\}"/);
  const args = read('scripts/args/arg-leantime.sh');
  assert.match(args, /'--api-limit',\n\s+dest='API_LIMIT'/);
  assert.match(args, /'--login-limit',\n\s+dest='LOGIN_LIMIT'/);
  const connect = FUN.slice(FUN.indexOf('function leantime_connect()'), FUN.indexOf('function leantime_cli_tool()'));
  assert.doesNotMatch(connect, /RATELIMIT|api_limit|login_limit/i, 'connecting to a Leantime never changes its limits');
});

test('the functions carry the names the core\'s tools look for, and run Leantime\'s tools in its container', () => {
  for (const fn of ['set_leantime_users', 'add_leantime_users', 'cancel_leantime_users', 'testing_configure_leantime', 'leantime_build', 'leantime_cli_tool', 'leantime_connect']) {
    assert.match(FUN, new RegExp(`^function ${fn}\\(\\) \\{`, 'm'), `${fn} is defined`);
  }
  assert.match(FUN, /ddev exec -s leantime "sh -c \$\(printf '%q' "cd \/var\/www\/html && \$\{1\}"\)"/, 'in Leantime\'s container, in its folder');
  assert.match(FUN, /leantime_exec "php \$\(leantime_scripts_dir\)\/leantime-site\.php \$\*"/, 'the site script with Leantime\'s own PHP');
  assert.match(FUN, /leantime_exec "php bin\/leantime \$\{RUN\}"/, 'the tool runs Leantime\'s own console commands');
  assert.match(FUN, /users=\(owner member commenter reader stranger\);/);
  assert.match(FUN, /user_owner_role='manager' ; user_owner_member='yes' ;\n\s+user_member_role='editor' ; user_member_member='yes' ;\n\s+user_commenter_role='commenter' ; user_commenter_member='yes' ;\n\s+user_reader_role='readonly' ; user_reader_member='yes' ;\n\s+user_stranger_role='editor' ; user_stranger_member='' ;/);
  assert.doesNotMatch(FUN, /ddev stop -y/, 'ddev stop takes no -y');
  const connect = FUN.slice(FUN.indexOf('function leantime_connect()'), FUN.indexOf('function leantime_cli_tool()'));
  assert.match(connect, /LEANTIME_NEW_TOKEN="\$\{token\}" python3/, 'the token reaches the settings writer in its environment only');
  assert.match(connect, /0o600/, 'the settings file stays readable by its owner only');
  assert.doesNotMatch(connect, /echo[^\n]*\$\{token\}/, 'the token is never printed');
  assert.match(connect, /its earlier one revoked/, 'the person is told the earlier token is gone');
  const testing = FUN.slice(FUN.indexOf('function testing_configure_leantime()'));
  assert.match(testing, /registry="\$\{registry\}\$\{user\}\|\$\{!user_mail\}\|\$\{!user_password\}\|\$\{!user_first\} \$\{!user_last\}"/, 'the pack logs in with the address and shows the whole name');
  assert.match(testing, /project: process\.env\.PROJECT \|\| '%s',/, 'the project the pack works in');
  // add_leantime_users ends in the folder: the sample content is asked for in the project again, and each part says
  // when it did not work.
  assert.match(FUN, /^function add_leantime_users\(\) \{[\s\S]*?\n  cd \$\{WORKSPACE_ROOT\}\/\$\{doc_name\};\n  return \$\{status\} ;\n\}/m);
  assert.match(testing, /elif ! \( cd "\$\{project_path\}" && leantime_site content < \/dev\/null > \/dev\/null 2>&1 \) ; then/, 'the sample content, in the project');
  for (const said of ['Leantime does not answer', 'The default accounts could not be written', 'The sample content could not be written']) assert.ok(testing.includes(said), said);
});

test('the assistant is told how to build, test and connect a site', () => {
  const told = assistantContext();
  for (const c of COMMANDS) assert.ok(told.includes(c), `the assistant is told about ${c}`);
  for (const a of AGENTS) assert.ok(told.includes(a), `the assistant is told about ${a}`);
  assert.match(told, /1\.5 GB of free memory/);
  assert.match(told, /--connect <login>/);
  assert.match(told, /My Project, stays empty/);
  assert.match(told, /Time Tracking/);
});

test('the docs say container-based, name only what ships, and carry no personal value', () => {
  const docs = ['README.md', ...manifest.ai.agents, 'scripts/functions/fun-leantime.sh', 'config/plugin.leantime.settings.yml'];
  for (const f of docs) {
    const src = read(f);
    assert.doesNotMatch(src, /DDEV-only/i, `${f}: the workspace is container-based, DDEV by default`);
    assert.doesNotMatch(src, /\/home\/(?!YOUR_USER)[a-z]/, `${f} carries no personal path`);
    const mails = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g) || [];
    for (const m of mails) assert.match(m, /@example\.(com|org)$/, `${f}: ${m} is not an example address`);
  }
  for (const c of COMMANDS) assert.ok(read('README.md').includes(c), `the README lists ${c}`);
  const keys = [...read('config/plugin.leantime.settings.yml').matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 12);
  for (const k of keys) assert.ok(read('README.md').includes(`\`${k}\``), `the README describes the setting ${k}`);
});
