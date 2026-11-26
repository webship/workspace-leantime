#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The name of the Leantime project in this folder.')
parser.add_argument('-r', '--run',
                    default="_none_",
                    help='Run one of Leantime\'s own console commands (php bin/leantime <command>) in its container. Example: --run "about"')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='Make the default accounts (owner, member, commenter, reader, stranger) and their roles in the project Webship site, or give them back their names, passwords and roles.')
parser.add_argument('-c', '--cancel-users',
                    action='store_true',
                    default=False,
                    help='Keep the default accounts from logging in: their work stays.')
parser.add_argument('-s', '--sample-content',
                    action='store_true',
                    default=False,
                    help='Add the sample content the step pack and the tracker are tested on, where it is missing.')
parser.add_argument('-t', '--tidy',
                    action='store_true',
                    default=False,
                    help='Remove for good what a test run that was stopped half way left: its tasks, titled "Webship test …" and made by one of the default accounts in the project Webship site, with their comments, history and logged time; and the comments, logged time and history the default accounts left on tasks that are gone, which Leantime\'s own delete of a task keeps. Nothing else is touched.')
parser.add_argument('--connect',
                    default="_none_",
                    help='Point the dashboard\'s Leantime at this site as this account: a new bearer token of it goes into core/config/plugin.leantime.settings.yml (never shown, its earlier one revoked), with the site\'s address. Example: --connect member')
ARGEOF
