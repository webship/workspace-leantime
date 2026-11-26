#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The name of the project: its folder, its project in containers and its host name.')
parser.add_argument('--runtime',
                    dest='RUNTIME',
                    default="_none_",
                    choices=['ddev'],
                    help='The container runtime to build on: ddev (the default). Leantime is not proven on the other runtimes yet.')
parser.add_argument('-i', '--install',
                    action='store_true',
                    default=False,
                    help='Install Leantime with its own installer and make the workspace account the site\'s owner.')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='With --install, add the default accounts (owner: Company Manager, member: Editor, commenter: Commenter, reader: Read Only, members of the project Webship site; stranger: an Editor with no membership): the ones the test scenarios log in as.')
parser.add_argument('-s', '--sample-content',
                    action='store_true',
                    default=False,
                    help='With --install and --add-users, add the sample content the step pack and the tracker are tested on: the tasks of Webship site, its sprint Sprint 1, comments and logged time.')
parser.add_argument('-v', '--release',
                    dest='LEANTIME_VERSION',
                    default="",
                    help='The release of the site (a tag of Leantime\'s image): 3.17.0 by default. Example: --release 3.17.0')
parser.add_argument('--api-limit',
                    dest='API_LIMIT',
                    default="",
                    help='How many calls of its API a minute Leantime allows an account from one address on this site: a dev and test setting, 1000 by default so a test suite can read as often as it needs; Leantime\'s own default is 120. Example: --api-limit 120')
parser.add_argument('--login-limit',
                    dest='LOGIN_LIMIT',
                    default="",
                    help='How many logins a minute Leantime allows from one address on this site: a dev and test setting, 100 by default; Leantime\'s own default is 20. Example: --login-limit 20')
parser.add_argument('-l', '--launch',
                    action='store_true',
                    default=False,
                    help='Open the site in a browser when it is ready.')
ARGEOF
