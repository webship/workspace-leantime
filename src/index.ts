/**
 * Leantime for Webship Workspace: a platform plugin and a provider of the tracker family.
 *
 * What the package carries is placed by the installer from the manifest: the builder and the tool in the sites
 * folders, their functions and argparse under core/scripts/plugins/leantime/ (with the compose file of Leantime's
 * service, the PHP script the builder runs with Leantime's own code in its container, and the first feature of a
 * site), and its AI items (ai/ in this package) in the folder of their kind.
 *
 * What register() adds: the tasks of a Leantime as work items (@webship.co/workspace-tracker): the LEANTIME menu on
 * the project rows of sites and code folders that work against a Leantime project, the list, one task, analyze, do
 * the work with the workspace's AI CLI on a branch, and, with writes on, a comment, a status, tags, an assignee and
 * logged time, each a person's click after a preview. And what the assistant is told.
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from the dashboard's own
 * files, so it can be installed from npm and removed without a trace.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { registerTracker } from '@webship.co/workspace-tracker';

import { leantimeTracker } from './lib/tracker';

export { leantimeTracker };

/** The plugin's name: a site is a generic project in containers that the plugin claims, and the core's tools call its functions under it. */
export const PLATFORM = 'leantime';

/** The commands the installer places in every sites folder. */
export const COMMANDS = ['cmd-leantime-project.sh', 'cmd-tools-leantime-cli.sh'];

/** The agents the installer places in the AI Agents folder. */
export const AGENTS = ['leantime-site-builder', 'leantime-tester', 'leantime-issue-worker'];

/** The skill the installer places in the AI Skills folder (a folder each, with its SKILL.md). */
export const SKILLS = ['leantime-scenarios'];

/** The slash command the installer places in the AI Commands folder. */
export const AI_COMMANDS = ['leantime-test'];

/** The prompts the installer places in the AI Prompts folder: each a whole launch command for a new session. */
export const PROMPTS = ['leantime-build-and-test', 'leantime-issue-to-branch'];

/** What the assistant is told about Leantime sites in this workspace (the tasks are told by the tracker). */
export function assistantContext(): string {
  return [
    'Leantime (a plugin, @webship.co/workspace-leantime), the open-source project management software: a site is built with',
    '`bash cmd-leantime-project.sh <name> --install --add-users --sample-content` from a sites folder (dev, test, sandboxes, demos):',
    'Leantime\'s own image (3.17.0 by default, `--release`) on the project\'s own MariaDB 11.4, on DDEV at https://<name>.ddev.site; other runtimes are not proven for it yet.',
    'The builder asks for 1.5 GB of free memory before it starts.',
    '`--install` runs Leantime\'s own installer and makes the workspace account the site\'s owner (its onboarding project, My Project, stays empty: the installer fills it only for a person);',
    '`--add-users` adds the default accounts (owner: Company Manager, member: Editor, commenter: Commenter, reader: Read Only, in the team of the project Webship site; stranger: an Editor outside it), each @example.com;',
    '`--sample-content` adds its tasks #1 and #2, the sprint "Sprint 1", two comments and logged time.',
    '`bash cmd-tools-leantime-cli.sh <name>` says what the site is and lists its accounts; `--run "<command>"` runs one of Leantime\'s own console commands in its container,',
    '`--sample-content` adds the sample content later, `--tidy` removes the tasks a stopped test run left ("Webship test …") and what Leantime keeps of removed tasks, `--add-users` and `--cancel-users` manage the default accounts,',
    'and `--connect <login>` points the dashboard\'s Leantime at the site as that account (a new bearer token in the plugin\'s settings, never shown, its earlier one revoked).',
    'A Commenter of a Leantime project reads and comments, and changes no task; a Read Only person only reads; Leantime logs time on a task (its Time Tracking).',
    '`bash cmd-tools-testing.sh <name>` sets up webship-js with the Leantime step pack; `--run` runs the suite.',
    `For Leantime sites hand over to the agent \`${AGENTS[0]}\`, for testing one to \`${AGENTS[1]}\`, for working a task to \`${AGENTS[2]}\`.`,
    `The plugin also places the skill ${SKILLS.map((a) => `\`${a}\``).join(', ')} (the step pack's phrases, by area) in ai-skills/,`,
    `the command ${AI_COMMANDS.map((a) => `\`/${a} <site>\``).join(', ')} in ai-commands/ and the prompts ${PROMPTS.map((a) => `\`${a}\``).join(' and ')} in ai-prompts/.`,
    'Never run Leantime\'s tools on the host for a project; removing the project removes its database and its files too.',
  ].join(' ');
}

export function register(api: PluginApi): void {
  registerTracker(api, leantimeTracker(api));
  if (typeof api.addAssistantContext === 'function') api.addAssistantContext(assistantContext);
}
