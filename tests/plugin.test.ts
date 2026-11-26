import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
  assert.deepStrictEqual(names, ['docker-compose.leantime.yaml', 'leantime-site.php', 'leantime-serve.sh', 'site.feature']);
  assert.deepStrictEqual(manifest.features, ['features/leantime.feature', 'features/leantime-runtimes.feature']);
  assert.strictEqual(manifest.featuresSite, 'cmd-leantime-project.sh ci-leantime --install --add-users --sample-content --runtime docker', 'CI builds a site on Docker Compose for the features');
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
  assert.match(SITE, /^\$root = is_file\('\/opt\/leantime\/bootstrap\/app\.php'\) \? '\/opt\/leantime' : '\/var\/www\/html';$/m, 'Leantime\'s code where it is: its own container on DDEV, the web container elsewhere');
  assert.match(SITE, /^\$app = require_once \$root \. '\/bootstrap\/app\.php';$/m, 'Leantime\'s own application');
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

test('the runtimes: DDEV, Docker Compose, Podman and Kubernetes; another is refused before anything is changed, and so is a machine with too little memory', () => {
  assert.match(read('scripts/args/arg-leantime.sh'), /choices=\['ddev', 'docker', 'podman', 'kubernetes'\]/);
  const build = FUN.slice(FUN.indexOf('function leantime_build()'));
  const guard = build.indexOf('case "${runtime}" in');
  const serve = build.indexOf('declare -f rt_serve');
  const memory = build.indexOf('leantime_free_memory');
  assert.ok(guard > 0 && guard < build.indexOf('drop_database') && guard < build.indexOf('ddev config'), 'the runtime is asked first');
  assert.match(build, /case "\$\{runtime\}" in\n\s+ddev\|docker\|podman\|kubernetes\) ;;/, 'the four runtimes the plugin was proven on');
  assert.ok(build.includes('Leantime builds on DDEV, Docker Compose, Podman and Kubernetes for now (--runtime ddev, docker, podman or kubernetes), not on ${runtime}: that runtime is not proven for it yet. Nothing was changed.'));
  assert.ok(serve > guard && serve < build.indexOf('drop_database'), 'a workspace whose runtimes serve no application of its own is told so before anything is removed');
  assert.ok(memory > 0 && memory < build.indexOf('drop_database'), 'the free memory is asked before anything is removed');
  assert.match(FUN, /^readonly LEANTIME_MEMORY_MB=1536;$/m, 'the builder asks for 1.5 GB free');
  assert.match(FUN, /^readonly LEANTIME_DATABASE='mariadb:11\.4';$/m);
  assert.match(build, /ddev config --project-type=generic --project-name=\$\{PROJECT_NAME\} --database=\$\{LEANTIME_DATABASE\} \\\n\s+--nodejs-version=\$\(ddev_nodejs_version\)/, 'on DDEV a generic project on MariaDB 11.4, with the workspace\'s Node.js');
  assert.match(build, /ddev config --project-type=generic --webserver-type=generic --project-name=\$\{PROJECT_NAME\} --database=\$\{LEANTIME_DATABASE\} --auto/, 'elsewhere the runtime\'s own project, on the same database');
  assert.doesNotMatch(FUN, /--database=mysql/, 'MariaDB, the database of every runtime the workspace has');
  assert.ok(build.indexOf('base_url="$(leantime_url)"') > build.indexOf('leantime_write_config'), 'the address is read once the runtime has given the project its port');
  const tool = FUN.slice(FUN.indexOf('function leantime_cli_tool()'), FUN.indexOf('function testing_configure_leantime()'));
  assert.match(tool, /case "\$\(leantime_probe\)" in\n\s+200\|302\|303\) ;;\n\s+\*\) ddev start < \/dev\/null > \/dev\/null 2>&1 \|\| ddev start -y < \/dev\/null \|\| exit 1 ;;/, 'the tool starts a site that does not answer, and leaves one that does (webship/workspace#906)');
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
    'LEAN_ALLOW_TELEMETRY=false', 'LEAN_EMAIL_SMTP_HOSTS=${mail}', 'LEAN_EMAIL_SMTP_PORT=1025', 'LEAN_RATELIMIT_API=${api_limit}', 'LEAN_RATELIMIT_AUTH=${login_limit}']) {
    assert.ok(env.split('\n').includes(line), line);
  }
  assert.match(env, /\( umask 077 && cat > "\$\{project_path\}\/\$\{LEANTIME_FILES\}\/env"/, 'leantime/env is its owner\'s only');
  assert.match(env, /local secure='false' mail='web' ;/, 'the mail catcher of DDEV\'s web container, unless another runtime has its own');
  assert.match(env, /\[ "\$\{runtime\}" != 'ddev' \] && mail='mail' ;/);
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
  assert.match(told, /--runtime docker/);
  assert.match(told, /--runtime kubernetes/);
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

/** What the builder writes for a project, with the runtime layer's calls stood in: the calls, the project. */
function written(runtime: string, address: string): { calls: string, dir: string, read: (f: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leantime-runtimes-'));
  const plugin = path.join(dir, 'scripts', 'plugins', 'leantime');
  fs.mkdirSync(plugin, { recursive: true });
  for (const f of manifest.scripts.machine) fs.copyFileSync(path.join(PKG, f), path.join(plugin, path.basename(f)));
  const project = path.join(dir, 'mysite');
  fs.mkdirSync(path.join(project, '.ddev'), { recursive: true });
  const stand = [
    'rt_claim() { echo "rt_claim $*" >> "$LOG" ; }',
    'rt_stack() { echo "rt_stack $*" >> "$LOG" ; }',
    'rt_web_build() { echo "rt_web_build $*" >> "$LOG" ; cat > "$LOG.dockerfile" ; }',
    'rt_serve() { echo "rt_serve $1 [$2]" >> "$LOG" ; }',
  ].join('\n');
  const script = `${stand}\nsource "${path.join(PKG, 'scripts/functions/fun-leantime.sh')}"\nleantime_write_config "${project}" 3.17.0 ${runtime} && leantime_write_env "${project}" 3.17.0 "${address}" 1000 100 ${runtime}`;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, WORKSPACE_SCRIPTS: path.join(dir, 'scripts'), LOG: path.join(dir, 'calls.log') } });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const log = path.join(dir, 'calls.log');
  return { calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '', dir, read: (f: string) => fs.readFileSync(path.join(project, f), 'utf8') };
}

/** Remove a folder of this file's tests, never a path outside one. */
function removeTestDir(dir: string): void {
  const parts = path.relative(os.tmpdir(), path.resolve(dir)).split(path.sep);
  assert.ok(parts.length === 1 && /^leantime-runtimes-[A-Za-z0-9]{6}$/.test(parts[0]), `refused to remove ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

test('on Docker Compose, Podman and Kubernetes: Leantime\'s image as the web container\'s, its code out of the project\'s mount, run as the host user', () => {
  for (const runtime of ['docker', 'podman', 'kubernetes']) {
    const w = written(runtime, 'http://127.0.0.1:33001');
    try {
      assert.deepStrictEqual(w.calls.trim().split('\n'), [
        'rt_claim leantime',
        'rt_stack image docker.io/leantime/leantime:3.17.0',
        'rt_web_build leantime',
        'rt_serve 8080 [bash leantime/leantime-serve.sh]',
      ], runtime);
      const fragment = fs.readFileSync(path.join(w.dir, 'calls.log.dockerfile'), 'utf8');
      assert.match(fragment, /^ENTRYPOINT \["\/sbin\/tini", "--"\]$/m, 'tini stays first; the image\'s own start runs from serve, as the host user');
      assert.match(fragment, /cp -a \/var\/www\/html\/\. \/opt\/leantime\//, 'the code out of the folder the stack mounts the project on');
      assert.match(fragment, /sed -i 's#\/var\/www\/html#\/opt\/leantime#g' \/etc\/nginx\/nginx\.conf \/etc\/supervisor\/conf\.d\/supervisord\.conf \/usr\/local\/etc\/php-fpm\.d\/www\.conf/);
      assert.match(fragment, /if grep -rqs '\/var\/www\/html' \/etc\/nginx \/etc\/supervisor \/usr\/local\/etc\/php-fpm\.d ; then echo "[^"]+" >&2 ; exit 1 ; fi/, 'a release that names the old folder elsewhere stops the build, saying why');
      for (const [link, to] of [['userfiles', 'userfiles'], ['public/userfiles', 'public-userfiles'], ['app/Plugins', 'plugins']]) {
        assert.ok(fragment.includes(`ln -s /var/www/html/leantime/files/${to} /opt/leantime/${link}`), `${link} is kept in the project`);
      }
      assert.match(fragment, /chown -R www-data:www-data \/opt\/leantime\/storage \/opt\/leantime\/bootstrap\/cache \/run \/var\/lib\/nginx \/var\/log\/nginx$/m, 'what Leantime writes is the host user\'s');
      assert.doesNotMatch(fragment, /chown -R www-data:www-data \/opt\/leantime( |$)/m, 'never the whole code');
      const env = w.read('leantime/env').split('\n');
      for (const line of ['LEAN_APP_URL=http://127.0.0.1:33001', 'LEAN_SESSION_SECURE=false', 'LEAN_DB_HOST=db', 'LEAN_EMAIL_SMTP_HOSTS=mail', 'LEAN_RATELIMIT_API=1000', 'LEAN_RATELIMIT_AUTH=100']) {
        assert.ok(env.includes(line), `${runtime}: ${line}`);
      }
      assert.strictEqual(fs.statSync(path.join(w.dir, 'mysite', 'leantime', 'env')).mode & 0o777, 0o600, `${runtime}: leantime/env is its owner's only`);
      for (const f of ['leantime-site.php', 'leantime-serve.sh']) assert.ok(fs.existsSync(path.join(w.dir, 'mysite', 'leantime', f)), `${runtime}: leantime/${f}`);
      assert.ok(!fs.existsSync(path.join(w.dir, 'mysite', '.ddev', 'docker-compose.leantime.yaml')), `${runtime}: no DDEV service`);
    } finally {
      removeTestDir(w.dir);
    }
  }
  // On DDEV the site's values are what they were: its own address, its mail catcher in the web container.
  const d = written('ddev', 'https://mysite.ddev.site');
  try {
    assert.strictEqual(d.calls, '', 'no call of the runtime layer on DDEV');
    const env = d.read('leantime/env').split('\n');
    for (const line of ['LEAN_APP_URL=https://mysite.ddev.site', 'LEAN_SESSION_SECURE=true', 'LEAN_EMAIL_SMTP_HOSTS=web']) assert.ok(env.includes(line), line);
    assert.ok(fs.existsSync(path.join(d.dir, 'mysite', '.ddev', 'docker-compose.leantime.yaml')));
  } finally {
    removeTestDir(d.dir);
  }
});

test('the server on the other runtimes: the site\'s values, the project\'s folders for Leantime\'s files, then the image\'s own start', () => {
  const serve = read('scripts/leantime-serve.sh');
  assert.match(serve, /^set -a\n# shellcheck disable=SC1091\n\. "\$\{here\}\/env" \|\| exit 1\nset \+a$/m, 'the site\'s values in its environment');
  assert.match(serve, /^mkdir -p "\$\{here\}\/files\/userfiles" "\$\{here\}\/files\/public-userfiles" "\$\{here\}\/files\/plugins" \|\| exit 1$/m);
  assert.match(serve, /^exec \/start\.sh$/m, 'then the image\'s own start: supervisord, nginx, PHP-FPM and the scheduler');
  const r = spawnSync('bash', ['-n', path.join(PKG, 'scripts/leantime-serve.sh')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(FUN, /ddev exec "set -a ; \. \/var\/www\/html\/\$\{LEANTIME_FILES\}\/env ; set \+a ; cd \$\{LEANTIME_CODE\} && \$\{1\}"/, 'elsewhere Leantime\'s commands run in the web container, with the site\'s values');
  assert.match(FUN, /if \[ "\$\(leantime_runtime\)" = 'ddev' \] ; then echo 'http:\/\/leantime:8080' ; else echo "http:\/\/127\.0\.0\.1:\$\{LEANTIME_SERVE_PORT\}" ; fi/, 'Leantime asked where it answers');
});
