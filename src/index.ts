import type { PluginApi } from '@webship.co/workspace-plugin-api';

/** The platform this plugin builds sites of, as the core's tools and the dashboard name it. */
export const PLATFORM = 'leantime';

/** The commands the installer places in the sites folders. */
export const COMMANDS = ['cmd-leantime-project.sh', 'cmd-tools-leantime-cli.sh'];

/** What the assistant is told about Leantime sites in this workspace. */
export function assistantContext(): string {
  return [
    'Leantime (a plugin, @webship.co/workspace-leantime), the open-source project management software: a site is built with',
    '`bash cmd-leantime-project.sh <name> --install --add-users --sample-content` from a sites folder (dev, test, sandboxes, demos):',
    'Leantime\'s own image (3.17.0 by default, `--release`) on the project\'s own MySQL, on DDEV at https://<name>.ddev.site.',
    '`--install` runs Leantime\'s own installer and makes the workspace account the site\'s owner; `--add-users` adds the default accounts',
    '(owner: Company Manager, member: Editor, commenter: Commenter, reader: Read Only, members of the project Webship site; stranger: no membership), each @example.com;',
    '`--sample-content` adds its tasks, the sprint "Sprint 1", comments and logged time.',
    '`bash cmd-tools-leantime-cli.sh <name>` says what the site is and lists its accounts; `--run "<command>"` runs one of Leantime\'s own console commands in its container,',
    '`--sample-content` adds the sample content later, `--tidy` removes the tasks a stopped test run left ("Webship test …"), `--add-users` and `--cancel-users` manage the default accounts,',
    'and `--connect <login>` points the dashboard\'s Leantime at the site as that account (a new bearer token in the plugin\'s settings, never shown).',
    'A Commenter of a Leantime project comments and changes nothing else; a Read Only person only reads.',
    'Never run Leantime\'s tools on the host for a project; removing the project removes its database and its files too.',
  ].join(' ');
}

export function register(api: PluginApi): void {
  if (typeof api.addAssistantContext === 'function') api.addAssistantContext(assistantContext);
}
