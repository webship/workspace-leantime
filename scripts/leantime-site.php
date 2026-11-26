<?php
/*
 * The Leantime site of a Webship Workspace project, from Leantime's own code in its container: the plugin's
 * leantime-site.php, read from the project's leantime/ folder (at /opt/webship on DDEV).
 *
 *     php /opt/webship/leantime-site.php <verb>…
 *
 * Verbs, run in the order given:
 *   version   the release the site runs (VERSION <release>)
 *   install   Leantime's own installer (its console's db:migrate) with the account on the input, once; its first
 *             login done; Leantime's onboarding project stays empty, which it says
 *   defaults  the site's settings: no telemetry
 *   accounts  the default accounts on the input: made or given back their names, roles and passwords, their first
 *             login done, members of the sample project in their roles; or kept from logging in ("lock")
 *   content   the sample content, made as its authors: the sample project's sprint, its tasks, comments and time
 *   tidy      what a stopped test run left: tasks titled "Webship test …" made by the default accounts in the sample
 *             project, with their comments, history and logged time; and what the default accounts left on tasks that
 *             are gone, which Leantime's own delete of a task keeps (comments, logged time, history)
 *   list      the accounts, and what the sample project holds
 *   token     a new bearer token of the account on the input (TOKEN <token>); its earlier one is revoked
 *   counts    what the sample project holds, one count a line
 *
 * What a verb reads (accounts, passwords, a login) comes on the input as JSON, never on a command line: Leantime's
 * own console commands run here, in this process, with their options built from it.
 */

define('LEAN_CLI', true);
define('ARTISAN_BINARY', 'bin/leantime');
chdir('/var/www/html');
require '/var/www/html/vendor/autoload.php';
$app = require_once '/var/www/html/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

const SAMPLE_PROJECT = 'Webship site';
const SAMPLE_SPRINT = 'Sprint 1';
const TEST_PREFIX = 'Webship test ';
const TEST_ACCOUNTS = ['owner', 'member', 'commenter', 'reader', 'stranger'];
const TOKEN_NAME = 'webship-workspace';
// Leantime's roles, by the names its console takes.
const ROLES = ['readonly' => 5, 'commenter' => 10, 'editor' => 20, 'manager' => 30, 'admin' => 40, 'owner' => 50];

$verbs = array_slice($argv, 1);
$input = null;

function input(): array
{
    global $input;
    if ($input === null) {
        $raw = trim(stream_get_contents(STDIN));
        $input = $raw === '' ? [] : (json_decode(base64_decode($raw, true) ?: $raw, true) ?? []);
    }
    return $input;
}

function say(string $line): void
{
    fwrite(STDOUT, $line . "\n");
}

function fail(string $line): never
{
    fwrite(STDERR, $line . "\n");
    exit(1);
}

/** Run one of Leantime's own console commands in this process; its output, and whether it went through. */
function console(string $command, array $options): array
{
    global $kernel;
    $buffer = new Symfony\Component\Console\Output\BufferedOutput();
    $status = $kernel->call($command, $options + ['--no-interaction' => true], $buffer);
    return [$status === 0, $buffer->fetch()];
}

function installed(): bool
{
    try {
        return DB::table('zp_user')->count() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function setting(string $key, string $value): void
{
    DB::table('zp_settings')->updateOrInsert(['key' => $key], ['value' => $value]);
}

function user_by_mail(string $mail): ?array
{
    $row = DB::table('zp_user')->where('username', $mail)->first();
    return $row ? (array) $row : null;
}

function act_as(string $mail): array
{
    $user = user_by_mail($mail);
    if (! $user) {
        fail("No account {$mail}: add the default accounts first (--add-users).");
    }
    $full = app(Leantime\Domain\Users\Repositories\Users::class)->getUser($user['id'], false);
    app(Leantime\Domain\Auth\Services\Auth::class)->setUserSession($full);
    return $user;
}

function sample_project(): ?array
{
    $row = DB::table('zp_projects')->where('name', SAMPLE_PROJECT)->orderBy('id')->first();
    return $row ? (array) $row : null;
}

function test_account_ids(): array
{
    return DB::table('zp_user')
        ->whereIn('username', array_map(fn ($a) => $a . '@example.com', TEST_ACCOUNTS))
        ->pluck('id')->map(fn ($id) => (int) $id)->all();
}

foreach ($verbs as $verb) {
    if ($verb === 'version') {
        say('VERSION ' . app(Leantime\Core\Configuration\AppSettings::class)->appVersion);
    } elseif ($verb === 'install') {
        if (installed()) {
            say('Leantime is installed already.');
            continue;
        }
        $a = input();
        // Leantime's console installer (db:install is its other name): the database, then the account as the owner.
        // Last it fills Leantime's own onboarding project with tasks as a person, which a console run is not: that
        // part is refused, and the project stays empty. The sample project is the builder's own (accounts).
        [$ok, $out] = console('db:migrate', [
            '--email' => $a['mail'], '--password' => $a['password'], '--company-name' => $a['company'] ?? 'Webship',
            '--first-name' => $a['first'] ?? 'Workspace', '--last-name' => $a['last'] ?? 'Account',
        ]);
        $user = installed() ? user_by_mail($a['mail']) : null;
        if (! $user || (int) $user['role'] !== ROLES['owner']) {
            fail("Leantime's installer did not finish:\n" . trim($out));
        }
        setting("user.{$user['id']}.firstLoginCompleted", '1');
        say("installed: {$a['mail']} is the site's owner");
        $empty = DB::table('zp_projects')->where('name', 'My Project')->value('id');
        if ($empty && ! DB::table('zp_tickets')->where('projectId', $empty)->exists()) {
            say("Leantime's own onboarding project, My Project, is empty on purpose: its installer fills it as a person, which a console run is not. The sample project is " . SAMPLE_PROJECT . '.');
        }
    } elseif ($verb === 'defaults') {
        setting('companysettings.telemetry.optOut', 'true');
        say('defaults: no telemetry');
    } elseif ($verb === 'accounts') {
        $rows = input();
        $project = sample_project();
        if (! $project) {
            $owner = DB::table('zp_user')->where('role', ROLES['owner'])->orderBy('id')->first();
            act_as($owner->username);
            $id = app(Leantime\Domain\Projects\Repositories\Projects::class)->addProject([
                'name' => SAMPLE_PROJECT, 'details' => '<p>The sample project of the Webship Workspace.</p>',
                'clientId' => 0, 'hourBudget' => 0, 'dollarBudget' => 0, 'psettings' => 'restricted', 'type' => 'project',
                'assignedUsers' => [],
            ]);
            // Leantime makes the account that adds a project its member.
            $project = (array) DB::table('zp_projects')->find($id);
            say('project: ' . SAMPLE_PROJECT . " (id {$id})");
        }
        $users = app(Leantime\Domain\Users\Repositories\Users::class);
        foreach ($rows as $r) {
            $user = user_by_mail($r['mail']);
            if (($r['action'] ?? '') === 'lock') {
                if ($user) {
                    DB::table('zp_user')->where('id', $user['id'])->update(['status' => 'i']);
                    say("{$r['login']}: kept from logging in");
                }
                continue;
            }
            $role = ROLES[$r['role']] ?? fail("{$r['login']}: no role {$r['role']} in Leantime.");
            if (! $user) {
                $id = (int) $users->addUser([
                    'user' => $r['mail'], 'firstname' => $r['first'], 'lastname' => $r['last'], 'role' => $role,
                    'password' => $r['password'], 'status' => 'a', 'source' => 'webship-workspace',
                ]);
            } else {
                $id = (int) $user['id'];
                DB::table('zp_user')->where('id', $id)->update([
                    'firstname' => $r['first'], 'lastname' => $r['last'], 'role' => $role, 'status' => 'a',
                    'password' => password_hash($r['password'], PASSWORD_DEFAULT),
                ]);
            }
            // The first login is done: no onboarding modal on every page of a scenario's account.
            setting("user.{$id}.firstLoginCompleted", '1');
            $member = DB::table('zp_relationuserproject')->where(['userId' => $id, 'projectId' => $project['id']]);
            if (! empty($r['member'])) {
                $member->exists() ? $member->update(['projectRole' => '']) : DB::table('zp_relationuserproject')->insert(['userId' => $id, 'projectId' => $project['id'], 'projectRole' => '']);
                say("{$r['login']}: " . array_search($role, ROLES) . ' of ' . SAMPLE_PROJECT);
            } else {
                $member->delete();
                say("{$r['login']}: no membership of " . SAMPLE_PROJECT);
            }
        }
        app(Leantime\Domain\Auth\Services\Auth::class);
        if (class_exists(Leantime\Domain\Auth\Services\PermissionService::class)) {
            Leantime\Domain\Auth\Services\PermissionService::projectAccessChanged();
        }
    } elseif ($verb === 'content') {
        $project = sample_project() ?? fail('No sample project: add the default accounts first (--add-users).');
        $pid = (int) $project['id'];
        session(['currentProject' => $pid]);
        $owner = act_as('owner@example.com');
        $member = user_by_mail('member@example.com');
        // The sprint of the current fortnight.
        $sprint = DB::table('zp_sprints')->where(['projectId' => $pid, 'name' => SAMPLE_SPRINT])->first();
        if (! $sprint) {
            $start = new DateTimeImmutable('monday this week');
            DB::table('zp_sprints')->insert([
                'projectId' => $pid, 'name' => SAMPLE_SPRINT, 'startDate' => $start->format('Y-m-d 00:00:00'),
                'endDate' => $start->modify('+13 days')->format('Y-m-d 23:59:59'), 'modified' => date('Y-m-d H:i:s'),
            ]);
            $sprint = DB::table('zp_sprints')->where(['projectId' => $pid, 'name' => SAMPLE_SPRINT])->first();
        }
        $tickets = app(Leantime\Domain\Tickets\Services\Tickets::class);
        $comments = app(Leantime\Domain\Comments\Services\Comments::class);
        $made = function (string $headline) use ($pid) {
            return DB::table('zp_tickets')->where(['projectId' => $pid, 'headline' => $headline])->value('id');
        };
        $greeting = 'The greeting script says Helo instead of Hello';
        if (! $made($greeting)) {
            $tickets->addTicket([
                'headline' => $greeting, 'type' => 'task', 'projectId' => $pid, 'status' => 4, 'priority' => 2,
                'editorId' => $member['id'], 'tags' => 'bug', 'sprint' => $sprint->id,
                'description' => '<p><code>greeting.sh</code> prints <em>Helo</em> where it should print <em>Hello</em>.</p>',
            ]);
            $id = $made($greeting);
            $comments->addComment(['text' => '<p>Seen on the test site: the greeting prints Helo.</p>', 'father' => 0], 'ticket', $id, $tickets->getTicket($id));
        }
        $greetingId = $made($greeting);
        $usage = 'The usage line spells greeting as greting';
        if (! $made($usage)) {
            act_as('member@example.com');
            $tickets->addTicket([
                'headline' => $usage, 'type' => 'task', 'projectId' => $pid, 'status' => 3,
                'description' => '<p>The usage line of <code>greeting.sh</code> says <em>greting</em>.</p>',
            ]);
            // Someone from outside the project's editors: a commenter's word on it.
            act_as('commenter@example.com');
            $id = $made($usage);
            $comments->addComment(['text' => '<p>From outside the project: the usage line reads greting here too.</p>', 'father' => 0], 'ticket', $id, $tickets->getTicket($id));
        }
        // Time logged on the greeting by its assignee.
        if (! DB::table('zp_timesheets')->where(['ticketId' => $greetingId, 'userId' => $member['id']])->exists()) {
            DB::table('zp_timesheets')->insert([
                'userId' => $member['id'], 'ticketId' => $greetingId, 'workDate' => date('Y-m-d 00:00:00'), 'hours' => 1.5,
                'description' => 'Looked into the greeting', 'kind' => 'DEVELOPMENT', 'modified' => date('Y-m-d H:i:s'),
            ]);
        }
        $count = DB::table('zp_tickets')->where('projectId', $pid)->where('type', '<>', 'milestone')->count();
        say('content: ' . SAMPLE_PROJECT . " holds {$count} tasks, " . SAMPLE_SPRINT . ' (' . substr($sprint->startDate, 0, 10) . ' to ' . substr($sprint->endDate, 0, 10) . ')');
    } elseif ($verb === 'tidy') {
        $project = sample_project();
        if (! $project) {
            say('tidy: no sample project');
            continue;
        }
        $authors = test_account_ids();
        $left = DB::table('zp_tickets')->where('projectId', $project['id'])->where('headline', 'like', TEST_PREFIX . '%')
            ->whereIn('userId', $authors)->pluck('id')->all();
        foreach ($left as $id) {
            DB::table('zp_comment')->where(['module' => 'ticket', 'moduleId' => $id])->delete();
            DB::table('zp_tickethistory')->where('ticketId', $id)->delete();
            DB::table('zp_timesheets')->where('ticketId', $id)->delete();
            DB::table('zp_tickets')->where('id', $id)->delete();
        }
        say('tidy: ' . count($left) . ' task(s) of a stopped test run removed');
        // Leantime's own delete of a task keeps its comments, its logged time and its history in the database, out of
        // every screen and every answer of its API: the rows of the default accounts on a task that is gone go too.
        $gone = fn (string $table, string $column) => DB::table($table)->whereIn('userId', $authors)
            ->whereNotIn($column, DB::table('zp_tickets')->select('id'));
        $rows = $gone('zp_comment', 'moduleId')->where('module', 'ticket')->delete()
            + $gone('zp_timesheets', 'ticketId')->delete()
            + $gone('zp_tickethistory', 'ticketId')->delete();
        say("tidy: {$rows} row(s) the default accounts left on removed tasks (comments, logged time, history) removed");
    } elseif ($verb === 'list') {
        $project = sample_project();
        say('Accounts:');
        $members = $project ? DB::table('zp_relationuserproject')->where('projectId', $project['id'])->pluck('userId')->map(fn ($i) => (int) $i)->all() : [];
        foreach (DB::table('zp_user')->orderBy('id')->get() as $u) {
            $role = array_search((int) $u->role, ROLES) ?: $u->role;
            $standing = in_array((int) $u->id, $members, true) ? "{$role} of " . SAMPLE_PROJECT : ($role === 'owner' ? 'the site\'s owner' : 'no membership');
            say(sprintf('  %-12s %-28s %-9s %s', strtok($u->username, '@'), $u->username, strtolower($u->status) === 'a' ? 'active' : 'locked', $standing));
        }
        if ($project) {
            $tasks = DB::table('zp_tickets')->where('projectId', $project['id'])->where('type', '<>', 'milestone')->count();
            $sprints = DB::table('zp_sprints')->where('projectId', $project['id'])->count();
            say(SAMPLE_PROJECT . " (project {$project['id']}): {$tasks} tasks, {$sprints} sprint(s)");
        }
    } elseif ($verb === 'token') {
        $login = trim((string) (input()['login'] ?? ''));
        $mail = str_contains($login, '@') ? $login : "{$login}@example.com";
        $user = user_by_mail($mail) ?? fail("No account {$login}.");
        if (strtolower($user['status']) !== 'a') {
            fail("{$login} is kept from logging in.");
        }
        DB::table('zp_access_tokens')->where(['tokenable_id' => $user['id'], 'name' => TOKEN_NAME])->delete();
        [$ok, $out] = console('auth:create-bearer-token', ['--email' => $mail, '--name' => TOKEN_NAME, '--quiet-output' => true]);
        $token = trim($out);
        if (! $ok || ! preg_match('/^[A-Za-z0-9|]{20,}$/', $token)) {
            fail("No token could be made for {$login}.");
        }
        say("TOKEN {$token}");
    } elseif ($verb === 'counts') {
        $project = sample_project() ?? fail('No sample project.');
        $pid = $project['id'];
        $tasks = DB::table('zp_tickets')->where('projectId', $pid)->where('type', '<>', 'milestone');
        $ids = (clone $tasks)->pluck('id')->all();
        $done = DB::table('zp_tickets')->where('projectId', $pid)->whereIn('status', [0, -1])->where('type', '<>', 'milestone')->count();
        say('tasks: ' . count($ids));
        say('open tasks: ' . (count($ids) - $done));
        say('comments: ' . DB::table('zp_comment')->where('module', 'ticket')->whereIn('moduleId', $ids)->count());
        say('assignees: ' . (clone $tasks)->whereNotNull('editorId')->where('editorId', '<>', '')->where('editorId', '<>', 0)->count());
        say('tagged tasks: ' . (clone $tasks)->whereNotNull('tags')->where('tags', '<>', '')->count());
        say('sprint tasks: ' . (clone $tasks)->where('sprint', '>', 0)->count());
        say('sprints: ' . DB::table('zp_sprints')->where('projectId', $pid)->count());
        say('time entries: ' . DB::table('zp_timesheets')->whereIn('ticketId', $ids)->count());
        say('history entries: ' . DB::table('zp_tickethistory')->whereIn('ticketId', $ids)->count());
        say('project members: ' . DB::table('zp_relationuserproject')->where('projectId', $pid)->count());
        say('users: ' . DB::table('zp_user')->count());
    } else {
        fail("No verb {$verb} (version, install, defaults, accounts, content, tidy, list, token, counts).");
    }
}
